import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { InventoryAlert, ALERT_TYPES } from '../../models/InventoryAlert';
import { Stock } from '../../models/Stock';
import { asyncHandler } from '../../utils/asyncHandler';
import { Q } from '../../utils/http';
import { objectIdSchema, oid } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { optionalPharmacyId } from '../../middleware/scope';
import { stockService } from '../stock/stock.service';
import { alertService } from '../stock/alert.service';

const listQuery = paginationSchema.extend({
  pharmacyId: objectIdSchema.optional(),
  status: z.enum(['open', 'resolved']).default('open'),
  type: z.enum(ALERT_TYPES).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

export const alertsRoutes = Router();
alertsRoutes.use(authenticate, authorize('PHARMACIST', 'ADMIN'));

alertsRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const filter: Record<string, unknown> = { status: q.status };
  const pid = optionalPharmacyId(req, q.pharmacyId);
  if (pid) filter.pharmacyId = oid(pid);
  if (q.type) filter.type = q.type;
  if (q.severity) filter.severity = q.severity;
  const [items, total] = await Promise.all([
    InventoryAlert.find(filter).sort({ openedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    InventoryAlert.countDocuments(filter),
  ]);
  res.json({ data: items, meta: pageMeta(total, q) });
}));

/** Retire les lots expirés puis recalcule toutes les alertes de la pharmacie (planifié + déclenchable à la main). */
alertsRoutes.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const pid = optionalPharmacyId(req, req.body?.pharmacyId);
  const swept = await stockService.sweepExpired(pid);
  const stocks = await Stock.find(pid ? { pharmacyId: oid(pid) } : {}).select('_id').lean();
  for (const s of stocks) await alertService.refresh(String(s._id));
  res.json({ data: { swept, stocksChecked: stocks.length } });
}));
