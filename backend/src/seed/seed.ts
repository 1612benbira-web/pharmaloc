/**
 * Données DEMO réalistes pour le jury CADEV.
 *   npm run seed          (base vide uniquement)
 *   npm run seed:reset    (vide la base puis recrée tout)
 * Refuse de s'exécuter en production sauf SEED_ALLOW_PRODUCTION=1.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { User } from '../models/User';
import { Pharmacy } from '../models/Pharmacy';
import { Medicine } from '../models/Medicine';
import { Stock } from '../models/Stock';
import { StockMovement } from '../models/StockMovement';
import { Order } from '../models/Order';
import { Supplier } from '../models/Supplier';
import { stockService } from '../modules/stock/stock.service';
import { alertService } from '../modules/stock/alert.service';
import { restockService } from '../modules/stock/restock.service';
import { orderService } from '../modules/orders/order.service';
import { deliveryService } from '../modules/deliveries/delivery.service';
import { orderCode } from '../modules/orders/orderCode';
import { Delivery } from '../models/Delivery';
import { registerEventHandlers } from '../events/handlers';
import type { AuthUser } from '../middleware/auth';

export const DEMO_PASSWORD = 'Demo1234';
const DAY = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

let seedState = 42;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);
const rint = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const week = (open: string, close: string) => Array.from({ length: 7 }, (_, day) => ({ day, open, close }));
const PHARMACIES = [
  { name: 'Pharmacie Plateau Santé', address: 'Avenue Léopold Sédar Senghor', neighborhood: 'Plateau', latitude: 14.6708, longitude: -17.438, phone: '+221338210001', is24h: true, deliveryFee: 1000 },
  { name: 'Pharmacie de la Médina', address: 'Rue 11 x 22, Médina', neighborhood: 'Médina', latitude: 14.685, longitude: -17.45, phone: '+221338210002', openingHours: week('08:00', '22:00'), deliveryFee: 1000 },
  { name: 'Pharmacie des Almadies', address: 'Route des Almadies', neighborhood: 'Almadies', latitude: 14.744, longitude: -17.506, phone: '+221338210003', openingHours: week('08:00', '20:00'), deliveryFee: 1500 },
  { name: 'Pharmacie Liberté 6', address: 'Cité Liberté 6, Dakar', neighborhood: 'Liberté 6', latitude: 14.7167, longitude: -17.4677, phone: '+221338210004', is24h: true, deliveryFee: 1000 },
  { name: 'Pharmacie de Pikine', address: 'Boulevard du Centenaire, Pikine', neighborhood: 'Pikine', latitude: 14.7549, longitude: -17.3908, phone: '+221338210005', openingHours: week('08:00', '21:00'), deliveryFee: 1500 },
];

// nom, dosage, forme, catégorie, ordonnance, prix (FCFA), fabricant
const MEDICINES: [string, string, string, string, boolean, number, string][] = [
  ['Paracétamol', '1000 mg', 'Comprimé', 'Antalgique', false, 500, 'Sanofi'],
  ['Paracétamol', '500 mg', 'Comprimé', 'Antalgique', false, 400, 'Sanofi'],
  ['Ibuprofène', '400 mg', 'Comprimé', 'Anti-inflammatoire', false, 900, 'Zentiva'],
  ['Aspirine', '500 mg', 'Comprimé', 'Antalgique', false, 700, 'Bayer'],
  ['Amoxicilline', '500 mg', 'Gélule', 'Antibiotique', true, 2500, 'Biogaran'],
  ['Amoxicilline + acide clavulanique', '1 g', 'Comprimé', 'Antibiotique', true, 4500, 'GSK'],
  ['Métronidazole', '500 mg', 'Comprimé', 'Antibiotique', true, 1500, 'Sanofi'],
  ['Artéméther + luméfantrine', '20/120 mg', 'Comprimé', 'Antipaludique', false, 2800, 'Novartis'],
  ['Oméprazole', '20 mg', 'Gélule', 'Digestif', false, 2000, 'Mylan'],
  ['Vitamine C', '500 mg', 'Comprimé', 'Vitamines', false, 1200, 'UPSA'],
  ['Zinc', '20 mg', 'Comprimé dispersible', 'Vitamines', false, 800, 'Unicef'],
  ['Sels de réhydratation orale', 'Sachet', 'Poudre', 'Réhydratation', false, 300, 'OMS'],
  ['Sirop contre la toux', '125 ml', 'Sirop', 'Toux et rhume', false, 1800, 'Pierre Fabre'],
  ['Cétirizine', '10 mg', 'Comprimé', 'Antiallergique', false, 1500, 'UCB'],
  ['Loratadine', '10 mg', 'Comprimé', 'Antiallergique', false, 1400, 'Bayer'],
  ['Diclofénac gel', '1 %', 'Gel', 'Anti-inflammatoire', false, 2200, 'Novartis'],
  ['Metformine', '850 mg', 'Comprimé', 'Diabète', true, 1800, 'Merck'],
  ['Amlodipine', '5 mg', 'Comprimé', 'Cardiologie', true, 2000, 'Pfizer'],
  ['Salbutamol', '100 µg', 'Spray', 'Asthme', true, 3200, 'GSK'],
  ['Fer + acide folique', '60 mg', 'Comprimé', 'Vitamines', false, 1600, 'Sanofi'],
];

async function main() {
  if (env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw new Error('Seed DEMO interdit en production (SEED_ALLOW_PRODUCTION=1 pour forcer).');
  }
  registerEventHandlers();
  await connectDb();
  if (process.argv.includes('--reset')) {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  } else if (await User.exists({})) {
    throw new Error('La base contient déjà des données : utilisez `npm run seed:reset` pour la réinitialiser.');
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  // ---------- comptes ----------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_ROUNDS);
  const pharmacies = await Pharmacy.insertMany(PHARMACIES.map((p) => ({ ...p, city: 'Dakar', isValidated: true, isActive: true, offersDelivery: true, offersPickup: true, deliveryRadiusKm: 15 })));
  const mk = (role: string, email: string, firstName: string, lastName: string, extra: object = {}) =>
    User.create({ email, passwordHash, role, firstName, lastName, phone: '+221770000000', ...extra });
  const admin = await mk('ADMIN', 'admin@pharmaloc.sn', 'Aminata', 'Admin');
  const pharmA = await mk('PHARMACIST', 'pharmacien@pharmaloc.sn', 'Moussa', 'Ndiaye', { pharmacyId: pharmacies[0]!._id });
  await mk('PHARMACIST', 'pharmacien2@pharmaloc.sn', 'Fatou', 'Sow', { pharmacyId: pharmacies[1]!._id });
  const agent = await mk('DELIVERY_AGENT', 'livreur@pharmaloc.sn', 'Ibrahima', 'Fall');
  const agent2 = await mk('DELIVERY_AGENT', 'livreur2@pharmaloc.sn', 'Cheikh', 'Diop');
  const patient = await mk('PATIENT', 'patient@pharmaloc.sn', 'Awa', 'Diop');
  void admin;

  const meds = await Medicine.insertMany(MEDICINES.map(([name, dosage, form, category, rx, , manufacturer], i) => ({
    name, dosage, form, category, prescriptionRequired: rx, manufacturer, barcode: `61500000${String(i + 1).padStart(5, '0')}`,
    genericName: name.split(' ')[0], description: `${name} ${dosage} - ${form}`,
  })));
  const price = (i: number) => MEDICINES[i]![5];
  const [P1000, P500, IBU, , AMOX, , , , , VITC, ZINC, SRO, , CETI, , , , , SALB] = meds;
  const idx = (m: (typeof meds)[number]) => meds.findIndex((x) => String(x._id) === String(m._id));

  const stockIn = async (ph: (typeof pharmacies)[number], m: (typeof meds)[number], qty: number, o: { min?: number; max?: number; expDays?: number; batch?: string } = {}) => {
    const r = await stockService.receive(
      { pharmacyId: String(ph._id), medicineId: String(m._id), quantity: qty, batchNumber: o.batch ?? `LOT${rint(100, 999)}`, expirationDate: daysFromNow(o.expDays ?? rint(200, 900)), purchasePrice: Math.round(price(idx(m)) * 0.7) },
      { userId: String(pharmA._id), reference: 'SEED-INIT', note: 'Stock initial DEMO' },
    );
    await Stock.updateOne({ _id: r.stockId }, { $set: { unitPrice: price(idx(m)) + (rint(0, 2) * 50), minimumQuantity: o.min ?? 10, ...(o.max ? { maximumQuantity: o.max } : {}) } });
    return r.stockId;
  };
  /** Consomme `perDay` unités par jour sur 14 jours puis antidate les ventes (historique pour la prévision). */
  const sellHistory = async (stockId: string, perDay: number) => {
    for (let d = 0; d < 14; d++) await stockService.consume(stockId, perDay, { reference: 'SEED-HIST' });
    const movs = await StockMovement.find({ stockId, type: 'sale', reference: 'SEED-HIST' }).sort({ createdAt: 1 }).lean();
    for (const [i, m] of movs.entries()) await StockMovement.updateOne({ _id: m._id }, { $set: { createdAt: new Date(Date.now() - (i + 0.5) * DAY) } });
  };

  // ---------- stocks ----------
  const [A, B, C, D, E] = pharmacies as [(typeof pharmacies)[number], ...(typeof pharmacies)[number][]];
  for (const [pi, ph] of pharmacies.entries()) {
    for (const [mi, m] of meds.entries()) {
      if (pi > 0 && rnd() < 0.2) continue; // certaines pharmacies n'ont pas tout
      if (pi === 0 && [0, 2, 4, 9, 18].includes(mi)) continue; // cas scénarios gérés ci-dessous pour A
      if (mi === 0 && pi > 0) continue; // Paracétamol 1000 géré ci-dessous
      await stockIn(ph, m, rint(30, 160), { min: 15 });
    }
  }
  // Scénario 1 : « Paracétamol 1000 mg » -> A 20, B 50, C rupture, D 35, E 12
  const paraA = await stockIn(A, P1000!, 34, { min: 15, batch: 'PARA-A' });
  await sellHistory(paraA, 1); // 34 - 14 = 20
  await stockIn(B!, P1000!, 50, { min: 15 });
  const paraC = await stockIn(C!, P1000!, 3, { min: 15 });
  await stockService.adjust(paraC, -3, { note: 'Inventaire : rupture', userId: String(pharmA._id) });
  await stockIn(D!, P1000!, 35, { min: 15 });
  await stockIn(E!, P1000!, 12, { min: 15 });
  // Scénario 2 : Amoxicilline 8 < minimum 10 => stock faible
  await stockIn(A, AMOX!, 8, { min: 10 });
  // Scénario 3 : Ibuprofène 400, 10/jour, stock 30 => rupture sous 3 jours, réappro recommandé 100
  const ibuA = await stockIn(A, IBU!, 170, { min: 20, max: 130 });
  await sellHistory(ibuA, 10);
  // Autres cas : produit proche de l'expiration, rupture complète, consommations régulières
  await stockIn(A, VITC!, 20, { min: 10, expDays: 20, batch: 'VITC-EXP' });
  const salb = await stockIn(A, SALB!, 4, { min: 5 });
  await stockService.consume(salb, 4, { reference: 'SEED-SALB' });
  await sellHistory(await stockIn(A, P500!, 200, { min: 20 }), 3);
  await sellHistory(await stockIn(A, ZINC!, 140, { min: 20 }), 2);
  await sellHistory(await stockIn(A, SRO!, 190, { min: 30 }), 4);
  await sellHistory(await stockIn(A, CETI!, 100, { min: 15 }), 1);
  for (const n of ['Sanofi', 'UbiPharm', 'Laborex Sénégal']) await Supplier.create({ pharmacyId: A._id, name: n });

  // ---------- historique de commandes (graphiques) ----------
  const history = [];
  for (let d = 0; d < 14; d++) {
    for (let k = rint(2, 6); k > 0; k--) {
      const ph = rnd() < 0.55 ? A : pharmacies[rint(1, 4)]!;
      const m = meds[rint(0, 19)]!;
      const q = rint(1, 4);
      const unit = price(idx(m));
      const at = new Date(Date.now() - d * DAY - rint(0, 10) * 3_600_000);
      history.push({
        userId: patient._id, pharmacyId: ph._id, deliveryType: rnd() < 0.6 ? 'delivery' : 'pickup', status: 'delivered',
        items: [{ medicineId: m._id, stockId: new mongoose.Types.ObjectId(), name: m.name, quantity: q, unitPrice: unit }],
        subtotal: q * unit, deliveryFee: 0, totalAmount: q * unit, paymentMethod: 'cash_on_pickup', paymentStatus: 'paid',
        stockReserved: false, stockConsumed: true, deliveredAt: at, createdAt: at, updatedAt: at,
      });
    }
  }
  await Order.collection.insertMany(history as never[]);

  // ---------- commandes réelles à différents statuts (via les vrais services) ----------
  const patientAuth: AuthUser = { id: String(patient._id), role: 'PATIENT' };
  const pharmAuth: AuthUser = { id: String(pharmA._id), role: 'PHARMACIST', pharmacyId: String(A._id) };
  const agentAuth: AuthUser = { id: String(agent._id), role: 'DELIVERY_AGENT' };
  const address = { label: 'Domicile', street: 'Rue 10 x 15, Médina', neighborhood: 'Médina', city: 'Dakar', latitude: 14.686, longitude: -17.447 };
  const place = (type: 'delivery' | 'pickup', items: [typeof ZINC, number][], pay: 'cash_on_delivery' | 'cash_on_pickup' | 'mobile_money') =>
    orderService.create(String(patient._id), {
      pharmacyId: String(A._id), deliveryType: type, paymentMethod: pay, ...(type === 'delivery' ? { address } : {}),
      items: items.map(([m, q]) => ({ medicineId: String(m!._id), quantity: q })),
    });
  const toReady = async (id: string) => { await orderService.accept(id, pharmAuth); await orderService.prepare(id, pharmAuth); await orderService.markReady(id, pharmAuth); };
  await deliveryService.setAvailability(String(agent._id), { isAvailable: true, vehicle: 'Moto', latitude: 14.69, longitude: -17.44 });
  await deliveryService.setAvailability(String(agent2._id), { isAvailable: false, vehicle: 'Vélo' });

  const o1 = await place('delivery', [[ZINC, 2], [SRO, 3]], 'mobile_money');            // livrée
  await toReady(String(o1!._id));
  const d1 = await Delivery.findOne({ orderId: o1!._id });
  await deliveryService.accept(String(d1!._id), agentAuth);
  await deliveryService.pickup(String(d1!._id), agentAuth);
  await deliveryService.start(String(d1!._id), agentAuth);
  await deliveryService.complete(String(d1!._id), agentAuth, orderCode(String(o1!._id)));

  const o2 = await place('pickup', [[P500, 2]], 'cash_on_pickup');                       // retrait effectué
  await toReady(String(o2!._id));
  await orderService.handover(String(o2!._id), orderCode(String(o2!._id)), pharmAuth);

  const o3 = await place('delivery', [[CETI, 1]], 'cash_on_delivery');                   // en cours de livraison
  await toReady(String(o3!._id));
  const d3 = await Delivery.findOne({ orderId: o3!._id });
  await deliveryService.accept(String(d3!._id), agentAuth);
  await deliveryService.pickup(String(d3!._id), agentAuth);
  await deliveryService.start(String(d3!._id), agentAuth);
  await deliveryService.updateLocation(String(d3!._id), agentAuth, 14.688, -17.449);

  const o4 = await place('delivery', [[SRO, 2]], 'cash_on_delivery');                    // prête : un livreur doit l'accepter
  await toReady(String(o4!._id));
  const o5 = await place('delivery', [[P500, 1], [ZINC, 1]], 'cash_on_delivery');        // en attente : le pharmacien doit la traiter
  void o5;
  const o6 = await place('pickup', [[CETI, 1]], 'cash_on_pickup');                       // annulée
  await orderService.cancel(String(o6!._id), patientAuth, 'Changement d’avis');

  // ---------- alertes, prévisions, suggestion de réapprovisionnement ----------
  for (const s of await Stock.find().select('_id').lean()) await alertService.refresh(String(s._id));
  await restockService.generate(String(A._id));

  console.log('\n✅ Données DEMO créées.\n');
  console.log(`Mot de passe de tous les comptes : ${DEMO_PASSWORD}`);
  console.table([
    { rôle: 'PATIENT', email: 'patient@pharmaloc.sn' },
    { rôle: 'PHARMACIEN (Plateau Santé)', email: 'pharmacien@pharmaloc.sn' },
    { rôle: 'PHARMACIEN (Médina)', email: 'pharmacien2@pharmaloc.sn' },
    { rôle: 'LIVREUR', email: 'livreur@pharmaloc.sn' },
    { rôle: 'ADMIN', email: 'admin@pharmaloc.sn' },
  ]);
}

main()
  .catch((e) => { console.error('❌', e.message ?? e); process.exitCode = 1; })
  .finally(() => disconnectDb());
