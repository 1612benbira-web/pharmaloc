import { Schema, model } from 'mongoose';

const supplierSchema = new Schema(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
  },
  { timestamps: true },
);
supplierSchema.index({ pharmacyId: 1, name: 1 }, { unique: true });
export const Supplier = model('Supplier', supplierSchema);
