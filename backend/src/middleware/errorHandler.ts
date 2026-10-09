import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { isProd } from '../config/env';
import { logger } from '../utils/logger';

export const notFound: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route introuvable : ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erreur interne du serveur';
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Données invalides';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Corps JSON invalide';
  } else if (err?.type === 'entity.too.large') {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Corps de requête trop volumineux';
  } else if (err?.code === 11000) {
    status = 409;
    code = 'CONFLICT';
    message = 'Cette ressource existe déjà';
  } else if (err?.name === 'CastError') {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Identifiant invalide';
  }

  if (status >= 500) {
    logger.error('Erreur non gérée', { path: req.path, method: req.method, error: String(err?.message ?? err) });
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      // Jamais de stack trace en production
      ...(!isProd && status >= 500 && err?.stack ? { stack: err.stack } : {}),
    },
  });
};
