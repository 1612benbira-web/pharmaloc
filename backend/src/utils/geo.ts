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

export interface OpeningInfo {
  isOpen: boolean;
  is24h: boolean;
  /** Si ouverte : heure de fermeture (HH:MM). */
  closesAt?: string;
  /** Si fermée : prochaine heure d'ouverture (HH:MM) et dans combien de jours (0 = aujourd'hui). */
  opensAt?: string;
  opensInDays?: number;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Statut d'ouverture. Dakar est en GMT (UTC+0, sans changement d'heure) : on utilise l'heure UTC.
 * Jour = 0 (dimanche) à 6 (samedi). Une fermeture <= ouverture signifie « après minuit » (ex. 20:00 -> 02:00).
 */
export function openingInfo(p: HoursLike, now = new Date()): OpeningInfo {
  if (p.is24h) return { isOpen: true, is24h: true };
  const hours = p.openingHours ?? [];
  const range = (d: number) => {
    const h = hours.find((x) => x.day === (((d % 7) + 7) % 7));
    return h && !h.closed && h.open && h.close ? { open: h.open, close: h.close } : null;
  };
  const t = now.getUTCHours() * 60 + now.getUTCMinutes();
  const d = now.getUTCDay();
  const today = range(d);
  const yesterday = range(d - 1);

  if (today) {
    const o = toMin(today.open), c = toMin(today.close);
    if (o < c ? t >= o && t < c : t >= o) return { isOpen: true, is24h: false, closesAt: today.close };
  }
  if (yesterday) {
    const o = toMin(yesterday.open), c = toMin(yesterday.close);
    if (c <= o && t < c) return { isOpen: true, is24h: false, closesAt: yesterday.close }; // ouverture débordant après minuit
  }
  if (today && t < toMin(today.open)) return { isOpen: false, is24h: false, opensAt: today.open, opensInDays: 0 };
  for (let i = 1; i <= 7; i++) {
    const next = range(d + i);
    if (next) return { isOpen: false, is24h: false, opensAt: next.open, opensInDays: i };
  }
  return { isOpen: false, is24h: false };
}

export const isOpenNow = (p: HoursLike, now = new Date()): boolean => openingInfo(p, now).isOpen;
