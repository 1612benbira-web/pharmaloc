/**
 * Données personnelles du patient visibles UNIQUEMENT du patient et du livreur assigné :
 * position partagée, numéro de téléphone partagé. Jamais de la pharmacie ni de l'admin.
 * Effacées dès la fin de la livraison ou à l'annulation (minimisation des données).
 */
export const PRIVATE_FIELDS = [
  'patientLatitude', 'patientLongitude', 'patientLocationAccuracy', 'patientLocationAt',
  'patientPhone', 'patientPhoneSharedAt',
] as const;

/** Tout ce qui est effacé en fin de livraison (y compris l'état de la demande de numéro). */
export const UNSET_PRIVATE = {
  patientLatitude: 1, patientLongitude: 1, patientLocationAccuracy: 1, patientLocationAt: 1,
  patientPhone: 1, patientPhoneSharedAt: 1, phoneRequestStatus: 1, phoneRequestedAt: 1, phoneRequestCount: 1,
};
