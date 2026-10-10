import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Pharmacy } from '../../models/Pharmacy';
import { Review } from '../../models/Review';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { Q, boolish, numeric } from '../../utils/http';
import { idParams } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { haversineKm, isOpenNow } from '../../utils/geo';
import { validate } from '../../middleware/validate';
import { authenticate, authorize, optionalAuthenticate } from '../../middleware/auth';
import { audit } from '../../services/audit.service';
import { deliveryQuote } from './deliveryFee';
import { notify } from '../../services/notification.service';

const hours = z.object({
  day: z.number().int().min(0).max(6),
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  closed: z.boolean().optional(),
});

const base = {
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  neighborhood: z.string().trim().max(80).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  is24h: z.boolean().optional(),
  openingHours: z.array(hours).max(7).optional(),
  offersDelivery: z.boolean().optional(),
  offersPickup: z.boolean().optional(),
  deliveryFee: z.number().min(0).max(100000).optional(),
  deliveryPerKmFee: z.number().min(0).max(10000).optional(),
  deliveryIncludedKm: z.number().min(0).max(50).optional(),
  deliveryRadiusKm: z.number().min(0).max(100).optional(),
};
const createSchema = z.object({ ...base, isValidated: z.boolean().optional() }).strict();
const adminPatch = z.object(base).partial().extend({ isActive: z.boolean().optional() }).strict();
const ownerPatch = z
  .object({
    phone: base.phone, email: base.email, is24h: base.is24h, openingHours: base.openingHours,
    offersDelivery: base.offersDelivery, offersPickup: base.offersPickup, deliveryFee: base.deliveryFee, deliveryRadiusKm: base.deliveryRadiusKm,
    deliveryPerKmFee: base.deliveryPerKmFee, deliveryIncludedKm: base.deliveryIncludedKm,
  })
  .partial()
  .strict();

const listQuery = paginationSchema.extend({
  lat: numeric.optional(), lng: numeric.optional(), radiusKm: numeric.optional(),
  city: z.string().optional(), neighborhood: z.string().optional(),
  openNow: boolish.optional(), delivery: boolish.optional(), all: boolish.optional(),
});

export const pharmaciesRoutes = Router();

pharmaciesRoutes.get('/', optionalAuthenticate, validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const filter: Record<string, unknown> = {};
  if (!(req.auth?.role === 'ADMIN' && q.all)) Object.assign(filter, { isActive: true, isValidated: true });
  if (q.city) filter.city = new RegExp(`^${q.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (q.neighborhood) filter.neighborhood = new RegExp(`^${q.neighborhood.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (q.delivery) filter.offersDelivery = true;
  const all = await Pharmacy.find(filter).lean();
  const now = new Date();
  let items = all.map((p) => ({
    ...p,
    id: String(p._id),
    isOpen: isOpenNow(p, now),
    distanceKm: q.lat !== undefined && q.lng !== undefined ? haversineKm(q.lat, q.lng, p.latitude, p.longitude) : undefined,
  }));
  if (q.openNow) items = items.filter((p) => p.isOpen);
  if (q.radiusKm !== undefined) items = items.filter((p) => p.distanceKm === undefined || p.distanceKm <= q.radiusKm!);
  items.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.name.localeCompare(b.name));
  const total = items.length;
  res.json({ data: items.slice((q.page - 1) * q.limit, q.page * q.limit), meta: pageMeta(total, q) });
}));

/** Devis de livraison : distance pharmacie -> adresse du patient et frais correspondants (public). */
const quoteQuery = z.object({ lat: numeric.min(-90).max(90), lng: numeric.min(-180).max(180) });
pharmaciesRoutes.get('/:id/delivery-quote', validate({ params: idParams, query: quoteQuery }), asyncHandler(async (req: Request, res: Response) => {
  const p = await Pharmacy.findOne({ _id: req.params.id, isActive: true, isValidated: true }).lean();
  if (!p) throw AppError.notFound('Pharmacie introuvable');
  const { lat, lng } = Q<z.infer<typeof quoteQuery>>(req);
  const quote = deliveryQuote(p, lat, lng);
  res.json({ data: { ...quote, deliveryAvailable: p.offersDelivery && quote.inZone } });
}));

pharmaciesRoutes.get('/:id', optionalAuthenticate, validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const p = await Pharmacy.findById(req.params.id).lean();
  const privileged = req.auth?.role === 'ADMIN' || (req.auth?.role === 'PHARMACIST' && req.auth.pharmacyId === req.params.id);
  if (!p || (!privileged && (!p.isActive || !p.isValidated))) throw AppError.notFound('Pharmacie introuvable');
  const reviews = await Review.find({ pharmacyId: p._id }).select('rating').lean();
  const rating = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null;
  res.json({ data: { ...p, id: String(p._id), isOpen: isOpenNow(p), rating, reviewCount: reviews.length } });
}));

pharmaciesRoutes.post('/', authenticate, authorize('ADMIN'), validate({ body: createSchema }), asyncHandler(async (req: Request, res: Response) => {
  const p = await Pharmacy.create({ isValidated: true, ...req.body });
  await audit({ action: 'pharmacy.create', userId: req.auth!.id, entity: 'Pharmacy', entityId: String(p._id), req });
  res.status(201).json({ data: p });
}));

pharmaciesRoutes.patch('/:id', authenticate, authorize('ADMIN', 'PHARMACIST'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const isAdmin = req.auth!.role === 'ADMIN';
  if (!isAdmin && req.auth!.pharmacyId !== id) throw AppError.forbidden('Vous ne pouvez modifier que votre pharmacie');
  const parsed = (isAdmin ? adminPatch : ownerPatch).safeParse(req.body);
  if (!parsed.success) throw AppError.validation(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const p = await Pharmacy.findByIdAndUpdate(id, { $set: parsed.data }, { new: true });
  if (!p) throw AppError.notFound('Pharmacie introuvable');
  await audit({ action: 'pharmacy.update', userId: req.auth!.id, entity: 'Pharmacy', entityId: id, metadata: { fields: Object.keys(parsed.data) }, req });
  res.json({ data: p });
}));

pharmaciesRoutes.patch('/:id/validation', authenticate, authorize('ADMIN'), validate({ params: idParams, body: z.object({ isValidated: z.boolean() }).strict() }), asyncHandler(async (req: Request, res: Response) => {
  const p = await Pharmacy.findByIdAndUpdate(req.params.id, { $set: { isValidated: req.body.isValidated } }, { new: true });
  if (!p) throw AppError.notFound('Pharmacie introuvable');
  await audit({ action: req.body.isValidated ? 'pharmacy.validate' : 'pharmacy.invalidate', userId: req.auth!.id, entity: 'Pharmacy', entityId: String(p._id), req });
  await notify.pharmacy(p._id, { type: 'pharmacy.validation', title: req.body.isValidated ? 'Pharmacie validée' : 'Pharmacie suspendue', message: req.body.isValidated ? 'Votre pharmacie est visible par les patients.' : 'Votre pharmacie n’est plus visible.' });
  res.json({ data: p });
}));
