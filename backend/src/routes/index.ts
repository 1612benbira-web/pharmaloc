import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';
import { usersRoutes } from '../modules/users/users.routes';
import { pharmaciesRoutes } from '../modules/pharmacies/pharmacies.routes';
import { medicinesRoutes } from '../modules/medicines/medicines.routes';
import { suppliersRoutes } from '../modules/suppliers/suppliers.routes';
import { stocksRoutes, stockMovementsRoutes } from '../modules/stock/stocks.routes';
import { supplierDeliveriesRoutes } from '../modules/supplier-deliveries/supplierDeliveries.routes';
import { alertsRoutes } from '../modules/alerts/alerts.routes';
import { purchaseOrdersRoutes } from '../modules/purchase-orders/purchaseOrders.routes';
import { notificationsRoutes } from '../modules/notifications/notifications.routes';
import { addressesRoutes } from '../modules/addresses/addresses.routes';
import { ordersRoutes } from '../modules/orders/orders.routes';
import { deliveriesRoutes, deliveryAssignmentsRoutes, agentsRoutes } from '../modules/deliveries/deliveries.routes';
import { paymentsRoutes } from '../modules/payments/payments.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { auditRoutes } from '../modules/audit/audit.routes';
import { settlementsRoutes } from '../modules/settlements/settlements.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pharmaloc' });
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/pharmacies', pharmaciesRoutes);
apiRouter.use('/medicines', medicinesRoutes);
apiRouter.use('/suppliers', suppliersRoutes);
apiRouter.use('/stocks', stocksRoutes);
apiRouter.use('/stock-movements', stockMovementsRoutes);
// Réception de marchandise fournisseur ("Nouvelle livraison" côté pharmacien)
apiRouter.use('/supplier-deliveries', supplierDeliveriesRoutes);
apiRouter.use('/alerts', alertsRoutes);
apiRouter.use('/purchase-orders', purchaseOrdersRoutes);
apiRouter.use('/notifications', notificationsRoutes);
apiRouter.use('/addresses', addressesRoutes);
apiRouter.use('/orders', ordersRoutes);
// Livraison d'une commande au patient (livreur)
apiRouter.use('/deliveries', deliveriesRoutes);
apiRouter.use('/delivery-assignments', deliveryAssignmentsRoutes);
apiRouter.use('/agents', agentsRoutes);
apiRouter.use('/payments', paymentsRoutes);
apiRouter.use('/settlements', settlementsRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/audit-logs', auditRoutes);
