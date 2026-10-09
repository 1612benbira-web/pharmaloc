import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { corsOrigins, isProd } from './config/env';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiRouter } from './routes';
import { registerEventHandlers } from './events/handlers';

export function createApp() {
  registerEventHandlers();
  const app = express();

  app.disable('x-powered-by');
  // Derrière le proxy Datacloud : nécessaire pour que le rate limiting voie la vraie IP
  if (isProd) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Autorise les requêtes sans Origin (curl, health checks) et les origines listées
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
