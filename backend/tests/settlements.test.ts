import { describe, expect, it } from 'vitest';
import { Delivery } from '../src/models/Delivery';
import { Notification } from '../src/models/Notification';
import { Payout } from '../src/models/Payout';
import { Settlement } from '../src/models/Settlement';
import { Payment } from '../src/models/Payment';
import { eventBus } from '../src/events/eventBus';
import { computeShares, settlementService } from '../src/modules/settlements/settlement.service';
import { registerPayoutProvider } from '../src/modules/payments/payout.service';
import { addStock, api, auth, createUser, makeWorld } from './helpers/app';

type World = Awaited<ReturnType<typeof makeWorld>>;
const addr = { street: 'Rue 10, Médina', city: 'Dakar', latitude: 14.686, longitude: -17.447 };
const PH_PHONE = '+221 77 000 00 01';
const AG_PHONE = '+221 77 111 22 33';

async function setup(withAccounts = true) {
  const w = await makeWorld(); // pharmacie A : frais de livraison fixes 1000 FCFA
  await addStock(w.pid(w.pharmacyA), w.pid(w.para), 200, { price: 500 });
  if (withAccounts) await setAccounts(w);
  return w;
}
async function setAccounts(w: World) {
  const a = await api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}`).set(auth(w.pharmA.token)).send({ payoutOperator: 'wave', payoutPhone: PH_PHONE });
  const b = await api().patch('/api/agents/me').set(auth(w.agent.token)).send({ payoutOperator: 'orange_money', payoutPhone: AG_PHONE });
  expect([a.status, b.status]).toEqual([200, 200]);
}

/** Commande de 2 x 500 = 1000 FCFA de médicaments (+ 1000 de livraison). Retourne l'id et, si livrée, la répartition. */
async function order(w: World, o: { method: string; type?: 'delivery' | 'pickup'; qty?: number; finish?: boolean }) {
  const type = o.type ?? 'delivery';
  const res = await api().post('/api/orders').set(auth(w.patient.token)).send({
    pharmacyId: w.pid(w.pharmacyA), deliveryType: type, paymentMethod: o.method, ...(type === 'delivery' ? { address: addr } : {}),
    items: [{ medicineId: w.pid(w.para), quantity: o.qty ?? 2 }],
  });
  const ord = res.body.data;
  for (const a of ['accept', 'prepare', 'ready']) await api().post(`/api/orders/${ord._id}/${a}`).set(auth(w.pharmA.token)).send({});
  const code = (await api().get(`/api/orders/${ord._id}`).set(auth(w.patient.token))).body.data.deliveryCode;
  let deliveryId: string | undefined;
  if (type === 'pickup') {
    if (o.finish !== false) await api().post(`/api/orders/${ord._id}/handover`).set(auth(w.pharmA.token)).send({ code });
  } else {
    await api().patch('/api/agents/me').set(auth(w.agent.token)).send({ isAvailable: true });
    deliveryId = String((await Delivery.findOne({ orderId: ord._id }).lean())!._id);
    const acc = await api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId });
    if (o.finish === false || acc.status !== 201) return { orderId: ord._id as string, deliveryId, code, acceptStatus: acc.status, acceptBody: acc.body };
    for (const s of ['pickup', 'start']) await api().post(`/api/deliveries/${deliveryId}/${s}`).set(auth(w.agent.token));
    await api().post(`/api/deliveries/${deliveryId}/complete`).set(auth(w.agent.token)).send({ code });
  }
  return { orderId: ord._id as string, deliveryId, code, acceptStatus: 201, acceptBody: null };
}
const settlementOf = (orderId: string) => Settlement.findOne({ orderId }).lean();
const payoutsOf = (orderId: string) => Payout.find({ orderId }).lean();

describe('RÉPARTITION - calcul des parts', () => {
  it('la pharmacie reçoit le prix des médicaments, le livreur les frais de livraison ; la somme est exacte', () => {
    expect(computeShares({ totalAmount: 2000, deliveryFee: 1000, deliveryType: 'delivery' })).toEqual({ pharmacyAmount: 1000, courierAmount: 1000 });
    expect(computeShares({ totalAmount: 3650, deliveryFee: 650, deliveryType: 'delivery' })).toEqual({ pharmacyAmount: 3000, courierAmount: 650 });
    expect(computeShares({ totalAmount: 1000, deliveryFee: 0, deliveryType: 'pickup' })).toEqual({ pharmacyAmount: 1000, courierAmount: 0 });
    for (const [total, fee] of [[2000, 1000], [999, 1], [100, 0], [5050, 650]] as const) {
      const s = computeShares({ totalAmount: total, deliveryFee: fee, deliveryType: 'delivery' });
      expect(s.pharmacyAmount + s.courierAmount).toBe(total);
    }
  });
});

describe('RÉPARTITION - paiement en ligne (Wave / Orange Money, mode DEMO)', () => {
  it('à la confirmation de la livraison, chacun reçoit sa part automatiquement', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'mobile_money' });
    const s = await settlementOf(orderId);
    expect(s).toMatchObject({ kind: 'online', status: 'paid', pharmacyAmount: 1000, courierAmount: 1000, totalAmount: 2000, mode: 'DEMO' });
    const payouts = await payoutsOf(orderId);
    expect(payouts).toHaveLength(2);
    const ph = payouts.find((p) => p.recipientType === 'PHARMACY')!;
    const co = payouts.find((p) => p.recipientType === 'COURIER')!;
    expect(ph).toMatchObject({ amount: 1000, status: 'paid', provider: 'demo', mode: 'DEMO', operator: 'wave' });
    expect(co).toMatchObject({ amount: 1000, status: 'paid', provider: 'demo', mode: 'DEMO', operator: 'orange_money' });
    expect(String(co.recipientId)).toBe(w.agent.id);
    expect(ph.providerReference).toMatch(/^DEMO-PO-/);
    // le numéro complet n'est jamais conservé dans l'historique
    expect(JSON.stringify(payouts)).not.toContain('77 000 00 01');
    expect(JSON.stringify(payouts)).not.toContain('111 22 33');
    expect(ph.destination).toContain('••••');
    expect(await Notification.countDocuments({ userId: w.pharmA.id, type: 'payout.paid' })).toBe(1);
    expect(await Notification.countDocuments({ userId: w.agent.id, type: 'payout.paid' })).toBe(1);
  });

  it('les synthèses du pharmacien et du livreur reflètent les versements', async () => {
    const w = await setup();
    await order(w, { method: 'mobile_money' });
    const ph = await api().get('/api/settlements').set(auth(w.pharmA.token));
    expect(ph.body.meta.summary).toMatchObject({ onlineReceived: 1000, onlinePending: 0, cashToReceive: 0, orders: 1 });
    expect(ph.body.data[0]).toMatchObject({ kind: 'online', status: 'paid' });
    expect(ph.body.data[0].payouts).toHaveLength(2);
    const co = await api().get('/api/settlements').set(auth(w.agent.token));
    expect(co.body.meta.summary).toMatchObject({ earnedOnline: 1000, totalEarned: 1000, cashToRemit: 0, deliveries: 1 });
  });

  it('idempotent : un second déclenchement ne crée ni répartition ni versement en double', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'mobile_money' });
    await settlementService.release(orderId);
    await eventBus.emit('DELIVERY_COMPLETED', { orderId });
    expect(await Settlement.countDocuments({ orderId })).toBe(1);
    expect(await Payout.countDocuments({ orderId })).toBe(2);
    expect(await Notification.countDocuments({ userId: w.pharmA.id, type: 'payout.paid' })).toBe(1);
  });

  it('retrait payé en ligne : seule la pharmacie reçoit, tout le montant', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'mobile_money', type: 'pickup' });
    expect(await settlementOf(orderId)).toMatchObject({ kind: 'online', status: 'paid', pharmacyAmount: 1000, courierAmount: 0 });
    const payouts = await payoutsOf(orderId);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ recipientType: 'PHARMACY', amount: 1000 });
  });

  it('sans compte de réception, le versement attend puis part dès que le compte est renseigné', async () => {
    const w = await setup(false);
    const { orderId } = await order(w, { method: 'mobile_money' });
    expect(await settlementOf(orderId)).toMatchObject({ status: 'pending' });
    const waiting = await payoutsOf(orderId);
    expect(waiting.every((p) => p.status === 'pending' && /non renseigné/.test(p.failureReason ?? ''))).toBe(true);
    expect(waiting.every((p) => p.attempts === 0)).toBe(true); // l'attente ne consomme pas de tentative
    expect((await api().get('/api/settlements').set(auth(w.pharmA.token))).body.meta.summary.onlinePending).toBe(1000);

    await api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}`).set(auth(w.pharmA.token)).send({ payoutOperator: 'wave', payoutPhone: PH_PHONE });
    expect(await settlementOf(orderId)).toMatchObject({ status: 'partial' });
    expect((await payoutsOf(orderId)).find((p) => p.recipientType === 'PHARMACY')!.status).toBe('paid');

    await api().patch('/api/agents/me').set(auth(w.agent.token)).send({ payoutOperator: 'orange_money', payoutPhone: AG_PHONE });
    expect(await settlementOf(orderId)).toMatchObject({ status: 'paid' });
    expect((await payoutsOf(orderId)).every((p) => p.status === 'paid' && !p.failureReason)).toBe(true);
  });

  it('échec du prestataire : versement « failed », relance par l’admin, plafond de tentatives', async () => {
    const w = await setup();
    registerPayoutProvider({ name: 'failing', mode: 'DEMO', disburse: async () => ({ providerReference: '', status: 'failed', error: 'Prestataire indisponible' }) });
    const prev = process.env.PAYOUT_PROVIDER;
    try {
      process.env.PAYOUT_PROVIDER = 'failing';
      const { orderId } = await order(w, { method: 'mobile_money' });
      expect(await settlementOf(orderId)).toMatchObject({ status: 'failed' });
      const failed = await payoutsOf(orderId);
      expect(failed.every((p) => p.status === 'failed' && p.failureReason === 'Prestataire indisponible' && p.attempts === 1)).toBe(true);
      const sid = String((await settlementOf(orderId))!._id);

      expect((await api().post(`/api/settlements/${sid}/retry`).set(auth(w.pharmA.token))).status).toBe(403); // admin seulement
      process.env.PAYOUT_PROVIDER = prev ?? 'demo';
      const retry = await api().post(`/api/settlements/${sid}/retry`).set(auth(w.admin.token));
      expect(retry.status).toBe(200);
      expect(retry.body.data.retried).toBe(2);
      expect(await settlementOf(orderId)).toMatchObject({ status: 'paid' });
      expect((await payoutsOf(orderId)).every((p) => p.status === 'paid')).toBe(true);

      // plafond : 5 tentatives maximum sur un même versement
      process.env.PAYOUT_PROVIDER = 'failing';
      const second = await order(w, { method: 'mobile_money' });
      const sid2 = String((await settlementOf(second.orderId))!._id);
      for (let i = 0; i < 4; i++) await settlementService.retryFor({ settlementId: sid2 });
      expect((await payoutsOf(second.orderId)).every((p) => p.attempts === 5)).toBe(true);
      expect(await settlementService.retryFor({ settlementId: sid2 })).toBe(0);
      expect(await settlementOf(second.orderId)).toMatchObject({ status: 'failed' });
    } finally {
      process.env.PAYOUT_PROVIDER = prev ?? 'demo';
    }
  });

  it('une commande annulée avant livraison est remboursée et ne produit aucune répartition', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'mobile_money', finish: false });
    const res = await api().post(`/api/orders/${orderId}/cancel`).set(auth(w.pharmA.token)).send({ reason: 'test' });
    expect(res.body.data.paymentStatus).toBe('refunded');
    expect(await Settlement.countDocuments({ orderId })).toBe(0);
    expect(await Payout.countDocuments({ orderId })).toBe(0);
    expect(await Payment.findOne({ orderId }).lean()).toMatchObject({ status: 'refunded' });
  });
});

describe('RÉPARTITION - espèces à la livraison : le livreur garde ses frais et remet le reste', () => {
  it('à la livraison : frais conservés par le livreur, montant des médicaments « à remettre »', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'cash_on_delivery' });
    expect(await settlementOf(orderId)).toMatchObject({ kind: 'cash_delivery', status: 'cash_due', pharmacyAmount: 1000, courierAmount: 1000, totalAmount: 2000 });
    expect(await Payout.countDocuments({ orderId })).toBe(0); // aucun versement : l'argent est déjà en main
    expect((await api().get('/api/settlements').set(auth(w.agent.token))).body.meta.summary).toMatchObject({ earnedCash: 1000, totalEarned: 1000, cashToRemit: 1000, cashToRemitCount: 1, cashRemitted: 0 });
    expect((await api().get('/api/settlements').set(auth(w.pharmA.token))).body.meta.summary).toMatchObject({ cashToReceive: 1000, cashReceived: 0 });
    expect(await Notification.countDocuments({ userId: w.agent.id, type: 'cash.due' })).toBe(1);
    expect(await Notification.countDocuments({ userId: w.pharmA.id, type: 'cash.expected' })).toBe(1);
  });

  it('seul le pharmacien concerné (ou l’admin) confirme la réception ; pas de double confirmation', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'cash_on_delivery' });
    const sid = String((await settlementOf(orderId))!._id);
    const url = `/api/settlements/${sid}/confirm-cash`;
    for (const t of [w.agent.token, w.patient.token, w.pharmB.token]) expect((await api().post(url).set(auth(t))).status).toBe(403);
    expect((await settlementOf(orderId))!.status).toBe('cash_due');
    const ok = await api().post(url).set(auth(w.pharmA.token));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'cash_remitted' });
    expect((await settlementOf(orderId))!.confirmedBy?.toString()).toBe(w.pharmA.id);
    expect((await api().post(url).set(auth(w.pharmA.token))).status).toBe(409);
    expect(await Notification.countDocuments({ userId: w.agent.id, type: 'cash.confirmed' })).toBe(1);
    expect((await api().get('/api/settlements').set(auth(w.agent.token))).body.meta.summary).toMatchObject({ cashToRemit: 0, cashRemitted: 1000 });
    expect((await api().get('/api/settlements').set(auth(w.pharmA.token))).body.meta.summary).toMatchObject({ cashToReceive: 0, cashReceived: 1000 });
  });

  it('confirmation groupée : les remises valides passent, les autres sont signalées', async () => {
    const w = await setup();
    const a = await order(w, { method: 'cash_on_delivery' });
    const b = await order(w, { method: 'cash_on_delivery' });
    const ids = [String((await settlementOf(a.orderId))!._id), String((await settlementOf(b.orderId))!._id)];
    const res = await api().post('/api/settlements/confirm-cash').set(auth(w.pharmA.token)).send({ ids: [...ids, '65f0000000000000000000aa'] });
    expect(res.status).toBe(200);
    expect(res.body.data.confirmed).toBe(2);
    expect(res.body.data.failed).toHaveLength(1);
    expect((await api().post('/api/settlements/confirm-cash').set(auth(w.agent.token)).send({ ids })).status).toBe(403);
    expect((await api().post('/api/settlements/confirm-cash').set(auth(w.pharmA.token)).send({ ids: [] })).status).toBe(422);
  });

  it('espèces au retrait : la pharmacie encaisse elle-même, rien à reverser', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'cash_on_pickup', type: 'pickup' });
    expect(await settlementOf(orderId)).toMatchObject({ kind: 'cash_pickup', status: 'settled', courierAmount: 0 });
    expect(await Payout.countDocuments({ orderId })).toBe(0);
    expect((await api().get('/api/settlements').set(auth(w.pharmA.token))).body.meta.summary.cashAtCounter).toBe(1000);
  });

  it('plafond : un livreur qui détient trop d’espèces ne peut plus accepter de livraison avant de les remettre', async () => {
    const w = await setup();
    const prev = process.env.CASH_LIMIT_FCFA;
    process.env.CASH_LIMIT_FCFA = '500';
    try {
      const first = await order(w, { method: 'cash_on_delivery' }); // le livreur détient maintenant 1000 > 500
      const blocked = await order(w, { method: 'cash_on_delivery', finish: false });
      expect(blocked.acceptStatus).toBe(409);
      expect(blocked.acceptBody.error.message).toContain('espèces');
      expect(blocked.acceptBody.error.details).toMatchObject({ cashHeld: 1000, limit: 500 });
      expect((await Delivery.findById(blocked.deliveryId).lean())!.status).toBe('searching'); // la livraison reste disponible

      const sid = String((await settlementOf(first.orderId))!._id);
      await api().post(`/api/settlements/${sid}/confirm-cash`).set(auth(w.pharmA.token));
      const ok = await api().post('/api/delivery-assignments').set(auth(w.agent.token)).send({ deliveryId: blocked.deliveryId });
      expect(ok.status).toBe(201);
    } finally {
      if (prev === undefined) delete process.env.CASH_LIMIT_FCFA; else process.env.CASH_LIMIT_FCFA = prev;
    }
  });
});

describe('RÉPARTITION - accès, supervision et confidentialité', () => {
  it('chacun ne voit que ses propres répartitions ; le patient n’y a pas accès', async () => {
    const w = await setup();
    await order(w, { method: 'mobile_money' });
    expect((await api().get('/api/settlements').set(auth(w.patient.token))).status).toBe(403);
    expect((await api().get('/api/settlements').set(auth(w.pharmA.token))).body.meta.total).toBe(1);
    expect((await api().get('/api/settlements').set(auth(w.pharmB.token))).body.meta.total).toBe(0);
    const other = await createUser('DELIVERY_AGENT', 'autre-livreur@test.sn');
    expect((await api().get('/api/settlements').set(auth(other.token))).body.meta.total).toBe(0);
    expect((await api().get('/api/settlements').set(auth(w.admin.token))).body.meta.total).toBe(1);
    for (const t of [w.pharmA.token, w.agent.token, w.patient.token]) expect((await api().get('/api/settlements/overview').set(auth(t))).status).toBe(403);
    expect((await api().get('/api/settlements')).status).toBe(401);
  });

  it('vue admin : espèces détenues par livreur et versements à corriger', async () => {
    const w = await setup();
    await order(w, { method: 'cash_on_delivery' });
    const res = await api().get('/api/settlements/overview').set(auth(w.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.cashHeldByCouriers).toHaveLength(1);
    expect(res.body.data.cashHeldByCouriers[0]).toMatchObject({ courierId: w.agent.id, amount: 1000, count: 1 });
    expect(res.body.data.volume.cashDelivery).toBe(2000);
    expect(res.body.data.deliveredWithoutSettlement).toBe(0);
  });

  it('rattrapage : une livraison sans répartition (événement perdu) est répartie par l’admin', async () => {
    const w = await setup();
    const { orderId } = await order(w, { method: 'mobile_money' });
    await Payout.deleteMany({ orderId });
    await Settlement.deleteMany({ orderId }); // simule un événement perdu (panne au mauvais moment)
    expect((await api().get('/api/settlements/overview').set(auth(w.admin.token))).body.data.deliveredWithoutSettlement).toBe(1);
    expect((await api().post('/api/settlements/reconcile').set(auth(w.pharmA.token))).status).toBe(403);
    const r = await api().post('/api/settlements/reconcile').set(auth(w.admin.token));
    expect(r.body.data.released).toBe(1);
    expect(await settlementOf(orderId)).toMatchObject({ status: 'paid' });
    expect((await api().post('/api/settlements/reconcile').set(auth(w.admin.token))).body.data.released).toBe(0);
  });

  it('le compte de réception n’est jamais public : propriétaire et admin seulement', async () => {
    const w = await setup();
    const list = await api().get('/api/pharmacies?limit=50');
    expect(JSON.stringify(list.body)).not.toContain('77 000 00 01');
    expect(JSON.stringify(list.body)).not.toContain('payoutPhone');
    const url = `/api/pharmacies/${w.pid(w.pharmacyA)}`;
    expect(JSON.stringify((await api().get(url)).body)).not.toContain('payoutPhone');
    expect(JSON.stringify((await api().get(url).set(auth(w.patient.token))).body)).not.toContain('payoutPhone');
    expect(JSON.stringify((await api().get(url).set(auth(w.pharmB.token))).body)).not.toContain('payoutPhone');
    expect((await api().get(url).set(auth(w.pharmA.token))).body.data).toMatchObject({ payoutOperator: 'wave', payoutPhone: PH_PHONE });
    const all = await api().get('/api/pharmacies?all=true&limit=50').set(auth(w.admin.token));
    expect(all.body.data.find((p: { id: string }) => p.id === w.pid(w.pharmacyA)).payoutPhone).toBe(PH_PHONE);
    const search = await api().get('/api/medicines/search').query({ q: 'paracetamol' });
    expect(JSON.stringify(search.body)).not.toContain('payoutPhone');
  });

  it('validation du compte de réception (opérateur et numéro)', async () => {
    const w = await setup(false);
    const ph = (b: object, t = w.pharmA.token) => api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}`).set(auth(t)).send(b);
    const ag = (b: object, t = w.agent.token) => api().patch('/api/agents/me').set(auth(t)).send(b);
    expect((await ph({ payoutOperator: 'paypal', payoutPhone: PH_PHONE })).status).toBe(422);
    expect((await ph({ payoutOperator: 'wave', payoutPhone: 'abc' })).status).toBe(422);
    expect((await ag({ payoutOperator: 'bitcoin' })).status).toBe(422);
    expect((await ag({ payoutPhone: '12' })).status).toBe(422);
    expect((await ph({ payoutOperator: 'orange_money', payoutPhone: '77 123 45 67' }, w.pharmB.token)).status).toBe(403); // autre pharmacie
    expect((await ph({ payoutOperator: 'orange_money', payoutPhone: '77 123 45 67' })).status).toBe(200);
  });
});
