import { Schema, model } from 'mongoose';

/** Historique des assignations (traçabilité : qui a accepté quelle livraison, quand). */
const assignmentSchema = new Schema(
  {
    deliveryId: { type: Schema.Types.ObjectId, ref: 'Delivery', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['accepted', 'completed', 'cancelled'], default: 'accepted' },
    acceptedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true },
);
export const DeliveryAssignment = model('DeliveryAssignment', assignmentSchema);
