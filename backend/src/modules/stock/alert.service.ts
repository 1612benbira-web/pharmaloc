import { Types } from 'mongoose';
import { InventoryAlert, type AlertType } from '../../models/InventoryAlert';
import { Stock } from '../../models/Stock';
import { StockBatch } from '../../models/StockBatch';
import { Medicine } from '../../models/Medicine';
import { notify } from '../../services/notification.service';
import { forecastStock, FORECAST_ALERT_DAYS } from './forecast.service';
import { logger } from '../../utils/logger';

export const EXPIRY_WARNING_DAYS = 30;

const NOTIF_TITLES: Record<AlertType, string> = {
  low_stock: 'Stock faible',
  out_of_stock: 'Rupture de stock',
  expiring_soon: 'Produit bientôt expiré',
  expired: 'Produit expiré',
  stockout_forecast: 'Risque de rupture',
  anomaly: 'Anomalie de stock',
};

interface OpenArgs {
  stock: { _id: Types.ObjectId; pharmacyId: Types.ObjectId; medicineId: Types.ObjectId };
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  data?: Record<string, unknown>;
}

async function open({ stock, type, severity, message, data }: OpenArgs) {
  const existing = await InventoryAlert.findOne({ stockId: stock._id, type }).lean();
  if (existing && existing.status === 'open') {
    await InventoryAlert.updateOne({ _id: existing._id }, { $set: { message, severity, data } });
    return;
  }
  await InventoryAlert.findOneAndUpdate(
    { stockId: stock._id, type },
    {
      $set: { status: 'open', message, severity, data, openedAt: new Date() },
      $unset: { resolvedAt: 1 },
      $setOnInsert: { pharmacyId: stock.pharmacyId, medicineId: stock.medicineId },
    },
    { upsert: true },
  );
  // nouvelle alerte (ou réouverture) => notification du pharmacien
  await notify.pharmacy(stock.pharmacyId, { type: `alert.${type}`, title: NOTIF_TITLES[type], message, data: { stockId: String(stock._id), ...data } });
}

const resolve = (stockId: Types.ObjectId, ...types: AlertType[]) =>
  InventoryAlert.updateMany({ stockId, type: { $in: types }, status: 'open' }, { $set: { status: 'resolved', resolvedAt: new Date() } });

export const alertService = {
  /** Recalcule toutes les alertes d'un stock : faible, rupture, expiration, prévision, cohérence. */
  async refresh(stockId: string) {
    try {
      const stock = await Stock.findById(stockId).lean();
      if (!stock) return;
      const med = await Medicine.findById(stock.medicineId).select('name dosage').lean();
      const label = med ? [med.name, med.dosage].filter(Boolean).join(' ') : 'Médicament';
      const qty = stock.quantity;

      // 1) rupture / stock faible (quantity <= minimumQuantity)
      if (qty === 0) {
        await open({ stock, type: 'out_of_stock', severity: 'critical', message: `🔴 RUPTURE : ${label}`, data: { quantity: 0 } });
        await resolve(stock._id, 'low_stock');
      } else if (qty <= stock.minimumQuantity) {
        await open({
          stock, type: 'low_stock', severity: 'warning',
          message: `⚠ STOCK FAIBLE : ${label} (${qty} restant${qty > 1 ? 's' : ''}, minimum ${stock.minimumQuantity})`,
          data: { quantity: qty, minimumQuantity: stock.minimumQuantity },
        });
        await resolve(stock._id, 'out_of_stock');
      } else {
        await resolve(stock._id, 'low_stock', 'out_of_stock');
      }

      // 2) expiration proche / produits expirés
      const now = new Date();
      const limit = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
      const batches = await StockBatch.find({ stockId: stock._id, quantity: { $gt: 0 }, expirationDate: { $lte: limit } }).lean();
      const expired = batches.filter((b) => b.expirationDate <= now);
      const soon = batches.filter((b) => b.expirationDate > now);
      const soonQty = soon.reduce((s, b) => s + b.quantity, 0);
      const expiredQty = expired.reduce((s, b) => s + b.quantity, 0);
      if (soonQty > 0) {
        await open({
          stock, type: 'expiring_soon', severity: 'warning',
          message: `${soonQty} boîtes de ${label} arrivent à expiration dans ${EXPIRY_WARNING_DAYS} jours.`,
          data: { quantity: soonQty, batches: soon.map((b) => ({ batchNumber: b.batchNumber, expirationDate: b.expirationDate, quantity: b.quantity })) },
        });
      } else await resolve(stock._id, 'expiring_soon');
      if (expiredQty > 0) {
        await open({
          stock, type: 'expired', severity: 'critical',
          message: `${expiredQty} boîtes de ${label} sont expirées et ne peuvent plus être vendues.`,
          data: { quantity: expiredQty },
        });
      } else await resolve(stock._id, 'expired');

      // 3) prévision de rupture
      const f = await forecastStock(stock);
      if (qty > 0 && f.daysRemaining !== null && f.daysRemaining <= FORECAST_ALERT_DAYS) {
        await open({
          stock, type: 'stockout_forecast', severity: f.daysRemaining <= 3 ? 'critical' : 'warning',
          message: `Attention : ${label} risque d'être en rupture dans environ ${Math.ceil(f.daysRemaining)} jours.`,
          data: { daysRemaining: f.daysRemaining, avgDailyConsumption: f.avgDailyConsumption, explanation: f.explanation },
        });
      } else await resolve(stock._id, 'stockout_forecast');

      // 4) cohérence stock agrégé / lots non expirés
      const live = await StockBatch.find({ stockId: stock._id, expirationDate: { $gt: now } }).select('quantity').lean();
      const sum = live.reduce((s, b) => s + b.quantity, 0);
      if (sum !== qty || stock.available !== qty - stock.reservedQuantity) {
        await open({
          stock, type: 'anomaly', severity: 'critical',
          message: `Anomalie de stock sur ${label} : stock ${qty}, lots ${sum}, réservé ${stock.reservedQuantity}.`,
          data: { quantity: qty, batchSum: sum, reserved: stock.reservedQuantity, available: stock.available },
        });
      } else await resolve(stock._id, 'anomaly');
    } catch (err) {
      logger.error('Échec recalcul des alertes', { stockId, error: String(err) });
    }
  },

  async raiseAnomaly(stockId: string, message: string) {
    const stock = await Stock.findById(stockId).lean();
    if (stock) await open({ stock, type: 'anomaly', severity: 'critical', message });
  },
};
