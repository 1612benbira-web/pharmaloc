import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { verifyToken } from '../modules/auth/token.service';
import { userRepository } from '../modules/users/user.repository';
import type { Role } from '../models/roles';

export interface AuthUser {
  id: string;
  role: Role;
  pharmacyId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser;
  }
}

/** Vérifie le jeton ET l'état réel du compte en base (pas de confiance au seul JWT). */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw AppError.unauthorized();
    const payload = verifyToken(header.slice(7), 'access');
    const user = await userRepository.findByIdWithSecrets(payload.sub);
    if (!user || !user.isActive || (user.tokenVersion ?? 0) !== payload.tv) {
      throw AppError.unauthorized('Session invalide');
    }
    req.auth = {
      id: String(user._id),
      role: user.role,
      pharmacyId: user.pharmacyId ? String(user.pharmacyId) : undefined,
    };
    next();
  } catch (err) {
    next(err);
  }
};

/** Autorisation par rôle - à placer APRÈS authenticate. */
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden('Permission insuffisante pour cette action'));
    next();
  };

/** Identifie l'utilisateur s'il envoie un jeton valide, sinon continue en anonyme (routes publiques enrichies). */
export const optionalAuthenticate: RequestHandler = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
};
