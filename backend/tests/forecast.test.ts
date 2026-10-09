import { describe, expect, it } from 'vitest';
import { Stock } from '../src/models/Stock';
import { InventoryAlert } from '../src/models/InventoryAlert';
import { PurchaseOrder } from '../src/models/PurchaseOrder';
import { StockMovement } from '../src/models/StockMovement';
import { stockService } from '../src/modules/stock/stock.service';
import { alertService } from '../src/modules/stock/alert.service';
import { computeForecast } from '../src/modules/stock/forecast.service';
import { suggestQuantity } from '../src/modules/stock/restock.service';
import { addStock, api, auth, makeWorld } from './helpers/app';

describe('PRÉVISION - calcul vérifiable', () => {
  it('24 en stock, 8/jour => rupture dans 3 jours', () => {
    const f = computeForecast(24, 8 * 14);
    expect(f.avgDailyConsumption).toBe(8);
    expect(f.daysRemaining).toBe(3);
    expect(f.explanation).toContain('24 unités');
    expect(f.explanation).toContain('= 3 jours');
  });
  it('30 en stock, 10/jour => 3 jours (scénario 3)', () => {
    expect(computeForecast(30, 140).daysRemaining).toBe(3);
  });
  it('sans historique de ventes : pas de prévision', () => {
    const f = computeForecast(50, 0);
    expect(f.daysRemaining).toBeNull();
    expect(f.estimatedStockoutDate).toBeNull();
  });
  it('suggestion : stock 30, max 130 => 100 unités ; sans max : conso x 14 j + minimum', () => {
    expect(suggestQuantity({ quantity: 30, minimumQuantity: 20, maximumQuantity: 130 }, 10)).toBe(100);
    expect(suggestQuantity({ quantity: 24, minimumQuantity: 20 }, 8)).toBe(110); // 8x14+20-24=108 -> 110
    expect(suggestQuantity({ quantity: 500, minimumQuantity: 20 }, 1)).toBe(0);
  });
});

/** Simule 10 unités vendues/jour sur 14 jours en antidatant les mouvements de vente. */
async function simulateSales(stockId: string, perDay: number) {
  for (let d = 1; d <= 14; d++) {
    await stockService.consume(stockId, perDay);
  }
  const movs = await StockMovement.find({ stockId, type: 'sale' }).sort({ createdAt: 1 }).lean();
  for (const [i, m] of movs.entries()) await StockMovement.updateOne({ _id: m._id }, { $set: { createdAt: new Date(Date.now() - (i + 0.5) * 86_400_000) } });
}

describe('PRÉVISION - alertes et réapprovisionnement (scénario 3)', () => {
  it('stock 30, consommation 10/jour => alerte « risque de rupture dans 3 jours » puis suggestion de 100', async () => {
    const w = await makeWorld();
    const id = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 170, { min: 20, max: 130 });
    await simulateSales(id, 10); // 170 - 140 = 30 en stock
    expect((await Stock.findById(id).lean())!.quantity).toBe(30);
    await alertService.refresh(id);
    const alert = await InventoryAlert.findOne({ stockId: id, type: 'stockout_forecast', status: 'open' }).lean();
    expect(alert!.message).toContain('risque d\'être en rupture');
    expect(alert!.message).toContain('3 jours');

    const gen = await api().post('/api/purchase-orders/generate').set(auth(w.pharmA.token));
    expect(gen.status).toBe(201);
    const item = gen.body.data.items[0];
    expect(item).toMatchObject({ currentQuantity: 30, avgDailyConsumption: 10, suggestedQuantity: 100, quantity: 100 });
    expect(item.reason).toContain('30 unités');

    // le pharmacien accepte en modifiant la quantité
    const acc = await api().post(`/api/purchase-orders/${gen.body.data._id}/accept`).set(auth(w.pharmA.token)).send({ items: [{ stockId: id, quantity: 120 }] });
    expect(acc.status).toBe(200);
    expect(acc.body.data).toMatchObject({ status: 'accepted' });
    expect(acc.body.data.items[0].quantity).toBe(120);
    expect(acc.body.data.items[0].suggestedQuantity).toBe(100);
    // rien n'a été commandé / reçu automatiquement
    expect((await Stock.findById(id).lean())!.quantity).toBe(30);
    // pas de double décision
    expect((await api().post(`/api/purchase-orders/${gen.body.data._id}/reject`).set(auth(w.pharmA.token)).send({})).status).toBe(409);
  });

  it('refuser une suggestion ; une autre pharmacie ne peut pas la traiter', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 5, { min: 10 });
    const gen = await api().post('/api/purchase-orders/generate').set(auth(w.pharmA.token));
    expect(gen.status).toBe(201);
    expect((await api().post(`/api/purchase-orders/${gen.body.data._id}/reject`).set(auth(w.pharmB.token)).send({})).status).toBe(404);
    const rej = await api().post(`/api/purchase-orders/${gen.body.data._id}/reject`).set(auth(w.pharmA.token)).send({ note: 'trop cher' });
    expect(rej.body.data.status).toBe('rejected');
  });

  it('rien à commander quand tout va bien ; régénérer remplace la suggestion ouverte', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.para), 500, { min: 10 });
    const none = await api().post('/api/purchase-orders/generate').set(auth(w.pharmA.token));
    expect(none.status).toBe(200);
    expect(none.body.data).toBeNull();
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 2, { min: 10 });
    await api().post('/api/purchase-orders/generate').set(auth(w.pharmA.token));
    await api().post('/api/purchase-orders/generate').set(auth(w.pharmA.token));
    expect(await PurchaseOrder.countDocuments({ status: 'suggested' })).toBe(1);
  });
});
