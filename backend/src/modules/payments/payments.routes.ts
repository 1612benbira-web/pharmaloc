import { Router, type Request, type Response } from 'express';
import { Payment } from '../../models/Payment';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { idParams } from '../../utils/ids';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { paymentService } from './payment.service';

async function own(req: Request) {
  const p = await Payment.findById(req.params.id).lean();
  const a = req.auth!;
  if (!p || (a.role !== 'ADMIN' && String(p.userId) !== a.id)) throw AppError.notFound('Paiement introuvable');
  return p;
}

export const paymentsRoutes = Router();
paymentsRoutes.use(authenticate);
paymentsRoutes.get('/:id', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  await own(req);
  res.json({ data: await paymentService.getPaymentStatus(String(req.params.id)) });
}));
paymentsRoutes.post('/:id/verify', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  await own(req);
  res.json({ data: await paymentService.verifyPayment(String(req.params.id)) });
}));
