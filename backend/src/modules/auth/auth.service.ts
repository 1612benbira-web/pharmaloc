import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { userRepository } from '../users/user.repository';
import { issueTokens, verifyToken } from './token.service';
import { Pharmacy } from '../../models/Pharmacy';
import { DeliveryAgent } from '../../models/DeliveryAgent';
import type { LoginInput, RegisterCourierInput, RegisterInput, RegisterPharmacyInput } from './auth.validators';
import type { UserDoc } from '../../models/User';

// Hash factice pour égaliser le temps de réponse quand l'email n'existe pas
const DUMMY_HASH = bcrypt.hashSync('dummy-password-1', 4);

export type PublicUser = { id: string } & Record<string, unknown>;

function session(user: UserDoc) {
  const tokens = issueTokens({ id: String(user._id), role: user.role, tokenVersion: user.tokenVersion ?? 0 });
  const publicUser = user.toJSON() as unknown as PublicUser;
  return { user: publicUser, ...tokens };
}

export const authService = {
  async register(input: RegisterInput) {
    const existing = await userRepository.findByEmailWithSecrets(input.email);
    if (existing) throw AppError.conflict('Un compte existe déjà avec cet email');
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    // L'inscription publique crée TOUJOURS un patient.
    const user = await userRepository.create({ ...input, passwordHash, role: 'PATIENT' });
    const created = await userRepository.findByIdWithSecrets(String(user._id));
    return session(created ?? user);
  },

  /** Pharmacie : compte pharmacien + fiche pharmacie, tous deux EN ATTENTE (invisibles des patients) jusqu'à validation admin. */
  async registerPharmacy(input: RegisterPharmacyInput) {
    if (await userRepository.findByEmailWithSecrets(input.email)) throw AppError.conflict('Un compte existe déjà avec cet email');
    const { pharmacy: ph, password, ...account } = input;
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    const pharmacy = await Pharmacy.create({
      ...ph,
      phone: ph.phone ?? account.phone,
      email: account.email,
      isValidated: false,
      isActive: true,
      // Tarification par défaut modifiable ensuite par la pharmacie : 500 FCFA + 150 FCFA/km au-delà de 1 km
      deliveryFee: 500,
      deliveryPerKmFee: 150,
      deliveryIncludedKm: 1,
      deliveryRadiusKm: 10,
    });
    try {
      const user = await userRepository.create({ ...account, passwordHash, role: 'PHARMACIST', pharmacyId: String(pharmacy._id), approvalStatus: 'pending' });
      const created = await userRepository.findByIdWithSecrets(String(user._id));
      return { ...session(created ?? user), pharmacyId: String(pharmacy._id) };
    } catch (err) {
      await Pharmacy.deleteOne({ _id: pharmacy._id }); // pas de pharmacie orpheline
      throw err;
    }
  },

  /** Livreur : compte EN ATTENTE ; profil créé indisponible. */
  async registerCourier(input: RegisterCourierInput) {
    if (await userRepository.findByEmailWithSecrets(input.email)) throw AppError.conflict('Un compte existe déjà avec cet email');
    const { vehicle, password, ...account } = input;
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    const user = await userRepository.create({ ...account, passwordHash, role: 'DELIVERY_AGENT', approvalStatus: 'pending' });
    await DeliveryAgent.create({ userId: user._id, vehicle, isAvailable: false });
    const created = await userRepository.findByIdWithSecrets(String(user._id));
    return session(created ?? user);
  },

  async login(input: LoginInput) {
    const user = await userRepository.findByEmailWithSecrets(input.email);
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw AppError.unauthorized('Email ou mot de passe incorrect');
    if (!user.isActive) throw AppError.forbidden('Compte désactivé');
    return session(user);
  },

  async refresh(refreshToken: string) {
    const payload = verifyToken(refreshToken, 'refresh');
    const user = await userRepository.findByIdWithSecrets(payload.sub);
    if (!user || !user.isActive || (user.tokenVersion ?? 0) !== payload.tv) {
      throw AppError.unauthorized('Session expirée');
    }
    return session(user);
  },

  async logout(userId: string) {
    await userRepository.bumpTokenVersion(userId);
  },
};
