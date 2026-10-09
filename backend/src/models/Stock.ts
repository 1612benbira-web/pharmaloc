import { Schema, model } from 'mongoose';

/**
 * Stock agrégé par (pharmacie x médicament).
 * Invariants : quantity = somme des lots non expirés ; available = quantity - reservedQuantity.
 * `available` est dénormalisé pour permettre des réservations atomiques avec un filtre simple
 * ({ available: { $gte: n } }) sans $expr ni transaction.
 */
const stockSchema = new Schema(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    quantity: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    available: { type: Number, default: 0, min: 0 },
    minimumQuantity: { type: Number, default: 10, min: 0 },
    maximumQuantity: { type: Number, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    isListed: { type: Boolean, default: true },
  },
  { timestamps: true },
);
stockSchema.index({ pharmacyId: 1, medicineId: 1 }, { unique: true });
stockSchema.index({ medicineId: 1, available: 1 });
export const Stock = model('Stock', stockSchema);
