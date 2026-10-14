import { Schema, model } from 'mongoose';

export const SETTLEMENT_KINDS = ['online', 'cash_delivery', 'cash_pickup'] as const;
export const SETTLEMENT_STATUSES = ['pending', 'partial', 'paid', 'failed', 'cash_due', 'cash_remitted', 'settled'] as const;

/**
 * Répartition d'une commande LIVRÉE (une par commande) :
 *   pharmacyAmount = prix des médicaments -> la pharmacie
 *   courierAmount  = frais de livraison   -> le livreur
 * online        : versements automatiques (Payout) à la confirmation de la livraison
 * cash_delivery : le livreur a encaissé les espèces, GARDE ses frais et doit remettre pharmacyAmount à la pharmacie
 * cash_pickup   : la pharmacie a encaissé elle-même, rien à reverser
 */
const settlementSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    courierId: { type: Schema.Types.ObjectId, ref: 'User' },
    kind: { type: String, enum: SETTLEMENT_KINDS, required: true },
    mode: { type: String, enum: ['DEMO', 'LIVE'], default: 'DEMO' },
    pharmacyAmount: { type: Number, required: true, min: 0 },
    courierAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: SETTLEMENT_STATUSES, required: true },
    releasedAt: { type: Date, default: Date.now },
    cashRemittedAt: { type: Date },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
settlementSchema.index({ pharmacyId: 1, releasedAt: -1 });
settlementSchema.index({ courierId: 1, releasedAt: -1 });
settlementSchema.index({ status: 1, kind: 1 });
export const Settlement = model('Settlement', settlementSchema);
