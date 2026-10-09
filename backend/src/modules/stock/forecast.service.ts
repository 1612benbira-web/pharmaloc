import { Types } from 'mongoose';
import { StockMovement } from '../../models/StockMovement';

/**
 * PRÉVISION DE RUPTURE - calcul simple et vérifiable (aucune IA) :
 *   consommation moyenne/jour = unités vendues sur les N derniers jours / N
 *   jours restants            = stock physique / consommation moyenne
 */
export const FORECAST_WINDOW_DAYS = 14;
export const FORECAST_ALERT_DAYS = 7;

export interface Forecast {
  windowDays: number;
  soldInWindow: number;
  avgDailyConsumption: number;
  daysRemaining: number | null;
  estimatedStockoutDate: Date | null;
  explanation: string;
}

export function computeForecast(quantity: number, soldInWindow: number, windowDays = FORECAST_WINDOW_DAYS, now = new Date()): Forecast {
  const avg = Math.round((soldInWindow / windowDays) * 100) / 100;
  if (avg <= 0) {
    return {
      windowDays, soldInWindow, avgDailyConsumption: 0, daysRemaining: null, estimatedStockoutDate: null,
      explanation: `Aucune vente sur les ${windowDays} derniers jours : prévision impossible.`,
    };
  }
  const days = Math.round((quantity / avg) * 10) / 10;
  return {
    windowDays, soldInWindow, avgDailyConsumption: avg, daysRemaining: days,
    estimatedStockoutDate: new Date(now.getTime() + days * 86_400_000),
    explanation: `${quantity} unités en stock / ${avg} vendues par jour (moyenne sur ${windowDays} jours) = ${days} jours`,
  };
}

export async function soldInWindow(stockId: string | Types.ObjectId, windowDays = FORECAST_WINDOW_DAYS, now = new Date()) {
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const rows = await StockMovement.aggregate<{ total: number }>([
    { $match: { stockId: new Types.ObjectId(String(stockId)), type: 'sale', createdAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]);
  return Math.abs(rows[0]?.total ?? 0);
}

export async function forecastStock(stock: { _id: Types.ObjectId; quantity: number }, windowDays = FORECAST_WINDOW_DAYS, now = new Date()) {
  return computeForecast(stock.quantity, await soldInWindow(stock._id, windowDays, now), windowDays, now);
}
