import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from './AppError';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');
export const idParams = z.object({ id: objectIdSchema });
export const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));

export function assertObjectId(v: string, label = 'Identifiant'): Types.ObjectId {
  if (!Types.ObjectId.isValid(v)) throw AppError.badRequest(`${label} invalide`);
  return new Types.ObjectId(v);
}
