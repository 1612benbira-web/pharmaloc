import { randomBytes } from 'node:crypto';
import { Order } from '../../models/Order';
import { Payment } from '../../models/Payment';
import { AppError } from '../../utils/AppError';
import { oid } from '../../utils/ids';
import { eventBus } from '../../events/eventBus';

export type PaymentMethod = 'mobile_money' | 'online' | 'cash_on_delivery' | 'cash_on_pickup';
type ProviderStatus = 'pending' | 'paid' | 'failed';

/** Contrat d'un fournisseur de paiement (Wave, Orange Money, PayTech... à brancher ici). */
export interface PaymentProvider {
  readonly name: string;
  readonly mode: 'DEMO' | 'LIVE';
  initiate(i: { orderId: string; amount: number; method: PaymentMethod }): Promise<{ providerReference: string; status: ProviderStatus }>;
  verify(providerReference: string): Promise<ProviderStatus>;
  refund(providerReference: string, amount: number): Promise<boolean>;
}

/**
 * Fournisseur DEMO : aucun argent ne circule. Paiements mobile/en ligne réussis immédiatement,
 * espèces en attente jusqu'à la remise/livraison. Clairement identifié (mode = 'DEMO').
 */
export const demoProvider: PaymentProvider = {
  name: 'demo',
  mode: 'DEMO',
  async initiate({ method }) {
    const ref = `DEMO-${randomBytes(5).toString('hex').toUpperCase()}`;
    return { providerReference: ref, status: method === 'mobile_money' || method === 'online' ? 'paid' : 'pending' };
  },
  async verify(ref) {
    return ref.startsWith('DEMO-') ? 'paid' : 'failed';
  },
  async refund() {
    return true;
  },
};

const providers: Record<string, PaymentProvider> = { demo: demoProvider };
const active = (): PaymentProvider => providers[process.env.PAYMENT_PROVIDER ?? 'demo'] ?? demoProvider;

/** Abstraction PaymentService (cahier des charges §13). */
export const paymentService = {
  async initiatePayment(order: { _id: unknown; userId: unknown; totalAmount: number; paymentMethod: PaymentMethod }) {
    const provider = active();
    const res = await provider.initiate({ orderId: String(order._id), amount: order.totalAmount, method: order.paymentMethod });
    const payment = await Payment.create({
      orderId: order._id,
      userId: order.userId,
      method: order.paymentMethod,
      provider: provider.name,
      mode: provider.mode,
      amount: order.totalAmount,
      status: res.status,
      providerReference: res.providerReference,
      paidAt: res.status === 'paid' ? new Date() : undefined,
    });
    await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: res.status === 'paid' ? 'paid' : 'pending' } });
    if (res.status === 'paid') await eventBus.emit('PAYMENT_CONFIRMED', { orderId: String(order._id), paymentId: String(payment._id) });
    return payment;
  },

  async verifyPayment(paymentId: string) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (payment.status === 'pending' && payment.providerReference && payment.method !== 'cash_on_delivery' && payment.method !== 'cash_on_pickup') {
      const status = await active().verify(payment.providerReference);
      if (status === 'paid') {
        payment.status = 'paid';
        payment.paidAt = new Date();
        await payment.save();
        await Order.updateOne({ _id: payment.orderId }, { $set: { paymentStatus: 'paid' } });
        await eventBus.emit('PAYMENT_CONFIRMED', { orderId: String(payment.orderId), paymentId: String(payment._id) });
      }
    }
    return payment;
  },

  async getPaymentStatus(paymentId: string) {
    const payment = await Payment.findById(paymentId).lean();
    if (!payment) throw AppError.notFound('Paiement introuvable');
    return payment;
  },

  /** Rembourse les paiements encaissés d'une commande (annulation). */
  async refundPayment(orderId: string) {
    const paid = await Payment.find({ orderId: oid(orderId), status: 'paid' });
    for (const p of paid) {
      if (p.providerReference && (await active().refund(p.providerReference, p.amount))) {
        p.status = 'refunded';
        p.refundedAt = new Date();
        await p.save();
      }
    }
    if (paid.length) await Order.updateOne({ _id: oid(orderId) }, { $set: { paymentStatus: 'refunded' } });
    return paid.length;
  },

  /** Encaissement des paiements en espèces à la livraison / au retrait. */
  async markCashPaid(orderId: string) {
    const pending = await Payment.find({ orderId: oid(orderId), status: 'pending', method: { $in: ['cash_on_delivery', 'cash_on_pickup'] } });
    for (const p of pending) {
      p.status = 'paid';
      p.paidAt = new Date();
      await p.save();
      await Order.updateOne({ _id: oid(orderId) }, { $set: { paymentStatus: 'paid' } });
      await eventBus.emit('PAYMENT_CONFIRMED', { orderId, paymentId: String(p._id) });
    }
  },
};
