import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export function signalRateLimiter() {
  return rateLimit({
    windowMs: 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.ip || 'unknown',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: 'TooManyRequests' });
    },
  });
}

export function generalRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: 'TooManyRequests' });
    },
  });
}
