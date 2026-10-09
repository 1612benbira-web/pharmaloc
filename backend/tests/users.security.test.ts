import { describe, expect, it } from 'vitest';
import { api, auth, createAdmin, PASSWORD, registerPatient } from './helpers/app';

const newPharmacist = { email: 'pharma@test.sn', password: PASSWORD, firstName: 'Moussa', lastName: 'Ndiaye', role: 'PHARMACIST' };

describe("SECURITY - contrôle d'accès par rôle (serveur)", () => {
  it('401 sans jeton', async () => {
    expect((await api().get('/api/users')).status).toBe(401);
  });
  it('403 pour un patient sur /api/users', async () => {
    const { accessToken } = await registerPatient();
    expect((await api().get('/api/users').set(auth(accessToken))).status).toBe(403);
    expect((await api().post('/api/users').set(auth(accessToken)).send(newPharmacist)).status).toBe(403);
  });
  it('un admin crée un pharmacien qui peut ensuite se connecter', async () => {
    const admin = await createAdmin();
    const res = await api().post('/api/users').set(auth(admin.accessToken)).send(newPharmacist);
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('PHARMACIST');
    const login = await api().post('/api/auth/login').send({ email: newPharmacist.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('PHARMACIST');
  });
  it('422 pour données invalides (rôle inconnu, pagination hors limites)', async () => {
    const admin = await createAdmin();
    expect((await api().post('/api/users').set(auth(admin.accessToken)).send({ ...newPharmacist, role: 'ROOT' })).status).toBe(422);
    expect((await api().get('/api/users?limit=5000').set(auth(admin.accessToken))).status).toBe(422);
  });
  it('liste paginée avec filtre par rôle', async () => {
    const admin = await createAdmin();
    await registerPatient('p1@test.sn');
    const res = await api().get('/api/users?role=PATIENT').set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
  });
  it('désactiver un compte invalide immédiatement sa session', async () => {
    const admin = await createAdmin();
    const patient = await registerPatient();
    const off = await api().patch(`/api/users/${patient.user.id}/status`).set(auth(admin.accessToken)).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await api().get('/api/auth/me').set(auth(patient.accessToken))).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email: 'patient@test.sn', password: PASSWORD })).status).toBe(403);
  });
  it('un admin ne peut pas se désactiver lui-même', async () => {
    const admin = await createAdmin();
    const res = await api().patch(`/api/users/${admin.user.id}/status`).set(auth(admin.accessToken)).send({ isActive: false });
    expect(res.status).toBe(400);
  });
});
