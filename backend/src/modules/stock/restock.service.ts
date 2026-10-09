import { Types } from 'mongoose';
import { Stock } from '../../models/Stock';
import { Medicine } from '../../models/Medicine';
import { PurchaseOrder } from '../../models/PurchaseOrder';
import { oid } from '../../utils/ids';
import { forecastStock, FORECAST_ALERT_DAYS } from './forecast.service';

/**
 * SUGGESTION DE RÉAPPROVISIONNEMENT (jamais de commande automatique en v1) :
 *   niveau cible  = maximumQuantity, sinon (consommation/jour x COVERAGE_DAYS + minimumQuantity)
 *   à commander   = niveau cible - stock actuel, arrondi au multiple de PACK_SIZE supérieur
 * Un produit est "à risque" si stock <= minimum OU rupture prévue sous FORECAST_ALERT_DAYS jours.
 */
export const COVERAGE_DAYS = 14;
export const PACK_SIZE = 10;

export function suggestQuantity(s: { quantity: number; minimumQuantity: number; maximumQuantity?: number | null }, avgDaily: number) {
  const target = s.maximumQuantity ?? Math.ceil(avgDaily * COVERAGE_DAYS) + s.minimumQuantity;
  const missing = target - s.quantity;
  return missing > 0 ? Math.ceil(missing / PACK_SIZE) * PACK_SIZE : 0;
}

export const restockService = {
  /** (Re)génère la suggestion ouverte d'une pharmacie. Retourne null s'il n'y a rien à commander. */
  async generate(pharmacyId: string) {
    const stocks = await Stock.find({ pharmacyId: oid(pharmacyId), isListed: true }).lean();
    const meds = await Medicine.find({ _id: { $in: stocks.map((s) => s.medicineId) } }).select('name dosage').lean();
    const label = new Map(meds.map((m) => [String(m._id), [m.name, m.dosage].filter(Boolean).join(' ')]));

    const items = [];
    for (const s of stocks) {
      const f = await forecastStock(s);
      const risky = s.quantity <= s.minimumQuantity || (f.daysRemaining !== null && f.daysRemaining <= FORECAST_ALERT_DAYS);
      if (!risky) continue;
      const qty = suggestQuantity(s, f.avgDailyConsumption);
      if (qty <= 0) continue;
      items.push({
        medicineId: s.medicineId as Types.ObjectId,
        stockId: s._id,
        currentQuantity: s.quantity,
        avgDailyConsumption: f.avgDailyConsumption,
        daysRemaining: f.daysRemaining ?? undefined,
        suggestedQuantity: qty,
        quantity: qty,
        reason:
          `${label.get(String(s.medicineId)) ?? 'Médicament'} : ${f.explanation}` +
          (s.quantity <= s.minimumQuantity ? ` ; stock (${s.quantity}) ≤ minimum (${s.minimumQuantity})` : ''),
      });
    }
    await PurchaseOrder.deleteMany({ pharmacyId: oid(pharmacyId), status: 'suggested' }); // une seule suggestion ouverte
    if (!items.length) return null;
    return PurchaseOrder.create({ pharmacyId: oid(pharmacyId), items, status: 'suggested' });
  },
};
