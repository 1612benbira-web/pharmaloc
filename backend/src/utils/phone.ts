import { z } from 'zod';

export const PHONE_MESSAGE = 'Numéro de téléphone invalide (ex. +221 77 123 45 67)';

/** Accepte les formes courantes (« +221 77 123 45 67 », « 77.123.45.67 », « (221) 771234567 ») : 8 à 15 chiffres. */
export function isValidPhone(v: string): boolean {
  const digits = v.replace(/\D/g, '').length;
  return /^\+?[0-9 .\-()]{8,25}$/.test(v) && digits >= 8 && digits <= 15;
}

/** Espaces normalisés ; le numéro n'est jamais écrit dans les journaux. */
export const normalizePhone = (v: string): string => v.replace(/\s+/g, ' ').trim();

export const phoneField = z.string().trim().refine(isValidPhone, PHONE_MESSAGE);
