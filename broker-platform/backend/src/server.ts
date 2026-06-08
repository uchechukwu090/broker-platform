import { buildApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { closeRedis, getRedis } from './utils/redis';
import { prisma } from './utils/prisma';

async function main() {
  const app = buildApp();
  // Touch redis to fail-fast if down
  try {
    await getRedis().ping();
    logger.info('redis connected');
  } catch (err) {
    logger.warn({ err }, 'redis not available at boot — continuing');
  }

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'http server listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => logger.info('http server closed'));
    try {
      await closeRedis();
    } catch (e) {
      logger.error({ err: e }, 'redis close error');
    }
    try {
      await prisma.$disconnect();
    } catch (e) {
      logger.error({ err: e }, 'prisma disconnect error');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
