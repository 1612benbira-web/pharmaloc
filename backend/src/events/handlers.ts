import { eventBus } from './eventBus';
import { Order } from '../models/Order';
import { Pharmacy } from '../models/Pharmacy';
import { notify } from '../services/notification.service';
import { paymentService } from '../modules/payments/payment.service';

let registered = false;

const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

/** Enregistre les automatisations événementielles (idempotent). */
export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;

  // Réception fournisseur : alertes déjà recalculées par le service de stock ; on prévient le pharmacien.
  eventBus.on('DELIVERY_RECEIVED', async (e) => {
    await notify.pharmacy(e.pharmacyId, {
      type: 'supplier_delivery.received',
      title: 'Nouvelle livraison fournisseur',
      message: `Livraison ${e.reference} enregistrée : ${e.stockIds.length} produit(s) mis à jour.`,
      data: { supplierDeliveryId: e.supplierDeliveryId },
    });
  });

  // Commande validée par le patient : stock déjà réservé -> prévenir pharmacie et patient.
  eventBus.on('ORDER_CONFIRMED', async ({ orderId }) => {
    const o = await Order.findById(orderId).lean();
    if (!o) return;
    await notify.pharmacy(o.pharmacyId, { type: 'order.new', title: 'Nouvelle commande', message: `Commande de ${fcfa(o.totalAmount)} (${o.deliveryType === 'delivery' ? 'livraison' : 'retrait'}) à traiter.`, data: { orderId } });
    await notify.user(o.userId, { type: 'order.placed', title: 'Commande enregistrée', message: 'Votre commande est transmise à la pharmacie.', data: { orderId } });
  });

  eventBus.on('ORDER_STATUS_CHANGED', async ({ orderId, to }) => {
    const o = await Order.findById(orderId).lean();
    if (!o) return;
    const patient: Record<string, [string, string]> = {
      confirmed: ['Commande confirmée', 'La pharmacie a accepté votre commande.'],
      preparing: ['Commande en préparation', 'Votre commande est en cours de préparation.'],
      ready: o.deliveryType === 'pickup'
        ? ['Commande préparée', 'Votre commande est prête : présentez votre code de retrait en pharmacie.']
        : ['Commande préparée', 'Votre commande est prête, un livreur va la récupérer.'],
      assigned: ['Livreur assigné', 'Un livreur a accepté votre commande.'],
      in_delivery: ['Livraison en cours', 'Votre commande est en route.'],
      delivered: ['Commande livrée', 'Merci ! Vous pouvez évaluer votre expérience.'],
    };
    const p = patient[to];
    if (p) await notify.user(o.userId, { type: `order.${to}`, title: p[0], message: p[1], data: { orderId } });
    if (['assigned', 'picked_up', 'delivered'].includes(to) && o.deliveryType === 'delivery') {
      await notify.pharmacy(o.pharmacyId, { type: `order.${to}`, title: `Commande ${to === 'assigned' ? 'prise en charge' : to === 'picked_up' ? 'récupérée' : 'livrée'}`, message: `La livraison est « ${to} ».`, data: { orderId } });
    }
  });

  eventBus.on('ORDER_CANCELLED', async ({ orderId, by, reason }) => {
    const o = await Order.findById(orderId).lean();
    if (!o) return;
    const why = reason ? ` Motif : ${reason}.` : '';
    if (by !== 'patient') await notify.user(o.userId, { type: 'order.cancelled', title: 'Commande annulée', message: `Votre commande a été annulée par la pharmacie.${why}`, data: { orderId } });
    if (by !== 'pharmacy') {
      const ph = await Pharmacy.findById(o.pharmacyId).select('name').lean();
      await notify.pharmacy(o.pharmacyId, { type: 'order.cancelled', title: 'Commande annulée', message: `Commande annulée (${by}). Le stock réservé a été libéré.${why}`, data: { orderId, pharmacy: ph?.name } });
    }
  });

  // Livraison / retrait terminé : encaissement des paiements en espèces et notification.
  eventBus.on('DELIVERY_COMPLETED', async ({ orderId }) => {
    await paymentService.markCashPaid(orderId);
  });

  eventBus.on('PAYMENT_CONFIRMED', async ({ orderId }) => {
    const o = await Order.findById(orderId).lean();
    if (o) await notify.user(o.userId, { type: 'payment.confirmed', title: 'Paiement confirmé', message: `Paiement de ${fcfa(o.totalAmount)} confirmé.`, data: { orderId } });
  });
}
