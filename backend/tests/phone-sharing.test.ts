import { describe, expect, it } from 'vitest';
import { Delivery } from '../src/models/Delivery';
import { Notification } from '../src/models/Notification';
import { AuditLog } from '../src/models/AuditLog';
import { User } from '../src/models/User';
import { addStock, api, auth, createUser, makeWorld } from './helpers/app';

const addr = { street: 'Rue 10, Médina', city: 'Dakar', latitude: 14.686, longitude: -17.447 };
const PHONE = '+221 77 111 22 33';

async function setup() {
  const w = await makeWorld();
  await addStock(w.pid(w.pharmacyA), w.pid(w.para), 50, { price: 500 });
  const order = (await api().post('/api/orders').set(auth(w.patient.token)).send({
    pharmacyId: w.pid(w.pharmacyA), deliveryType: 'delivery', paymentMethod: 'cash_on_delivery', address: addr, items: [{ medicineId: w.pid(w.para), quantity: 2 }],
  })).body.data;
  for (const a of ['accept', 'prepare', 'ready']) await api().post(`/api/orders/${order._id}/${a}`).set(auth(w.pharmA.token)).send({});
  await api().patch('/api/agents/me').set(auth(w.agent.token)).send({ isAvailable: true });
  const deliveryId = String((await Delivery.findOne({ orderId: order._id }).lean())!._id);
  const assign = () => api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId });
  const share = (body: object = { phone: PHONE }, token = w.patient.token) => api().post(`/api/orders/${order._id}/share-phone`).set(auth(token)).send(body);
  const request = (token = w.agent.token) => api().post(`/api/deliveries/${deliveryId}/request-phone`).set(auth(token)).send({});
  const decline = (token = w.patient.token) => api().post(`/api/orders/${order._id}/decline-phone-request`).set(auth(token)).send({});
  const dbDelivery = () => Delivery.findOne({ orderId: order._id }).lean();
  return { w, order, deliveryId, assign, share, request, decline, dbDelivery };
}

describe('LIVRAISON - le patient envoie son numéro au livreur', () => {
  it('impossible avant l’assignation ; ensuite le livreur reçoit le numéro et une notification', async () => {
    const { w, assign, share, dbDelivery } = await setup();
    const early = await share();
    expect(early.status).toBe(409);
    expect(early.body.error.message).toContain('livreur');
    await assign();
    expect((await share()).status).toBe(200);
    expect(await dbDelivery()).toMatchObject({ patientPhone: PHONE, phoneRequestStatus: 'shared' });
    const mine = await api().get('/api/deliveries/mine').set(auth(w.agent.token));
    expect(mine.body.data[0]).toMatchObject({ patientPhone: PHONE, phoneRequestStatus: 'shared' });
    expect(await Notification.countDocuments({ userId: w.agent.id, type: 'delivery.patient_phone' })).toBe(1);
    // le numéro n'est jamais écrit dans le journal d'audit
    const logs = await AuditLog.find({ action: 'delivery.patient_phone_shared' }).lean();
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain('111 22 33');
  });

  it('utilise le numéro du profil si aucun n’est saisi ; refuse l’absence de numéro et les numéros invalides', async () => {
    const { w, assign, share, dbDelivery } = await setup();
    await assign();
    const noPhone = await share({});
    expect(noPhone.status).toBe(422);
    expect(JSON.stringify(noPhone.body.error.details)).toContain('Saisissez votre numéro');
    expect((await share({ phone: 'abc' })).status).toBe(422);
    expect((await share({ phone: '123' })).status).toBe(422);
    expect((await share({ phone: PHONE, role: 'x' })).status).toBe(422);
    await User.updateOne({ email: 'patient@test.sn' }, { phone: '+221771112233' });
    expect((await share({})).status).toBe(200);
    expect((await dbDelivery())!.patientPhone).toBe('+221771112233');
    expect(w).toBeTruthy();
  });

  it('seuls le patient et le livreur assigné voient le numéro (ni pharmacie, ni admin, ni autre livreur)', async () => {
    const { w, order, deliveryId, assign, share } = await setup();
    await assign();
    await share();
    expect((await api().get(`/api/orders/${order._id}`).set(auth(w.patient.token))).body.data.delivery.patientPhone).toBe(PHONE);
    for (const t of [w.pharmA.token, w.admin.token]) {
      expect((await api().get(`/api/orders/${order._id}`).set(auth(t))).body.data.delivery.patientPhone).toBeUndefined();
      expect((await api().get(`/api/deliveries/${deliveryId}`).set(auth(t))).body.data.patientPhone).toBeUndefined();
    }
    const other = await createUser('DELIVERY_AGENT', 'autre-livreur@test.sn');
    expect((await api().get(`/api/deliveries/${deliveryId}`).set(auth(other.token))).status).toBe(403);
    expect((await api().get('/api/deliveries/mine').set(auth(other.token))).body.data).toHaveLength(0);
  });

  it('accepte les formats usuels de numéros sénégalais et refuse les autres', async () => {
    const { assign, share, dbDelivery } = await setup();
    await assign();
    for (const ok of ['+221 77 123 45 67', '77 123 45 67', '77.123.45.67', '+221771234567', '(221) 77 123 45 67', '00221 77 123 45 67']) {
      expect((await share({ phone: ok })).status, ok).toBe(200);
    }
    for (const bad of ['77 12', 'abc', '+221 77 123 45 67 89 01 23', '77-12-ab-45', '', ' ']) {
      expect((await share({ phone: bad })).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await dbDelivery())!.patientPhone).toBe('00221 77 123 45 67'); // dernier numéro valide conservé tel quel
  });

  it('seul le patient propriétaire peut partager ou arrêter ; l’arrêt efface le numéro', async () => {
    const { w, order, assign, share, dbDelivery } = await setup();
    await assign();
    const other = await createUser('PATIENT', 'autre@test.sn');
    for (const t of [other.token, w.agent.token, w.pharmA.token]) expect((await share({ phone: PHONE }, t)).status).toBe(403);
    await share();
    expect((await api().delete(`/api/orders/${order._id}/share-phone`).set(auth(other.token))).status).toBe(403);
    expect((await api().delete(`/api/orders/${order._id}/share-phone`).set(auth(w.patient.token))).status).toBe(200);
    const d = await dbDelivery();
    expect(d!.patientPhone).toBeUndefined();
    expect(d!.phoneRequestStatus).toBeUndefined();
  });

  it('un retrait en pharmacie ne permet pas de partager un numéro', async () => {
    const { w } = await setup();
    const pickup = (await api().post('/api/orders').set(auth(w.patient.token)).send({
      pharmacyId: w.pid(w.pharmacyA), deliveryType: 'pickup', paymentMethod: 'cash_on_pickup', items: [{ medicineId: w.pid(w.para), quantity: 1 }],
    })).body.data;
    expect((await api().post(`/api/orders/${pickup._id}/share-phone`).set(auth(w.patient.token)).send({ phone: PHONE })).status).toBe(409);
  });
});

describe('LIVRAISON - le livreur demande le numéro du patient', () => {
  it('demande -> le patient est prévenu -> il accepte -> le livreur voit le numéro', async () => {
    const { w, order, assign, request, share, dbDelivery } = await setup();
    await assign();
    expect((await request()).status).toBe(200);
    expect(await dbDelivery()).toMatchObject({ phoneRequestStatus: 'requested', phoneRequestCount: 1 });
    expect(await Notification.countDocuments({ userId: w.patient.id, type: 'delivery.phone_requested' })).toBe(1);
    expect((await dbDelivery())!.patientPhone).toBeUndefined(); // rien n'est partagé sans accord
    expect((await api().get(`/api/orders/${order._id}`).set(auth(w.patient.token))).body.data.delivery.phoneRequestStatus).toBe('requested');
    expect((await request()).status).toBe(409); // déjà en attente
    expect((await share()).status).toBe(200);
    expect(await dbDelivery()).toMatchObject({ phoneRequestStatus: 'shared', patientPhone: PHONE });
    expect((await request()).status).toBe(409); // déjà partagé
    expect(await Notification.countDocuments({ userId: w.agent.id, type: 'delivery.patient_phone' })).toBe(1);
  });

  it('refus du patient : le livreur est informé, ne reçoit rien, peut redemander mais pas indéfiniment (3 demandes)', async () => {
    const { w, assign, request, decline, dbDelivery } = await setup();
    await assign();
    expect((await decline()).status).toBe(409); // rien à refuser
    await request();
    expect((await decline()).status).toBe(200);
    expect(await dbDelivery()).toMatchObject({ phoneRequestStatus: 'declined' });
    expect((await dbDelivery())!.patientPhone).toBeUndefined();
    expect(await Notification.countDocuments({ userId: w.agent.id, type: 'delivery.phone_declined' })).toBe(1);
    expect((await request()).status).toBe(200); // 2e demande
    await decline();
    expect((await request()).status).toBe(200); // 3e demande
    await decline();
    const fourth = await request();
    expect(fourth.status).toBe(429);
    expect((await dbDelivery())!.phoneRequestCount).toBe(3);
  });

  it('droits : seul le livreur assigné peut demander ; pas de demande hors livraison en cours', async () => {
    const { w, deliveryId, assign, request, share, decline } = await setup();
    expect((await request()).status).toBe(403); // pas encore assigné à ce livreur
    await assign();
    const other = await createUser('DELIVERY_AGENT', 'autre-livreur@test.sn');
    expect((await request(other.token)).status).toBe(403);
    expect((await request(w.patient.token)).status).toBe(403);
    expect((await request(w.pharmA.token)).status).toBe(403);
    expect((await decline(w.agent.token)).status).toBe(403);
    const otherPatient = await createUser('PATIENT', 'autre@test.sn');
    expect((await decline(otherPatient.token)).status).toBe(403);
    expect((await api().post('/api/deliveries/x/request-phone').set(auth(w.agent.token)).send({})).status).toBe(422);
    expect(deliveryId).toBeTruthy(); expect(share).toBeTruthy();
  });

  it('numéro et état de la demande EFFACÉS à la fin de la livraison et à l’annulation', async () => {
    const { w, order, deliveryId, assign, request, share, dbDelivery } = await setup();
    await assign();
    await request();
    await share();
    await api().post(`/api/deliveries/${deliveryId}/pickup`).set(auth(w.agent.token));
    await api().post(`/api/deliveries/${deliveryId}/start`).set(auth(w.agent.token));
    const code = (await api().get(`/api/orders/${order._id}`).set(auth(w.patient.token))).body.data.deliveryCode;
    expect((await api().post(`/api/deliveries/${deliveryId}/complete`).set(auth(w.agent.token)).send({ code })).status).toBe(200);
    const d = await dbDelivery();
    expect(d!.status).toBe('delivered');
    for (const f of ['patientPhone', 'patientPhoneSharedAt', 'phoneRequestStatus', 'phoneRequestedAt', 'phoneRequestCount'] as const) expect(d![f], f).toBeUndefined();
    expect((await share()).status).toBe(409);
    expect((await request()).status).toBe(409);
  });

  it('effacés aussi si la commande est annulée', async () => {
    const { w, order, assign, share, dbDelivery } = await setup();
    await assign();
    await share();
    await api().post(`/api/orders/${order._id}/cancel`).set(auth(w.pharmA.token)).send({ reason: 'test' });
    const d = await dbDelivery();
    expect(d!.patientPhone).toBeUndefined();
    expect(d!.phoneRequestStatus).toBeUndefined();
  });
});
