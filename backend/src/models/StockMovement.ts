import { Schema, model } from 'mongoose';

export const MOVEMENT_TYPES = [
  'delivery_received', 'sale', 'reservation', 'cancellation', 'adjustment', 'return', 'expiration',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * quantity       = variation du stock physique (sale = -5). 0 pour reservation/cancellation.
 * reservedDelta  = variation des unités réservées (reservation +n, cancellation -n, sale -n si réservé).
 * Immuable : on ne modifie ni ne supprime jamais un mouvement.
 */
const movementSchema = new Schema(
  {
    stockId: { type: Schema.Types.ObjectId, ref: 'Stock', required: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'StockBatch' },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true },
    reservedDelta: { type: Number, default: 0 },
    previousQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true },
    previousReserved: { type: Number, default: 0 },
    newReserved: { type: Number, default: 0 },
    reference: { type: String },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index({ stockId: 1, createdAt: -1 });
movementSchema.index({ pharmacyId: 1, type: 1, createdAt: -1 });
movementSchema.index({ orderId: 1 });
export const StockMovement = model('StockMovement', movementSchema);
