import { Types } from 'mongoose';
import { Settlement } from '../../models/Settlement';
import { Payout } from '../../models/Payout';
import { Order } from '../../models/Order';
import { Payment } from '../../models/Payment';
import { Delivery } from '../../models/Delivery';
import { Pharmacy } from '../../models/Pharmacy';
import { DeliveryAgent } from '../../models/DeliveryAgent';
import { User } from '../../models/User';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { oid } from '../../utils/ids';
import { audit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { activePayoutProvider, maskPhone, OPERATOR_LABEL, type Operator } from '../payments/payout.service';
import type { AuthUser } from '../../middleware/auth';

export const MAX_PAYOUT_ATTEMPTS = 5;
/** Plafond d'espèces qu'un livreur peut détenir (à remettre aux pharmacies) avant de ne plus pouvoir accepter de livraison. */
export const cashLimit = () => Number(process.env.CASH_LIMIT_FCFA ?? 50_000);
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

/**
 * RÉPARTITION : la pharmacie reçoit le prix des médicaments, le livreur reçoit les frais de livraison.
 * Aucune commission de plateforme à ce stade. pharmacie + livreur = total, toujours.
 */
export function computeShares(order: { totalAmount: number; deliveryFee: number; deliveryType: 'pickup' | 'delivery' }) {
  const courierAmount = order.deliveryType === 'delivery' ? order.deliveryFee : 0;
  return { pharmacyAmount: order.totalAmount - courierAmount, courierAmount };
}

type PayoutDoc = { _id: Types.ObjectId; settlementId: Types.ObjectId; recipientType: 'PHARMACY' | 'COURIER'; recipientId: Types.ObjectId; amount: number };

async function accountFor(p: PayoutDoc): Promise<{ operator: Operator; phone: string } | null> {
  const src = p.recipientType === 'PHARMACY' ? await Pharmacy.findById(p.recipientId).lean() : await DeliveryAgent.findOne({ userId: p.recipientId }).lean();
  return src?.payoutOperator && src.payoutPhone ? { operator: src.payoutOperator, phone: src.payoutPhone } : null;
}

async function refreshStatus(settlementId: Types.ObjectId | string) {
  const payouts = await Payout.find({ settlementId }).lean();
  if (!payouts.length) return;
  const paid = payouts.filter((p) => p.status === 'paid').length;
  const status = payouts.some((p) => p.status === 'failed') ? 'failed' : paid === payouts.length ? 'paid' : paid > 0 ? 'partial' : 'pending';
  await Settlement.updateOne({ _id: settlementId }, { $set: { status } });
}

/** Exécute un versement. Réservation atomique (pending -> processing) : un versement ne part JAMAIS deux fois. */
async function executePayout(payoutId: Types.ObjectId | string) {
  const claimed = await Payout.findOneAndUpdate(
    { _id: payoutId, status: 'pending', attempts: { $lt: MAX_PAYOUT_ATTEMPTS } },
    { $set: { status: 'processing' }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!claimed) return;
  const account = await accountFor(claimed);
  if (!account) {
    // pas de compte de réception : le versement attend (ne compte pas comme une tentative)
    await Payout.updateOne({ _id: claimed._id }, { $set: { status: 'pending', failureReason: 'Compte de réception (Wave / Orange Money) non renseigné' }, $inc: { attempts: -1 } });
    await refreshStatus(claimed.settlementId);
    return;
  }
  const provider = activePayoutProvider();
  let res: { providerReference: string; status: 'paid' | 'failed'; error?: string };
  try {
    res = await provider.disburse({ reference: `${claimed.settlementId}:${claimed.recipientType}`, amount: claimed.amount, ...account });
  } catch (err) {
    res = { providerReference: '', status: 'failed', error: String((err as Error).message ?? err) };
  }
  await Payout.updateOne(
    { _id: claimed._id },
    {
      $set: {
        status: res.status, provider: provider.name, mode: provider.mode, providerReference: res.providerReference, operator: account.operator,
        destination: maskPhone(account.phone), ...(res.status === 'paid' ? { paidAt: new Date() } : { failureReason: res.error ?? 'Versement refusé' }),
      },
      ...(res.status === 'paid' ? { $unset: { failureReason: 1 } } : {}),
    },
  );
  if (res.status === 'paid') {
    const msg = `Vous avez reçu ${fcfa(claimed.amount)} sur votre compte ${OPERATOR_LABEL[account.operator]} (${claimed.recipientType === 'PHARMACY' ? 'prix des médicaments' : 'frais de livraison'}).`;
    if (claimed.recipientType === 'PHARMACY') await notify.pharmacy(claimed.recipientId, { type: 'payout.paid', title: 'Paiement reçu', message: msg, data: { orderId: String(claimed.orderId) } });
    else await notify.user(claimed.recipientId, { type: 'payout.paid', title: 'Paiement reçu', message: msg, data: { orderId: String(claimed.orderId) } });
  } else {
    logger.error('Versement refusé', { payoutId: String(claimed._id), reason: res.error });
  }
  await refreshStatus(claimed.settlementId);
}

export const settlementService = {
  /**
   * Libère l'argent d'une commande LIVRÉE (déclenché par DELIVERY_COMPLETED, quand le patient a donné son code).
   * Idempotent : une seule répartition par commande, un seul versement par bénéficiaire.
   */
  async release(orderId: string) {
    const existing = await Settlement.findOne({ orderId: oid(orderId) });
    if (existing) return existing;
    const order = await Order.findById(orderId).lean();
    if (!order || order.status !== 'delivered') return null;
    const [delivery, payment] = await Promise.all([
      Delivery.findOne({ orderId: order._id }).lean(),
      Payment.findOne({ orderId: order._id, status: 'paid' }).lean(),
    ]);
    if (!payment) { logger.error('Répartition impossible : paiement non encaissé', { orderId }); return null; }

    const { pharmacyAmount, courierAmount } = computeShares(order);
    const courierId = order.deliveryType === 'delivery' ? delivery?.deliveryAgentId : undefined;
    const kind = payment.method === 'cash_on_delivery' ? 'cash_delivery' : payment.method === 'cash_on_pickup' ? 'cash_pickup' : 'online';
    let settlement;
    try {
      settlement = await Settlement.create({
        orderId: order._id, pharmacyId: order.pharmacyId, courierId, kind, mode: payment.mode, pharmacyAmount, courierAmount, totalAmount: order.totalAmount,
        status: kind === 'online' ? 'pending' : kind === 'cash_delivery' ? 'cash_due' : 'settled',
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return Settlement.findOne({ orderId: order._id }); // course : déjà créée
      throw err;
    }

    if (kind === 'online') {
      const targets = [{ recipientType: 'PHARMACY' as const, recipientId: order.pharmacyId, amount: pharmacyAmount }, ...(courierId && courierAmount > 0 ? [{ recipientType: 'COURIER' as const, recipientId: courierId, amount: courierAmount }] : [])];
      for (const t of targets.filter((x) => x.amount > 0)) {
        try { await Payout.create({ settlementId: settlement._id, orderId: order._id, ...t, status: 'pending' }); }
        catch (err) { if ((err as { code?: number }).code !== 11000) throw err; }
      }
      for (const p of await Payout.find({ settlementId: settlement._id }).lean()) await executePayout(p._id);
    } else if (kind === 'cash_delivery') {
      if (courierId) await notify.user(courierId, { type: 'cash.due', title: 'Espèces à remettre', message: `Vous avez encaissé ${fcfa(order.totalAmount)}. Vous gardez ${fcfa(courierAmount)} (frais de livraison) et devez remettre ${fcfa(pharmacyAmount)} à la pharmacie.`, data: { orderId } });
      await notify.pharmacy(order.pharmacyId, { type: 'cash.expected', title: 'Espèces à recevoir', message: `Le livreur doit vous remettre ${fcfa(pharmacyAmount)} pour une commande payée en espèces.`, data: { orderId } });
    }
    await audit({ action: 'settlement.release', entity: 'Settlement', entityId: String(settlement._id), metadata: { kind, pharmacyAmount, courierAmount } });
    return Settlement.findById(settlement._id);
  },

  /** Relance les versements en attente ou échoués d'un bénéficiaire (après saisie de son compte, ou par un admin). */
  async retryFor(filter: { recipientType?: 'PHARMACY' | 'COURIER'; recipientId?: Types.ObjectId | string; settlementId?: Types.ObjectId | string }) {
    const q: Record<string, unknown> = { status: { $in: ['pending', 'failed'] }, attempts: { $lt: MAX_PAYOUT_ATTEMPTS } };
    if (filter.recipientType) q.recipientType = filter.recipientType;
    if (filter.recipientId) q.recipientId = oid(String(filter.recipientId));
    if (filter.settlementId) q.settlementId = oid(String(filter.settlementId));
    let n = 0;
    for (const p of await Payout.find(q).lean()) {
      await Payout.updateOne({ _id: p._id, status: 'failed' }, { $set: { status: 'pending' } });
      await executePayout(p._id);
      n++;
    }
    return n;
  },

  /** Le pharmacien confirme avoir REÇU les espèces du livreur. */
  async confirmCash(settlementId: string, auth: AuthUser) {
    if (!Types.ObjectId.isValid(settlementId)) throw AppError.notFound('Répartition introuvable');
    const s = await Settlement.findById(settlementId);
    if (!s) throw AppError.notFound('Répartition introuvable');
    if (auth.role === 'PHARMACIST' && String(s.pharmacyId) !== auth.pharmacyId) throw AppError.forbidden('Cette remise ne concerne pas votre pharmacie');
    if (s.kind !== 'cash_delivery') throw AppError.conflict('Cette commande n’a pas d’espèces à remettre');
    const done = await Settlement.findOneAndUpdate({ _id: s._id, status: 'cash_due' }, { $set: { status: 'cash_remitted', cashRemittedAt: new Date(), confirmedBy: oid(auth.id) } }, { new: true });
    if (!done) throw AppError.conflict('Cette remise est déjà confirmée');
    if (s.courierId) await notify.user(s.courierId, { type: 'cash.confirmed', title: 'Remise confirmée', message: `La pharmacie a confirmé la réception de ${fcfa(s.pharmacyAmount)}.`, data: { orderId: String(s.orderId) } });
    await audit({ action: 'settlement.cash_confirmed', userId: auth.id, entity: 'Settlement', entityId: String(s._id), metadata: { amount: s.pharmacyAmount } });
    return done;
  },

  /** Espèces actuellement détenues par un livreur (à remettre aux pharmacies). */
  async cashHeldBy(courierId: string) {
    const due = await Settlement.find({ courierId: oid(courierId), kind: 'cash_delivery', status: 'cash_due' }).lean();
    return { amount: due.reduce((s, x) => s + x.pharmacyAmount, 0), count: due.length, oldest: due.reduce<Date | null>((m, x) => (!m || x.releasedAt < m ? x.releasedAt : m), null) };
  },

  async assertCanTakeDelivery(courierId: string) {
    const held = await this.cashHeldBy(courierId);
    if (held.amount > cashLimit()) {
      throw AppError.conflict(`Vous détenez ${fcfa(held.amount)} d’espèces à remettre aux pharmacies (plafond ${fcfa(cashLimit())}). Remettez-les avant d’accepter une nouvelle livraison.`, { cashHeld: held.amount, limit: cashLimit() });
    }
  },

  /** Synthèse financière selon le rôle (calculée sur l'ensemble des répartitions du bénéficiaire). */
  async summary(auth: AuthUser) {
    if (auth.role === 'PHARMACIST') {
      const pid = oid(auth.pharmacyId ?? '000000000000000000000000');
      const [settlements, payouts] = await Promise.all([Settlement.find({ pharmacyId: pid }).lean(), Payout.find({ recipientType: 'PHARMACY', recipientId: pid }).lean()]);
      const sum = (a: { amount?: number; pharmacyAmount?: number }[], k: 'amount' | 'pharmacyAmount') => a.reduce((s, x) => s + (x[k] ?? 0), 0);
      return {
        onlineReceived: sum(payouts.filter((p) => p.status === 'paid'), 'amount'),
        onlinePending: sum(payouts.filter((p) => p.status !== 'paid'), 'amount'),
        cashToReceive: sum(settlements.filter((s) => s.status === 'cash_due'), 'pharmacyAmount'),
        cashReceived: sum(settlements.filter((s) => s.status === 'cash_remitted'), 'pharmacyAmount'),
        cashAtCounter: sum(settlements.filter((s) => s.kind === 'cash_pickup'), 'pharmacyAmount'),
        orders: settlements.length,
      };
    }
    const cid = oid(auth.id);
    const [settlements, payouts] = await Promise.all([Settlement.find({ courierId: cid }).lean(), Payout.find({ recipientType: 'COURIER', recipientId: cid }).lean()]);
    const held = await this.cashHeldBy(auth.id);
    const onlinePaid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const feesKeptCash = settlements.filter((s) => s.kind === 'cash_delivery').reduce((s, x) => s + x.courierAmount, 0);
    return {
      earnedOnline: onlinePaid,
      earnedCash: feesKeptCash,
      totalEarned: onlinePaid + feesKeptCash,
      pendingPayouts: payouts.filter((p) => p.status !== 'paid').reduce((s, p) => s + p.amount, 0),
      cashToRemit: held.amount,
      cashToRemitCount: held.count,
      oldestDueDays: held.oldest ? Math.floor((Date.now() - held.oldest.getTime()) / 86_400_000) : 0,
      cashLimit: cashLimit(),
      cashRemitted: settlements.filter((s) => s.status === 'cash_remitted').reduce((s, x) => s + x.pharmacyAmount, 0),
      deliveries: settlements.length,
    };
  },

  /** Vue admin : espèces détenues par livreur, versements en attente/échoués, commandes livrées sans répartition. */
  async overview() {
    const [due, bad, settlements, delivered] = await Promise.all([
      Settlement.find({ kind: 'cash_delivery', status: 'cash_due' }).lean(),
      Payout.find({ status: { $in: ['pending', 'failed', 'processing'] } }).sort({ createdAt: -1 }).limit(100).lean(),
      Settlement.find().select('kind totalAmount pharmacyAmount courierAmount orderId').lean(),
      Order.find({ status: 'delivered' }).select('_id').lean(),
    ]);
    const byCourier = new Map<string, { amount: number; count: number; oldest: Date }>();
    for (const s of due) {
      const k = String(s.courierId);
      const cur = byCourier.get(k);
      byCourier.set(k, { amount: (cur?.amount ?? 0) + s.pharmacyAmount, count: (cur?.count ?? 0) + 1, oldest: cur && cur.oldest < s.releasedAt ? cur.oldest : s.releasedAt });
    }
    const users = await User.find({ _id: { $in: [...byCourier.keys()].map(oid) } }).lean();
    const settled = new Set(settlements.map((s) => String(s.orderId)));
    const sumKind = (k: string) => settlements.filter((s) => s.kind === k).reduce((a, s) => a + s.totalAmount, 0);
    return {
      cashHeldByCouriers: [...byCourier.entries()].map(([id, v]) => {
        const u = users.find((x) => String(x._id) === id);
        return { courierId: id, name: u ? `${u.firstName} ${u.lastName}` : id, amount: v.amount, count: v.count, oldestDays: Math.floor((Date.now() - v.oldest.getTime()) / 86_400_000) };
      }),
      payoutsToFix: bad.map((p) => ({ id: String(p._id), settlementId: String(p.settlementId), orderId: String(p.orderId), recipientType: p.recipientType, recipientId: String(p.recipientId), amount: p.amount, status: p.status, reason: p.failureReason, attempts: p.attempts })),
      volume: { online: sumKind('online'), cashDelivery: sumKind('cash_delivery'), cashPickup: sumKind('cash_pickup'), total: settlements.reduce((a, s) => a + s.totalAmount, 0) },
      deliveredWithoutSettlement: delivered.filter((o) => !settled.has(String(o._id))).length,
      cashLimit: cashLimit(),
    };
  },

  /** Filet de sécurité : répartit les commandes livrées qui n'ont pas (encore) de répartition. */
  async reconcile() {
    const settled = new Set((await Settlement.find().select('orderId').lean()).map((s) => String(s.orderId)));
    let n = 0;
    for (const o of await Order.find({ status: 'delivered' }).select('_id').lean()) {
      if (!settled.has(String(o._id)) && (await this.release(String(o._id)))) n++;
    }
    return n;
  },
};
