import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Settlement, SETTLEMENT_KINDS, SETTLEMENT_STATUSES } from '../../models/Settlement';
import { Payout } from '../../models/Payout';
import { Order } from '../../models/Order';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { Q } from '../../utils/http';
import { idParams, objectIdSchema, oid } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { audit } from '../../services/audit.service';
import { settlementService } from './settlement.service';

const listQuery = paginationSchema.extend({
  status: z.enum(SETTLEMENT_STATUSES).optional(),
  kind: z.enum(SETTLEMENT_KINDS).optional(),
  pharmacyId: objectIdSchema.optional(),
  courierId: objectIdSchema.optional(),
});

export const settlementsRoutes = Router();
settlementsRoutes.use(authenticate);

/** Répartitions de l'utilisateur : pharmacien = sa pharmacie, livreur = les siennes, admin = toutes. */
settlementsRoutes.get('/', authorize('PHARMACIST', 'DELIVERY_AGENT', 'ADMIN'), validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const a = req.auth!;
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.kind) filter.kind = q.kind;
  if (a.role === 'PHARMACIST') filter.pharmacyId = oid(a.pharmacyId ?? '000000000000000000000000');
  else if (a.role === 'DELIVERY_AGENT') filter.courierId = oid(a.id);
  else { if (q.pharmacyId) filter.pharmacyId = oid(q.pharmacyId); if (q.courierId) filter.courierId = oid(q.courierId); }

  const [items, total] = await Promise.all([
    Settlement.find(filter).sort({ releasedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Settlement.countDocuments(filter),
  ]);
  const [payouts, orders] = await Promise.all([
    Payout.find({ settlementId: { $in: items.map((s) => s._id) } }).lean(),
    Order.find({ _id: { $in: items.map((s) => s.orderId) } }).select('items deliveryType paymentMethod deliveredAt').lean(),
  ]);
  const data = items.map((s) => ({
    ...s,
    id: String(s._id),
    payouts: payouts.filter((p) => String(p.settlementId) === String(s._id)).map((p) => ({ id: String(p._id), recipientType: p.recipientType, amount: p.amount, status: p.status, destination: p.destination, operator: p.operator, failureReason: p.failureReason, paidAt: p.paidAt })),
    order: orders.find((o) => String(o._id) === String(s.orderId)),
  }));
  const summary = a.role === 'ADMIN' ? undefined : await settlementService.summary(a);
  res.json({ data, meta: { ...pageMeta(total, q), summary } });
}));

settlementsRoutes.get('/overview', authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await settlementService.overview() });
}));

settlementsRoutes.post('/reconcile', authorize('ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const released = await settlementService.reconcile();
  await audit({ action: 'settlement.reconcile', userId: req.auth!.id, metadata: { released }, req });
  res.json({ data: { released } });
}));

/** Confirme la réception d'espèces remises par un livreur (une ou plusieurs commandes). */
settlementsRoutes.post('/confirm-cash', authorize('PHARMACIST', 'ADMIN'), validate({ body: z.object({ ids: z.array(objectIdSchema).min(1).max(50) }).strict() }), asyncHandler(async (req: Request, res: Response) => {
  let confirmed = 0;
  const failed: { id: string; message: string }[] = [];
  for (const id of req.body.ids as string[]) {
    try { await settlementService.confirmCash(id, req.auth!); confirmed++; }
    catch (e) { failed.push({ id, message: e instanceof AppError ? e.message : 'Erreur' }); }
  }
  res.json({ data: { confirmed, failed } });
}));

settlementsRoutes.post('/:id/confirm-cash', authorize('PHARMACIST', 'ADMIN'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await settlementService.confirmCash(String(req.params.id), req.auth!) });
}));

/** Relance les versements en attente ou échoués d'une commande (admin). */
settlementsRoutes.post('/:id/retry', authorize('ADMIN'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const retried = await settlementService.retryFor({ settlementId: String(req.params.id) });
  await audit({ action: 'settlement.retry', userId: req.auth!.id, entity: 'Settlement', entityId: String(req.params.id), metadata: { retried }, req });
  res.json({ data: { retried, settlement: await Settlement.findById(req.params.id).lean() } });
}));
