import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { User } from '../../src/models/User';
import { Pharmacy } from '../../src/models/Pharmacy';
import { Medicine } from '../../src/models/Medicine';
import { Stock } from '../../src/models/Stock';
import { stockService } from '../../src/modules/stock/stock.service';
import type { Role } from '../../src/models/roles';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Secret123';
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

export async function registerPatient(email = 'patient@test.sn') {
  const res = await api().post('/api/auth/register').send({ email, password: PASSWORD, firstName: 'Awa', lastName: 'Diop' });
  return res.body.data as { user: { id: string; role: string }; accessToken: string; refreshToken: string };
}

/** Crée un utilisateur de n'importe quel rôle directement en base, puis le connecte. */
export async function createUser(role: Role, email: string, extra: Record<string, unknown> = {}) {
  const u = await User.create({ email, passwordHash: await bcrypt.hash(PASSWORD, 4), firstName: role, lastName: 'Test', role, ...extra });
  const res = await api().post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: String(u._id), token: res.body.data.accessToken as string };
}
export const createAdmin = (email = 'admin@test.sn') => createUser('ADMIN', email).then((u) => ({ user: { id: u.id }, accessToken: u.token }));

export const allDayHours = Array.from({ length: 7 }, (_, day) => ({ day, open: '00:00', close: '23:59' }));

export async function createPharmacy(name: string, extra: Record<string, unknown> = {}) {
  return Pharmacy.create({
    name, address: '1 rue test', city: 'Dakar', neighborhood: 'Plateau', latitude: 14.6937, longitude: -17.4441,
    isValidated: true, is24h: true, deliveryFee: 1000, ...extra,
  });
}

export async function createMedicine(name: string, dosage?: string, extra: Record<string, unknown> = {}) {
  return Medicine.create({ name, dosage, ...extra });
}

/** Ajoute du stock via le service réel (lot + mouvement + alertes). */
export async function addStock(pharmacyId: string, medicineId: string, quantity: number, opts: { price?: number; min?: number; max?: number; batch?: string; expiresInDays?: number } = {}) {
  const r = await stockService.receive({
    pharmacyId, medicineId, quantity, batchNumber: opts.batch ?? 'LOT1', expirationDate: daysFromNow(opts.expiresInDays ?? 400),
  }, { reference: 'INIT' });
  await Stock.updateOne({ _id: r.stockId }, { $set: { unitPrice: opts.price ?? 500, minimumQuantity: opts.min ?? 10, ...(opts.max ? { maximumQuantity: opts.max } : {}) } });
  return r.stockId;
}

/** Monde de test : 2 pharmacies (A, B), 1 pharmacien chacune, 1 patient, 1 livreur, 1 admin, 2 médicaments. */
export async function makeWorld() {
  const pharmacyA = await createPharmacy('Pharmacie A', { latitude: 14.69, longitude: -17.44 });
  const pharmacyB = await createPharmacy('Pharmacie B', { latitude: 14.75, longitude: -17.40 });
  const para = await createMedicine('Paracétamol', '1000 mg', { genericName: 'Paracetamol', category: 'Antalgique' });
  const amox = await createMedicine('Amoxicilline', '500 mg', { prescriptionRequired: true, category: 'Antibiotique' });
  const pharmA = await createUser('PHARMACIST', 'pharma-a@test.sn', { pharmacyId: pharmacyA._id });
  const pharmB = await createUser('PHARMACIST', 'pharma-b@test.sn', { pharmacyId: pharmacyB._id });
  const patient = await createUser('PATIENT', 'patient@test.sn');
  const agent = await createUser('DELIVERY_AGENT', 'agent@test.sn');
  const admin = await createUser('ADMIN', 'admin@test.sn');
  return { pharmacyA, pharmacyB, para, amox, pharmA, pharmB, patient, agent, admin, pid: (p: { _id: unknown }) => String(p._id) };
}
