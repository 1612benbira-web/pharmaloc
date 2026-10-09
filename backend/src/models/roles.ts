export const ROLES = ['PATIENT', 'PHARMACIST', 'DELIVERY_AGENT', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];
