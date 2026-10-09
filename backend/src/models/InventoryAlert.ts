import { Schema, model } from 'mongoose';

export const ALERT_TYPES = [
  'low_stock', 'out_of_stock', 'expiring_soon', 'expired', 'stockout_forecast', 'anomaly',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Un seul document par (stock, type) : rouvert/résolu selon l'état courant. */
const alertSchema = new Schema(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    stockId: { type: Schema.Types.ObjectId, ref: 'Stock', required: true },
    type: { type: String, enum: ALERT_TYPES, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    openedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);
alertSchema.index({ stockId: 1, type: 1 }, { unique: true });
alertSchema.index({ pharmacyId: 1, status: 1, severity: 1 });
export const InventoryAlert = model('InventoryAlert', alertSchema);
