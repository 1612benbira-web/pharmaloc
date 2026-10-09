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
