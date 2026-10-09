import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Stock } from '../../models/Stock';
import { StockBatch } from '../../models/StockBatch';
import { StockMovement, MOVEMENT_TYPES } from '../../models/StockMovement';
import { Medicine, normalize } from '../../models/Medicine';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { Q, boolish } from '../../utils/http';
import { idParams, objectIdSchema, oid } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { parseExpiration } from '../../utils/dates';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { optionalPharmacyId, requirePharmacyId } from '../../middleware/scope';
import { audit } from '../../services/audit.service';
import { stockService } from './stock.service';
import { alertService } from './alert.service';
import { forecastStock } from './forecast.service';

const createSchema = z.object({
  medicineId: objectIdSchema,
  minimumQuantity: z.number().int().min(0).max(1_000_000).default(10),
  maximumQuantity: z.number().int().min(0).max(1_000_000).optional(),
  unitPrice: z.number().min(0).max(10_000_000).default(0),
  pharmacyId: objectIdSchema.optional(),
}).strict();
const patchSchema = z.object({
  minimumQuantity: z.number().int().min(0).max(1_000_000),
  maximumQuantity: z.number().int().min(0).max(1_000_000),
  unitPrice: z.number().min(0).max(10_000_000),
  isListed: z.boolean(),
}).partial().strict();
const expiry = z.string().transform((v, ctx) => {
  const d = parseExpiration(v);
  if (!d) ctx.addIssue({ code: 'custom', message: 'Date invalide (AAAA-MM ou AAAA-MM-JJ)' });
  return d as Date;
});
const adjustSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'Variation non nulle requise'),
  note: z.string().trim().min(3, 'Motif obligatoire').max(200),
  batchNumber: z.string().trim().min(1).max(40).optional(),
  expirationDate: expiry.optional(),
  purchasePrice: z.number().min(0).optional(),
}).strict();
const listQuery = paginationSchema.extend({
  pharmacyId: objectIdSchema.optional(),
  status: z.enum(['ok', 'low', 'out']).optional(),
  q: z.string().trim().max(80).optional(),
  includeForecast: boolish.optional(),
});

async function ownedStock(req: Request, id: string) {
  const stock = await Stock.findById(id);
  if (!stock) throw AppError.notFound('Stock introuvable');
  if (req.auth!.role === 'PHARMACIST' && String(stock.pharmacyId) !== req.auth!.pharmacyId) throw AppError.forbidden('Ce stock n’appartient pas à votre pharmacie');
  return stock;
}

export const stocksRoutes = Router();
stocksRoutes.use(authenticate, authorize('PHARMACIST', 'ADMIN'));

stocksRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const pid = optionalPharmacyId(req, q.pharmacyId);
  const filter: Record<string, unknown> = {};
  if (pid) filter.pharmacyId = oid(pid);
  if (q.q) {
    const meds = await Medicine.find({ nameLower: { $regex: new RegExp(normalize(q.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) } }).select('_id').lean();
    filter.medicineId = { $in: meds.map((m) => m._id) };
  }
  // statut : filtré après lecture (comparaison entre deux champs du même document)
  let stocks = await Stock.find(filter).sort({ updatedAt: -1 }).lean();
  if (q.status === 'out') stocks = stocks.filter((s) => s.quantity === 0);
  if (q.status === 'low') stocks = stocks.filter((s) => s.quantity > 0 && s.quantity <= s.minimumQuantity);
  if (q.status === 'ok') stocks = stocks.filter((s) => s.quantity > s.minimumQuantity);
  const total = stocks.length;
  const page = stocks.slice((q.page - 1) * q.limit, q.page * q.limit);
  const meds = await Medicine.find({ _id: { $in: page.map((s) => s.medicineId) } }).lean();
  const data = await Promise.all(page.map(async (s) => ({
    ...s,
    id: String(s._id),
    medicine: meds.find((m) => String(m._id) === String(s.medicineId)),
    status: s.quantity === 0 ? 'out' : s.quantity <= s.minimumQuantity ? 'low' : 'ok',
    forecast: q.includeForecast ? await forecastStock(s) : undefined,
  })));
  res.json({ data, meta: pageMeta(total, q) });
}));

stocksRoutes.post('/', validate({ body: createSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { pharmacyId, ...rest } = req.body;
  const pid = requirePharmacyId(req, pharmacyId);
  if (!(await Medicine.exists({ _id: oid(rest.medicineId) }))) throw AppError.validation([{ path: 'medicineId', message: 'Médicament inconnu' }]);
  const s = await Stock.create({ ...rest, pharmacyId: oid(pid), medicineId: oid(rest.medicineId), quantity: 0, available: 0, reservedQuantity: 0 });
  await audit({ action: 'stock.create', userId: req.auth!.id, entity: 'Stock', entityId: String(s._id), req });
  await alertService.refresh(String(s._id));
  res.status(201).json({ data: s });
}));

stocksRoutes.post('/sweep-expired', asyncHandler(async (req: Request, res: Response) => {
  const pid = req.auth!.role === 'PHARMACIST' ? requirePharmacyId(req) : (req.body?.pharmacyId as string | undefined);
  const result = await stockService.sweepExpired(pid);
  await audit({ action: 'stock.sweep_expired', userId: req.auth!.id, metadata: result, req });
  res.json({ data: result });
}));

stocksRoutes.get('/:id', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const s = await ownedStock(req, String(req.params.id));
  const [medicine, batches, forecast] = await Promise.all([
    Medicine.findById(s.medicineId).lean(),
    StockBatch.find({ stockId: s._id }).sort({ expirationDate: 1 }).lean(),
    forecastStock(s),
  ]);
  res.json({ data: { ...s.toObject(), id: String(s._id), medicine, batches, forecast } });
}));

stocksRoutes.get('/:id/forecast', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const s = await ownedStock(req, String(req.params.id));
  res.json({ data: await forecastStock(s) });
}));

stocksRoutes.patch('/:id', validate({ params: idParams, body: patchSchema }), asyncHandler(async (req: Request, res: Response) => {
  const s = await ownedStock(req, String(req.params.id));
  s.set(req.body);
  await s.save();
  await audit({ action: 'stock.update', userId: req.auth!.id, entity: 'Stock', entityId: String(s._id), metadata: req.body, req });
  await alertService.refresh(String(s._id));
  res.json({ data: s });
}));

stocksRoutes.post('/:id/adjust', validate({ params: idParams, body: adjustSchema }), asyncHandler(async (req: Request, res: Response) => {
  const s = await ownedStock(req, String(req.params.id));
  const { delta, note, batchNumber, expirationDate, purchasePrice } = req.body;
  const batch = batchNumber && expirationDate ? { batchNumber, expirationDate, purchasePrice } : undefined;
  const result = await stockService.adjust(String(s._id), delta, { userId: req.auth!.id, note, reference: 'ADJ' }, batch);
  await audit({ action: 'stock.adjust', userId: req.auth!.id, entity: 'Stock', entityId: String(s._id), metadata: { delta, note }, req });
  res.json({ data: result });
}));

// ---------- historique des mouvements ----------
const movQuery = paginationSchema.extend({
  pharmacyId: objectIdSchema.optional(),
  stockId: objectIdSchema.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const stockMovementsRoutes = Router();
stockMovementsRoutes.use(authenticate, authorize('PHARMACIST', 'ADMIN'));
stockMovementsRoutes.get('/', validate({ query: movQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof movQuery>>(req);
  const filter: Record<string, unknown> = {};
  const pid = optionalPharmacyId(req, q.pharmacyId);
  if (pid) filter.pharmacyId = oid(pid);
  if (q.stockId) filter.stockId = oid(q.stockId);
  if (q.type) filter.type = q.type;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const [items, total] = await Promise.all([
    StockMovement.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    StockMovement.countDocuments(filter),
  ]);
  const meds = await Medicine.find({ _id: { $in: items.map((m) => m.medicineId) } }).select('name dosage').lean();
  res.json({
    data: items.map((m) => ({ ...m, id: String(m._id), medicine: meds.find((x) => String(x._id) === String(m.medicineId)) })),
    meta: pageMeta(total, q),
  });
}));
