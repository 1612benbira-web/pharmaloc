import { Types } from 'mongoose';
import { Order } from '../../models/Order';
import { Stock } from '../../models/Stock';
import { StockMovement, MOVEMENT_TYPES } from '../../models/StockMovement';
import { SupplierDelivery } from '../../models/SupplierDelivery';
import { InventoryAlert } from '../../models/InventoryAlert';
import { Medicine } from '../../models/Medicine';
import { Pharmacy } from '../../models/Pharmacy';
import { User } from '../../models/User';
import { Delivery } from '../../models/Delivery';
import { ORDER_STATUSES } from '../../models/Order';
import { dayKey, lastDays, startOfDayUTC } from '../../utils/dates';
import { oid } from '../../utils/ids';

const DAYS = 14;
const severityRank = { critical: 0, warning: 1, info: 2 } as const;

export const dashboardService = {
  async pharmacy(pharmacyId: string) {
    const pid = oid(pharmacyId);
    const today = startOfDayUTC();
    const since = new Date(today.getTime() - (DAYS - 1) * 86_400_000);
    const days = lastDays(DAYS);

    const [stocks, ordersRecent, receivedToday, alerts, movements] = await Promise.all([
      Stock.find({ pharmacyId: pid, isListed: true }).lean(),
      Order.find({ pharmacyId: pid, createdAt: { $gte: since } }).select('status totalAmount subtotal createdAt deliveredAt').lean(),
      SupplierDelivery.countDocuments({ pharmacyId: pid, status: 'received', receivedAt: { $gte: today } }),
      InventoryAlert.find({ pharmacyId: pid, status: 'open' }).sort({ openedAt: -1 }).limit(50).lean(),
      StockMovement.find({ pharmacyId: pid, createdAt: { $gte: since } }).select('type quantity createdAt medicineId').lean(),
    ]);

    const delivered = ordersRecent.filter((o) => o.status === 'delivered' && o.deliveredAt);
    const salesToday = delivered.filter((o) => o.deliveredAt! >= today).reduce((s, o) => s + o.subtotal, 0);
    const sales = Object.fromEntries(days.map((d) => [d, { date: d, amount: 0, orders: 0 }]));
    for (const o of delivered) { const r = sales[dayKey(o.deliveredAt!)]; if (r) { r.amount += o.subtotal; r.orders += 1; } }
    const created = Object.fromEntries(days.map((d) => [d, 0]));
    for (const o of ordersRecent) { const k = dayKey(o.createdAt as Date); if (k in created) created[k]! += 1; }

    // évolution du stock total : on remonte le temps à partir du total actuel
    const total = stocks.reduce((s, x) => s + x.quantity, 0);
    const deltaByDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    for (const m of movements) { const k = dayKey(m.createdAt as Date); if (k in deltaByDay) deltaByDay[k]! += m.quantity; }
    let running = total;
    const evolution: { date: string; quantity: number }[] = [];
    for (const d of [...days].reverse()) { evolution.unshift({ date: d, quantity: running }); running -= deltaByDay[d]!; }

    const byType = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t, 0])) as Record<string, number>;
    for (const m of movements) byType[m.type] = (byType[m.type] ?? 0) + 1;

    const sold = new Map<string, number>();
    for (const m of movements) if (m.type === 'sale') sold.set(String(m.medicineId), (sold.get(String(m.medicineId)) ?? 0) - m.quantity);
    const topIds = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const meds = await Medicine.find({ _id: { $in: topIds.map(([id]) => oid(id)) } }).select('name dosage').lean();
    const topSelling = topIds.map(([id, qty]) => {
      const m = meds.find((x) => String(x._id) === id);
      return { medicineId: id, name: m ? [m.name, m.dosage].filter(Boolean).join(' ') : id, quantity: qty };
    });

    return {
      stats: {
        salesToday,
        ordersToday: ordersRecent.filter((o) => (o.createdAt as Date) >= today).length,
        ordersPending: ordersRecent.filter((o) => o.status === 'pending').length,
        productsAvailable: stocks.filter((s) => s.quantity > 0).length,
        productsOutOfStock: stocks.filter((s) => s.quantity === 0).length,
        productsLowStock: stocks.filter((s) => s.quantity > 0 && s.quantity <= s.minimumQuantity).length,
        deliveriesReceivedToday: receivedToday,
      },
      alerts: alerts.sort((a, b) => severityRank[a.severity as keyof typeof severityRank] - severityRank[b.severity as keyof typeof severityRank]).slice(0, 10),
      charts: {
        sales: Object.values(sales),
        ordersPerDay: days.map((d) => ({ date: d, orders: created[d] })),
        stockEvolution: evolution,
        movementsByType: Object.entries(byType).map(([type, count]) => ({ type, count })),
        topSelling,
      },
    };
  },

  async admin() {
    const days = lastDays(DAYS);
    const since = new Date(startOfDayUTC().getTime() - (DAYS - 1) * 86_400_000);
    const [users, pharmaciesAll, medicines, orders, activeDeliveries, alerts, stocks] = await Promise.all([
      User.find().select('role isActive').lean(),
      Pharmacy.find().select('isValidated isActive').lean(),
      Medicine.countDocuments(),
      Order.find().select('status totalAmount createdAt').lean(),
      Delivery.countDocuments({ status: { $in: ['searching', 'assigned', 'picked_up', 'in_delivery'] } }),
      InventoryAlert.find({ status: 'open' }).select('type severity').lean(),
      Stock.find().select('quantity minimumQuantity').lean(),
    ]);
    const count = <T,>(arr: T[], key: (x: T) => string) => arr.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
    const perDay = Object.fromEntries(days.map((d) => [d, { date: d, orders: 0, revenue: 0 }]));
    for (const o of orders) {
      const r = perDay[dayKey(o.createdAt as Date)];
      if (r && o.createdAt >= since) { r.orders += 1; if (o.status !== 'cancelled') r.revenue += o.totalAmount; }
    }
    return {
      stats: {
        users: users.length,
        usersByRole: count(users, (u) => u.role),
        pharmacies: pharmaciesAll.length,
        pharmaciesPendingValidation: pharmaciesAll.filter((p) => !p.isValidated).length,
        medicines,
        orders: orders.length,
        revenue: orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.totalAmount, 0),
        activeDeliveries,
        openAlerts: alerts.length,
        stockLines: stocks.length,
        stockLowOrOut: stocks.filter((s) => s.quantity <= s.minimumQuantity).length,
      },
      charts: {
        ordersPerDay: Object.values(perDay),
        ordersByStatus: ORDER_STATUSES.map((s) => ({ status: s, count: orders.filter((o) => o.status === s).length })),
        alertsByType: Object.entries(count(alerts, (a) => a.type)).map(([type, count]) => ({ type, count })),
      },
    };
  },
};
export type { Types };
