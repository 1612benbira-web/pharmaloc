import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { SupplierDelivery } from '../../models/SupplierDelivery';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { Q } from '../../utils/http';
import { idParams, objectIdSchema, oid } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { parseExpiration } from '../../utils/dates';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { optionalPharmacyId, requirePharmacyId } from '../../middleware/scope';
import { receiveSupplierDelivery } from './supplierDelivery.service';

const dateField = (label: string) =>
  z.string().transform((v, ctx) => {
    const d = parseExpiration(v);
    if (!d) ctx.addIssue({ code: 'custom', message: `${label} invalide (AAAA-MM ou AAAA-MM-JJ)` });
    return d as Date;
  });

const itemSchema = z.object({
  medicineId: objectIdSchema,
  quantity: z.number().int().min(1).max(1_000_000),
  batchNumber: z.string().trim().min(1).max(40),
  expirationDate: dateField('Date d’expiration'),
  purchasePrice: z.number().min(0).max(10_000_000).optional(),
}).strict();

const createSchema = z.object({
  supplierName: z.string().trim().min(2).max(120),
  reference: z.string().trim().min(2).max(60),
  receivedAt: dateField('Date de livraison').optional(),
  items: z.array(itemSchema).min(1).max(100),
  pharmacyId: objectIdSchema.optional(),
}).strict();

const listQuery = paginationSchema.extend({ pharmacyId: objectIdSchema.optional() });

export const supplierDeliveriesRoutes = Router();
supplierDeliveriesRoutes.use(authenticate, authorize('PHARMACIST', 'ADMIN'));

/** « Nouvelle livraison » : enregistre, met à jour le stock, trace les mouvements, recalcule les alertes. */
supplierDeliveriesRoutes.post('/', validate({ body: createSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { pharmacyId, receivedAt, ...rest } = req.body;
  const pid = requirePharmacyId(req, pharmacyId);
  const result = await receiveSupplierDelivery(pid, req.auth!.id, { ...rest, receivedAt: receivedAt ?? new Date() }, req);
  res.status(201).json({ data: result });
}));

supplierDeliveriesRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const pid = optionalPharmacyId(req, q.pharmacyId);
  const filter = pid ? { pharmacyId: oid(pid) } : {};
  const [items, total] = await Promise.all([
    SupplierDelivery.find(filter).sort({ receivedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    SupplierDelivery.countDocuments(filter),
  ]);
  res.json({ data: items, meta: pageMeta(total, q) });
}));

supplierDeliveriesRoutes.get('/:id', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const d = await SupplierDelivery.findById(req.params.id).lean();
  if (!d || (req.auth!.role === 'PHARMACIST' && String(d.pharmacyId) !== req.auth!.pharmacyId)) throw AppError.notFound('Livraison introuvable');
  res.json({ data: d });
}));
