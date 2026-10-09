import { Types } from 'mongoose';
import { Stock } from '../../models/Stock';
import { StockBatch } from '../../models/StockBatch';
import { StockMovement, type MovementType } from '../../models/StockMovement';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { oid } from '../../utils/ids';
import { alertService } from './alert.service';

/**
 * SERVICE UNIQUE de modification du stock.
 * Chaque opération = mise à jour atomique conditionnelle du document Stock (aucune
 * transaction requise) + écriture d'un StockMovement immuable. Les invariants :
 *   quantity  = somme des lots non expirés
 *   available = quantity - reservedQuantity   (>= 0)
 */
export interface Ctx {
  userId?: string;
  reference?: string;
  orderId?: string;
  note?: string;
}

export interface ReceiveInput {
  pharmacyId: string;
  medicineId: string;
  quantity: number;
  batchNumber: string;
  expirationDate: Date;
  purchasePrice?: number;
}

const assertQty = (q: number) => {
  if (!Number.isInteger(q) || q <= 0) throw AppError.validation([{ path: 'quantity', message: 'Quantité entière > 0 requise' }]);
};

function baseMovement(stock: { _id: Types.ObjectId; pharmacyId: Types.ObjectId; medicineId: Types.ObjectId }, ctx: Ctx) {
  return {
    stockId: stock._id,
    pharmacyId: stock.pharmacyId,
    medicineId: stock.medicineId,
    reference: ctx.reference,
    orderId: ctx.orderId ? oid(ctx.orderId) : undefined,
    userId: ctx.userId ? oid(ctx.userId) : undefined,
    note: ctx.note,
  };
}

async function upsertStock(pharmacyId: string, medicineId: string, qty: number, retry = true) {
  try {
    return await Stock.findOneAndUpdate(
      { pharmacyId: oid(pharmacyId), medicineId: oid(medicineId) },
      { $inc: { quantity: qty, available: qty }, $setOnInsert: { reservedQuantity: 0 } },
      { upsert: true, new: true },
    );
  } catch (err) {
    if (retry && (err as { code?: number }).code === 11000) return upsertStock(pharmacyId, medicineId, qty, false);
    throw err;
  }
}

export const stockService = {
  /** Entrée de stock (réception fournisseur, ajustement positif, retour). */
  async receive(input: ReceiveInput, ctx: Ctx = {}, type: MovementType = 'delivery_received') {
    assertQty(input.quantity);
    if (input.expirationDate.getTime() <= Date.now()) {
      throw AppError.validation([{ path: 'expirationDate', message: 'Produit déjà expiré : réception refusée' }]);
    }
    const q = input.quantity;
    const stock = await upsertStock(input.pharmacyId, input.medicineId, q);
    if (!stock) throw AppError.conflict('Création du stock impossible');

    let batch;
    try {
      batch = await StockBatch.findOneAndUpdate(
        { stockId: stock._id, batchNumber: input.batchNumber, expirationDate: input.expirationDate },
        {
          $inc: { quantity: q },
          ...(input.purchasePrice !== undefined ? { $set: { purchasePrice: input.purchasePrice } } : {}),
          $setOnInsert: { pharmacyId: stock.pharmacyId, medicineId: stock.medicineId },
        },
        { upsert: true, new: true },
      );
    } catch (err) {
      // compensation : annuler l'incrément du stock
      await Stock.updateOne({ _id: stock._id }, { $inc: { quantity: -q, available: -q } });
      throw err;
    }

    const movement = await StockMovement.create({
      ...baseMovement(stock, ctx),
      batchId: batch?._id,
      type,
      quantity: q,
      reservedDelta: 0,
      previousQuantity: stock.quantity - q,
      newQuantity: stock.quantity,
      previousReserved: stock.reservedQuantity,
      newReserved: stock.reservedQuantity,
    });
    await alertService.refresh(String(stock._id));
    return {
      stockId: String(stock._id),
      batchId: String(batch?._id),
      movementId: String(movement._id),
      previousQuantity: stock.quantity - q,
      newQuantity: stock.quantity,
    };
  },

  /** Annule une entrée (compensation d'une réception partielle). N'écrit pas de mouvement : supprime celui d'origine. */
  async rollbackReceive(r: { stockId: string; batchId: string; movementId: string }, quantity: number) {
    await StockBatch.updateOne({ _id: r.batchId }, { $inc: { quantity: -quantity } });
    await Stock.updateOne({ _id: r.stockId }, { $inc: { quantity: -quantity, available: -quantity } });
    await StockMovement.deleteOne({ _id: r.movementId });
    await alertService.refresh(r.stockId);
  },

  /** Réserve des unités pour une commande. Échoue (409) si le disponible est insuffisant. */
  async reserve(stockId: string, qty: number, ctx: Ctx = {}) {
    assertQty(qty);
    const stock = await Stock.findOneAndUpdate(
      { _id: oid(stockId), isListed: true, available: { $gte: qty } },
      { $inc: { reservedQuantity: qty, available: -qty } },
      { new: true },
    );
    if (!stock) throw AppError.conflict('Stock insuffisant pour la réservation', { stockId, requested: qty });
    await StockMovement.create({
      ...baseMovement(stock, ctx),
      type: 'reservation',
      quantity: 0,
      reservedDelta: qty,
      previousQuantity: stock.quantity,
      newQuantity: stock.quantity,
      previousReserved: stock.reservedQuantity - qty,
      newReserved: stock.reservedQuantity,
    });
    return stock;
  },

  /** Libère une réservation (annulation de commande). */
  async release(stockId: string, qty: number, ctx: Ctx = {}) {
    assertQty(qty);
    const stock = await Stock.findOneAndUpdate(
      { _id: oid(stockId), reservedQuantity: { $gte: qty } },
      { $inc: { reservedQuantity: -qty, available: qty } },
      { new: true },
    );
    if (!stock) throw AppError.conflict('Réservation introuvable ou déjà libérée', { stockId, qty });
    await StockMovement.create({
      ...baseMovement(stock, ctx),
      type: 'cancellation',
      quantity: 0,
      reservedDelta: -qty,
      previousQuantity: stock.quantity,
      newQuantity: stock.quantity,
      previousReserved: stock.reservedQuantity + qty,
      newReserved: stock.reservedQuantity,
    });
    return stock;
  },

  /**
   * Sortie physique de stock, par lots FEFO (le plus proche de l'expiration d'abord).
   * Les lots expirés ne sont JAMAIS utilisés. `fromReserved` : les unités avaient été réservées.
   */
  async consume(stockId: string, qty: number, ctx: Ctx = {}, opts: { type?: MovementType; fromReserved?: boolean } = {}) {
    assertQty(qty);
    const type = opts.type ?? 'sale';
    const fromReserved = opts.fromReserved ?? false;

    const filter = fromReserved
      ? { _id: oid(stockId), reservedQuantity: { $gte: qty } }
      : { _id: oid(stockId), available: { $gte: qty } };
    const inc = fromReserved ? { quantity: -qty, reservedQuantity: -qty } : { quantity: -qty, available: -qty };
    const prev = await Stock.findOneAndUpdate(filter, { $inc: inc }, { new: false });
    if (!prev) throw AppError.conflict('Stock insuffisant', { stockId, requested: qty });

    const allocations: { batchId: Types.ObjectId; take: number }[] = [];
    let remaining = qty;
    for (let pass = 0; pass < 2 && remaining > 0; pass++) {
      const batches = await StockBatch.find({ stockId: prev._id, quantity: { $gt: 0 }, expirationDate: { $gt: new Date() } })
        .sort({ expirationDate: 1 })
        .lean();
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, b.quantity);
        const upd = await StockBatch.findOneAndUpdate({ _id: b._id, quantity: { $gte: take } }, { $inc: { quantity: -take } }, { new: true });
        if (upd) {
          allocations.push({ batchId: b._id, take });
          remaining -= take;
        }
      }
    }

    if (remaining > 0) {
      // Incohérence stock/lots : on annule tout et on signale une anomalie.
      for (const a of allocations) await StockBatch.updateOne({ _id: a.batchId }, { $inc: { quantity: a.take } });
      await Stock.updateOne({ _id: prev._id }, { $inc: { quantity: qty, ...(fromReserved ? { reservedQuantity: qty } : { available: qty }) } });
      logger.error('Incohérence stock/lots', { stockId });
      await alertService.refresh(stockId);
      throw AppError.conflict('Stock incohérent (lots insuffisants ou expirés) : opération annulée', { stockId });
    }

    let running = prev.quantity;
    let runningReserved = prev.reservedQuantity;
    for (const a of allocations) {
      await StockMovement.create({
        ...baseMovement(prev, ctx),
        batchId: a.batchId,
        type,
        quantity: -a.take,
        reservedDelta: fromReserved ? -a.take : 0,
        previousQuantity: running,
        newQuantity: running - a.take,
        previousReserved: runningReserved,
        newReserved: fromReserved ? runningReserved - a.take : runningReserved,
      });
      running -= a.take;
      if (fromReserved) runningReserved -= a.take;
    }
    await alertService.refresh(stockId);
    return { allocations: allocations.map((a) => ({ batchId: String(a.batchId), quantity: a.take })), newQuantity: running };
  },

  /** Ajustement manuel (inventaire, casse, perte). delta < 0 : sortie ; delta > 0 : il faut préciser le lot. */
  async adjust(
    stockId: string,
    delta: number,
    ctx: Ctx & { note: string },
    batch?: { batchNumber: string; expirationDate: Date; purchasePrice?: number },
  ) {
    if (!Number.isInteger(delta) || delta === 0) throw AppError.validation([{ path: 'delta', message: 'Variation entière non nulle requise' }]);
    if (delta < 0) return stockService.consume(stockId, -delta, ctx, { type: 'adjustment' });
    if (!batch) throw AppError.validation([{ path: 'batchNumber', message: 'Lot et date d’expiration requis pour un ajustement positif' }]);
    const stock = await Stock.findById(stockId).lean();
    if (!stock) throw AppError.notFound('Stock introuvable');
    return stockService.receive(
      { pharmacyId: String(stock.pharmacyId), medicineId: String(stock.medicineId), quantity: delta, ...batch },
      ctx,
      'adjustment',
    );
  },

  /** Retire du stock les lots expirés (mouvement `expiration`). Idempotent. */
  async sweepExpired(pharmacyId?: string) {
    const now = new Date();
    const filter: Record<string, unknown> = { quantity: { $gt: 0 }, expirationDate: { $lte: now } };
    if (pharmacyId) filter.pharmacyId = oid(pharmacyId);
    const expired = await StockBatch.find(filter).lean();
    const touched = new Set<string>();
    let removed = 0;

    for (const e of expired) {
      const b = await StockBatch.findOneAndUpdate(
        { _id: e._id, quantity: { $gt: 0 }, expirationDate: { $lte: now } },
        { $set: { quantity: 0 } },
        { new: false },
      );
      if (!b || b.quantity <= 0) continue;
      const q = b.quantity;
      let prev = await Stock.findOneAndUpdate({ _id: b.stockId, available: { $gte: q } }, { $inc: { quantity: -q, available: -q } }, { new: false });
      if (!prev) {
        // Cas limite : des unités réservées s'appuyaient sur ce lot -> disponible ramené à 0 + anomalie.
        const s = await Stock.findById(b.stockId).lean();
        if (!s) continue;
        const newQty = Math.max(0, s.quantity - q);
        prev = await Stock.findOneAndUpdate(
          { _id: b.stockId },
          { $inc: { quantity: -q }, $set: { available: Math.max(0, newQty - s.reservedQuantity) } },
          { new: false },
        );
        if (prev) await alertService.raiseAnomaly(String(b.stockId), 'Des commandes réservées dépassent le stock non expiré après retrait de lots expirés');
      }
      if (!prev) continue;
      await StockMovement.create({
        ...baseMovement(prev, { reference: `EXP-${b.batchNumber}`, note: `Lot ${b.batchNumber} expiré` }),
        batchId: b._id,
        type: 'expiration',
        quantity: -q,
        reservedDelta: 0,
        previousQuantity: prev.quantity,
        newQuantity: prev.quantity - q,
        previousReserved: prev.reservedQuantity,
        newReserved: prev.reservedQuantity,
      });
      touched.add(String(b.stockId));
      removed += q;
    }
    for (const id of touched) await alertService.refresh(id);
    return { batches: expired.length, unitsRemoved: removed };
  },
};
