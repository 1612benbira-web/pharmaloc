/** Accepte « 2028-04 » (=> dernier jour du mois, fin de journée UTC) ou une date ISO complète. */
export function parseExpiration(v: string): Date | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0, 23, 59, 59, 999));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const startOfDayUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Liste des N derniers jours (YYYY-MM-DD), du plus ancien au plus récent. */
export function lastDays(n: number, now = new Date()): string[] {
  const start = startOfDayUTC(now).getTime();
  return Array.from({ length: n }, (_, i) => dayKey(new Date(start - (n - 1 - i) * 86_400_000)));
}
