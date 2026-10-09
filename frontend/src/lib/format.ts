export const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
export const dt = (d: string | Date) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
export const day = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', assigned: 'Livreur assigné',
  picked_up: 'Récupérée', in_delivery: 'En livraison', delivered: 'Livrée', cancelled: 'Annulée', searching: 'Recherche livreur',
};
export const ALERT_LABEL: Record<string, string> = {
  low_stock: 'Stock faible', out_of_stock: 'Rupture', expiring_soon: 'Expiration proche', expired: 'Expiré', stockout_forecast: 'Rupture prévue', anomaly: 'Anomalie',
};
export const MOVE_LABEL: Record<string, string> = {
  delivery_received: 'Réception fournisseur', sale: 'Vente', reservation: 'Réservation', cancellation: 'Annulation', adjustment: 'Ajustement', return: 'Retour', expiration: 'Expiration',
};
export const PAY_LABEL: Record<string, string> = { mobile_money: 'Mobile money (DEMO)', online: 'Carte en ligne (DEMO)', cash_on_delivery: 'À la livraison', cash_on_pickup: 'Au retrait' };
