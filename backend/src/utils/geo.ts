/** Distance en km (formule de Haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

interface HoursLike {
  is24h?: boolean | null;
  openingHours?: { day: number; open?: string | null; close?: string | null; closed?: boolean | null }[] | null;
}

/** Dakar est en GMT (UTC+0, sans changement d'heure) : on utilise l'heure UTC. */
export function isOpenNow(p: HoursLike, now = new Date()): boolean {
  if (p.is24h) return true;
  const today = p.openingHours?.find((h) => h.day === now.getUTCDay());
  if (!today || today.closed || !today.open || !today.close) return false;
  const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  return hhmm >= today.open && hhmm < today.close;
}
