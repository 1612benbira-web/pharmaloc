import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AuditLog } from '../../models/AuditLog';
import { asyncHandler } from '../../utils/asyncHandler';
import { Q } from '../../utils/http';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';

const listQuery = paginationSchema.extend({ action: z.string().max(80).optional(), entity: z.string().max(40).optional() });

export const auditRoutes = Router();
auditRoutes.use(authenticate, authorize('ADMIN'));
auditRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = q.action;
  if (q.entity) filter.entity = q.entity;
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ data: items, meta: pageMeta(total, q) });
}));
