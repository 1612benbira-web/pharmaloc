import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, '8 caractères minimum')
  .max(72, '72 caractères maximum')
  .regex(/[A-Za-z]/, 'Doit contenir une lettre')
  .regex(/[0-9]/, 'Doit contenir un chiffre');

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{8,15}$/, 'Numéro de téléphone invalide')
  .optional();

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Email invalide').max(254),
    password: passwordSchema,
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    phone: phoneSchema,
  })
  .strict(); // refuse tout champ inconnu (ex: "role")

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Email invalide'),
    password: z.string().min(1).max(72),
  })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(10) }).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

const phoneRequired = z.string().trim().regex(/^\+?[0-9 ]{8,15}$/, 'Numéro de téléphone invalide');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure HH:MM attendue');

/** Demande d'inscription d'une pharmacie : compte pharmacien + fiche pharmacie, EN ATTENTE de validation admin. */
export const registerPharmacySchema = registerSchema
  .extend({
    phone: phoneRequired,
    pharmacy: z
      .object({
        name: z.string().trim().min(2).max(120),
        licenseNumber: z.string().trim().min(3, 'Numéro d’agrément requis').max(60),
        address: z.string().trim().min(3).max(200),
        city: z.string().trim().min(2).max(80),
        neighborhood: z.string().trim().max(80).optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        phone: z.string().trim().max(30).optional(),
        is24h: z.boolean().optional(),
        openingHours: z
          .array(z.object({ day: z.number().int().min(0).max(6), open: hhmm.optional(), close: hhmm.optional(), closed: z.boolean().optional() }))
          .max(7)
          .optional(),
        offersDelivery: z.boolean().optional(),
        offersPickup: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

/** Demande d'inscription d'un livreur : compte EN ATTENTE de validation admin. */
export const registerCourierSchema = registerSchema
  .extend({ phone: phoneRequired, vehicle: z.string().trim().min(2).max(40) })
  .strict();

export type RegisterPharmacyInput = z.infer<typeof registerPharmacySchema>;
export type RegisterCourierInput = z.infer<typeof registerCourierSchema>;
