import { Schema, model } from 'mongoose';

const hoursSchema = new Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = dimanche (heure de Dakar = UTC)
    open: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    close: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    closed: { type: Boolean, default: false },
  },
  { _id: false },
);

const pharmacySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    neighborhood: { type: String, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    licenseNumber: { type: String, trim: true }, // n° d'agrément / d'ordre
    // Compte de réception des paiements en ligne (numéro Wave / Orange Money : aucune donnée bancaire)
    payoutOperator: { type: String, enum: ['wave', 'orange_money'] },
    payoutPhone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isValidated: { type: Boolean, default: false }, // validée par un administrateur
    is24h: { type: Boolean, default: false },
    openingHours: { type: [hoursSchema], default: [] },
    offersDelivery: { type: Boolean, default: true },
    offersPickup: { type: Boolean, default: true },
    // Frais de livraison = deliveryFee + deliveryPerKmFee x max(0, distance - deliveryIncludedKm), arrondi à 50 FCFA.
    deliveryFee: { type: Number, default: 0, min: 0 },
    deliveryPerKmFee: { type: Number, default: 0, min: 0 },
    deliveryIncludedKm: { type: Number, default: 0, min: 0 },
    deliveryRadiusKm: { type: Number, default: 10, min: 0 },
  },
  { timestamps: true },
);
pharmacySchema.index({ isActive: 1, isValidated: 1 });
pharmacySchema.index({ city: 1, neighborhood: 1 });
export const Pharmacy = model('Pharmacy', pharmacySchema);
