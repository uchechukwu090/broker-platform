import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { hmacVerify } from '../middleware/hmac';
import { config } from '../config';
import { prisma } from '../utils/prisma';
import { getRedis } from '../utils/redis';
import { onTradeClose } from '../pamm';
import { HttpError } from '../middleware/error';

const router = Router();

const eaLimiter = rateLimit({
  windowMs: 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  handler: (_req, res) => res.status(429).json({ error: 'TooManyRequests' }),
});

function getPoolSecret(req: Request): string | null {
  const pool = (req.body?.pool || req.query?.pool) as string | undefined;
  if (pool === 'A') return config.POOL_A_HMAC_SECRET;
  if (pool === 'B') return config.POOL_B_HMAC_SECRET;
  return null;
}

// ---- Trade Opened ----
const OpenedSchema = z.object({
  pool: z.enum(['A', 'B']),
  ticket: z.string().min(1),
  symbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  lotSize: z.number().positive(),
  openPrice: z.number().positive(),
  sl: z.number().positive().optional(),
  tp: z.number().positive().optional(),
  eaSource: z.enum(['signal', 'wickbot']).default('signal'),
  openedAt: z.string().datetime().optional(),
});

router.post(
  '/trade-opened',
  eaLimiter,
  hmacVerify(getPoolSecret),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = OpenedSchema.parse(req.body);
      const trade = await prisma.trade.upsert({
        where: { poolId_ticket: { poolId: body.pool, ticket: body.ticket } },
        update: {
          symbol: body.symbol,
          type: body.type,
          lotSize: body.lotSize,
          openPrice: body.openPrice,
          sl: body.sl,
          tp: body.tp,
          eaSource: body.eaSource,
        },
        create: {
          poolId: body.pool,
          ticket: body.ticket,
          symbol: body.symbol,
          type: body.type,
          lotSize: body.lotSize,
          openPrice: body.openPrice,
          sl: body.sl,
          tp: body.tp,
          eaSource: body.eaSource,
          openedAt: body.openedAt ? new Date(body.openedAt) : new Date(),
        },
      });
      res.json({ ok: true, tradeId: trade.id });
    } catch (err) {
      next(err);
    }
  },
);

// ---- Trade Closed ----
const ClosedSchema = z.object({
  pool: z.enum(['A', 'B']),
  ticket: z.string().min(1),
  closePrice: z.number().nonnegative(),
  pnl: z.number(),
  closedAt: z.string().datetime().optional(),
});

router.post(
  '/trade-closed',
  eaLimiter,
  hmacVerify(getPoolSecret),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = ClosedSchema.parse(req.body);
      const existing = await prisma.trade.findUnique({
        where: { poolId_ticket: { poolId: body.pool, ticket: body.ticket } },
      });
      if (!existing) throw new HttpError(404, 'TradeNotFound');
      if (existing.closedAt) {
        return res.json({ ok: true, alreadyClosed: true });
      }
      await prisma.trade.update({
        where: { id: existing.id },
        data: {
          closePrice: body.closePrice,
          pnl: body.pnl,
          closedAt: body.closedAt ? new Date(body.closedAt) : new Date(),
        },
      });
      // Trigger PAMM recompute
      const recompute = await onTradeClose(body.pool, body.pnl);
      res.json({ ok: true, recompute });
    } catch (err) {
      next(err);
    }
  },
);

// ---- Pending Signals ----
router.get(
  '/signals/pending',
  eaLimiter,
  hmacVerify(getPoolSecret),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pool = String(req.query.pool || (req.body && req.body.pool) || '');
      if (pool !== 'A' && pool !== 'B') throw new HttpError(400, 'PoolRequired');
      const redis = getRedis();
      const queueKey = `signals:queue:${pool}`;
      const items = await redis.lrange(queueKey, 0, -1);
      if (items.length === 0) {
        return res.json({ pool, signals: [] });
      }
      // Mark dispatched
      await redis.del(queueKey);
      const parsed = items.map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      }).filter(Boolean);
      if (parsed.length) {
        const ids = parsed.map((p: any) => p.id).filter(Boolean);
        if (ids.length) {
          await prisma.signal.updateMany({
            where: { id: { in: ids } },
            data: { status: 'dispatched', dispatchedTo: `ea-pool-${pool}` },
          });
        }
      }
      res.json({ pool, signals: parsed });
    } catch (err) {
      next(err);
    }
  },
);

// ---- Investment Status ----
router.get(
  '/investments/status',
  eaLimiter,
  hmacVerify(getPoolSecret),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pool = String(req.query.pool || (req.body && req.body.pool) || '');
      if (pool !== 'A' && pool !== 'B') throw new HttpError(400, 'PoolRequired');
      const shares = await prisma.poolShare.findMany({
        where: { poolId: pool },
        include: { investment: { select: { id: true, status: true } } },
      });
      const list = shares.map((s) => ({
        investmentId: s.investment.id,
        status: s.investment.status,
      }));
      res.json({ pool, investments: list });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
