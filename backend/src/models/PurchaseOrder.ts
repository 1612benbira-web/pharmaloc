import { Schema, model } from 'mongoose';

const itemSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    stockId: { type: Schema.Types.ObjectId, ref: 'Stock', required: true },
    currentQuantity: { type: Number, required: true },
    avgDailyConsumption: { type: Number, required: true },
    daysRemaining: { type: Number },
    suggestedQuantity: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 0 }, // quantité validée par le pharmacien
    reason: { type: String },
  },
  { _id: false },
);

/**
 * Suggestion / bon de commande fournisseur. En v1 le système ne commande JAMAIS seul :
 * suggested -> accepted | rejected (décision du pharmacien).
 */
const purchaseOrderSchema = new Schema(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    status: { type: String, enum: ['suggested', 'accepted', 'rejected'], default: 'suggested' },
    items: { type: [itemSchema], required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    note: { type: String },
  },
  { timestamps: true },
);
purchaseOrderSchema.index({ pharmacyId: 1, status: 1, createdAt: -1 });
export const PurchaseOrder = model('PurchaseOrder', purchaseOrderSchema);
