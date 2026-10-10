import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Address } from '../../models/Address';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { idParams, oid } from '../../utils/ids';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  street: z.string().trim().min(3).max(200),
  neighborhood: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2).max(80),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  instructions: z.string().trim().max(300).optional(),
  locationSource: z.enum(['gps', 'quartier', 'manual']).optional(),
}).strict();

export const addressesRoutes = Router();
addressesRoutes.use(authenticate, authorize('PATIENT'));

addressesRoutes.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await Address.find({ userId: oid(req.auth!.id) }).sort({ createdAt: -1 }).lean() });
}));
addressesRoutes.post('/', validate({ body: addressSchema }), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await Address.create({ ...req.body, userId: oid(req.auth!.id) }) });
}));
addressesRoutes.delete('/:id', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const r = await Address.deleteOne({ _id: oid(String(req.params.id)), userId: oid(req.auth!.id) });
  if (!r.deletedCount) throw AppError.notFound('Adresse introuvable');
  res.status(204).end();
}));
