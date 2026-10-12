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

export interface OpenStatus { isOpen: boolean; is24h?: boolean; closesAt?: string; opensAt?: string; opensInDays?: number }
export const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 🟢 Ouverte jusqu'à 20:00 » / « ⚪ Fermée · ouvre demain à 08:00 » (Dakar = UTC). */
export function openLabel(s?: OpenStatus | null, fallbackOpen?: boolean): string {
  if (!s) return fallbackOpen ? '🟢 Ouverte' : '⚪ Fermée';
  if (s.is24h) return '🟢 Ouverte 24 h/24';
  if (s.isOpen) return `🟢 Ouverte jusqu’à ${s.closesAt}`;
  if (s.opensAt) {
    const n = s.opensInDays ?? 0;
    const when = n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : DAY_NAMES[(new Date().getUTCDay() + n) % 7];
    return `⚪ Fermée · ouvre ${when} à ${s.opensAt}`;
  }
  return '⚪ Fermée';
}

/** Liens d'appel : tel: garde le +, WhatsApp veut des chiffres seuls (numéro local à 9 chiffres => indicatif 221). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export function waHref(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = `221${d}`;
  return `https://wa.me/${d}`;
}
