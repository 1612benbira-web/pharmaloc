import { Schema, model } from 'mongoose';

const itemSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    stockId: { type: Schema.Types.ObjectId, ref: 'Stock' },
    quantity: { type: Number, required: true, min: 1 },
    batchNumber: { type: String, required: true },
    expirationDate: { type: Date, required: true },
    purchasePrice: { type: Number, min: 0 },
  },
  { _id: false },
);

/** Livraison fournisseur (réception de marchandise). Ne pas confondre avec `Delivery` (livraison patient). */
const supplierDeliverySchema = new Schema(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, required: true },
    reference: { type: String, required: true, trim: true },
    receivedAt: { type: Date, required: true },
    items: { type: [itemSchema], required: true },
    status: { type: String, enum: ['processing', 'received', 'failed'], default: 'processing' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    totalCost: { type: Number, default: 0 },
  },
  { timestamps: true },
);
// Une référence fournisseur n'est enregistrée qu'une fois par pharmacie (anti double saisie)
supplierDeliverySchema.index({ pharmacyId: 1, reference: 1 }, { unique: true });
supplierDeliverySchema.index({ pharmacyId: 1, receivedAt: -1 });
export const SupplierDelivery = model('SupplierDelivery', supplierDeliverySchema);
