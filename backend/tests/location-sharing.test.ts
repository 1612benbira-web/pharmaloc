import { describe, expect, it } from 'vitest';
import { Delivery } from '../src/models/Delivery';
import { Notification } from '../src/models/Notification';
import { addStock, api, auth, createUser, makeWorld } from './helpers/app';

const addr = { street: 'Rue 10, Médina', city: 'Dakar', latitude: 14.686, longitude: -17.447 };
const pos = { latitude: 14.6865, longitude: -17.4472, accuracy: 12 };

/** Commande en livraison jusqu'à l'état « prête », livreur disponible. */
async function setup() {
  const w = await makeWorld();
  await addStock(w.pid(w.pharmacyA), w.pid(w.para), 50, { price: 500 });
  const order = (await api().post('/api/orders').set(auth(w.patient.token)).send({
    pharmacyId: w.pid(w.pharmacyA), deliveryType: 'delivery', paymentMethod: 'cash_on_delivery', address: addr, items: [{ medicineId: w.pid(w.para), quantity: 2 }],
  })).body.data;
  for (const a of ['accept', 'prepare', 'ready']) await api().post(`/api/orders/${order._id}/${a}`).set(auth(w.pharmA.token)).send({});
  await api().patch('/api/agents/me').set(auth(w.agent.token)).send({ isAvailable: true });
  const deliveryId = String((await Delivery.findOne({ orderId: order._id }).lean())!._id);
  const share = (token = w.patient.token, body: object = pos) => api().post(`/api/orders/${order._id}/share-location`).set(auth(token)).send(body);
  const assign = () => api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId });
  return { w, order, deliveryId, share, assign };
}

describe('LIVRAISON - le patient envoie sa position au livreur', () => {
  it('impossible tant qu’aucun livreur n’est assigné ; possible ensuite ; le livreur est prévenu', async () => {
    const { w, order, share, assign } = await setup();
    const early = await share();
    expect(early.status).toBe(409);
    expect(early.body.error.message).toContain('livreur');
    expect((await assign()).status).toBe(201);
    expect((await share()).status).toBe(200);
    const d = await Delivery.findOne({ orderId: order._id }).lean();
    expect(d).toMatchObject({ patientLatitude: 14.6865, patientLongitude: -17.4472, patientLocationAccuracy: 12 });
    expect(d!.patientLocationAt).toBeTruthy();
    await share(w.patient.token, { latitude: 14.687, longitude: -17.4475 }); // mise à jour
    expect(await Notification.countDocuments({ userId: w.agent.id, type: 'delivery.patient_location' })).toBe(1); // une seule alerte
  });

  it('le livreur assigné et le patient voient la position ; la pharmacie, l’admin et les autres NON', async () => {
    const { w, order, deliveryId, share, assign } = await setup();
    await assign();
    await share();
    const mine = await api().get('/api/deliveries/mine').set(auth(w.agent.token));
    expect(mine.body.data[0]).toMatchObject({ patientLatitude: 14.6865, patientLongitude: -17.4472 });
    expect((await api().get(`/api/deliveries/${deliveryId}`).set(auth(w.agent.token))).body.data.patientLatitude).toBe(14.6865);
    expect((await api().get(`/api/orders/${order._id}`).set(auth(w.patient.token))).body.data.delivery.patientLatitude).toBe(14.6865);
    for (const t of [w.pharmA.token, w.admin.token]) {
      expect((await api().get(`/api/orders/${order._id}`).set(auth(t))).body.data.delivery.patientLatitude).toBeUndefined();
      expect((await api().get(`/api/deliveries/${deliveryId}`).set(auth(t))).body.data.patientLatitude).toBeUndefined();
    }
    const other = await createUser('DELIVERY_AGENT', 'autre-livreur@test.sn');
    expect((await api().get(`/api/deliveries/${deliveryId}`).set(auth(other.token))).status).toBe(403);
    expect((await api().get('/api/deliveries/mine').set(auth(other.token))).body.data).toHaveLength(0);
  });

  it('seul le patient propriétaire peut partager ; coordonnées invalides refusées', async () => {
    const { w, share, assign } = await setup();
    await assign();
    const other = await createUser('PATIENT', 'autre@test.sn');
    expect((await share(other.token)).status).toBe(403);
    expect((await share(w.agent.token)).status).toBe(403);
    expect((await share(w.pharmA.token)).status).toBe(403);
    expect((await share(w.patient.token, { latitude: 200, longitude: 0 })).status).toBe(422);
    expect((await share(w.patient.token, { latitude: 14.6 })).status).toBe(422);
    expect((await share(w.patient.token, { ...pos, role: 'x' })).status).toBe(422);
    expect((await api().post('/api/orders/x/share-location').set(auth(w.patient.token)).send(pos)).status).toBe(422);
  });

  it('le patient peut arrêter le partage : la position est effacée', async () => {
    const { w, order, share, assign } = await setup();
    await assign();
    await share();
    const stop = await api().delete(`/api/orders/${order._id}/share-location`).set(auth(w.patient.token));
    expect(stop.status).toBe(200);
    const d = await Delivery.findOne({ orderId: order._id }).lean();
    expect(d!.patientLatitude).toBeUndefined();
    expect(d!.patientLocationAt).toBeUndefined();
    const other = await createUser('PATIENT', 'autre2@test.sn');
    expect((await api().delete(`/api/orders/${order._id}/share-location`).set(auth(other.token))).status).toBe(403);
  });

  it('la position est EFFACÉE à la fin de la livraison (minimisation des données)', async () => {
    const { w, order, deliveryId, share, assign } = await setup();
    await assign();
    await share();
    await api().post(`/api/deliveries/${deliveryId}/pickup`).set(auth(w.agent.token));
    await api().post(`/api/deliveries/${deliveryId}/start`).set(auth(w.agent.token));
    const code = (await api().get(`/api/orders/${order._id}`).set(auth(w.patient.token))).body.data.deliveryCode;
    expect((await api().post(`/api/deliveries/${deliveryId}/complete`).set(auth(w.agent.token)).send({ code })).status).toBe(200);
    const d = await Delivery.findOne({ orderId: order._id }).lean();
    expect(d!.status).toBe('delivered');
    expect(d!.patientLatitude).toBeUndefined();
    expect((await share()).status).toBe(409); // plus de partage possible après livraison
  });

  it('effacée aussi à l’annulation ; un retrait en pharmacie ne peut pas partager', async () => {
    const { w, order, share, assign } = await setup();
    await assign();
    await share();
    await api().post(`/api/orders/${order._id}/cancel`).set(auth(w.pharmA.token)).send({ reason: 'test' });
    expect((await Delivery.findOne({ orderId: order._id }).lean())!.patientLatitude).toBeUndefined();

    const pickup = (await api().post('/api/orders').set(auth(w.patient.token)).send({
      pharmacyId: w.pid(w.pharmacyA), deliveryType: 'pickup', paymentMethod: 'cash_on_pickup', items: [{ medicineId: w.pid(w.para), quantity: 1 }],
    })).body.data;
    const r = await api().post(`/api/orders/${pickup._id}/share-location`).set(auth(w.patient.token)).send(pos);
    expect(r.status).toBe(409);
  });
});
