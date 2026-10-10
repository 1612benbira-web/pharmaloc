import { Schema, model } from 'mongoose';

export const ORDER_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'in_delivery', 'delivered', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const itemSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    stockId: { type: Schema.Types.ObjectId, ref: 'Stock', required: true },
    name: { type: String, required: true }, // instantané (le catalogue peut évoluer)
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    prescriptionRequired: { type: Boolean, default: false },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    deliveryType: { type: String, enum: ['pickup', 'delivery'], required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    items: { type: [itemSchema], required: true },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    deliveryDistanceKm: { type: Number },
    totalAmount: { type: Number, required: true },
    addressId: { type: Schema.Types.ObjectId, ref: 'Address' },
    addressSnapshot: { type: Schema.Types.Mixed },
    paymentMethod: { type: String, enum: ['mobile_money', 'online', 'cash_on_delivery', 'cash_on_pickup'], required: true },
    paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid', 'refunded'], default: 'unpaid' },
    prescriptionRequired: { type: Boolean, default: false },
    stockReserved: { type: Boolean, default: false },
    stockConsumed: { type: Boolean, default: false },
    codeAttempts: { type: Number, default: 0 },
    cancelledBy: { type: String },
    cancelReason: { type: String },
    deliveredAt: { type: Date },
    statusHistory: {
      type: [new Schema({ status: String, at: Date, by: String }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
);
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ pharmacyId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
export const Order = model('Order', orderSchema);
