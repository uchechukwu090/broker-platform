import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { logger } from './utils/logger';
import authRoutes from './auth/routes';
import investmentRoutes from './investments/routes';
import webhookRoutes from './webhooks/routes';
import eaRoutes from './ea/routes';
import adminRoutes from './admin/routes';
import { errorHandler, notFound } from './middleware/error';
import { generalRateLimiter } from './utils/http';

export function buildApp() {
  const app = express();

  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(generalRateLimiter());

  // Capture raw body for HMAC verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString('utf8');
      },
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/investments', investmentRoutes);
  app.use('/api/v1', webhookRoutes); // /api/v1/signals
  app.use('/api/v1/ea', eaRoutes);
  app.use('/api/v1/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  app.use((err: any, _req: any, res: any, _next: any) => {
    logger.error({ err }, 'express error');
  });

  return app;
}
