import { Schema, model } from 'mongoose';

/** Aucune donnée bancaire n'est stockée : uniquement référence fournisseur, montant et statut. */
const paymentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, enum: ['mobile_money', 'online', 'cash_on_delivery', 'cash_on_pickup'], required: true },
    provider: { type: String, required: true }, // 'demo' | futur: 'wave', 'orange_money', ...
    mode: { type: String, enum: ['DEMO', 'LIVE'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'XOF' },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    providerReference: { type: String, index: true },
    paidAt: { type: Date },
    refundedAt: { type: Date },
  },
  { timestamps: true },
);
export const Payment = model('Payment', paymentSchema);
