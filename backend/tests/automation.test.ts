import { describe, expect, it } from 'vitest';
import { Stock } from '../src/models/Stock';
import { StockMovement } from '../src/models/StockMovement';
import { SupplierDelivery } from '../src/models/SupplierDelivery';
import { AuditLog } from '../src/models/AuditLog';
import { Notification } from '../src/models/Notification';
import { InventoryAlert } from '../src/models/InventoryAlert';
import { addStock, api, auth, makeWorld } from './helpers/app';

const payload = (medicineId: string, extra: Record<string, unknown> = {}) => ({
  supplierName: 'Sanofi',
  reference: 'LIV-2026-001',
  items: [{ medicineId, quantity: 100, batchNumber: 'LOT123', expirationDate: '2028-04', purchasePrice: 250 }],
  ...extra,
});

describe('AUTOMATION - réception fournisseur (scénario 2)', () => {
  it('Paracétamol 20 + livraison 100 = 120 : livraison, mouvement, stock, audit, notification', async () => {
    const w = await makeWorld();
    const stockId = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    const res = await api().post('/api/supplier-deliveries').set(auth(w.pharmA.token)).send(payload(w.pid(w.para)));
    expect(res.status).toBe(201);
    expect(res.body.data.movements[0]).toMatchObject({ previousQuantity: 20, newQuantity: 120 });

    expect(await Stock.findById(stockId).lean()).toMatchObject({ quantity: 120, available: 120 });
    const mv = await StockMovement.findOne({ type: 'delivery_received', reference: 'LIV-2026-001' }).lean();
    expect(mv).toMatchObject({ quantity: 100, previousQuantity: 20, newQuantity: 120 });
    expect(String(mv!.userId)).toBe(w.pharmA.id); // utilisateur responsable
    expect(await SupplierDelivery.findOne({ reference: 'LIV-2026-001' }).lean()).toMatchObject({ status: 'received', supplierName: 'Sanofi', totalCost: 25000 });
    expect(await AuditLog.countDocuments({ action: 'supplier_delivery.received' })).toBe(1);
    expect(await Notification.countDocuments({ userId: w.pharmA.id, type: 'supplier_delivery.received' })).toBe(1);
    // date d'expiration "2028-04" => fin de mois
    const d = await SupplierDelivery.findOne().lean();
    expect(d!.items[0]!.expirationDate.toISOString().slice(0, 10)).toBe('2028-04-30');
  });

  it('crée le stock et le fournisseur à la première réception', async () => {
    const w = await makeWorld();
    const res = await api().post('/api/supplier-deliveries').set(auth(w.pharmA.token)).send(payload(w.pid(w.para)));
    expect(res.status).toBe(201);
    expect(await Stock.countDocuments({ pharmacyId: w.pharmacyA._id })).toBe(1);
    const sup = await api().get('/api/suppliers').set(auth(w.pharmA.token));
    expect(sup.body.data.map((s: { name: string }) => s.name)).toEqual(['Sanofi']);
  });

  it('la détection de stock faible suit la réception (Amoxicilline 8 < 10)', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 8, { min: 10 });
    const res = await api().get('/api/alerts').set(auth(w.pharmA.token));
    expect(res.body.data.some((a: { type: string; message: string }) => a.type === 'low_stock' && a.message.includes('STOCK FAIBLE'))).toBe(true);
  });

  it('refuse une référence déjà enregistrée (409) sans doubler le stock', async () => {
    const w = await makeWorld();
    const stockId = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    await api().post('/api/supplier-deliveries').set(auth(w.pharmA.token)).send(payload(w.pid(w.para)));
    const again = await api().post('/api/supplier-deliveries').set(auth(w.pharmA.token)).send(payload(w.pid(w.para)));
    expect(again.status).toBe(409);
    expect((await Stock.findById(stockId).lean())!.quantity).toBe(120);
  });

  it('refuse médicament inconnu, produit expiré, date invalide (422) sans toucher au stock', async () => {
    const w = await makeWorld();
    const stockId = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    const post = (body: unknown) => api().post('/api/supplier-deliveries').set(auth(w.pharmA.token)).send(body as object);
    expect((await post(payload('65f000000000000000000001'))).status).toBe(422);
    expect((await post(payload(w.pid(w.para), { items: [{ medicineId: w.pid(w.para), quantity: 5, batchNumber: 'X', expirationDate: '2020-01' }] }))).status).toBe(422);
    expect((await post(payload(w.pid(w.para), { items: [{ medicineId: w.pid(w.para), quantity: 5, batchNumber: 'X', expirationDate: 'n’importe quoi' }] }))).status).toBe(422);
    expect((await post(payload(w.pid(w.para), { items: [] }))).status).toBe(422);
    expect((await Stock.findById(stockId).lean())!.quantity).toBe(20);
    expect(await SupplierDelivery.countDocuments()).toBe(0);
  });

  it('multi-lignes : plusieurs médicaments dans une même livraison', async () => {
    const w = await makeWorld();
    const res = await api().post('/api/supplier-deliveries').set(auth(w.pharmA.token)).send({
      supplierName: 'UbiPharm', reference: 'LIV-2',
      items: [
        { medicineId: w.pid(w.para), quantity: 40, batchNumber: 'A', expirationDate: '2029-01' },
        { medicineId: w.pid(w.amox), quantity: 30, batchNumber: 'B', expirationDate: '2029-02' },
      ],
    });
    expect(res.status).toBe(201);
    expect(await Stock.countDocuments({ pharmacyId: w.pharmacyA._id })).toBe(2);
    expect(await StockMovement.countDocuments({ type: 'delivery_received' })).toBe(2);
  });

  it('isolation : un pharmacien ne voit ni ne modifie le stock d’une autre pharmacie', async () => {
    const w = await makeWorld();
    const stockId = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    expect((await api().get(`/api/stocks/${stockId}`).set(auth(w.pharmB.token))).status).toBe(403);
    expect((await api().post(`/api/stocks/${stockId}/adjust`).set(auth(w.pharmB.token)).send({ delta: -5, note: 'vol' })).status).toBe(403);
    const list = await api().get('/api/stocks').set(auth(w.pharmB.token));
    expect(list.body.data).toHaveLength(0);
    expect((await Stock.findById(stockId).lean())!.quantity).toBe(20);
    expect(await InventoryAlert.countDocuments({ pharmacyId: w.pharmacyB._id })).toBe(0);
  });
});
