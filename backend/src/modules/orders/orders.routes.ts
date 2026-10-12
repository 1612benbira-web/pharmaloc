import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Order, ORDER_STATUSES } from '../../models/Order';
import { Delivery } from '../../models/Delivery';
import { Payment } from '../../models/Payment';
import { Pharmacy } from '../../models/Pharmacy';
import { asyncHandler } from '../../utils/asyncHandler';
import { Q } from '../../utils/http';
import { idParams, objectIdSchema, oid } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { orderService, assertCanView, loadOrder, orderCode } from './order.service';
import { addressSchema } from '../addresses/addresses.routes';
import { deliveryService, forViewer } from '../deliveries/delivery.service';
import { phoneField } from '../../utils/phone';

const createSchema = z.object({
  pharmacyId: objectIdSchema,
  deliveryType: z.enum(['pickup', 'delivery']),
  items: z.array(z.object({ medicineId: objectIdSchema, quantity: z.number().int().min(1).max(50) }).strict()).min(1).max(20),
  addressId: objectIdSchema.optional(),
  address: addressSchema.optional(),
  paymentMethod: z.enum(['mobile_money', 'online', 'cash_on_delivery', 'cash_on_pickup']),
}).strict();
const listQuery = paginationSchema.extend({ status: z.enum(ORDER_STATUSES).optional(), pharmacyId: objectIdSchema.optional() });
const reasonSchema = z.object({ reason: z.string().trim().max(200).optional() }).strict();
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres') }).strict();
const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }).strict();

/** Vue d'une commande adaptée au rôle : seul le patient voit son code de livraison/retrait. */
async function present(req: Request, orderId: string) {
  const order = await loadOrder(orderId);
  await assertCanView(order, req.auth!);
  const o = order.toObject();
  const [payments, delivery, pharmacy] = await Promise.all([
    Payment.find({ orderId: order._id }).select('-__v').lean(),
    Delivery.findOne({ orderId: order._id }).lean(),
    Pharmacy.findById(order.pharmacyId).select('name address phone latitude longitude').lean(),
  ]);
  return {
    ...o,
    id: String(order._id),
    pharmacy,
    payments,
    delivery: forViewer(delivery, req.auth!),
    ...(req.auth!.role === 'PATIENT' && !['cancelled', 'delivered'].includes(order.status) ? { deliveryCode: orderCode(String(order._id)) } : {}),
  };
}

export const ordersRoutes = Router();
ordersRoutes.use(authenticate);

ordersRoutes.post('/', authorize('PATIENT'), validate({ body: createSchema }), asyncHandler(async (req: Request, res: Response) => {
  const order = await orderService.create(req.auth!.id, req.body, req);
  res.status(201).json({ data: await present(req, String(order!._id)) });
}));

ordersRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const a = req.auth!;
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (a.role === 'PATIENT') filter.userId = oid(a.id);
  else if (a.role === 'PHARMACIST') filter.pharmacyId = oid(a.pharmacyId ?? '000000000000000000000000');
  else if (a.role === 'ADMIN') { if (q.pharmacyId) filter.pharmacyId = oid(q.pharmacyId); }
  else {
    const ds = await Delivery.find({ deliveryAgentId: oid(a.id) }).select('orderId').lean();
    filter._id = { $in: ds.map((d) => d.orderId) };
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ data: items.map((o) => ({ ...o, id: String(o._id) })), meta: pageMeta(total, q) });
}));

ordersRoutes.get('/:id', validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await present(req, String(req.params.id)) });
}));

ordersRoutes.post('/:id/cancel', validate({ params: idParams, body: reasonSchema }), asyncHandler(async (req: Request, res: Response) => {
  await orderService.cancel(String(req.params.id), req.auth!, req.body.reason);
  res.json({ data: await present(req, String(req.params.id)) });
}));

const pharmacyAction = (name: 'accept' | 'prepare' | 'markReady', path: string) =>
  ordersRoutes.post(`/:id/${path}`, authorize('PHARMACIST', 'ADMIN'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
    await orderService[name](String(req.params.id), req.auth!);
    res.json({ data: await present(req, String(req.params.id)) });
  }));
pharmacyAction('accept', 'accept');
pharmacyAction('prepare', 'prepare');
pharmacyAction('markReady', 'ready');

ordersRoutes.post('/:id/reject', authorize('PHARMACIST', 'ADMIN'), validate({ params: idParams, body: reasonSchema }), asyncHandler(async (req: Request, res: Response) => {
  await orderService.cancel(String(req.params.id), req.auth!, req.body.reason ?? 'Refusée par la pharmacie');
  res.json({ data: await present(req, String(req.params.id)) });
}));

/** Retrait en pharmacie : saisie du code présenté par le patient. */
ordersRoutes.post('/:id/handover', authorize('PHARMACIST', 'ADMIN'), validate({ params: idParams, body: codeSchema }), asyncHandler(async (req: Request, res: Response) => {
  await orderService.handover(String(req.params.id), req.body.code, req.auth!);
  res.json({ data: await present(req, String(req.params.id)) });
}));

ordersRoutes.post('/:id/review', authorize('PATIENT'), validate({ params: idParams, body: reviewSchema }), asyncHandler(async (req: Request, res: Response) => {
  const r = await orderService.review(String(req.params.id), req.auth!.id, req.body.rating, req.body.comment);
  res.status(201).json({ data: r });
}));

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional(),
}).strict();

/** Le patient envoie sa position au livreur (réservé au patient propriétaire, livraison en cours uniquement). */
ordersRoutes.post('/:id/share-location', authorize('PATIENT'), validate({ params: idParams, body: locationSchema }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.sharePatientLocation(String(req.params.id), req.auth!, req.body.latitude, req.body.longitude, req.body.accuracy) });
}));
ordersRoutes.delete('/:id/share-location', authorize('PATIENT'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.stopSharingPatientLocation(String(req.params.id), req.auth!) });
}));

const phoneSchema = z.object({ phone: phoneField.optional() }).strict();

/** Le patient envoie son numéro au livreur assigné (numéro du profil, ou saisi). */
ordersRoutes.post('/:id/share-phone', authorize('PATIENT'), validate({ params: idParams, body: phoneSchema }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.sharePatientPhone(String(req.params.id), req.auth!, req.body.phone) });
}));
ordersRoutes.delete('/:id/share-phone', authorize('PATIENT'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.stopSharingPatientPhone(String(req.params.id), req.auth!) });
}));
ordersRoutes.post('/:id/decline-phone-request', authorize('PATIENT'), validate({ params: idParams }), asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await deliveryService.declinePhoneRequest(String(req.params.id), req.auth!) });
}));
