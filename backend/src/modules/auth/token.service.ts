import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import type { Role } from '../../models/roles';
import { AppError } from '../../utils/AppError';

export interface TokenPayload {
  sub: string;
  role: Role;
  tv: number; // tokenVersion
  typ: 'access' | 'refresh';
}

const sign = (payload: TokenPayload, secret: string, ttl: string) =>
  jwt.sign(payload, secret, { expiresIn: ttl as SignOptions['expiresIn'], algorithm: 'HS256' });

export function issueTokens(user: { id: string; role: Role; tokenVersion: number }) {
  const base = { sub: user.id, role: user.role, tv: user.tokenVersion };
  return {
    accessToken: sign({ ...base, typ: 'access' }, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL),
    refreshToken: sign({ ...base, typ: 'refresh' }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_TTL),
  };
}

export function verifyToken(token: string, kind: 'access' | 'refresh'): TokenPayload {
  const secret = kind === 'access' ? env.JWT_ACCESS_SECRET : env.JWT_REFRESH_SECRET;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
    if (payload.typ !== kind) throw new Error('mauvais type');
    return payload;
  } catch {
    throw AppError.unauthorized('Jeton invalide ou expiré');
  }
}
