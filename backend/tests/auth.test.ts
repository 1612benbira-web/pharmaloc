import { describe, expect, it } from 'vitest';
import { api, auth, PASSWORD, registerPatient } from './helpers/app';

describe('AUTH - inscription', () => {
  it('crée un patient et ne renvoie jamais le hash', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'Awa@Test.sn', password: PASSWORD, firstName: 'Awa', lastName: 'Diop' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('PATIENT');
    expect(res.body.data.user.email).toBe('awa@test.sn');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.accessToken).toBeTruthy();
  });
  it("refuse l'élévation de privilège via le champ role (422)", async () => {
    const res = await api().post('/api/auth/register').send({ email: 'x@test.sn', password: PASSWORD, firstName: 'X', lastName: 'Y', role: 'ADMIN' });
    expect(res.status).toBe(422);
  });
  it('refuse un mot de passe faible (422)', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'x@test.sn', password: 'abc', firstName: 'X', lastName: 'Y' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('refuse un email déjà utilisé (409)', async () => {
    await registerPatient('dup@test.sn');
    const res = await api().post('/api/auth/register').send({ email: 'dup@test.sn', password: PASSWORD, firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(409);
  });
});

describe('AUTH - connexion & session', () => {
  it('connecte avec les bons identifiants', async () => {
    await registerPatient('ok@test.sn');
    const res = await api().post('/api/auth/login').send({ email: 'ok@test.sn', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeTruthy();
  });
  it('401 générique pour mauvais mot de passe ET email inconnu', async () => {
    await registerPatient('ok@test.sn');
    const bad = await api().post('/api/auth/login').send({ email: 'ok@test.sn', password: 'Mauvais999' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nope@test.sn', password: PASSWORD });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });
  it('GET /me exige un jeton valide', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth('faux'))).status).toBe(401);
    const { accessToken } = await registerPatient();
    const res = await api().get('/api/auth/me').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('patient@test.sn');
  });
  it("un refresh token n'est pas accepté comme access token", async () => {
    const { refreshToken } = await registerPatient();
    expect((await api().get('/api/auth/me').set(auth(refreshToken))).status).toBe(401);
  });
  it('refresh renvoie de nouveaux jetons', async () => {
    const { refreshToken } = await registerPatient();
    const res = await api().post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });
  it('logout invalide les jetons existants', async () => {
    const { accessToken, refreshToken } = await registerPatient();
    expect((await api().post('/api/auth/logout').set(auth(accessToken))).status).toBe(204);
    expect((await api().get('/api/auth/me').set(auth(accessToken))).status).toBe(401);
    expect((await api().post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
  });
});
