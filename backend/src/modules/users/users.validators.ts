import { z } from 'zod';
import { ROLES } from '../../models/roles';
import { paginationSchema } from '../../utils/pagination';
import { registerSchema } from '../auth/auth.validators';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');

export const createUserSchema = registerSchema
  .extend({
    role: z.enum(ROLES),
    pharmacyId: objectId.optional(),
  })
  .strict();

export const listUsersQuery = paginationSchema.extend({
  role: z.enum(ROLES).optional(),
  approvalStatus: z.enum(['approved', 'pending', 'rejected']).optional(),
});
export const approvalSchema = z
  .object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional() })
  .strict()
  .refine((v) => v.decision === 'approve' || (v.reason && v.reason.length >= 3), { message: 'Un motif est obligatoire pour refuser', path: ['reason'] });
export const idParams = z.object({ id: objectId });
export const setStatusSchema = z.object({ isActive: z.boolean() }).strict();
