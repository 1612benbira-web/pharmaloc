import { Schema, model } from 'mongoose';

const medicineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, index: true }, // recherche insensible à la casse/accents
    genericName: { type: String, trim: true },
    genericNameLower: { type: String, index: true },
    dosage: { type: String, trim: true },
    form: { type: String, trim: true }, // comprimé, sirop...
    manufacturer: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    prescriptionRequired: { type: Boolean, default: false },
    barcode: { type: String, trim: true, unique: true, sparse: true },
    description: { type: String, trim: true },
  },
  { timestamps: true },
);

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

medicineSchema.pre('validate', function () {
  this.nameLower = normalize([this.name, this.dosage].filter(Boolean).join(' '));
  this.genericNameLower = this.genericName ? normalize(this.genericName) : undefined;
});
export const Medicine = model('Medicine', medicineSchema);
