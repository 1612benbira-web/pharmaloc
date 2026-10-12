import { describe, expect, it } from 'vitest';
import { Pharmacy } from '../src/models/Pharmacy';
import { openingInfo } from '../src/utils/geo';
import { addStock, api, auth, makeWorld } from './helpers/app';

// Dates de référence (Dakar = UTC) : 2026-10-12 = lundi, 2026-10-11 = dimanche, 2026-10-16 = vendredi, 2026-10-17 = samedi
const at = (iso: string) => new Date(`${iso}Z`);
const week = (open: string, close: string, days = [1, 2, 3, 4, 5, 6]) =>
  Array.from({ length: 7 }, (_, day) => (days.includes(day) ? { day, open, close } : { day, closed: true }));

describe('HORAIRES - calcul d’ouverture par jour', () => {
  const p = { openingHours: week('08:00', '20:00') }; // lundi-samedi 8h-20h, dimanche fermé

  it('ouverte pendant les heures, avec l’heure de fermeture', () => {
    expect(openingInfo(p, at('2026-10-12T10:00:00'))).toMatchObject({ isOpen: true, closesAt: '20:00' });
    expect(openingInfo(p, at('2026-10-12T08:00:00')).isOpen).toBe(true);   // l'ouverture est incluse
    expect(openingInfo(p, at('2026-10-12T19:59:00')).isOpen).toBe(true);
    expect(openingInfo(p, at('2026-10-12T20:00:00')).isOpen).toBe(false);  // la fermeture est exclue
  });
  it('fermée avant l’ouverture : ouvre aujourd’hui ; après la fermeture : ouvre demain', () => {
    expect(openingInfo(p, at('2026-10-12T07:00:00'))).toMatchObject({ isOpen: false, opensAt: '08:00', opensInDays: 0 });
    expect(openingInfo(p, at('2026-10-12T21:00:00'))).toMatchObject({ isOpen: false, opensAt: '08:00', opensInDays: 1 });
  });
  it('jour fermé (dimanche) : la prochaine ouverture saute le jour', () => {
    expect(openingInfo(p, at('2026-10-11T12:00:00'))).toMatchObject({ isOpen: false, opensAt: '08:00', opensInDays: 1 });
    expect(openingInfo(p, at('2026-10-17T21:00:00'))).toMatchObject({ isOpen: false, opensAt: '08:00', opensInDays: 2 }); // samedi soir -> lundi
  });
  it('horaires différents selon les jours', () => {
    const q = { openingHours: [{ day: 3, open: '09:00', close: '13:00' }, { day: 6, open: '10:00', close: '22:00' }] };
    expect(openingInfo(q, at('2026-10-14T12:00:00')).isOpen).toBe(true);   // mercredi matin
    expect(openingInfo(q, at('2026-10-14T14:00:00')).isOpen).toBe(false);
    expect(openingInfo(q, at('2026-10-12T12:00:00'))).toMatchObject({ isOpen: false, opensAt: '09:00', opensInDays: 2 }); // lundi -> mercredi
    expect(openingInfo(q, at('2026-10-17T21:00:00')).isOpen).toBe(true);   // samedi soir
  });
  it('fermeture après minuit (20:00 -> 02:00) : ouverte la nuit suivante, pas de débordement le lendemain si fermé', () => {
    const night = { openingHours: [{ day: 5, open: '20:00', close: '02:00' }] }; // vendredi
    expect(openingInfo(night, at('2026-10-16T23:00:00'))).toMatchObject({ isOpen: true, closesAt: '02:00' });
    expect(openingInfo(night, at('2026-10-17T01:00:00'))).toMatchObject({ isOpen: true, closesAt: '02:00' }); // samedi 01h : encore la garde de vendredi
    expect(openingInfo(night, at('2026-10-17T02:30:00')).isOpen).toBe(false);
    expect(openingInfo(night, at('2026-10-16T19:00:00'))).toMatchObject({ isOpen: false, opensAt: '20:00', opensInDays: 0 });
    expect(openingInfo(night, at('2026-10-17T12:00:00'))).toMatchObject({ isOpen: false, opensInDays: 6 });
  });
  it('24 h/24 toujours ouverte ; sans horaires, jamais ouverte et sans prochaine ouverture', () => {
    expect(openingInfo({ is24h: true }, at('2026-10-12T03:00:00'))).toMatchObject({ isOpen: true, is24h: true });
    expect(openingInfo({}, at('2026-10-12T10:00:00'))).toEqual({ isOpen: false, is24h: false });
    expect(openingInfo({ openingHours: week('08:00', '20:00', []) }, at('2026-10-12T10:00:00'))).toEqual({ isOpen: false, is24h: false });
  });
});

describe('HORAIRES - enregistrement par le pharmacien', () => {
  const patch = (w: Awaited<ReturnType<typeof makeWorld>>, body: object, token = w.pharmA.token) =>
    api().patch(`/api/pharmacies/${w.pid(w.pharmacyA)}`).set(auth(token)).send(body);

  it('le pharmacien définit ses jours et heures ; la pharmacie les expose avec le statut', async () => {
    const w = await makeWorld();
    const hours = [
      { day: 1, open: '08:00', close: '20:00' }, { day: 2, open: '08:00', close: '20:00' }, { day: 3, open: '09:00', close: '13:00' },
      { day: 4, open: '08:00', close: '20:00' }, { day: 5, open: '08:00', close: '22:00' }, { day: 6, open: '10:00', close: '14:00' }, { day: 0, closed: true },
    ];
    const res = await patch(w, { is24h: false, openingHours: hours });
    expect(res.status).toBe(200);
    const saved = await Pharmacy.findById(w.pharmacyA._id).lean();
    expect(saved!.is24h).toBe(false);
    expect(saved!.openingHours).toHaveLength(7);
    expect(saved!.openingHours.find((h) => h.day === 0)).toMatchObject({ closed: true });
    expect(saved!.openingHours.find((h) => h.day === 3)).toMatchObject({ open: '09:00', close: '13:00' });
    const detail = await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}`);
    expect(detail.body.data.openStatus).toHaveProperty('isOpen');
    expect(detail.body.data.openingHours).toHaveLength(7);
  });

  it('refuse les horaires incohérents (422) et ne modifie rien', async () => {
    const w = await makeWorld();
    const before = JSON.stringify((await Pharmacy.findById(w.pharmacyA._id).lean())!.openingHours);
    const bad: [string, object][] = [
      ['ouverture = fermeture', [{ day: 1, open: '08:00', close: '08:00' }]],
      ['sans heure de fermeture', [{ day: 1, open: '08:00' }]],
      ['sans heures et non fermé', [{ day: 1 }]],
      ['jour en double', [{ day: 1, open: '08:00', close: '12:00' }, { day: 1, open: '14:00', close: '18:00' }]],
      ['format d’heure invalide', [{ day: 1, open: '8h', close: '20h' }]],
      ['heure inexistante', [{ day: 1, open: '08:00', close: '25:00' }]],
      ['jour hors semaine', [{ day: 7, open: '08:00', close: '20:00' }]],
      ['plus de 7 jours', Array.from({ length: 8 }, () => ({ day: 1, open: '08:00', close: '20:00' }))],
      ['champ inconnu', [{ day: 1, open: '08:00', close: '20:00', garde: true }]],
    ];
    for (const [label, hours] of bad) expect((await patch(w, { openingHours: hours })).status, label).toBe(422);
    expect(JSON.stringify((await Pharmacy.findById(w.pharmacyA._id).lean())!.openingHours)).toBe(before);
  });

  it('seule la pharmacie concernée (ou l’admin) modifie ses horaires', async () => {
    const w = await makeWorld();
    const hours = [{ day: 1, open: '08:00', close: '20:00' }];
    expect((await patch(w, { openingHours: hours }, w.pharmB.token)).status).toBe(403);
    expect((await patch(w, { openingHours: hours }, w.patient.token)).status).toBe(403);
    expect((await patch(w, { openingHours: hours }, w.admin.token)).status).toBe(200);
  });

  it('la recherche reflète les horaires : fermée tous les jours => hors du filtre « ouverte »', async () => {
    const w = await makeWorld();
    await addStock(w.pid(w.pharmacyA), w.pid(w.para), 30);
    await patch(w, { is24h: false, openingHours: week('08:00', '20:00', []) }); // 7 jours fermés
    const closed = await api().get('/api/medicines/search').query({ q: 'paracetamol' });
    const offer = closed.body.data[0].offers.find((o: { pharmacy: { id: string } }) => o.pharmacy.id === w.pid(w.pharmacyA));
    expect(offer.isOpen).toBe(false);
    expect(offer.openStatus.isOpen).toBe(false);
    const filtered = await api().get('/api/medicines/search').query({ q: 'paracetamol', openNow: true });
    expect(filtered.body.data[0].offers.some((o: { pharmacy: { id: string } }) => o.pharmacy.id === w.pid(w.pharmacyA))).toBe(false);
    await patch(w, { is24h: true });
    const open = await api().get('/api/medicines/search').query({ q: 'paracetamol' });
    expect(open.body.data[0].offers.find((o: { pharmacy: { id: string } }) => o.pharmacy.id === w.pid(w.pharmacyA)).openStatus).toMatchObject({ isOpen: true, is24h: true });
  });

  it('l’inscription d’une pharmacie valide aussi ses horaires', async () => {
    await makeWorld();
    const body = (hours: object) => ({
      email: 'h@test.sn', password: 'Secret123', firstName: 'A', lastName: 'B', phone: '+221770000009',
      pharmacy: { name: 'Pharma H', licenseNumber: 'AGR-1', address: '1 rue', city: 'Dakar', latitude: 14.7, longitude: -17.4, openingHours: hours },
    });
    expect((await api().post('/api/auth/register/pharmacy').send(body([{ day: 1, open: '08:00', close: '08:00' }]))).status).toBe(422);
    expect((await api().post('/api/auth/register/pharmacy').send(body([{ day: 1, open: '08:00', close: '20:00' }, { day: 0, closed: true }]))).status).toBe(201);
  });
});
