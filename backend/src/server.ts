import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';
import { stockService } from './modules/stock/stock.service';
import { alertService } from './modules/stock/alert.service';
import { Stock } from './models/Stock';

async function main() {
  await connectDb();
  const server = createApp().listen(env.PORT, () => logger.info(`PharmaLoc API démarrée sur le port ${env.PORT}`));

  // Tâche planifiée : retire les lots expirés et recalcule alertes + prévisions (toutes les 15 min)
  const job = setInterval(async () => {
    try {
      await stockService.sweepExpired();
      for (const s of await Stock.find().select('_id').lean()) await alertService.refresh(String(s._id));
    } catch (err) {
      logger.error('Tâche planifiée en échec', { error: String(err) });
    }
  }, 15 * 60 * 1000);
  job.unref();

  const shutdown = async (signal: string) => {
    logger.info(`Arrêt (${signal})`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Démarrage impossible', { error: String(err?.message ?? err) });
  process.exit(1);
});
