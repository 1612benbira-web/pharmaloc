import type { Request } from 'express';
import { AppError } from '../utils/AppError';

/**
 * Pharmacie ciblée par la requête : un pharmacien est TOUJOURS limité à la sienne
 * (le paramètre est ignoré) ; un admin doit la préciser.
 */
export function requirePharmacyId(req: Request, explicit?: string): string {
  const a = req.auth;
  if (!a) throw AppError.unauthorized();
  if (a.role === 'PHARMACIST') {
    if (!a.pharmacyId) throw AppError.forbidden('Aucune pharmacie n’est associée à votre compte');
    return a.pharmacyId;
  }
  if (a.role === 'ADMIN') {
    if (!explicit) throw AppError.badRequest('Paramètre pharmacyId requis');
    return explicit;
  }
  throw AppError.forbidden();
}

/** Comme requirePharmacyId, mais un admin peut ne rien préciser (vue globale). */
export function optionalPharmacyId(req: Request, explicit?: string): string | undefined {
  if (req.auth?.role === 'ADMIN') return explicit;
  return requirePharmacyId(req);
}
