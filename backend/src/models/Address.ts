import { Schema, model } from 'mongoose';

const addressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true, default: 'Domicile' },
    street: { type: String, required: true, trim: true },
    neighborhood: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    instructions: { type: String, trim: true },
    locationSource: { type: String, enum: ['gps', 'quartier', 'manual'] },
  },
  { timestamps: true },
);
export const Address = model('Address', addressSchema);
