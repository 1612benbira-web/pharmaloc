import { Schema, model } from 'mongoose';

const deliveryAgentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    isAvailable: { type: Boolean, default: false },
    vehicle: { type: String, trim: true },
    payoutOperator: { type: String, enum: ['wave', 'orange_money'] },
    payoutPhone: { type: String, trim: true },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    locationUpdatedAt: { type: Date },
  },
  { timestamps: true },
);
export const DeliveryAgent = model('DeliveryAgent', deliveryAgentSchema);
