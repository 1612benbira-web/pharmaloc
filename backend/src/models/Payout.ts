import { Schema, model } from 'mongoose';

/** Un versement vers la pharmacie ou le livreur. Unique par (commande, bénéficiaire) : jamais de double versement. */
const payoutSchema = new Schema(
  {
    settlementId: { type: Schema.Types.ObjectId, ref: 'Settlement', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    recipientType: { type: String, enum: ['PHARMACY', 'COURIER'], required: true },
    recipientId: { type: Schema.Types.ObjectId, required: true }, // id de la pharmacie ou du compte livreur
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'processing', 'paid', 'failed'], default: 'pending' },
    provider: { type: String },
    mode: { type: String, enum: ['DEMO', 'LIVE'] },
    providerReference: { type: String },
    destination: { type: String }, // numéro MASQUÉ (derniers chiffres seulement)
    operator: { type: String, enum: ['wave', 'orange_money'] },
    failureReason: { type: String },
    attempts: { type: Number, default: 0 },
    paidAt: { type: Date },
  },
  { timestamps: true },
);
payoutSchema.index({ orderId: 1, recipientType: 1 }, { unique: true });
payoutSchema.index({ recipientType: 1, recipientId: 1, status: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });
export const Payout = model('Payout', payoutSchema);
