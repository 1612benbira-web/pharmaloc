import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError';

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/** Valide (et nettoie) body / query / params avec Zod. Erreur 422 si invalide. */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    const issues: { path: string; message: string }[] = [];
    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (result.success) {
        (req as unknown as Record<string, unknown>)[key] = result.data;
      } else {
        for (const i of result.error.issues) {
          issues.push({ path: `${key}.${i.path.join('.')}`.replace(/\.$/, ''), message: i.message });
        }
      }
    }
    if (issues.length) return next(AppError.validation(issues));
    next();
  };
