import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Supplier } from '../../models/Supplier';
import { asyncHandler } from '../../utils/asyncHandler';
import { Q } from '../../utils/http';
import { objectIdSchema, oid } from '../../utils/ids';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { optionalPharmacyId, requirePharmacyId } from '../../middleware/scope';

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  pharmacyId: objectIdSchema.optional(),
}).strict();

export const suppliersRoutes = Router();
suppliersRoutes.use(authenticate, authorize('PHARMACIST', 'ADMIN'));

suppliersRoutes.get('/', validate({ query: z.object({ pharmacyId: objectIdSchema.optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const pid = optionalPharmacyId(req, Q<{ pharmacyId?: string }>(req).pharmacyId);
  res.json({ data: await Supplier.find(pid ? { pharmacyId: oid(pid) } : {}).sort({ name: 1 }).lean() });
}));

suppliersRoutes.post('/', validate({ body: createSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { pharmacyId, ...rest } = req.body;
  const s = await Supplier.create({ ...rest, pharmacyId: oid(requirePharmacyId(req, pharmacyId)) });
  res.status(201).json({ data: s });
}));
