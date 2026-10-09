import { Types } from 'mongoose';
import { User, type UserDoc } from '../../models/User';
import type { Role } from '../../models/roles';

/**
 * Seul point d'accès Mongoose aux utilisateurs : facilite les tests (mock)
 * et centralise les champs sensibles (passwordHash, tokenVersion).
 */
export interface NewUser {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  pharmacyId?: string;
}

export interface UserRepository {
  create(data: NewUser): Promise<UserDoc>;
  findByEmailWithSecrets(email: string): Promise<UserDoc | null>;
  findByIdWithSecrets(id: string): Promise<UserDoc | null>;
  bumpTokenVersion(id: string): Promise<void>;
  list(filter: { role?: Role }, skip: number, limit: number): Promise<{ items: UserDoc[]; total: number }>;
  setActive(id: string, isActive: boolean): Promise<UserDoc | null>;
}

const secrets = '+passwordHash +tokenVersion';

export const userRepository: UserRepository = {
  create: (data) =>
    User.create({
      ...data,
      pharmacyId: data.pharmacyId ? new Types.ObjectId(data.pharmacyId) : undefined,
    }),
  findByEmailWithSecrets: (email) => User.findOne({ email }).select(secrets).exec(),
  findByIdWithSecrets: (id) => (Types.ObjectId.isValid(id) ? User.findById(id).select(secrets).exec() : Promise.resolve(null)),
  bumpTokenVersion: async (id) => {
    await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
  },
  list: async (filter, skip, limit) => {
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      User.countDocuments(filter),
    ]);
    return { items, total };
  },
  setActive: async (id, isActive) => {
    if (!Types.ObjectId.isValid(id)) return null;
    // Désactiver => invalider les jetons existants (updateOne + lecture : compatible tous serveurs Mongo)
    const r = await User.updateOne({ _id: id }, { $set: { isActive }, ...(isActive ? {} : { $inc: { tokenVersion: 1 } }) });
    return r.matchedCount ? User.findById(id).exec() : null;
  },
};
