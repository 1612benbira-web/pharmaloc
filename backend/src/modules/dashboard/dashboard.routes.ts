import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { Q } from '../../utils/http';
import { objectIdSchema } from '../../utils/ids';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { requirePharmacyId } from '../../middleware/scope';
import { dashboardService } from './dashboard.service';

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate);
dashboardRoutes.get('/pharmacy', authorize('PHARMACIST', 'ADMIN'), validate({ query: z.object({ pharmacyId: objectIdSchema.optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await dashboardService.pharmacy(requirePharmacyId(req, Q<{ pharmacyId?: string }>(req).pharmacyId)) });
}));
dashboardRoutes.get('/admin', authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await dashboardService.admin() });
}));
