import { describe, expect, it } from 'vitest';
import { Pharmacy } from '../src/models/Pharmacy';
import { User } from '../src/models/User';
import { Notification } from '../src/models/Notification';
import { DeliveryAgent } from '../src/models/DeliveryAgent';
import { AuditLog } from '../src/models/AuditLog';
import { api, auth, createUser, makeWorld, PASSWORD } from './helpers/app';

const pharmacyBody = (email = 'nouvelle@test.sn', extra: Record<string, unknown> = {}) => ({
  email, password: PASSWORD, firstName: 'Fatou', lastName: 'Sow', phone: '+221770000001',
  pharmacy: { name: 'Pharmacie Nouvelle', licenseNumber: 'AGR-2026-001', address: '5 rue test', city: 'Dakar', neighborhood: 'Pikine', latitude: 14.75, longitude: -17.39 },
  ...extra,
});
const courierBody = (email = 'coursier@test.sn', extra: Record<string, unknown> = {}) => ({
  email, password: PASSWORD, firstName: 'Ibra', lastName: 'Fall', phone: '+221770000002', vehicle: 'Moto', ...extra,
});

describe('INSCRIPTION - pharmacie (en attente de validation)', () => {
  it('crée un compte pharmacien ET une fiche pharmacie en attente, invisibles des patients', async () => {
    const w = await makeWorld();
    const res = await api().post('/api/auth/register/pharmacy').send(pharmacyBody());
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'PHARMACIST', approvalStatus: 'pending' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const ph = await Pharmacy.findById(res.body.data.pharmacyId).lean();
    expect(ph).toMatchObject({ isValidated: false, licenseNumber: 'AGR-2026-001', deliveryFee: 500, deliveryPerKmFee: 150, deliveryIncludedKm: 1 });
    expect(String((await User.findOne({ email: 'nouvelle@test.sn' }).lean())!.pharmacyId)).toBe(String(ph!._id));
    // invisible : liste publique et fiche
    const list = await api().get('/api/pharmacies?limit=100');
    expect(list.body.data.map((p: { name: string }) => p.name)).not.toContain('Pharmacie Nouvelle');
    expect((await api().get(`/api/pharmacies/${res.body.data.pharmacyId}`)).status).toBe(404);
    // les administrateurs sont prévenus
    expect(await Notification.countDocuments({ userId: w.admin.id, type: 'request.pharmacy' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'auth.register_pharmacy' })).toBe(1);
  });

  it('un compte en attente ne peut RIEN faire : 403 ACCOUNT_PENDING, sauf voir son statut', async () => {
    await makeWorld();
    const { accessToken } = (await api().post('/api/auth/register/pharmacy').send(pharmacyBody())).body.data;
    for (const url of ['/api/stocks', '/api/dashboard/pharmacy', '/api/alerts', '/api/orders', '/api/notifications']) {
      const r = await api().get(url).set(auth(accessToken));
      expect(r.status, url).toBe(403);
      expect(r.body.error.code, url).toBe('ACCOUNT_PENDING');
    }
    expect((await api().post('/api/supplier-deliveries').set(auth(accessToken)).send({})).status).toBe(403);
    const me = await api().get('/api/auth/me').set(auth(accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.approvalStatus).toBe('pending');
    // sur une route publique, il est traité comme anonyme (pas d'erreur)
    expect((await api().get('/api/pharmacies').set(auth(accessToken))).status).toBe(200);
    expect((await api().post('/api/auth/logout').set(auth(accessToken))).status).toBe(204);
  });

  it('la file d’attente admin affiche les détails ; approuver valide la pharmacie et ouvre l’accès', async () => {
    const w = await makeWorld();
    const reg = (await api().post('/api/auth/register/pharmacy').send(pharmacyBody())).body.data;
    const q = await api().get('/api/users/requests').set(auth(w.admin.token));
    expect(q.status).toBe(200);
    expect(q.body.data).toHaveLength(1);
    expect(q.body.data[0]).toMatchObject({ role: 'PHARMACIST', email: 'nouvelle@test.sn', pharmacy: { name: 'Pharmacie Nouvelle', licenseNumber: 'AGR-2026-001' } });
    expect(JSON.stringify(q.body)).not.toContain('passwordHash');

    const ok = await api().post(`/api/users/${reg.user.id}/approval`).set(auth(w.admin.token)).send({ decision: 'approve' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.approvalStatus).toBe('approved');
    expect((await Pharmacy.findById(reg.pharmacyId).lean())!.isValidated).toBe(true);
    expect((await api().get('/api/stocks').set(auth(reg.accessToken))).status).toBe(200); // même jeton, accès ouvert
    const list = await api().get('/api/pharmacies?limit=100');
    expect(list.body.data.map((p: { name: string }) => p.name)).toContain('Pharmacie Nouvelle');
    expect(await Notification.countDocuments({ userId: reg.user.id, type: 'account.approved' })).toBe(1);
    expect((await api().get('/api/users/requests').set(auth(w.admin.token))).body.data).toHaveLength(0);
  });

  it('refuser : motif obligatoire, pharmacie désactivée, accès fermé, motif visible par le demandeur', async () => {
    const w = await makeWorld();
    const reg = (await api().post('/api/auth/register/pharmacy').send(pharmacyBody())).body.data;
    const url = `/api/users/${reg.user.id}/approval`;
    expect((await api().post(url).set(auth(w.admin.token)).send({ decision: 'reject' })).status).toBe(422); // sans motif
    expect((await api().post(url).set(auth(w.admin.token)).send({ decision: 'reject', reason: 'Agrément introuvable' })).status).toBe(200);
    expect(await Pharmacy.findById(reg.pharmacyId).lean()).toMatchObject({ isValidated: false, isActive: false });
    const r = await api().get('/api/stocks').set(auth(reg.accessToken));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ACCOUNT_REJECTED');
    const me = await api().get('/api/auth/me').set(auth(reg.accessToken));
    expect(me.body.data).toMatchObject({ approvalStatus: 'rejected', rejectionReason: 'Agrément introuvable' });
    // décision définitive : pas de seconde décision
    expect((await api().post(url).set(auth(w.admin.token)).send({ decision: 'approve' })).status).toBe(409);
  });

  it('refuse l’escalade de privilèges et les champs inconnus (422)', async () => {
    await makeWorld();
    const post = (b: object) => api().post('/api/auth/register/pharmacy').send(b);
    expect((await post(pharmacyBody('a@test.sn', { role: 'ADMIN' }))).status).toBe(422);
    expect((await post(pharmacyBody('b@test.sn', { approvalStatus: 'approved' }))).status).toBe(422);
    expect((await post(pharmacyBody('c@test.sn', { pharmacy: { ...pharmacyBody().pharmacy, isValidated: true } }))).status).toBe(422);
    expect((await post(pharmacyBody('d@test.sn', { pharmacy: { ...pharmacyBody().pharmacy, licenseNumber: '' } }))).status).toBe(422);
    expect((await post(pharmacyBody('e@test.sn', { phone: 'abc' }))).status).toBe(422);
    expect(await User.countDocuments({ email: /@test\.sn$/, approvalStatus: 'pending' })).toBe(0);
    // l'inscription patient reste limitée au rôle patient
    expect((await api().post('/api/auth/register').send({ email: 'p@test.sn', password: PASSWORD, firstName: 'A', lastName: 'B', approvalStatus: 'approved' })).status).toBe(422);
  });

  it('email déjà utilisé : 409 et aucune pharmacie orpheline', async () => {
    const w = await makeWorld();
    const before = await Pharmacy.countDocuments();
    const res = await api().post('/api/auth/register/pharmacy').send(pharmacyBody('patient@test.sn'));
    expect(res.status).toBe(409);
    expect(await Pharmacy.countDocuments()).toBe(before);
    expect(w).toBeTruthy();
  });

  it('seul un administrateur décide', async () => {
    const w = await makeWorld();
    const reg = (await api().post('/api/auth/register/pharmacy').send(pharmacyBody())).body.data;
    const url = `/api/users/${reg.user.id}/approval`;
    for (const t of [w.patient.token, w.pharmA.token, w.agent.token, reg.accessToken]) {
      expect((await api().post(url).set(auth(t)).send({ decision: 'approve' })).status).toBe(403);
    }
    expect((await api().get('/api/users/requests').set(auth(w.pharmA.token))).status).toBe(403);
    expect((await User.findById(reg.user.id).lean())!.approvalStatus).toBe('pending');
  });
});

describe('INSCRIPTION - livreur (en attente de validation)', () => {
  it('crée un livreur en attente, sans disponibilité, qui ne peut ni se déclarer ni accepter', async () => {
    const w = await makeWorld();
    const res = await api().post('/api/auth/register/courier').send(courierBody());
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'DELIVERY_AGENT', approvalStatus: 'pending' });
    const t = res.body.data.accessToken;
    expect(await DeliveryAgent.findOne({ userId: res.body.data.user.id }).lean()).toMatchObject({ isAvailable: false, vehicle: 'Moto' });
    expect((await api().patch('/api/agents/me').set(auth(t)).send({ isAvailable: true })).status).toBe(403);
    expect((await api().get('/api/deliveries/available').set(auth(t))).status).toBe(403);
    expect((await api().post('/api/delivery-assignments').set(auth(t)).send({ deliveryId: '65f0000000000000000000aa' })).status).toBe(403);
    expect(await Notification.countDocuments({ userId: w.admin.id, type: 'request.courier' })).toBe(1);
  });

  it('après approbation, le livreur peut passer disponible ; refusé, il reste bloqué', async () => {
    const w = await makeWorld();
    const a = (await api().post('/api/auth/register/courier').send(courierBody('ok@test.sn'))).body.data;
    const b = (await api().post('/api/auth/register/courier').send(courierBody('ko@test.sn'))).body.data;
    expect((await api().post(`/api/users/${a.user.id}/approval`).set(auth(w.admin.token)).send({ decision: 'approve' })).status).toBe(200);
    expect((await api().post(`/api/users/${b.user.id}/approval`).set(auth(w.admin.token)).send({ decision: 'reject', reason: 'Pièce illisible' })).status).toBe(200);
    expect((await api().patch('/api/agents/me').set(auth(a.accessToken)).send({ isAvailable: true })).status).toBe(200);
    expect((await api().patch('/api/agents/me').set(auth(b.accessToken)).send({ isAvailable: true })).status).toBe(403);
  });

  it('validation : téléphone et véhicule obligatoires, champs inconnus refusés', async () => {
    await makeWorld();
    const post = (b: object) => api().post('/api/auth/register/courier').send(b);
    expect((await post(courierBody('a@test.sn', { phone: undefined }))).status).toBe(422);
    expect((await post(courierBody('b@test.sn', { vehicle: undefined }))).status).toBe(422);
    expect((await post(courierBody('c@test.sn', { role: 'ADMIN' }))).status).toBe(422);
    expect((await post(courierBody('patient@test.sn'))).status).toBe(409);
  });

  it('un compte créé par un admin est approuvé d’office ; un patient reste approuvé', async () => {
    const w = await makeWorld();
    const r = await api().post('/api/users').set(auth(w.admin.token)).send({ email: 'x@test.sn', password: PASSWORD, firstName: 'X', lastName: 'Y', role: 'DELIVERY_AGENT' });
    expect(r.body.data.approvalStatus).toBe('approved');
    const p = await createUser('PATIENT', 'zz@test.sn');
    expect((await api().get('/api/orders').set(auth(p.token))).status).toBe(200);
  });
});
