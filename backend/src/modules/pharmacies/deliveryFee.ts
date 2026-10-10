import { haversineKm } from '../../utils/geo';

/**
 * TARIF DE LIVRAISON À LA DISTANCE - formule simple, affichée au patient et vérifiable :
 *   frais = base + prix_par_km x max(0, distance - km_inclus), arrondi au multiple de 50 FCFA supérieur
 * distance = à vol d'oiseau entre la pharmacie et l'adresse du patient (arrondie à 0,1 km).
 * Au-delà du rayon de livraison de la pharmacie, la livraison est refusée.
 */
export const FEE_STEP = 50;

export interface FeeParams {
  deliveryFee?: number | null;
  deliveryPerKmFee?: number | null;
  deliveryIncludedKm?: number | null;
  deliveryRadiusKm?: number | null;
}

export function computeDeliveryFee(p: FeeParams, distanceKm: number): number {
  const raw = (p.deliveryFee ?? 0) + (p.deliveryPerKmFee ?? 0) * Math.max(0, distanceKm - (p.deliveryIncludedKm ?? 0));
  return Math.ceil(raw / FEE_STEP - 1e-9) * FEE_STEP || 0; // `|| 0` évite le -0 quand les frais sont nuls
}

export interface DeliveryQuote {
  distanceKm: number;
  fee: number;
  inZone: boolean;
  radiusKm: number;
  baseFee: number;
  perKmFee: number;
  includedKm: number;
}

export function deliveryQuote(p: FeeParams & { latitude: number; longitude: number }, lat: number, lng: number): DeliveryQuote {
  const distanceKm = haversineKm(p.latitude, p.longitude, lat, lng);
  const radiusKm = p.deliveryRadiusKm ?? 10;
  return {
    distanceKm,
    fee: computeDeliveryFee(p, distanceKm),
    inZone: distanceKm <= radiusKm,
    radiusKm,
    baseFee: p.deliveryFee ?? 0,
    perKmFee: p.deliveryPerKmFee ?? 0,
    includedKm: p.deliveryIncludedKm ?? 0,
  };
}
