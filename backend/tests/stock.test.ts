import { describe, expect, it } from 'vitest';
import { it as itReal } from 'vitest';
import { Stock } from '../src/models/Stock';
import { StockBatch } from '../src/models/StockBatch';
import { StockMovement } from '../src/models/StockMovement';
import { InventoryAlert } from '../src/models/InventoryAlert';
import { Notification } from '../src/models/Notification';
import { stockService } from '../src/modules/stock/stock.service';
import { alertService } from '../src/modules/stock/alert.service';
import { addStock, daysFromNow, makeWorld } from './helpers/app';

const openAlerts = async (stockId: string) => (await InventoryAlert.find({ stockId, status: 'open' }).lean()).map((a) => a.type).sort();

describe('STOCK - entrées (réception)', () => {
  it('ajoute du stock, crée lot + mouvement tracé (avant/après)', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 50);
    const r = await stockService.receive(
      { pharmacyId: w.pid(w.pharmacyA), medicineId: w.pid(w.para), quantity: 100, batchNumber: 'LOT123', expirationDate: daysFromNow(700), purchasePrice: 300 },
      { userId: w.pharmA.id, reference: 'LIV-2026-001' },
    );
    expect(r.previousQuantity).toBe(50);
    expect(r.newQuantity).toBe(150);
    const stock = await Stock.findById(id).lean();
    expect(stock).toMatchObject({ quantity: 150, available: 150, reservedQuantity: 0 });
    const mv = await StockMovement.findOne({ stockId: id, type: 'delivery_received', reference: 'LIV-2026-001' }).lean();
    expect(mv).toMatchObject({ quantity: 100, previousQuantity: 50, newQuantity: 150 });
    expect(String(mv!.userId)).toBe(w.pharmA.id);
    expect((await StockBatch.find({ stockId: id }).lean()).length).toBe(2);
  });

  it('un même lot reçu deux fois est cumulé (pas de doublon)', async () => {
    const w = await makeWorld();
    const exp = daysFromNow(500);
    const base = { pharmacyId: w.pid(w.pharmacyA), medicineId: w.pid(w.para), batchNumber: 'L9', expirationDate: exp };
    const a = await stockService.receive({ ...base, quantity: 10 });
    await stockService.receive({ ...base, quantity: 5 });
    const batches = await StockBatch.find({ stockId: a.stockId }).lean();
    expect(batches).toHaveLength(1);
    expect(batches[0]!.quantity).toBe(15);
  });

  it('refuse un produit expiré et une quantité invalide', async () => {
    const w = await makeWorld();
    const base = { pharmacyId: w.pid(w.pharmacyA), medicineId: w.pid(w.para), batchNumber: 'X' };
    await expect(stockService.receive({ ...base, quantity: 5, expirationDate: daysFromNow(-1) })).rejects.toMatchObject({ status: 422 });
    await expect(stockService.receive({ ...base, quantity: 0, expirationDate: daysFromNow(10) })).rejects.toMatchObject({ status: 422 });
    await expect(stockService.receive({ ...base, quantity: 1.5, expirationDate: daysFromNow(10) })).rejects.toMatchObject({ status: 422 });
    expect(await Stock.countDocuments()).toBe(0);
  });
});

describe('STOCK - ventes, FEFO, réservation', () => {
  it('vend en priorité le lot qui expire le plus tôt (FEFO), un mouvement par lot', async () => {
    const w = await makeWorld();
    const p = w.pid(w.pharmacyA), m = w.pid(w.para);
    await stockService.receive({ pharmacyId: p, medicineId: m, quantity: 10, batchNumber: 'TARD', expirationDate: daysFromNow(800) });
    const first = await stockService.receive({ pharmacyId: p, medicineId: m, quantity: 6, batchNumber: 'TOT', expirationDate: daysFromNow(100) });
    const res = await stockService.consume(first.stockId, 8, { reference: 'SALE-1' });
    expect(res.allocations).toHaveLength(2);
    const tot = await StockBatch.findOne({ batchNumber: 'TOT' }).lean();
    const tard = await StockBatch.findOne({ batchNumber: 'TARD' }).lean();
    expect(tot!.quantity).toBe(0);
    expect(tard!.quantity).toBe(8);
    const sales = await StockMovement.find({ type: 'sale' }).sort({ createdAt: 1 }).lean();
    expect(sales.map((s) => s.quantity)).toEqual([-6, -2]);
    expect(await Stock.findById(first.stockId).lean()).toMatchObject({ quantity: 8, available: 8 });
  });

  it('vente simple : stock 100 - 5 => 95, mouvement sale quantity -5', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 100);
    await stockService.consume(id, 5);
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 95 });
    expect(await StockMovement.findOne({ type: 'sale' }).lean()).toMatchObject({ quantity: -5, previousQuantity: 100, newQuantity: 95 });
  });

  it('refuse de vendre plus que le disponible (409) sans rien modifier', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 5);
    await expect(stockService.consume(id, 6)).rejects.toMatchObject({ status: 409 });
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 5, available: 5 });
  });

  it('réservation : réel 50, commande 5 => disponible 45 ; annulation libère les 5', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 50);
    await stockService.reserve(id, 5, { orderId: '65f0000000000000000000aa' });
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 50, reservedQuantity: 5, available: 45 });
    await stockService.release(id, 5);
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 50, reservedQuantity: 0, available: 50 });
    const types = (await StockMovement.find({ stockId: id, type: { $in: ['reservation', 'cancellation'] } }).sort({ createdAt: 1 }).lean()).map((m) => [m.type, m.reservedDelta]);
    expect(types).toEqual([['reservation', 5], ['cancellation', -5]]);
  });

  it('réserver plus que le disponible => 409 ; double libération => 409', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 10);
    await stockService.reserve(id, 8);
    await expect(stockService.reserve(id, 3)).rejects.toMatchObject({ status: 409 });
    await stockService.release(id, 8);
    await expect(stockService.release(id, 8)).rejects.toMatchObject({ status: 409 });
  });

  it('vente d’une quantité réservée : physique et réservé baissent, disponible inchangé', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 50);
    await stockService.reserve(id, 5);
    await stockService.consume(id, 5, {}, { fromReserved: true });
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 45, reservedQuantity: 0, available: 45 });
  });

  it('ne vend JAMAIS un lot expiré : opération annulée, stock intact, anomalie signalée', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 10);
    await StockBatch.updateOne({ stockId: id }, { $set: { expirationDate: daysFromNow(-2) } }); // expire après coup
    await expect(stockService.consume(id, 3)).rejects.toMatchObject({ status: 409 });
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 10, available: 10 });
    expect(await StockBatch.findOne({ stockId: id }).lean()).toMatchObject({ quantity: 10 });
  });

  it('balayage des expirés : mouvement `expiration`, stock réduit, alerte expired', async () => {
    const w = await makeWorld();
    const p = w.pid(w.pharmacyA), m = w.pid(w.para);
    const id = await addStock(w.pid(w.pharmacyA), m, 40, { batch: 'BON' });
    await stockService.receive({ pharmacyId: p, medicineId: m, quantity: 12, batchNumber: 'VIEUX', expirationDate: daysFromNow(5) });
    await StockBatch.updateOne({ stockId: id, batchNumber: 'VIEUX' }, { $set: { expirationDate: daysFromNow(-1) } });
    const r = await stockService.sweepExpired(p);
    expect(r.unitsRemoved).toBe(12);
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 40, available: 40 });
    expect(await StockMovement.findOne({ type: 'expiration' }).lean()).toMatchObject({ quantity: -12 });
    expect((await stockService.sweepExpired(p)).unitsRemoved).toBe(0); // idempotent
  });

  it('ajustement manuel : sortie (casse) et entrée avec lot', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 30);
    await stockService.adjust(id, -4, { note: 'casse' });
    await stockService.adjust(id, 6, { note: 'inventaire' }, { batchNumber: 'INV', expirationDate: daysFromNow(300) });
    expect(await Stock.findById(id).lean()).toMatchObject({ quantity: 32 });
    expect(await StockMovement.countDocuments({ stockId: id, type: 'adjustment' })).toBe(2);
    await expect(stockService.adjust(id, 3, { note: 'sans lot' })).rejects.toMatchObject({ status: 422 });
  });
});

describe('STOCK - alertes (faible, rupture, expiration, cohérence)', () => {
  it('stock faible quand quantity <= minimum, résolu après réapprovisionnement', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 8, { min: 10 });
    expect(await openAlerts(id)).toContain('low_stock');
    const a = await InventoryAlert.findOne({ stockId: id, type: 'low_stock' }).lean();
    expect(a!.message).toContain('STOCK FAIBLE');
    await stockService.receive({ pharmacyId: w.pid(w.pharmacyA), medicineId: w.pid(w.amox), quantity: 50, batchNumber: 'N', expirationDate: daysFromNow(500) });
    expect(await openAlerts(id)).not.toContain('low_stock');
  });

  it('rupture à 0 (critique) ; passe en stock faible après un petit réassort', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 5, { min: 10 });
    await stockService.consume(id, 5);
    expect(await openAlerts(id)).toContain('out_of_stock');
    expect((await InventoryAlert.findOne({ stockId: id, type: 'out_of_stock' }).lean())!.message).toContain('RUPTURE');
    await stockService.receive({ pharmacyId: w.pid(w.pharmacyA), medicineId: w.pid(w.para), quantity: 4, batchNumber: 'R', expirationDate: daysFromNow(500) });
    const types = await openAlerts(id);
    expect(types).toContain('low_stock');
    expect(types).not.toContain('out_of_stock');
  });

  it('notifie le pharmacien de la bonne pharmacie uniquement', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 3, { min: 10 });
    expect(await Notification.countDocuments({ userId: w.pharmA.id, type: 'alert.low_stock' })).toBe(1);
    expect(await Notification.countDocuments({ userId: w.pharmB.id })).toBe(0);
  });

  it('alerte « arrivent à expiration dans 30 jours »', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20, { expiresInDays: 20 });
    const a = await InventoryAlert.findOne({ stockId: id, type: 'expiring_soon' }).lean();
    expect(a!.message).toContain('20 boîtes');
    expect(a!.message).toContain('30 jours');
  });

  it('détecte une anomalie quand stock agrégé et lots divergent', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    await Stock.updateOne({ _id: id }, { $inc: { quantity: 7 } }); // corruption volontaire
    await alertService.refresh(id);
    expect(await openAlerts(id)).toContain('anomaly');
  });
});

// L'atomicité sous concurrence n'est garantie que par un vrai MongoDB (FerretDB ne la garantit pas) :
// lancer avec MONGO_REAL=1 et TEST_MONGODB_URI pointant vers MongoDB.
const real = process.env.MONGO_REAL === '1' ? itReal : itReal.skip;
describe('STOCK - concurrence (MongoDB réel uniquement)', () => {
  real('10 réservations simultanées de 2 sur un disponible de 6 : exactement 3 réussissent', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 6);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => stockService.reserve(id, 2)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await Stock.findById(id).lean()).toMatchObject({ reservedQuantity: 6, available: 0 });
  });
});
