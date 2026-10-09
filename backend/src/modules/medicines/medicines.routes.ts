import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Medicine, normalize } from '../../models/Medicine';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { Q, boolish, numeric } from '../../utils/http';
import { idParams } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { audit } from '../../services/audit.service';
import { searchOffers } from './search.service';

const fields = {
  name: z.string().trim().min(2).max(120),
  genericName: z.string().trim().max(120).optional(),
  dosage: z.string().trim().max(40).optional(),
  form: z.string().trim().max(60).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  prescriptionRequired: z.boolean().optional(),
  barcode: z.string().trim().min(4).max(40).optional(),
  description: z.string().trim().max(1000).optional(),
};
const createSchema = z.object(fields).strict();
const patchSchema = z.object(fields).partial().strict();

const listQuery = paginationSchema.extend({ q: z.string().trim().max(80).optional(), category: z.string().optional() });
const searchQuery = z.object({
  q: z.string().trim().min(2, 'Saisissez au moins 2 caractères').max(80),
  lat: numeric.min(-90).max(90).optional(),
  lng: numeric.min(-180).max(180).optional(),
  neighborhood: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  onlyAvailable: boolish.optional(),
  delivery: boolish.optional(),
  pickup: boolish.optional(),
  maxDistanceKm: numeric.positive().optional(),
  maxPrice: numeric.positive().optional(),
  openNow: boolish.optional(),
  sort: z.enum(['distance', 'price', 'availability']).optional(),
});

export const medicinesRoutes = Router();

medicinesRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const filter: Record<string, unknown> = {};
  if (q.q) filter.nameLower = { $regex: new RegExp(normalize(q.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) };
  if (q.category) filter.category = q.category;
  const [items, total] = await Promise.all([
    Medicine.find(filter).sort({ nameLower: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Medicine.countDocuments(filter),
  ]);
  res.json({ data: items.map((m) => ({ ...m, id: String(m._id) })), meta: pageMeta(total, q) });
}));

/** Recherche patient : médicament -> pharmacies, distance, disponibilité réelle, livraison/retrait. */
medicinesRoutes.get('/search', validate({ query: searchQuery }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await searchOffers(Q<z.infer<typeof searchQuery>>(req)) });
}));

medicinesRoutes.get('/:id', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const m = await Medicine.findById(req.params.id).lean();
  if (!m) throw AppError.notFound('Médicament introuvable');
  res.json({ data: { ...m, id: String(m._id) } });
}));

medicinesRoutes.post('/', authenticate, authorize('ADMIN', 'PHARMACIST'), validate({ body: createSchema }), asyncHandler(async (req: Request, res: Response) => {
  const m = await Medicine.create(req.body);
  await audit({ action: 'medicine.create', userId: req.auth!.id, entity: 'Medicine', entityId: String(m._id), req });
  res.status(201).json({ data: m });
}));

medicinesRoutes.patch('/:id', authenticate, authorize('ADMIN', 'PHARMACIST'), validate({ params: idParams, body: patchSchema }), asyncHandler(async (req: Request, res: Response) => {
  const m = await Medicine.findById(req.params.id);
  if (!m) throw AppError.notFound('Médicament introuvable');
  m.set(req.body);
  await m.save(); // déclenche la normalisation des champs de recherche
  await audit({ action: 'medicine.update', userId: req.auth!.id, entity: 'Medicine', entityId: String(m._id), req });
  res.json({ data: m });
}));
