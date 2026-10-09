import { describe, it, expect } from 'vitest';
import { api } from './helpers/app';

describe('observabilité & erreurs', () => {
  it('GET /api/health répond ok', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'pharmaloc' });
  });
  it('envoie les en-têtes de sécurité et masque x-powered-by', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('404 JSON pour une route inconnue', async () => {
    const res = await api().get('/api/inconnue');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
  it('400 pour un JSON malformé', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{oups');
    expect(res.status).toBe(400);
  });
});
