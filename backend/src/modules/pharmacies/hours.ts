import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure au format HH:MM attendue');

/** Un jour : soit fermé, soit une ouverture ET une fermeture différentes (fermeture <= ouverture = après minuit). */
export const dayHoursSchema = z
  .object({ day: z.number().int().min(0).max(6), open: hhmm.optional(), close: hhmm.optional(), closed: z.boolean().optional() })
  .strict()
  .superRefine((h, ctx) => {
    if (h.closed) return;
    if (!h.open || !h.close) ctx.addIssue({ code: 'custom', path: ['open'], message: 'Heures d’ouverture et de fermeture requises (ou marquer le jour fermé)' });
    else if (h.open === h.close) ctx.addIssue({ code: 'custom', path: ['close'], message: 'La fermeture doit être différente de l’ouverture' });
  });

/** Horaires de la semaine : 7 jours maximum, un seul enregistrement par jour (0 = dimanche … 6 = samedi). */
export const openingHoursSchema = z.array(dayHoursSchema).max(7).superRefine((days, ctx) => {
  const seen = new Set<number>();
  days.forEach((h, i) => {
    if (seen.has(h.day)) ctx.addIssue({ code: 'custom', path: [i, 'day'], message: 'Jour en double' });
    seen.add(h.day);
  });
});
