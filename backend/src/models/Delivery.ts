import { Schema, model } from 'mongoose';

export const DELIVERY_STATUSES = ['searching', 'assigned', 'picked_up', 'in_delivery', 'delivered', 'cancelled'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const point = new Schema(
  { latitude: Number, longitude: Number, address: String },
  { _id: false },
);

/** Livraison d'une commande au patient (livreur). */
const deliverySchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    deliveryAgentId: { type: Schema.Types.ObjectId, ref: 'User' }, // userId du livreur
    pickupLocation: { type: point },
    deliveryLocation: { type: point },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'searching' },
    estimatedTime: { type: Date },
    agentLatitude: { type: Number },
    agentLongitude: { type: Number },
    agentLocationAt: { type: Date },
    // Position partagée VOLONTAIREMENT par le patient pour guider le livreur (supprimée à la fin de la livraison).
    patientLatitude: { type: Number },
    patientLongitude: { type: Number },
    patientLocationAccuracy: { type: Number },
    patientLocationAt: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
  },
  { timestamps: true },
);
deliverySchema.index({ status: 1, createdAt: 1 });
deliverySchema.index({ deliveryAgentId: 1, status: 1 });
export const Delivery = model('Delivery', deliverySchema);
