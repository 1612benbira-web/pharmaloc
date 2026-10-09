import { describe, expect, it } from 'vitest';
import { api, auth, createUser, makeWorld, addStock } from './helpers/app';
import { AuditLog } from '../src/models/AuditLog';
import { Pharmacy } from '../src/models/Pharmacy';

describe('SECURITY - accès interdit et mauvaises permissions', () => {
  const protectedGets = ['/api/stocks', '/api/stock-movements', '/api/alerts', '/api/supplier-deliveries', '/api/purchase-orders', '/api/suppliers', '/api/dashboard/pharmacy', '/api/dashboard/admin', '/api/audit-logs', '/api/orders', '/api/notifications', '/api/addresses', '/api/agents/me', '/api/deliveries/available'];

  it('401 sans jeton sur toutes les routes protégées', async () => {
    for (const url of protectedGets) expect((await api().get(url)).status, url).toBe(401);
  });

  it('un patient ne peut accéder à aucune route pharmacien / admin / livreur', async () => {
    const w = await makeWorld();
    for (const url of ['/api/stocks', '/api/stock-movements', '/api/alerts', '/api/supplier-deliveries', '/api/purchase-orders', '/api/suppliers', '/api/dashboard/pharmacy', '/api/dashboard/admin', '/api/audit-logs', '/api/agents/me', '/api/deliveries/available', '/api/users']) {
      expect((await api().get(url).set(auth(w.patient.token))).status, url).toBe(403);
    }
  });

  it('un pharmacien ne peut pas accéder aux routes admin ni livreur ; un livreur non plus à celles du pharmacien', async () => {
    const w = await makeWorld();
    for (const url of ['/api/dashboard/admin', '/api/audit-logs', '/api/users', '/api/agents', '/api/addresses']) expect((await api().get(url).set(auth(w.pharmA.token))).status, url).toBe(403);
    for (const url of ['/api/stocks', '/api/alerts', '/api/dashboard/pharmacy', '/api/addresses']) expect((await api().get(url).set(auth(w.agent.token))).status, url).toBe(403);
  });

  it('seul un admin crée/valide une pharmacie ; un pharmacien ne modifie que la sienne et ses champs autorisés', async () => {
    const w = await makeWorld();
    const body = { name: 'Nouvelle', address: '2 rue', city: 'Dakar', latitude: 14.7, longitude: -17.4 };
    expect((await api().post('/api/pharmacies').set(auth(w.pharmA.token)).send(body)).status).toBe(403);
    const created = await api().post('/api/pharmacies').set(auth(w.admin.token)).send(body);
    expect(created.status).toBe(201);
    expect((await api().patch(`/api/pharmacies/${w.pid(w.pharmacyB)}`).set(auth(w.pharmA.token)).send({ phone: '+221770000000' })).status).toBe(403);
    expect((await api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}`).set(auth(w.pharmA.token)).send({ isValidated: false })).status).toBe(422); // champ réservé admin
    expect((await api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}`).set(auth(w.pharmA.token)).send({ phone: '+221770000000', deliveryFee: 1500 })).status).toBe(200);
    expect((await api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}/validation`).set(auth(w.pharmA.token)).send({ isValidated: false })).status).toBe(403);
    expect((await api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}/validation`).set(auth(w.admin.token)).send({ isValidated: false })).status).toBe(200);
    expect((await Pharmacy.findById(w.pharmacyA._id).lean())!.isValidated).toBe(false);
    expect((await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}`)).status).toBe(404); // masquée au public
    expect((await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}`).set(auth(w.pharmA.token))).status).toBe(200);
  });

  it('le pharmacien ne peut pas cibler une autre pharmacie via pharmacyId (paramètre ignoré)', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    const res = await api().get('/api/stocks').query({ pharmacyId: w.pid(w.pharmacyA) }).set(auth(w.pharmB.token));
    expect(res.body.data).toHaveLength(0);
    const sd = await api().post('/api/supplier-deliveries').set(auth(w.pharmB.token)).send({
      pharmacyId: w.pid(w.pharmacyA), supplierName: 'Fournisseur X', reference: 'R1',
      items: [{ medicineId: w.pid(w.para), quantity: 5, batchNumber: 'L', expirationDate: '2029-01' }],
    });
    expect(sd.status).toBe(201);
    const { Stock } = await import('../src/models/Stock.js');
    expect(await Stock.countDocuments({ pharmacyId: w.pharmacyA._id })).toBe(1);
    expect((await Stock.findOne({ pharmacyId: w.pharmacyA._id }).lean())!.quantity).toBe(20); // intact
    expect((await Stock.findOne({ pharmacyId: w.pharmacyB._id }).lean())!.quantity).toBe(5); // reçu chez B
  });

  it('un compte pharmacien sans pharmacie associée est refusé', async () => {
    const orphan = await createUser('PHARMACIST', 'orphan@test.sn');
    expect((await api().get('/api/stocks').set(auth(orphan.token))).status).toBe(403);
  });
});

describe('SECURITY - données invalides (422) et injections', () => {
  it('rejette ids malformés, champs inconnus, types incorrects, quantités négatives', async () => {
    const w = await makeWorld();
    const stockId = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    const h = auth(w.pharmA.token);
    expect((await api().get('/api/stocks/pas-un-id').set(h)).status).toBe(422);
    expect((await api().post('/api/stocks').set(h).send({ medicineId: 'x' })).status).toBe(422);
    expect((await api().post('/api/stocks').set(h).send({ medicineId: w.pid(w.amox), isAdmin: true })).status).toBe(422);
    expect((await api().patch(`/api/stocks/${stockId}`).set(h).send({ minimumQuantity: -5 })).status).toBe(422);
    expect((await api().post(`/api/stocks/${stockId}/adjust`).set(h).send({ delta: 0, note: 'x' })).status).toBe(422);
    expect((await api().post(`/api/stocks/${stockId}/adjust`).set(h).send({ delta: -2 })).status).toBe(422); // motif obligatoire
    expect((await api().post('/api/orders').set(auth(w.patient.token)).send({ pharmacyId: w.pid(w.pharmacyA), deliveryType: 'pickup', paymentMethod: 'cash_on_pickup', items: [{ medicineId: w.pid(w.para), quantity: -3 }] })).status).toBe(422);
  });

  it('un opérateur Mongo injecté dans un champ de connexion est rejeté', async () => {
    const res = await api().post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(422);
  });

  it('un patient ne peut pas tricher sur le prix ni sur le statut à la création', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20, { price: 500 });
    const res = await api().post('/api/orders').set(auth(w.patient.token)).send({
      pharmacyId: w.pid(w.pharmacyA), deliveryType: 'pickup', paymentMethod: 'cash_on_pickup',
      items: [{ medicineId: w.pid(w.para), quantity: 1, unitPrice: 1 }], status: 'delivered',
    });
    expect(res.status).toBe(422); // champs inconnus refusés (.strict)
    const ok = await api().post('/api/orders').set(auth(w.patient.token)).send({
      pharmacyId: w.pid(w.pharmacyA), deliveryType: 'pickup', paymentMethod: 'cash_on_pickup', items: [{ medicineId: w.pid(w.para), quantity: 1 }],
    });
    expect(ok.body.data.totalAmount).toBe(500); // prix lu côté serveur
  });

  it('les actions sensibles sont tracées dans les logs d’audit', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.para), 20);
    await api().post('/api/orders').set(auth(w.patient.token)).send({ pharmacyId: w.pid(w.pharmacyA), deliveryType: 'pickup', paymentMethod: 'cash_on_pickup', items: [{ medicineId: w.pid(w.para), quantity: 1 }] });
    await api().post('/api/auth/login').send({ email: 'patient@test.sn', password: 'Mauvais999' });
    expect(await AuditLog.countDocuments({ action: 'order.create' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'auth.login_failed' })).toBe(1);
    const logs = await api().get('/api/audit-logs?action=order.create').set(auth(w.admin.token));
    expect(logs.body.meta.total).toBe(1);
  });

  it('les erreurs 500 ne divulguent jamais de stack en production', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { errorHandler } = await import('../src/middleware/errorHandler.js');
      const express = (await import('express')).default;
      const request = (await import('supertest')).default;
      const app = express();
      app.get('/boom', () => { throw new Error('secret interne'); });
      app.use(errorHandler);
      const res = await request(app).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Erreur interne du serveur');
      expect(res.body.error.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('secret interne');
    } finally {
      process.env.NODE_ENV = prev;
      vi.resetModules();
    }
  });
});

describe('DASHBOARDS & notifications', () => {
  it('tableau de bord pharmacien : statistiques, alertes, graphiques', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.para), 100);
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 4, { min: 10 });
    const res = await api().get('/api/dashboard/pharmacy').set(auth(w.pharmA.token));
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toMatchObject({ productsAvailable: 2, productsLowStock: 1, productsOutOfStock: 0, salesToday: 0 });
    expect(res.body.data.alerts.some((a: { type: string }) => a.type === 'low_stock')).toBe(true);
    expect(res.body.data.charts.stockEvolution).toHaveLength(14);
    expect(res.body.data.charts.stockEvolution.at(-1).quantity).toBe(104);
    expect(res.body.data.charts.movementsByType.find((m: { type: string }) => m.type === 'delivery_received').count).toBe(2);
  });

  it('tableau de bord admin et notifications (lecture / marquage)', async () => {
    const w = await makeWorld();
    const a = await api().get('/api/dashboard/admin').set(auth(w.admin.token));
    expect(a.status).toBe(200);
    expect(a.body.data.stats).toMatchObject({ pharmacies: 2, pharmaciesPendingValidation: 0 });
    expect(a.body.data.stats.usersByRole).toMatchObject({ PATIENT: 1, PHARMACIST: 2, DELIVERY_AGENT: 1, ADMIN: 1 });
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 2, { min: 10 });
    const n = await api().get('/api/notifications').set(auth(w.pharmA.token));
    expect(n.body.meta.unread).toBeGreaterThan(0);
    const id = n.body.data[0]._id;
    expect((await api().post(`/api/notifications/${id}/read`).set(auth(w.pharmB.token))).status).toBe(404); // pas celle d'un autre
    expect((await api().post(`/api/notifications/${id}/read`).set(auth(w.pharmA.token))).status).toBe(200);
    expect((await api().post('/api/notifications/read-all').set(auth(w.pharmA.token))).status).toBe(200);
    expect((await api().get('/api/notifications/unread-count').set(auth(w.pharmA.token))).body.data.unread).toBe(0);
  });
});
