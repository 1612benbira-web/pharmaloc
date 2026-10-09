import { describe, expect, it } from 'vitest';
import { addStock, allDayHours, api, createMedicine, createPharmacy, makeWorld } from './helpers/app';
import { Stock } from '../src/models/Stock';
import { stockService } from '../src/modules/stock/stock.service';

async function world() {
  const w = await makeWorld();
  // A (0 km) : 50 en stock ; B (~7 km) : 20 ; C : rupture ; D : non validée (invisible)
  const pharmacyC = await createPharmacy('Pharmacie C', { latitude: 14.72, longitude: -17.46, is24h: false, openingHours: [] });
  const pharmacyD = await createPharmacy('Pharmacie D', { isValidated: false });
  await addStock(w.pid(w.pharmacyA), w.pid(w.para), 50, { price: 500 });
  await addStock(w.pid(w.pharmacyB), w.pid(w.para), 20, { price: 450 });
  const cId = await addStock(w.pid(pharmacyC), w.pid(w.para), 5, { price: 400 });
  await Stock.updateOne({ _id: cId }, { $set: { quantity: 0, available: 0 } });
  await addStock(w.pid(pharmacyD), w.pid(w.para), 99);
  return { ...w, pharmacyC, pharmacyD };
}

describe('MEDICINES - recherche et disponibilité', () => {
  it('« Paracétamol 1000 mg » (sans accent, casse libre) : pharmacies avec stock, distance, livraison, retrait', async () => {
    const w = await world();
    const res = await api().get('/api/medicines/search').query({ q: 'paracetamol 1000', lat: 14.69, lng: -17.44 });
    expect(res.status).toBe(200);
    const offers = res.body.data[0].offers;
    expect(res.body.data[0].medicine.name).toBe('Paracétamol');
    expect(offers.map((o: { pharmacy: { name: string } }) => o.pharmacy.name)).toEqual(['Pharmacie A', 'Pharmacie C', 'Pharmacie B']); // tri par distance, D (non validée) absente
    const a = offers[0];
    expect(a).toMatchObject({ distanceKm: 0, deliveryAvailable: true, pickupAvailable: true });
    expect(a.stock).toMatchObject({ available: 50, price: 500, status: 'available' });
    const c = offers.find((o: { pharmacy: { name: string } }) => o.pharmacy.name === 'Pharmacie C');
    expect(c.stock.status).toBe('out_of_stock');
    expect(c.deliveryAvailable).toBe(false);
    expect(w).toBeTruthy();
  });

  it('la disponibilité tient compte des réservations (stock réel - réservé)', async () => {
    const w = await world();
    const s = await Stock.findOne({ pharmacyId: w.pharmacyA._id });
    await stockService.reserve(String(s!._id), 5);
    const res = await api().get('/api/medicines/search').query({ q: 'paracetamol' });
    const a = res.body.data[0].offers.find((o: { pharmacy: { name: string } }) => o.pharmacy.name === 'Pharmacie A');
    expect(a.stock.available).toBe(45);
  });

  it('filtres : disponibilité, distance max, prix max, ouverte maintenant, livraison, retrait', async () => {
    await world();
    const names = async (q: Record<string, unknown>) =>
      (await api().get('/api/medicines/search').query({ q: 'paracetamol', lat: 14.69, lng: -17.44, ...q })).body.data[0].offers.map((o: { pharmacy: { name: string } }) => o.pharmacy.name);
    expect(await names({ onlyAvailable: true })).toEqual(['Pharmacie A', 'Pharmacie B']);
    expect(await names({ maxDistanceKm: 5 })).toEqual(['Pharmacie A', 'Pharmacie C']);
    expect(await names({ maxPrice: 450 })).toEqual(['Pharmacie C', 'Pharmacie B']);
    expect(await names({ openNow: true })).toEqual(['Pharmacie A', 'Pharmacie B']); // C n'a pas d'horaires
    expect(await names({ delivery: true })).toEqual(['Pharmacie A', 'Pharmacie B']);
    expect(await names({ pickup: true })).toEqual(['Pharmacie A', 'Pharmacie B']);
    expect(await names({ sort: 'price', onlyAvailable: true })).toEqual(['Pharmacie B', 'Pharmacie A']);
  });

  it('sans géolocalisation : recherche par quartier / ville', async () => {
    const w = await world();
    await w.pharmacyB.updateOne({ neighborhood: 'Almadies' });
    const res = await api().get('/api/medicines/search').query({ q: 'paracetamol', neighborhood: 'almadies' });
    expect(res.body.data[0].offers.map((o: { pharmacy: { name: string } }) => o.pharmacy.name)).toEqual(['Pharmacie B']);
    expect((await api().get('/api/medicines/search').query({ q: 'paracetamol', city: 'Thiès' })).body.data[0].offers).toHaveLength(0);
  });

  it('horaires : pharmacie fermée détectée', async () => {
    const w = await world();
    await w.pharmacyA.updateOne({ is24h: false, openingHours: [] });
    const res = await api().get('/api/medicines/search').query({ q: 'paracetamol' });
    const a = res.body.data[0].offers.find((o: { pharmacy: { name: string } }) => o.pharmacy.name === 'Pharmacie A');
    expect(a.isOpen).toBe(false);
    await w.pharmacyA.updateOne({ openingHours: allDayHours });
    const res2 = await api().get('/api/medicines/search').query({ q: 'paracetamol' });
    expect(res2.body.data[0].offers.find((o: { pharmacy: { name: string } }) => o.pharmacy.name === 'Pharmacie A').isOpen).toBe(true);
  });

  it('recherche par nom générique, par code-barres ; entrée invalide ou inconnue', async () => {
    const w = await world();
    await createMedicine('Doliprane', '500 mg', { genericName: 'Paracétamol', barcode: '3400000000017' });
    expect((await api().get('/api/medicines/search').query({ q: '3400000000017' })).body.data[0].medicine.name).toBe('Doliprane');
    const names = (await api().get('/api/medicines/search').query({ q: 'paracetamol' })).body.data.map((d: { medicine: { name: string } }) => d.medicine.name);
    expect(names).toContain('Doliprane');
    expect((await api().get('/api/medicines/search').query({ q: 'p' })).status).toBe(422);
    expect((await api().get('/api/medicines/search').query({ q: 'zzzzzz' })).body.data).toEqual([]);
    expect((await api().get('/api/medicines/search').query({ q: 'a.*(' })).status).toBe(200); // regex échappée
    expect(w).toBeTruthy();
  });

  it('GET /api/medicines : liste paginée publique ; /api/pharmacies proches triées par distance', async () => {
    await world();
    const meds = await api().get('/api/medicines?limit=1');
    expect(meds.status).toBe(200);
    expect(meds.body.meta.limit).toBe(1);
    const ph = await api().get('/api/pharmacies').query({ lat: 14.69, lng: -17.44, radiusKm: 100 });
    expect(ph.body.data.map((p: { name: string }) => p.name)).not.toContain('Pharmacie D');
    expect(ph.body.data[0].name).toBe('Pharmacie A');
    expect(ph.body.data[0]).toHaveProperty('isOpen');
  });
});
