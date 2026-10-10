import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Delivery } from '../../models/Delivery';
import { DeliveryAgent } from '../../models/DeliveryAgent';
import { User } from '../../models/User';
import { Order } from '../../models/Order';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { idParams, objectIdSchema, oid } from '../../utils/ids';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { deliveryService, forViewer } from './delivery.service';
import { assertCanView } from '../orders/order.service';

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres') }).strict();
const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
const availabilitySchema = z.object({
  isAvailable: z.boolean().optional(),
  vehicle: z.string().trim().max(60).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).strict();

export const deliveriesRoutes = Router();
deliveriesRoutes.use(authenticate);

// Livreur : demandes de livraison disponibles / mes livraisons
deliveriesRoutes.get('/available', authorize('DELIVERY_AGENT'), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.listAvailable(req.auth!.id) });
}));
deliveriesRoutes.get('/mine', authorize('DELIVERY_AGENT'), asyncHandler(async (req: Request, res: Response) => {
  const items = await Delivery.find({ deliveryAgentId: oid(req.auth!.id) }).sort({ createdAt: -1 }).limit(50).lean();
  const orders = await Order.find({ _id: { $in: items.map((d) => d.orderId) } }).select('items totalAmount deliveryFee deliveryDistanceKm paymentMethod paymentStatus addressSnapshot').lean();
  res.json({ data: items.map((d) => ({ ...d, order: orders.find((o) => String(o._id) === String(d.orderId)) })) });
}));

deliveriesRoutes.get('/:id', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  const d = await Delivery.findById(req.params.id).lean();
  if (!d) throw AppError.notFound('Livraison introuvable');
  const order = await Order.findById(d.orderId);
  if (!order) throw AppError.notFound('Commande introuvable');
  await assertCanView(order, req.auth!);
  res.json({ data: forViewer(d, req.auth!) });
}));

deliveriesRoutes.post('/:id/pickup', authorize('DELIVERY_AGENT'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.pickup(String(req.params.id), req.auth!) });
}));
deliveriesRoutes.post('/:id/start', authorize('DELIVERY_AGENT'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.start(String(req.params.id), req.auth!) });
}));
deliveriesRoutes.post('/:id/location', authorize('DELIVERY_AGENT'), validate({ params: idParams, body: locationSchema }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.updateLocation(String(req.params.id), req.auth!, req.body.latitude, req.body.longitude) });
}));
deliveriesRoutes.post('/:id/complete', authorize('DELIVERY_AGENT'), validate({ params: idParams, body: codeSchema }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.complete(String(req.params.id), req.auth!, req.body.code) });
}));

// Acceptation d'une livraison (POST /api/delivery-assignments)
export const deliveryAssignmentsRoutes = Router();
deliveryAssignmentsRoutes.post('/', authenticate, authorize('DELIVERY_AGENT'), validate({ body: z.object({ deliveryId: objectIdSchema }).strict() }), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ data: await deliveryService.accept(req.body.deliveryId, req.auth!) });
}));

// Profil / disponibilité du livreur
export const agentsRoutes = Router();
agentsRoutes.use(authenticate);
agentsRoutes.get('/me', authorize('DELIVERY_AGENT'), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: (await DeliveryAgent.findOne({ userId: oid(req.auth!.id) }).lean()) ?? { userId: req.auth!.id, isAvailable: false } });
}));
agentsRoutes.patch('/me', authorize('DELIVERY_AGENT'), validate({ body: availabilitySchema }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.setAvailability(req.auth!.id, req.body) });
}));
agentsRoutes.get('/', authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response) => {
  const agents = await DeliveryAgent.find().lean();
  const users = await User.find({ role: 'DELIVERY_AGENT' }).select('firstName lastName phone isActive').lean();
  const active = await Delivery.find({ status: { $in: ['assigned', 'picked_up', 'in_delivery'] } }).select('deliveryAgentId').lean();
  res.json({
    data: users.map((u) => ({
      user: u,
      profile: agents.find((a) => String(a.userId) === String(u._id)) ?? null,
      activeDeliveries: active.filter((d) => String(d.deliveryAgentId) === String(u._id)).length,
    })),
  });
}));
