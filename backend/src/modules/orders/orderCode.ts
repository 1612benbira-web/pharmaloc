import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

/**
 * Code de livraison / de retrait à 6 chiffres, dérivé (HMAC) de l'identifiant de commande :
 * rien à stocker, le patient peut le revoir, personne d'autre ne peut le deviner.
 */
export function orderCode(orderId: string): string {
  const hex = createHmac('sha256', `${env.JWT_ACCESS_SECRET}:order-code`).update(orderId).digest('hex');
  return String(parseInt(hex.slice(0, 8), 16) % 1_000_000).padStart(6, '0');
}

export function verifyOrderCode(orderId: string, code: string): boolean {
  const a = Buffer.from(orderCode(orderId));
  const b = Buffer.from(String(code).padStart(6, '0'));
  return a.length === b.length && timingSafeEqual(a, b);
}
