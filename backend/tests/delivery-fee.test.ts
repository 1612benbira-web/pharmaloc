import { describe, expect, it } from 'vitest';
import { Order } from '../src/models/Order';
import { Address } from '../src/models/Address';
import { computeDeliveryFee, deliveryQuote } from '../src/modules/pharmacies/deliveryFee';
import { haversineKm } from '../src/utils/geo';
import { addStock, api, auth, makeWorld } from './helpers/app';

const tariff = { deliveryFee: 500, deliveryPerKmFee: 150, deliveryIncludedKm: 1, deliveryRadiusKm: 10 };

describe('LIVRAISON - formule de tarif à la distance', () => {
  it('base + prix/km au-delà des km inclus, arrondi aux 50 FCFA supérieurs', () => {
    expect(computeDeliveryFee(tariff, 0.4)).toBe(500);   // sous le seuil inclus
    expect(computeDeliveryFee(tariff, 1)).toBe(500);     // exactement au seuil
    expect(computeDeliveryFee(tariff, 2)).toBe(650);     // 500 + 150 x 1
    expect(computeDeliveryFee(tariff, 5.3)).toBe(1150);  // 500 + 150 x 4,3 = 1145 -> 1150
    expect(computeDeliveryFee(tariff, 10)).toBe(1850);   // 500 + 150 x 9 = 1850
  });
  it('tarif fixe si aucun prix au km ; gratuit si base et prix à zéro', () => {
    expect(computeDeliveryFee({ deliveryFee: 1000 }, 7)).toBe(1000);
    expect(computeDeliveryFee({}, 7)).toBe(0);
  });
  it('plus la distance augmente, plus les frais augmentent (jamais l’inverse)', () => {
    let prev = 0;
    for (let d = 0; d <= 12; d += 0.5) { const f = computeDeliveryFee(tariff, d); expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
  });
  it('devis : distance de Haversine, zone de livraison', () => {
    const q = deliveryQuote({ ...tariff, latitude: 14.69, longitude: -17.44 }, 14.72, -17.46);
    expect(q.distanceKm).toBe(haversineKm(14.69, -17.44, 14.72, -17.46));
    expect(q.fee).toBe(computeDeliveryFee(tariff, q.distanceKm));
    expect(q.inZone).toBe(true);
    expect(deliveryQuote({ ...tariff, latitude: 14.69, longitude: -17.44 }, 15.5, -17.4).inZone).toBe(false);
  });
});

async function setup() {
  const w = await makeWorld();
  await w.pharmacyA.updateOne(tariff);
  await addStock(w.pid(w.pharmacyA), w.pid(w.para), 100, { price: 500 });
  const near = { street: 'Rue proche', city: 'Dakar', latitude: 14.695, longitude: -17.442 };  // ~0,6 km
  const far = { street: 'Rue lointaine', city: 'Dakar', latitude: 14.76, longitude: -17.5 };   // ~10 km (hors zone ou limite)
  const mid = { street: 'Rue moyenne', city: 'Dakar', latitude: 14.72, longitude: -17.46 };    // ~3-4 km
  const order = (body: Record<string, unknown>, token = w.patient.token) =>
    api().post('/api/orders').set(auth(token)).send({ pharmacyId: w.pid(w.pharmacyA), deliveryType: 'delivery', paymentMethod: 'cash_on_delivery', items: [{ medicineId: w.pid(w.para), quantity: 1 }], ...body });
  return { w, near, far, mid, order };
}

describe('LIVRAISON - devis et commande', () => {
  it('GET /pharmacies/:id/delivery-quote : distance, frais, zone (public)', async () => {
    const { w, mid } = await setup();
    const res = await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}/delivery-quote`).query({ lat: mid.latitude, lng: mid.longitude });
    expect(res.status).toBe(200);
    const expectedKm = haversineKm(14.69, -17.44, mid.latitude, mid.longitude);
    expect(res.body.data).toMatchObject({ distanceKm: expectedKm, fee: computeDeliveryFee(tariff, expectedKm), inZone: true, deliveryAvailable: true, baseFee: 500, perKmFee: 150, includedKm: 1 });
    const far = await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}/delivery-quote`).query({ lat: 15.6, lng: -17.4 });
    expect(far.body.data).toMatchObject({ inZone: false, deliveryAvailable: false });
    expect((await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}/delivery-quote`).query({ lat: 99, lng: 0 })).status).toBe(422);
    expect((await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}/delivery-quote`)).status).toBe(422);
    await w.pharmacyA.updateOne({ isValidated: false });
    expect((await api().get(`/api/pharmacies/${w.pid(w.pharmacyA)}/delivery-quote`).query({ lat: 14.7, lng: -17.4 })).status).toBe(404);
  });

  it('la commande applique le tarif calculé côté serveur : plus loin = plus cher', async () => {
    const { w, near, mid, order } = await setup();
    const a = await order({ address: near });
    const b = await order({ address: mid });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const kmA = haversineKm(14.69, -17.44, near.latitude, near.longitude);
    const kmB = haversineKm(14.69, -17.44, mid.latitude, mid.longitude);
    expect(a.body.data).toMatchObject({ deliveryDistanceKm: kmA, deliveryFee: computeDeliveryFee(tariff, kmA), totalAmount: 500 + computeDeliveryFee(tariff, kmA) });
    expect(b.body.data.deliveryFee).toBe(computeDeliveryFee(tariff, kmB));
    expect(b.body.data.deliveryFee).toBeGreaterThan(a.body.data.deliveryFee);
    expect(w).toBeTruthy();
  });

  it('le client ne peut pas imposer ses frais (champ refusé) ; adresse enregistrée utilisable', async () => {
    const { w, near, order } = await setup();
    expect((await order({ address: near, deliveryFee: 0 })).status).toBe(422);
    const saved = await Address.create({ userId: w.patient.id, street: 'Domicile', city: 'Dakar', latitude: near.latitude, longitude: near.longitude });
    const res = await order({ address: undefined, addressId: String(saved._id) });
    expect(res.status).toBe(201);
    expect(res.body.data.deliveryFee).toBe(computeDeliveryFee(tariff, haversineKm(14.69, -17.44, near.latitude, near.longitude)));
  });

  it('livraison sans position : 422 explicite, aucune commande ni adresse créée, stock intact', async () => {
    const { order } = await setup();
    const res = await order({ address: { street: 'Quelque part', city: 'Dakar' } });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body.error.details)).toContain('Position requise');
    expect(await Order.countDocuments()).toBe(0);
    expect(await Address.countDocuments()).toBe(0);
  });

  it('adresse hors zone de livraison : 409 avec distance et rayon', async () => {
    const { w, order } = await setup();
    await w.pharmacyA.updateOne({ deliveryRadiusKm: 3 });
    const res = await order({ address: { street: 'Très loin', city: 'Thiès', latitude: 14.79, longitude: -16.93 } });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ radiusKm: 3 });
    expect(res.body.error.details.distanceKm).toBeGreaterThan(3);
    expect(await Order.countDocuments()).toBe(0);
    expect(await Address.countDocuments()).toBe(0);
  });

  it('le retrait en pharmacie reste gratuit et n’exige aucune position', async () => {
    const { order } = await setup();
    const res = await order({ deliveryType: 'pickup', paymentMethod: 'cash_on_pickup' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ deliveryFee: 0, totalAmount: 500 });
  });

  it('la recherche affiche les frais estimés quand la position est connue', async () => {
    const { w, mid } = await setup();
    const withPos = await api().get('/api/medicines/search').query({ q: 'paracetamol', lat: mid.latitude, lng: mid.longitude });
    const offer = withPos.body.data[0].offers.find((o: { pharmacy: { id: string } }) => o.pharmacy.id === w.pid(w.pharmacyA));
    expect(offer.deliveryFeeEstimated).toBe(true);
    expect(offer.deliveryFee).toBe(computeDeliveryFee(tariff, haversineKm(14.69, -17.44, mid.latitude, mid.longitude)));
    const noPos = await api().get('/api/medicines/search').query({ q: 'paracetamol' });
    expect(noPos.body.data[0].offers[0].deliveryFeeEstimated).toBe(false);
  });

  it('la pharmacie règle son tarif ; valeurs négatives et autre pharmacie refusées', async () => {
    const { w } = await setup();
    const url = `/api/pharmacies/${w.pid(w.pharmacyA)}`;
    expect((await api().patch(url).set(auth(w.pharmA.token)).send({ deliveryFee: 700, deliveryPerKmFee: 200, deliveryIncludedKm: 2, deliveryRadiusKm: 8 })).status).toBe(200);
    expect(await (await import('../src/models/Pharmacy.js')).Pharmacy.findById(w.pharmacyA._id).lean()).toMatchObject({ deliveryFee: 700, deliveryPerKmFee: 200, deliveryIncludedKm: 2, deliveryRadiusKm: 8 });
    expect((await api().patch(url).set(auth(w.pharmA.token)).send({ deliveryPerKmFee: -5 })).status).toBe(422);
    expect((await api().patch(url).set(auth(w.pharmB.token)).send({ deliveryPerKmFee: 1 })).status).toBe(403);
    expect((await api().patch(url).set(auth(w.patient.token)).send({ deliveryPerKmFee: 1 })).status).toBe(403);
  });
});
