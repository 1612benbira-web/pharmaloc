import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PurchaseOrder } from '../../models/PurchaseOrder';
import { Supplier } from '../../models/Supplier';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { Q } from '../../utils/http';
import { idParams, objectIdSchema, oid } from '../../utils/ids';
import { pageMeta, paginationSchema } from '../../utils/pagination';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { optionalPharmacyId, requirePharmacyId } from '../../middleware/scope';
import { audit } from '../../services/audit.service';
import { restockService } from '../stock/restock.service';

const listQuery = paginationSchema.extend({
  pharmacyId: objectIdSchema.optional(),
  status: z.enum(['suggested', 'accepted', 'rejected']).optional(),
});
const acceptSchema = z.object({
  supplierId: objectIdSchema.optional(),
  items: z.array(z.object({ stockId: objectIdSchema, quantity: z.number().int().min(0).max(1_000_000) }).strict()).max(200).optional(),
  note: z.string().trim().max(300).optional(),
}).strict();

async function ownedOrder(req: Request) {
  const po = await PurchaseOrder.findById(req.params.id);
  if (!po || (req.auth!.role === 'PHARMACIST' && String(po.pharmacyId) !== req.auth!.pharmacyId)) throw AppError.notFound('Suggestion introuvable');
  return po;
}

export const purchaseOrdersRoutes = Router();
purchaseOrdersRoutes.use(authenticate, authorize('PHARMACIST', 'ADMIN'));

purchaseOrdersRoutes.get('/', validate({ query: listQuery }), asyncHandler(async (req: Request, res: Response) => {
  const q = Q<z.infer<typeof listQuery>>(req);
  const filter: Record<string, unknown> = {};
  const pid = optionalPharmacyId(req, q.pharmacyId);
  if (pid) filter.pharmacyId = oid(pid);
  if (q.status) filter.status = q.status;
  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    PurchaseOrder.countDocuments(filter),
  ]);
  res.json({ data: items, meta: pageMeta(total, q) });
}));

/** Calcule la suggestion de réapprovisionnement (aucune commande envoyée au fournisseur). */
purchaseOrdersRoutes.post('/generate', asyncHandler(async (req: Request, res: Response) => {
  const po = await restockService.generate(requirePharmacyId(req, req.body?.pharmacyId));
  res.status(po ? 201 : 200).json({ data: po, message: po ? undefined : 'Aucun réapprovisionnement nécessaire' });
}));

/** Le pharmacien accepte (éventuellement en modifiant les quantités). Rien n'est commandé automatiquement. */
purchaseOrdersRoutes.post('/:id/accept', validate({ params: idParams, body: acceptSchema }), asyncHandler(async (req: Request, res: Response) => {
  const po = await ownedOrder(req);
  if (po.status !== 'suggested') throw AppError.conflict('Cette suggestion a déjà été traitée');
  for (const o of req.body.items ?? []) {
    const item = po.items.find((i) => String(i.stockId) === o.stockId);
    if (!item) throw AppError.validation([{ path: 'items', message: `Produit absent de la suggestion (${o.stockId})` }]);
    item.quantity = o.quantity;
  }
  if (req.body.supplierId) {
    if (!(await Supplier.exists({ _id: oid(req.body.supplierId), pharmacyId: po.pharmacyId }))) throw AppError.validation([{ path: 'supplierId', message: 'Fournisseur inconnu' }]);
    po.supplierId = oid(req.body.supplierId) as never;
  }
  po.items = po.items.filter((i) => i.quantity > 0) as never;
  if (!po.items.length) throw AppError.validation([{ path: 'items', message: 'Aucune quantité à commander' }]);
  po.status = 'accepted';
  po.decidedBy = oid(req.auth!.id) as never;
  po.decidedAt = new Date();
  po.note = req.body.note;
  await po.save();
  await audit({ action: 'purchase_order.accept', userId: req.auth!.id, entity: 'PurchaseOrder', entityId: String(po._id), metadata: { items: po.items.length }, req });
  res.json({ data: po });
}));

purchaseOrdersRoutes.post('/:id/reject', validate({ params: idParams, body: z.object({ note: z.string().trim().max(300).optional() }).strict() }), asyncHandler(async (req: Request, res: Response) => {
  const po = await ownedOrder(req);
  if (po.status !== 'suggested') throw AppError.conflict('Cette suggestion a déjà été traitée');
  po.status = 'rejected';
  po.decidedBy = oid(req.auth!.id) as never;
  po.decidedAt = new Date();
  po.note = req.body.note;
  await po.save();
  await audit({ action: 'purchase_order.reject', userId: req.auth!.id, entity: 'PurchaseOrder', entityId: String(po._id), req });
  res.json({ data: po });
}));
