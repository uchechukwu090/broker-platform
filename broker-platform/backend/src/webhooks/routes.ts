import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { hmacVerify } from '../middleware/hmac';
import { config } from '../config';
import { signalRateLimiter } from '../utils/http';
import { getRedis } from '../utils/redis';
import { prisma } from '../utils/prisma';
import { HttpError } from '../middleware/error';

const router = Router();

const SignalSchema = z.object({
  symbol: z.string().min(1).max(32),
  type: z.enum(['BUY', 'SELL']),
  entry: z.number().positive(),
  sl: z.number().positive(),
  tp: z.number().positive(),
  source: z.string().optional(),
  pool: z.enum(['A', 'B']).optional().default('A'),
  meta: z.record(z.any()).optional(),
});

router.post(
  '/signals',
  signalRateLimiter(),
  hmacVerify(() => config.EA_HMAC_SECRET_SIGNAL),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = (req as any).rawBody ?? '';
      let parsed: z.infer<typeof SignalSchema>;
      try {
        parsed = SignalSchema.parse(req.body ?? {});
      } catch (e) {
        throw new HttpError(400, 'InvalidSignalPayload', (e as Error).message);
      }

      const signal = await prisma.signal.create({
        data: {
          poolId: parsed.pool,
          source: parsed.source || 'external',
          symbol: parsed.symbol,
          type: parsed.type,
          entry: parsed.entry,
          sl: parsed.sl,
          tp: parsed.tp,
          raw: parsed.meta ?? parsed,
          status: 'queued',
        },
      });

      const redis = getRedis();
      const queueKey = `signals:queue:${parsed.pool}`;
      await redis.lpush(queueKey, JSON.stringify({ id: signal.id, ...parsed }));

      res.status(202).json({ ok: true, signalId: signal.id, pool: parsed.pool });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
