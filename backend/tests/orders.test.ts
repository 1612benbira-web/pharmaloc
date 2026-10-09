import { describe, expect, it } from 'vitest';
import { Stock } from '../src/models/Stock';
import { StockMovement } from '../src/models/StockMovement';
import { Order } from '../src/models/Order';
import { Payment } from '../src/models/Payment';
import { Notification } from '../src/models/Notification';
import { Delivery } from '../src/models/Delivery';
import { orderCode } from '../src/modules/orders/orderCode';
import { addStock, api, auth, createUser, makeWorld } from './helpers/app';

const address = { street: 'Rue 10 x 15, Médina', neighborhood: 'Médina', city: 'Dakar', latitude: 14.68, longitude: -17.45 };

async function setup() {
  const w = await makeWorld();
  const stockId = await addStock(w.pid(w.pharmacyA), w.pid(w.para), 50, { price: 500 });
  const place = (body: Record<string, unknown> = {}, token = w.patient.token) =>
    api().post('/api/orders').set(auth(token)).send({
      pharmacyId: w.pid(w.pharmacyA), deliveryType: 'delivery', paymentMethod: 'cash_on_delivery', address,
      items: [{ medicineId: w.pid(w.para), quantity: 5 }], ...body,
    });
  const act = (id: string, action: string, token: string, body: object = {}) => api().post(`/api/orders/${id}/${action}`).set(auth(token)).send(body);
  return { w, stockId, place, act };
}

describe('ORDERS - création et réservation', () => {
  it('crée une commande : total = articles + frais, stock réservé (50 -> disponible 45), paiement en attente', async () => {
    const { w, stockId, place } = await setup();
    const res = await place();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', subtotal: 2500, deliveryFee: 1000, totalAmount: 3500, paymentStatus: 'pending', stockReserved: true });
    expect(res.body.data.deliveryCode).toMatch(/^\d{6}$/);
    expect(await Stock.findById(stockId).lean()).toMatchObject({ quantity: 50, reservedQuantity: 5, available: 45 });
    expect(await StockMovement.countDocuments({ type: 'reservation', orderId: res.body.data._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: w.pharmA.id, type: 'order.new' })).toBe(1);
  });

  it('stock insuffisant => 409, aucune commande créée, rien de plus réservé (anti-survente)', async () => {
    const { w, stockId, place } = await setup();
    expect((await place({ items: [{ medicineId: w.pid(w.para), quantity: 40 }] })).status).toBe(201); // disponible : 10
    const res = await place({ items: [{ medicineId: w.pid(w.para), quantity: 20 }] }, (await createUser('PATIENT', 'p2@test.sn')).token);
    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ requested: 20, available: 10 });
    expect(await Order.countDocuments()).toBe(1);
    expect(await Stock.findById(stockId).lean()).toMatchObject({ quantity: 50, reservedQuantity: 40, available: 10 });
  });

  it('commande multi-produits : si une ligne échoue, tout est annulé proprement', async () => {
    const { w, stockId, place } = await setup();
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 2);
    const res = await place({ items: [{ medicineId: w.pid(w.para), quantity: 5 }, { medicineId: w.pid(w.amox), quantity: 3 }] });
    expect(res.status).toBe(409);
    expect(await Stock.findById(stockId).lean()).toMatchObject({ reservedQuantity: 0, available: 50 });
    expect(await Order.countDocuments()).toBe(0);
  });

  it('valide les entrées : adresse manquante, quantité 0, paiement incohérent, pharmacie non validée', async () => {
    const { w, place } = await setup();
    expect((await place({ address: undefined })).status).toBe(422);
    expect((await place({ items: [{ medicineId: w.pid(w.para), quantity: 0 }] })).status).toBe(422);
    expect((await place({ deliveryType: 'pickup', paymentMethod: 'cash_on_delivery' })).status).toBe(422);
    await w.pharmacyA.updateOne({ isValidated: false });
    expect((await place()).status).toBe(404);
  });

  it('paiement mobile en mode DEMO : payé immédiatement, clairement identifié', async () => {
    const { w, place } = await setup();
    const res = await place({ paymentMethod: 'mobile_money' });
    expect(res.body.data.paymentStatus).toBe('paid');
    expect(res.body.data.payments[0]).toMatchObject({ mode: 'DEMO', provider: 'demo', status: 'paid', method: 'mobile_money' });
    expect(await Notification.countDocuments({ userId: w.patient.id, type: 'payment.confirmed' })).toBe(1);
  });

  it('marque la commande si un médicament sous ordonnance est présent', async () => {
    const { w, place } = await setup();
    await addStock(w.pid(w.pharmacyA), w.pid(w.amox), 20);
    const res = await place({ items: [{ medicineId: w.pid(w.amox), quantity: 1 }] });
    expect(res.body.data.prescriptionRequired).toBe(true);
  });
});

describe('ORDERS - annulation', () => {
  it('annulation par le patient : libère automatiquement les 5 unités et rembourse', async () => {
    const { w, stockId, place, act } = await setup();
    const o = (await place({ paymentMethod: 'mobile_money' })).body.data;
    const res = await act(o._id, 'cancel', w.patient.token, { reason: 'erreur' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.paymentStatus).toBe('refunded');
    expect(await Stock.findById(stockId).lean()).toMatchObject({ quantity: 50, reservedQuantity: 0, available: 50 });
    expect(await StockMovement.countDocuments({ orderId: o._id, type: 'cancellation' })).toBe(1);
    expect((await act(o._id, 'cancel', w.patient.token)).status).toBe(409); // pas de double libération
    expect((await Stock.findById(stockId).lean())!.available).toBe(50);
  });

  it('le patient ne peut plus annuler une fois la préparation commencée ; la pharmacie le peut', async () => {
    const { w, stockId, place, act } = await setup();
    const o = (await place()).body.data;
    await act(o._id, 'accept', w.pharmA.token);
    await act(o._id, 'prepare', w.pharmA.token);
    expect((await act(o._id, 'cancel', w.patient.token)).status).toBe(409);
    const res = await act(o._id, 'cancel', w.pharmA.token, { reason: 'rupture fournisseur' });
    expect(res.status).toBe(200);
    expect((await Stock.findById(stockId).lean())!.available).toBe(50);
    expect(await Notification.countDocuments({ userId: w.patient.id, type: 'order.cancelled' })).toBe(1);
  });

  it('refus par la pharmacie libère le stock', async () => {
    const { w, stockId, place, act } = await setup();
    const o = (await place()).body.data;
    expect((await act(o._id, 'reject', w.pharmA.token, { reason: 'ordonnance requise' })).body.data.status).toBe('cancelled');
    expect((await Stock.findById(stockId).lean())!.available).toBe(50);
  });
});

describe('DELIVERY - scénario complet (scénario 1)', () => {
  it('commande -> préparation -> livreur accepte -> récupère -> livre avec code -> stock vendu', async () => {
    const { w, stockId, place, act } = await setup();
    const o = (await place()).body.data;
    const code = o.deliveryCode as string;
    expect(code).toBe(orderCode(o._id));

    expect((await act(o._id, 'accept', w.pharmA.token)).body.data.status).toBe('confirmed');
    expect((await act(o._id, 'prepare', w.pharmA.token)).body.data.status).toBe('preparing');
    expect((await act(o._id, 'ready', w.pharmA.token)).body.data.status).toBe('ready');

    // le livreur doit être disponible pour voir / accepter
    expect((await api().get('/api/deliveries/available').set(auth(w.agent.token))).body.data).toHaveLength(0);
    expect((await api().patch('/api/agents/me').set(auth(w.agent.token)).send({ isAvailable: true, latitude: 14.7, longitude: -17.4 })).status).toBe(200);
    const avail = await api().get('/api/deliveries/available').set(auth(w.agent.token));
    expect(avail.body.data).toHaveLength(1);
    const deliveryId = avail.body.data[0]._id as string;

    const acc = await api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId });
    expect(acc.status).toBe(201);
    expect((await Order.findById(o._id).lean())!.status).toBe('assigned');

    // le stock n'est vendu qu'à la récupération
    expect((await Stock.findById(stockId).lean())).toMatchObject({ quantity: 50, reservedQuantity: 5 });
    expect((await api().post(`/api/deliveries/${deliveryId}/pickup`).set(auth(w.agent.token))).status).toBe(200);
    expect(await Stock.findById(stockId).lean()).toMatchObject({ quantity: 45, reservedQuantity: 0, available: 45 });
    expect(await StockMovement.findOne({ orderId: o._id, type: 'sale' }).lean()).toMatchObject({ quantity: -5, previousQuantity: 50, newQuantity: 45 });

    expect((await api().post(`/api/deliveries/${deliveryId}/start`).set(auth(w.agent.token))).status).toBe(200);
    expect((await api().post(`/api/deliveries/${deliveryId}/location`).set(auth(w.agent.token)).send({ latitude: 14.69, longitude: -17.44 })).status).toBe(200);

    // le patient suit la livraison
    const track = await api().get(`/api/orders/${o._id}`).set(auth(w.patient.token));
    expect(track.body.data).toMatchObject({ status: 'in_delivery', delivery: { status: 'in_delivery', agentLatitude: 14.69 } });

    // mauvais code refusé, bon code accepté
    expect((await api().post(`/api/deliveries/${deliveryId}/complete`).set(auth(w.agent.token)).send({ code: code === '000000' ? '111111' : '000000' })).status).toBe(403);
    const done = await api().post(`/api/deliveries/${deliveryId}/complete`).set(auth(w.agent.token)).send({ code });
    expect(done.status).toBe(200);
    const final = await api().get(`/api/orders/${o._id}`).set(auth(w.patient.token));
    expect(final.body.data).toMatchObject({ status: 'delivered', paymentStatus: 'paid' }); // espèces encaissées à la livraison
    expect(final.body.data.deliveredAt).toBeTruthy();
    expect(final.body.data.deliveryCode).toBeUndefined();
    expect(await Payment.findOne({ orderId: o._id }).lean()).toMatchObject({ status: 'paid' });
    const titles = (await Notification.find({ userId: w.patient.id }).lean()).map((n) => n.type);
    for (const t of ['order.placed', 'order.confirmed', 'order.preparing', 'order.ready', 'order.assigned', 'order.in_delivery', 'order.delivered']) expect(titles).toContain(t);

    // évaluation une fois livrée
    expect((await api().post(`/api/orders/${o._id}/review`).set(auth(w.patient.token)).send({ rating: 5, comment: 'Rapide' })).status).toBe(201);
    expect((await api().post(`/api/orders/${o._id}/review`).set(auth(w.patient.token)).send({ rating: 4 })).status).toBe(409);
  });

  it('une livraison ne peut être prise que par un seul livreur', async () => {
    const { w, place, act } = await setup();
    const agent2 = await createUser('DELIVERY_AGENT', 'agent2@test.sn');
    const o = (await place()).body.data;
    for (const a of ['accept', 'prepare', 'ready']) await act(o._id, a, w.pharmA.token);
    for (const t of [w.agent.token, agent2.token]) await api().patch('/api/agents/me').set(auth(t)).send({ isAvailable: true });
    const deliveryId = String((await Delivery.findOne().lean())!._id);
    expect((await api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId })).status).toBe(201);
    expect((await api().post('/api/delivery-assignments').set(auth(agent2.token)).send({ deliveryId })).status).toBe(409);
    // et un autre livreur ne peut pas la manipuler
    expect((await api().post(`/api/deliveries/${deliveryId}/pickup`).set(auth(agent2.token))).status).toBe(403);
  });

  it('un livreur indisponible ne peut pas accepter', async () => {
    const { w, place, act } = await setup();
    const o = (await place()).body.data;
    for (const a of ['accept', 'prepare', 'ready']) await act(o._id, a, w.pharmA.token);
    const deliveryId = String((await Delivery.findOne().lean())!._id);
    expect((await api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId })).status).toBe(409);
  });

  it('code de livraison : 5 essais erronés bloquent la confirmation (429)', async () => {
    const { w, place, act } = await setup();
    const o = (await place()).body.data;
    for (const a of ['accept', 'prepare', 'ready']) await act(o._id, a, w.pharmA.token);
    await api().patch('/api/agents/me').set(auth(w.agent.token)).send({ isAvailable: true });
    const deliveryId = String((await Delivery.findOne().lean())!._id);
    await api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId });
    for (const step of ['pickup', 'start']) await api().post(`/api/deliveries/${deliveryId}/${step}`).set(auth(w.agent.token));
    const bad = o.deliveryCode === '999999' ? '111111' : '999999';
    for (let i = 0; i < 5; i++) expect((await api().post(`/api/deliveries/${deliveryId}/complete`).set(auth(w.agent.token)).send({ code: bad })).status).toBe(403);
    expect((await api().post(`/api/deliveries/${deliveryId}/complete`).set(auth(w.agent.token)).send({ code: o.deliveryCode })).status).toBe(429);
  });

  it('retrait en pharmacie : le pharmacien valide avec le code du patient, le stock est vendu', async () => {
    const { w, stockId, place, act } = await setup();
    const o = (await place({ deliveryType: 'pickup', paymentMethod: 'cash_on_pickup', address: undefined })).body.data;
    expect(o.deliveryFee).toBe(0);
    for (const a of ['accept', 'prepare', 'ready']) await act(o._id, a, w.pharmA.token);
    expect(await Delivery.countDocuments()).toBe(0); // pas de livreur pour un retrait
    expect((await act(o._id, 'handover', w.pharmA.token, { code: '000000' })).status).toBe(403);
    const ok = await act(o._id, 'handover', w.pharmA.token, { code: o.deliveryCode });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(await Stock.findById(stockId).lean()).toMatchObject({ quantity: 45, reservedQuantity: 0 });
  });
});

describe('ORDERS - contrôle d’accès', () => {
  it('un autre patient, une autre pharmacie ou un livreur non assigné ne voient pas la commande', async () => {
    const { w, place, act } = await setup();
    const o = (await place()).body.data;
    const other = await createUser('PATIENT', 'autre@test.sn');
    expect((await api().get(`/api/orders/${o._id}`).set(auth(other.token))).status).toBe(403);
    expect((await api().get(`/api/orders/${o._id}`).set(auth(w.pharmB.token))).status).toBe(403);
    expect((await api().get(`/api/orders/${o._id}`).set(auth(w.agent.token))).status).toBe(403);
    expect((await api().get(`/api/orders/${o._id}`).set(auth(w.pharmA.token))).status).toBe(200);
    expect((await api().get(`/api/orders/${o._id}`).set(auth(w.admin.token))).status).toBe(200);
    // la pharmacie B ne peut pas agir sur la commande de A
    expect((await act(o._id, 'accept', w.pharmB.token)).status).toBe(403);
    // le patient ne peut pas faire d'actions de pharmacie
    expect((await act(o._id, 'accept', w.patient.token)).status).toBe(403);
    // les listes sont filtrées par rôle
    expect((await api().get('/api/orders').set(auth(other.token))).body.meta.total).toBe(0);
    expect((await api().get('/api/orders').set(auth(w.pharmB.token))).body.meta.total).toBe(0);
    expect((await api().get('/api/orders').set(auth(w.pharmA.token))).body.meta.total).toBe(1);
  });

  it('le code de livraison n’est jamais exposé à la pharmacie ni au livreur', async () => {
    const { w, place } = await setup();
    const o = (await place()).body.data;
    expect((await api().get(`/api/orders/${o._id}`).set(auth(w.pharmA.token))).body.data.deliveryCode).toBeUndefined();
  });

  it('les transitions interdites sont refusées (409)', async () => {
    const { w, place, act } = await setup();
    const o = (await place()).body.data;
    expect((await act(o._id, 'ready', w.pharmA.token)).status).toBe(409); // pending -> ready
    expect((await act(o._id, 'prepare', w.pharmA.token)).status).toBe(409); // pending -> preparing
    await act(o._id, 'accept', w.pharmA.token);
    expect((await act(o._id, 'accept', w.pharmA.token)).status).toBe(409); // déjà confirmée
  });
});
