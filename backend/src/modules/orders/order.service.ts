import { Types } from 'mongoose';
import type { Request } from 'express';
import { Order, type OrderStatus } from '../../models/Order';
import { Pharmacy } from '../../models/Pharmacy';
import { Stock } from '../../models/Stock';
import { Medicine } from '../../models/Medicine';
import { Address } from '../../models/Address';
import { Delivery } from '../../models/Delivery';
import { DeliveryAgent } from '../../models/DeliveryAgent';
import { Review } from '../../models/Review';
import { AppError } from '../../utils/AppError';
import { oid } from '../../utils/ids';
import { logger } from '../../utils/logger';
import { audit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { eventBus } from '../../events/eventBus';
import { stockService } from '../stock/stock.service';
import { paymentService, type PaymentMethod } from '../payments/payment.service';
import { orderCode, verifyOrderCode } from './orderCode';
import { deliveryQuote } from '../pharmacies/deliveryFee';
import type { AuthUser } from '../../middleware/auth';

export const MAX_CODE_ATTEMPTS = 5;

export interface CreateOrderInput {
  pharmacyId: string;
  deliveryType: 'pickup' | 'delivery';
  items: { medicineId: string; quantity: number }[];
  addressId?: string;
  address?: { label?: string; street: string; neighborhood?: string; city: string; latitude?: number; longitude?: number; instructions?: string };
  paymentMethod: PaymentMethod;
}

const stamp = (status: OrderStatus, by: string) => ({ status, at: new Date(), by });

/** Transition atomique : n'aboutit que si la commande est encore dans l'état `from`. */
export async function changeStatus(orderId: string, from: OrderStatus, to: OrderStatus, by: string, extra: Record<string, unknown> = {}) {
  const order = await Order.findOneAndUpdate(
    { _id: oid(orderId), status: from },
    { $set: { status: to, ...extra }, $push: { statusHistory: stamp(to, by) } },
    { new: true },
  );
  if (!order) throw AppError.conflict('Le statut de la commande a changé, rechargez la page');
  await eventBus.emit('ORDER_STATUS_CHANGED', { orderId, from, to });
  return order;
}

export async function loadOrder(orderId: string) {
  if (!Types.ObjectId.isValid(orderId)) throw AppError.notFound('Commande introuvable');
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Commande introuvable');
  return order;
}

/** Contrôle d'accès à une commande selon le rôle (toujours côté serveur). */
export async function assertCanView(order: { userId: unknown; pharmacyId: unknown; _id: unknown }, auth: AuthUser) {
  if (auth.role === 'ADMIN') return;
  if (auth.role === 'PATIENT' && String(order.userId) === auth.id) return;
  if (auth.role === 'PHARMACIST' && auth.pharmacyId && String(order.pharmacyId) === auth.pharmacyId) return;
  if (auth.role === 'DELIVERY_AGENT') {
    const d = await Delivery.findOne({ orderId: order._id as Types.ObjectId, deliveryAgentId: oid(auth.id) }).lean();
    if (d) return;
  }
  throw AppError.forbidden('Cette commande ne vous appartient pas');
}

function assertPharmacyOwns(order: { pharmacyId: unknown }, auth: AuthUser) {
  if (auth.role === 'ADMIN') return;
  if (auth.role === 'PHARMACIST' && auth.pharmacyId && String(order.pharmacyId) === auth.pharmacyId) return;
  throw AppError.forbidden('Cette commande n’appartient pas à votre pharmacie');
}

export const orderService = {
  async create(userId: string, input: CreateOrderInput, req?: Request) {
    const pharmacy = await Pharmacy.findOne({ _id: oid(input.pharmacyId), isActive: true, isValidated: true });
    if (!pharmacy) throw AppError.notFound('Pharmacie introuvable ou indisponible');
    if (input.deliveryType === 'delivery' && !pharmacy.offersDelivery) throw AppError.conflict('Cette pharmacie ne propose pas la livraison');
    if (input.deliveryType === 'pickup' && !pharmacy.offersPickup) throw AppError.conflict('Cette pharmacie ne propose pas le retrait');
    if (input.paymentMethod === 'cash_on_delivery' && input.deliveryType !== 'delivery') throw AppError.validation([{ path: 'paymentMethod', message: 'Paiement à la livraison réservé aux livraisons' }]);
    if (input.paymentMethod === 'cash_on_pickup' && input.deliveryType !== 'pickup') throw AppError.validation([{ path: 'paymentMethod', message: 'Paiement au retrait réservé aux retraits' }]);

    // adresse + tarif de livraison à la distance (calculé côté serveur, jamais fourni par le client)
    let addressId: Types.ObjectId | undefined;
    let addressSnapshot: unknown;
    let deliveryFee = 0;
    let deliveryDistanceKm: number | undefined;
    if (input.deliveryType === 'delivery') {
      let coords: { latitude?: number | null; longitude?: number | null };
      let saved: { _id: Types.ObjectId } | undefined;
      if (input.addressId) {
        const a = await Address.findOne({ _id: oid(input.addressId), userId: oid(userId) }).lean();
        if (!a) throw AppError.notFound('Adresse introuvable');
        saved = a;
        coords = a;
        addressSnapshot = a;
      } else if (input.address) {
        coords = input.address;
      } else throw AppError.validation([{ path: 'address', message: 'Adresse de livraison requise' }]);

      if (coords.latitude == null || coords.longitude == null) {
        throw AppError.validation([{ path: 'address', message: 'Position requise pour calculer les frais de livraison : partagez votre position ou choisissez votre quartier' }]);
      }
      const q = deliveryQuote(pharmacy, coords.latitude, coords.longitude);
      if (!q.inZone) {
        throw AppError.conflict(`Adresse hors de la zone de livraison de cette pharmacie (${q.distanceKm} km, maximum ${q.radiusKm} km)`, { distanceKm: q.distanceKm, radiusKm: q.radiusKm });
      }
      deliveryFee = q.fee;
      deliveryDistanceKm = q.distanceKm;
      if (saved) addressId = saved._id;
      else {
        const created = await Address.create({ ...input.address!, userId: oid(userId) });
        addressId = created._id;
        addressSnapshot = created.toObject();
      }
    }

    // fusionner les lignes identiques
    const merged = new Map<string, number>();
    for (const it of input.items) merged.set(it.medicineId, (merged.get(it.medicineId) ?? 0) + it.quantity);

    // ne jamais réserver de produits expirés
    await stockService.sweepExpired(input.pharmacyId);

    const medIds = [...merged.keys()];
    const [stocks, meds] = await Promise.all([
      Stock.find({ pharmacyId: pharmacy._id, medicineId: { $in: medIds.map(oid) }, isListed: true }).lean(),
      Medicine.find({ _id: { $in: medIds.map(oid) } }).lean(),
    ]);
    const lines = [];
    for (const [medicineId, quantity] of merged) {
      const stock = stocks.find((s) => String(s.medicineId) === medicineId);
      const med = meds.find((m) => String(m._id) === medicineId);
      if (!stock || !med) throw AppError.validation([{ path: 'items', message: `Médicament indisponible dans cette pharmacie (${medicineId})` }]);
      if (quantity > stock.available) {
        throw AppError.conflict(`Stock insuffisant pour ${med.name}`, { medicineId, requested: quantity, available: stock.available });
      }
      lines.push({
        medicineId: med._id,
        stockId: stock._id,
        name: [med.name, med.dosage].filter(Boolean).join(' '),
        quantity,
        unitPrice: stock.unitPrice,
        prescriptionRequired: !!med.prescriptionRequired,
      });
    }

    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const orderId = new Types.ObjectId();
    const order = await Order.create({
      _id: orderId,
      userId: oid(userId),
      pharmacyId: pharmacy._id,
      deliveryType: input.deliveryType,
      items: lines,
      subtotal,
      deliveryFee,
      deliveryDistanceKm,
      totalAmount: subtotal + deliveryFee,
      addressId,
      addressSnapshot,
      paymentMethod: input.paymentMethod,
      prescriptionRequired: lines.some((l) => l.prescriptionRequired),
      statusHistory: [stamp('pending', 'PATIENT')],
    });

    // réservation atomique ligne par ligne ; annulation propre en cas d'échec
    const reserved: typeof lines = [];
    try {
      for (const l of lines) {
        await stockService.reserve(String(l.stockId), l.quantity, { userId, orderId: String(orderId), reference: `ORDER-${orderId}` });
        reserved.push(l);
      }
    } catch (err) {
      for (const l of reserved) {
        await stockService.release(String(l.stockId), l.quantity, { userId, orderId: String(orderId), reference: `ORDER-${orderId}` }).catch((e) => logger.error('Libération échouée', { error: String(e) }));
      }
      await Order.deleteOne({ _id: orderId });
      throw err;
    }
    await Order.updateOne({ _id: orderId }, { $set: { stockReserved: true } });
    await paymentService.initiatePayment({ _id: orderId, userId: oid(userId), totalAmount: order.totalAmount, paymentMethod: input.paymentMethod });

    await audit({ action: 'order.create', userId, entity: 'Order', entityId: String(orderId), metadata: { total: order.totalAmount, type: input.deliveryType }, req });
    await eventBus.emit('ORDER_CONFIRMED', { orderId: String(orderId) });
    return Order.findById(orderId);
  },

  async accept(orderId: string, auth: AuthUser) {
    const order = await loadOrder(orderId);
    assertPharmacyOwns(order, auth);
    return changeStatus(orderId, 'pending', 'confirmed', auth.role);
  },

  async prepare(orderId: string, auth: AuthUser) {
    const order = await loadOrder(orderId);
    assertPharmacyOwns(order, auth);
    return changeStatus(orderId, 'confirmed', 'preparing', auth.role);
  },

  /** Commande prête : pour une livraison, ouvre la recherche d'un livreur. */
  async markReady(orderId: string, auth: AuthUser) {
    const order = await loadOrder(orderId);
    assertPharmacyOwns(order, auth);
    const updated = await changeStatus(orderId, 'preparing', 'ready', auth.role);
    if (updated.deliveryType === 'delivery') {
      const pharmacy = await Pharmacy.findById(updated.pharmacyId).lean();
      const snap = (updated.addressSnapshot ?? {}) as { latitude?: number; longitude?: number; street?: string; neighborhood?: string };
      await Delivery.create({
        orderId: updated._id,
        pharmacyId: updated.pharmacyId,
        pickupLocation: { latitude: pharmacy?.latitude, longitude: pharmacy?.longitude, address: pharmacy?.address },
        deliveryLocation: { latitude: snap.latitude, longitude: snap.longitude, address: [snap.street, snap.neighborhood].filter(Boolean).join(', ') },
        status: 'searching',
      });
      const agents = await DeliveryAgent.find({ isAvailable: true }).select('userId').lean();
      for (const a of agents) {
        await notify.user(a.userId, { type: 'delivery.available', title: 'Nouvelle livraison disponible', message: `${pharmacy?.name ?? 'Une pharmacie'} a une commande à livrer.`, data: { orderId } });
      }
    }
    return updated;
  },

  /** Retrait en pharmacie : le pharmacien saisit le code présenté par le patient. */
  async handover(orderId: string, code: string, auth: AuthUser) {
    const order = await loadOrder(orderId);
    assertPharmacyOwns(order, auth);
    if (order.deliveryType !== 'pickup') throw AppError.conflict('Cette commande est une livraison');
    if (order.status !== 'ready') throw AppError.conflict('La commande n’est pas prête');
    await checkCode(order, code);
    await consumeOrderStock(order);
    const done = await changeStatus(orderId, 'ready', 'delivered', auth.role, { deliveredAt: new Date(), stockConsumed: true });
    await eventBus.emit('DELIVERY_COMPLETED', { orderId });
    return done;
  },

  async cancel(orderId: string, auth: AuthUser, reason?: string) {
    const order = await loadOrder(orderId);
    const status = order.status;
    if (auth.role === 'PATIENT') {
      if (String(order.userId) !== auth.id) throw AppError.forbidden('Cette commande ne vous appartient pas');
      if (!['pending', 'confirmed'].includes(status)) throw AppError.conflict('Annulation impossible : la commande est déjà en préparation');
    } else {
      assertPharmacyOwns(order, auth);
      if (!['pending', 'confirmed', 'preparing', 'ready', 'assigned'].includes(status)) throw AppError.conflict('Annulation impossible à ce stade');
    }
    const by = auth.role === 'PATIENT' ? 'patient' : auth.role === 'ADMIN' ? 'admin' : 'pharmacy';
    // 1) transition atomique (empêche une double libération)
    const cancelled = await Order.findOneAndUpdate(
      { _id: order._id, status },
      { $set: { status: 'cancelled', cancelledBy: by, cancelReason: reason }, $push: { statusHistory: stamp('cancelled', by) } },
      { new: true },
    );
    if (!cancelled) throw AppError.conflict('Le statut de la commande a changé, rechargez la page');
    // 2) libération automatique du stock réservé
    if (cancelled.stockReserved && !cancelled.stockConsumed) {
      for (const it of cancelled.items) {
        await stockService
          .release(String(it.stockId), it.quantity, { userId: auth.id, orderId: String(cancelled._id), reference: `CANCEL-${cancelled._id}`, note: reason })
          .catch((e) => logger.error('Libération échouée', { orderId, error: String(e) }));
      }
      await Order.updateOne({ _id: cancelled._id }, { $set: { stockReserved: false } });
    }
    // 3) remboursement + livraison associée
    await paymentService.refundPayment(String(cancelled._id));
    await Delivery.updateOne(
      { orderId: cancelled._id, status: { $ne: 'delivered' } },
      { $set: { status: 'cancelled' }, $unset: { patientLatitude: 1, patientLongitude: 1, patientLocationAccuracy: 1, patientLocationAt: 1 } },
    );
    await audit({ action: 'order.cancel', userId: auth.id, entity: 'Order', entityId: String(cancelled._id), metadata: { by, reason } });
    await eventBus.emit('ORDER_CANCELLED', { orderId: String(cancelled._id), by, reason });
    return Order.findById(cancelled._id);
  },

  async review(orderId: string, userId: string, rating: number, comment?: string) {
    const order = await loadOrder(orderId);
    if (String(order.userId) !== userId) throw AppError.forbidden('Cette commande ne vous appartient pas');
    if (order.status !== 'delivered') throw AppError.conflict('Vous pouvez évaluer une commande une fois livrée');
    if (await Review.exists({ orderId: order._id })) throw AppError.conflict('Commande déjà évaluée');
    return Review.create({ orderId: order._id, userId: oid(userId), pharmacyId: order.pharmacyId, rating, comment });
  },
};

/** Vérifie le code avec limitation des tentatives (anti force brute sur 6 chiffres). */
export async function checkCode(order: { _id: unknown }, code: string) {
  const o = await Order.findOneAndUpdate({ _id: order._id, codeAttempts: { $lt: MAX_CODE_ATTEMPTS } }, { $inc: { codeAttempts: 1 } }, { new: true });
  if (!o) throw AppError.tooMany('Trop de codes erronés : contactez la pharmacie');
  if (!verifyOrderCode(String(order._id), code)) throw AppError.forbidden('Code incorrect');
  await Order.updateOne({ _id: order._id }, { $set: { codeAttempts: 0 } });
}

/** Sortie définitive du stock réservé (vente) - appelée à la remise au livreur / au patient. */
export async function consumeOrderStock(order: { _id: unknown; userId: unknown; items: { stockId: unknown; quantity: number }[]; stockConsumed?: boolean | null }) {
  if (order.stockConsumed) return;
  const done: { stockId: string; qty: number }[] = [];
  try {
    for (const it of order.items) {
      await stockService.consume(String(it.stockId), it.quantity, { userId: String(order.userId), orderId: String(order._id), reference: `SALE-${order._id}` }, { type: 'sale', fromReserved: true });
      done.push({ stockId: String(it.stockId), qty: it.quantity });
    }
  } catch (err) {
    // Remettre en réservation ce qui a déjà été sorti n'est pas possible proprement : on signale.
    logger.error('Vente partielle de commande', { orderId: String(order._id), done, error: String(err) });
    throw err;
  }
}

export { orderCode };
