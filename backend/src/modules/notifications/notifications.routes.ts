import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Notification } from '../../models/Notification';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { Q, boolish } from '../../utils/http';
import { idParams, oid } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';

const listQuery = paginationSchema.extend({ unread: boolish.optional() });

export const notificationsRoutes = Router();
notificationsRoutes.use(authenticate);

notificationsRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const filter: Record<string, unknown> = { userId: oid(req.auth!.id) };
  if (q.unread) filter.readAt = { $exists: false };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: oid(req.auth!.id), readAt: { $exists: false } }),
  ]);
  res.json({ data: items, meta: { ...pageMeta(total, q), unread } });
}));

notificationsRoutes.get('/unread-count', asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: { unread: await Notification.countDocuments({ userId: oid(req.auth!.id), readAt: { $exists: false } }) } });
}));

notificationsRoutes.post('/read-all', asyncHandler(async (req: Request, res: Response) => {
  const r = await Notification.updateMany({ userId: oid(req.auth!.id), readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  res.json({ data: { updated: r.modifiedCount } });
}));

notificationsRoutes.post('/:id/read', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const n = await Notification.findOneAndUpdate({ _id: oid(String(req.params.id)), userId: oid(req.auth!.id) }, { $set: { readAt: new Date() } }, { new: true });
  if (!n) throw AppError.notFound('Notification introuvable');
  res.json({ data: n });
}));
