import { Supplier } from '../../models/Supplier';
import { Medicine } from '../../models/Medicine';
import { SupplierDelivery } from '../../models/SupplierDelivery';
import { AppError } from '../../utils/AppError';
import { oid } from '../../utils/ids';
import { audit } from '../../services/audit.service';
import { eventBus } from '../../events/eventBus';
import { stockService } from '../stock/stock.service';
import { logger } from '../../utils/logger';

export interface ReceiveDeliveryInput {
  supplierName: string;
  reference: string;
  receivedAt: Date;
  items: { medicineId: string; quantity: number; batchNumber: string; expirationDate: Date; purchasePrice?: number }[];
}

/**
 * Réception d'une livraison fournisseur - séquence automatisée (cahier des charges §15) :
 * 1 enregistrer la livraison, 2 augmenter le stock, 3 créer les mouvements, 4 disponibilité,
 * 5 niveaux, 6 alertes, 7 audit (+ notification via l'événement DELIVERY_RECEIVED).
 */
export async function receiveSupplierDelivery(pharmacyId: string, userId: string, input: ReceiveDeliveryInput, req?: import('express').Request) {
  const now = Date.now();
  // pré-validation complète AVANT toute écriture de stock
  const ids = [...new Set(input.items.map((i) => i.medicineId))];
  const found = await Medicine.countDocuments({ _id: { $in: ids.map(oid) } });
  if (found !== ids.length) throw AppError.validation([{ path: 'items', message: 'Un ou plusieurs médicaments sont inconnus' }]);
  for (const [i, it] of input.items.entries()) {
    if (it.expirationDate.getTime() <= now) {
      throw AppError.validation([{ path: `items.${i}.expirationDate`, message: 'Produit déjà expiré : réception refusée' }]);
    }
  }
  if (await SupplierDelivery.exists({ pharmacyId: oid(pharmacyId), reference: input.reference })) {
    throw AppError.conflict(`La livraison ${input.reference} est déjà enregistrée`);
  }

  const supplier = await Supplier.findOneAndUpdate(
    { pharmacyId: oid(pharmacyId), name: input.supplierName },
    { $setOnInsert: { pharmacyId: oid(pharmacyId), name: input.supplierName } },
    { upsert: true, new: true },
  );

  const delivery = await SupplierDelivery.create({
    pharmacyId: oid(pharmacyId),
    supplierId: supplier?._id,
    supplierName: input.supplierName,
    reference: input.reference,
    receivedAt: input.receivedAt,
    items: input.items.map((i) => ({ ...i, medicineId: oid(i.medicineId) })),
    receivedBy: oid(userId),
    status: 'processing',
  });

  const applied: { r: Awaited<ReturnType<typeof stockService.receive>>; quantity: number }[] = [];
  try {
    for (const it of input.items) {
      const r = await stockService.receive(
        { pharmacyId, medicineId: it.medicineId, quantity: it.quantity, batchNumber: it.batchNumber, expirationDate: it.expirationDate, purchasePrice: it.purchasePrice },
        { userId, reference: input.reference },
      );
      applied.push({ r, quantity: it.quantity });
    }
  } catch (err) {
    logger.error('Réception fournisseur en échec : annulation', { reference: input.reference, error: String(err) });
    for (const a of applied.reverse()) await stockService.rollbackReceive(a.r, a.quantity);
    await SupplierDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'failed' } });
    throw err;
  }

  const totalCost = input.items.reduce((s, i) => s + i.quantity * (i.purchasePrice ?? 0), 0);
  delivery.items.forEach((it, idx) => {
    it.stockId = applied[idx] ? (oid(applied[idx]!.r.stockId) as never) : undefined;
  });
  delivery.status = 'received';
  delivery.totalCost = totalCost;
  await delivery.save();

  await audit({
    action: 'supplier_delivery.received',
    userId,
    entity: 'SupplierDelivery',
    entityId: String(delivery._id),
    metadata: { reference: input.reference, items: input.items.length, totalCost },
    req,
  });
  await eventBus.emit('DELIVERY_RECEIVED', {
    supplierDeliveryId: String(delivery._id),
    pharmacyId,
    stockIds: applied.map((a) => a.r.stockId),
    userId,
    reference: input.reference,
  });

  return {
    delivery,
    movements: applied.map((a) => ({ stockId: a.r.stockId, previousQuantity: a.r.previousQuantity, newQuantity: a.r.newQuantity })),
  };
}
