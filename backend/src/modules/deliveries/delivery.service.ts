import { Delivery } from '../../models/Delivery';
import { DeliveryAgent } from '../../models/DeliveryAgent';
import { DeliveryAssignment } from '../../models/DeliveryAssignment';
import { Order } from '../../models/Order';
import { Pharmacy } from '../../models/Pharmacy';
import { AppError } from '../../utils/AppError';
import { oid } from '../../utils/ids';
import { audit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { eventBus } from '../../events/eventBus';
import { changeStatus, checkCode, consumeOrderStock, loadOrder } from '../orders/order.service';
import type { AuthUser } from '../../middleware/auth';
import { User } from '../../models/User';
import { PRIVATE_FIELDS, UNSET_PRIVATE } from './privacy';
import { settlementService } from '../settlements/settlement.service';
import { isValidPhone, normalizePhone, PHONE_MESSAGE } from '../../utils/phone';

export const MAX_ACTIVE_DELIVERIES = 3;

/** Masque les données personnelles du patient à tous sauf lui-même et le livreur assigné. */
export function forViewer<T extends Record<string, unknown>>(d: T | null, auth: AuthUser): T | null {
  if (!d || auth.role === 'PATIENT' || auth.role === 'DELIVERY_AGENT') return d;
  const copy: Record<string, unknown> = { ...d };
  for (const f of PRIVATE_FIELDS) delete copy[f];
  return copy as T;
}

export const MAX_PHONE_REQUESTS = 3;
const ACTIVE = ['assigned', 'picked_up', 'in_delivery'];

async function mine(deliveryId: string, auth: AuthUser) {
  const d = await Delivery.findById(deliveryId);
  if (!d) throw AppError.notFound('Livraison introuvable');
  if (auth.role !== 'ADMIN' && String(d.deliveryAgentId) !== auth.id) throw AppError.forbidden('Cette livraison ne vous est pas assignée');
  return d;
}

export const deliveryService = {
  async setAvailability(userId: string, data: { isAvailable?: boolean; vehicle?: string; latitude?: number; longitude?: number; payoutOperator?: 'wave' | 'orange_money'; payoutPhone?: string }) {
    const set: Record<string, unknown> = { ...data };
    if (data.latitude !== undefined && data.longitude !== undefined) set.locationUpdatedAt = new Date();
    return DeliveryAgent.findOneAndUpdate({ userId: oid(userId) }, { $set: set, $setOnInsert: { userId: oid(userId) } }, { upsert: true, new: true });
  },

  async listAvailable(userId: string) {
    const agent = await DeliveryAgent.findOne({ userId: oid(userId) }).lean();
    if (!agent?.isAvailable) return [];
    const deliveries = await Delivery.find({ status: 'searching' }).sort({ createdAt: 1 }).limit(50).lean();
    const pharmacies = await Pharmacy.find({ _id: { $in: deliveries.map((d) => d.pharmacyId) } }).select('name address neighborhood').lean();
    const orders = await Order.find({ _id: { $in: deliveries.map((d) => d.orderId) } }).select('totalAmount deliveryFee deliveryDistanceKm items').lean();
    return deliveries.map((d) => ({
      ...d,
      pharmacy: pharmacies.find((p) => String(p._id) === String(d.pharmacyId)),
      order: orders.find((o) => String(o._id) === String(d.orderId)),
    }));
  },

  /** Acceptation : prise atomique (un seul livreur peut obtenir la livraison). */
  async accept(deliveryId: string, auth: AuthUser) {
    const agent = await DeliveryAgent.findOne({ userId: oid(auth.id) }).lean();
    if (!agent?.isAvailable) throw AppError.conflict('Passez en disponible pour accepter une livraison');
    const active = await Delivery.countDocuments({ deliveryAgentId: oid(auth.id), status: { $in: ['assigned', 'picked_up', 'in_delivery'] } });
    if (active >= MAX_ACTIVE_DELIVERIES) throw AppError.conflict(`Maximum ${MAX_ACTIVE_DELIVERIES} livraisons en cours`);

    await settlementService.assertCanTakeDelivery(auth.id); // trop d'espèces non remises : refus

    const delivery = await Delivery.findOneAndUpdate(
      { _id: oid(deliveryId), status: 'searching' },
      { $set: { status: 'assigned', deliveryAgentId: oid(auth.id) } },
      { new: true },
    );
    if (!delivery) throw AppError.conflict('Cette livraison n’est plus disponible');
    try {
      await changeStatus(String(delivery.orderId), 'ready', 'assigned', 'DELIVERY_AGENT');
    } catch (err) {
      await Delivery.updateOne({ _id: delivery._id }, { $set: { status: 'searching' }, $unset: { deliveryAgentId: 1 } });
      throw err;
    }
    await DeliveryAssignment.create({ deliveryId: delivery._id, orderId: delivery.orderId, agentId: oid(auth.id) });
    await audit({ action: 'delivery.accept', userId: auth.id, entity: 'Delivery', entityId: String(delivery._id) });
    return delivery;
  },

  /** Le livreur récupère la commande : c'est ici que le stock sort définitivement (vente). */
  async pickup(deliveryId: string, auth: AuthUser) {
    const d = await mine(deliveryId, auth);
    if (d.status !== 'assigned') throw AppError.conflict('La livraison n’est pas à l’état « assignée »');
    const order = await loadOrder(String(d.orderId));
    await changeStatus(String(order._id), 'assigned', 'picked_up', 'DELIVERY_AGENT');
    try {
      await consumeOrderStock(order);
    } catch (err) {
      await Order.updateOne({ _id: order._id }, { $set: { status: 'assigned' } });
      throw err;
    }
    await Order.updateOne({ _id: order._id }, { $set: { stockConsumed: true } });
    d.status = 'picked_up';
    d.pickedUpAt = new Date();
    await d.save();
    return d;
  },

  async start(deliveryId: string, auth: AuthUser) {
    const d = await mine(deliveryId, auth);
    if (d.status !== 'picked_up') throw AppError.conflict('Récupérez d’abord la commande');
    await changeStatus(String(d.orderId), 'picked_up', 'in_delivery', 'DELIVERY_AGENT');
    d.status = 'in_delivery';
    await d.save();
    return d;
  },

  async updateLocation(deliveryId: string, auth: AuthUser, latitude: number, longitude: number) {
    const d = await mine(deliveryId, auth);
    d.agentLatitude = latitude;
    d.agentLongitude = longitude;
    d.agentLocationAt = new Date();
    await d.save();
    return d;
  },

  /** Confirmation de remise au patient par code de livraison (OTP). */
  async complete(deliveryId: string, auth: AuthUser, code: string) {
    const d = await mine(deliveryId, auth);
    if (d.status !== 'in_delivery') throw AppError.conflict('La livraison n’est pas en cours');
    const order = await loadOrder(String(d.orderId));
    await checkCode(order, code);
    await changeStatus(String(order._id), 'in_delivery', 'delivered', 'DELIVERY_AGENT', { deliveredAt: new Date() });
    d.status = 'delivered';
    d.deliveredAt = new Date();
    await d.save();
    await DeliveryAssignment.updateOne({ deliveryId: d._id, agentId: oid(auth.id) }, { $set: { status: 'completed', completedAt: new Date() } });
    await Delivery.updateOne({ _id: d._id }, { $unset: UNSET_PRIVATE }); // minimisation : position et numéro effacés à la livraison
    await audit({ action: 'delivery.complete', userId: auth.id, entity: 'Delivery', entityId: String(d._id) });
    await eventBus.emit('DELIVERY_COMPLETED', { orderId: String(order._id), deliveryId: String(d._id) });
    return d;
  },

  /** Le patient partage volontairement sa position avec le livreur assigné (consentement à chaque envoi côté interface). */
  async sharePatientLocation(orderId: string, auth: AuthUser, latitude: number, longitude: number, accuracy?: number) {
    const order = await loadOrder(orderId);
    if (String(order.userId) !== auth.id) throw AppError.forbidden('Cette commande ne vous appartient pas');
    if (order.deliveryType !== 'delivery') throw AppError.conflict('Cette commande est un retrait en pharmacie');
    const prev = await Delivery.findOneAndUpdate(
      { orderId: order._id, status: { $in: ['assigned', 'picked_up', 'in_delivery'] } },
      { $set: { patientLatitude: latitude, patientLongitude: longitude, patientLocationAccuracy: accuracy, patientLocationAt: new Date() } },
      { new: false },
    );
    if (!prev) throw AppError.conflict('Vous pourrez partager votre position dès qu’un livreur aura accepté la livraison');
    if (!prev.patientLocationAt && prev.deliveryAgentId) {
      await notify.user(prev.deliveryAgentId, { type: 'delivery.patient_location', title: 'Position du client', message: 'Le client a partagé sa position pour vous guider.', data: { orderId } });
    }
    await audit({ action: 'delivery.patient_location_shared', userId: auth.id, entity: 'Delivery', entityId: String(prev._id) });
    return { shared: true };
  },

  async stopSharingPatientLocation(orderId: string, auth: AuthUser) {
    const order = await loadOrder(orderId);
    if (String(order.userId) !== auth.id) throw AppError.forbidden('Cette commande ne vous appartient pas');
    await Delivery.updateOne(
      { orderId: order._id },
      { $unset: { patientLatitude: 1, patientLongitude: 1, patientLocationAccuracy: 1, patientLocationAt: 1 } },
    );
    return { shared: false };
  },

  /**
   * Le patient partage SON numéro avec le livreur assigné (numéro du profil ou numéro saisi).
   * Fonctionne aussi en réponse à une demande du livreur.
   */
  async sharePatientPhone(orderId: string, auth: AuthUser, phone?: string) {
    const order = await loadOrder(orderId);
    if (String(order.userId) !== auth.id) throw AppError.forbidden('Cette commande ne vous appartient pas');
    if (order.deliveryType !== 'delivery') throw AppError.conflict('Cette commande est un retrait en pharmacie');
    const number = normalizePhone(phone ?? (await User.findById(auth.id).select('phone').lean())?.phone ?? '');
    if (!number) throw AppError.validation([{ path: 'phone', message: 'Saisissez votre numéro : aucun numéro n’est enregistré sur votre profil' }]);
    if (!isValidPhone(number)) throw AppError.validation([{ path: 'phone', message: PHONE_MESSAGE }]);
    const prev = await Delivery.findOneAndUpdate(
      { orderId: order._id, status: { $in: ACTIVE } },
      { $set: { patientPhone: number, patientPhoneSharedAt: new Date(), phoneRequestStatus: 'shared' } },
      { new: false },
    );
    if (!prev) throw AppError.conflict('Vous pourrez partager votre numéro dès qu’un livreur aura accepté la livraison');
    if (prev.deliveryAgentId) {
      await notify.user(prev.deliveryAgentId, { type: 'delivery.patient_phone', title: 'Numéro du client', message: 'Le client a partagé son numéro de téléphone.', data: { orderId } });
    }
    await audit({ action: 'delivery.patient_phone_shared', userId: auth.id, entity: 'Delivery', entityId: String(prev._id) }); // le numéro n'est jamais journalisé
    return { shared: true };
  },

  async stopSharingPatientPhone(orderId: string, auth: AuthUser) {
    const order = await loadOrder(orderId);
    if (String(order.userId) !== auth.id) throw AppError.forbidden('Cette commande ne vous appartient pas');
    await Delivery.updateOne({ orderId: order._id }, { $unset: { patientPhone: 1, patientPhoneSharedAt: 1, phoneRequestStatus: 1, phoneRequestedAt: 1 } });
    return { shared: false };
  },

  /** Le patient refuse de communiquer son numéro : le livreur en est informé. */
  async declinePhoneRequest(orderId: string, auth: AuthUser) {
    const order = await loadOrder(orderId);
    if (String(order.userId) !== auth.id) throw AppError.forbidden('Cette commande ne vous appartient pas');
    const d = await Delivery.findOneAndUpdate(
      { orderId: order._id, status: { $in: ACTIVE }, phoneRequestStatus: 'requested' },
      { $set: { phoneRequestStatus: 'declined' } },
      { new: true },
    );
    if (!d) throw AppError.conflict('Aucune demande de numéro en attente');
    if (d.deliveryAgentId) await notify.user(d.deliveryAgentId, { type: 'delivery.phone_declined', title: 'Numéro non partagé', message: 'Le client préfère ne pas partager son numéro. Utilisez la position ou contactez la pharmacie.', data: { orderId } });
    return { declined: true };
  },

  /** Le livreur demande le numéro du patient (le patient décide de le partager ou non). */
  async requestPatientPhone(deliveryId: string, auth: AuthUser) {
    const d = await mine(deliveryId, auth);
    if (!ACTIVE.includes(d.status)) throw AppError.conflict('La livraison n’est pas en cours');
    if (d.phoneRequestStatus === 'shared') throw AppError.conflict('Le client a déjà partagé son numéro');
    if (d.phoneRequestStatus === 'requested') throw AppError.conflict('Demande déjà envoyée : en attente de la réponse du client');
    if ((d.phoneRequestCount ?? 0) >= MAX_PHONE_REQUESTS) throw AppError.tooMany('Nombre maximal de demandes atteint pour cette livraison');
    const updated = await Delivery.findOneAndUpdate(
      { _id: d._id, $or: [{ phoneRequestStatus: { $exists: false } }, { phoneRequestStatus: 'declined' }] },
      { $set: { phoneRequestStatus: 'requested', phoneRequestedAt: new Date() }, $inc: { phoneRequestCount: 1 } },
      { new: true },
    );
    if (!updated) throw AppError.conflict('Demande déjà envoyée ou numéro déjà partagé');
    const order = await loadOrder(String(d.orderId));
    await notify.user(order.userId, { type: 'delivery.phone_requested', title: 'Le livreur demande votre numéro', message: 'Pour vous joindre à l’arrivée, le livreur demande votre numéro. Vous pouvez accepter ou refuser sur la page de votre commande.', data: { orderId: String(order._id) } });
    await audit({ action: 'delivery.phone_requested', userId: auth.id, entity: 'Delivery', entityId: String(d._id) });
    return { requested: true };
  },
};
