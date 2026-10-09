import type { Request } from 'express';
import { z } from 'zod';

/** Lecture typée de req.query après validation Zod. */
export const Q = <T>(req: Request) => req.query as unknown as T;
export const boolish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
export const numeric = z.coerce.number().finite();
