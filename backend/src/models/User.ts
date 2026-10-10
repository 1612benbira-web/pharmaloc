import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ROLES } from './roles';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    role: { type: String, enum: ROLES, required: true, default: 'PATIENT' },
    // Lien pharmacien -> pharmacie (le modèle Pharmacy arrive en phase 2)
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy' },
    isActive: { type: Boolean, default: true },
    // Pharmacies et livreurs s'inscrivent eux-mêmes mais restent « pending » jusqu'à validation par un admin.
    approvalStatus: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'approved' },
    rejectionReason: { type: String, trim: true },
    // Incrémenté à la déconnexion / désactivation : invalide tous les jetons émis.
    tokenVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ approvalStatus: 1, createdAt: -1 });

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema);
