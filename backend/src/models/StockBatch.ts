import { Schema, model } from 'mongoose';

const stockBatchSchema = new Schema(
  {
    stockId: { type: Schema.Types.ObjectId, ref: 'Stock', required: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batchNumber: { type: String, required: true, trim: true },
    expirationDate: { type: Date, required: true },
    quantity: { type: Number, default: 0, min: 0 },
    purchasePrice: { type: Number, min: 0 },
  },
  { timestamps: true },
);
stockBatchSchema.index({ stockId: 1, batchNumber: 1, expirationDate: 1 }, { unique: true });
stockBatchSchema.index({ stockId: 1, expirationDate: 1 });
stockBatchSchema.index({ pharmacyId: 1, expirationDate: 1 });
export const StockBatch = model('StockBatch', stockBatchSchema);
