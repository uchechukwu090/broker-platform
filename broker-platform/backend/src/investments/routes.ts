import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { HttpError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import {
  validateInvestmentAmount,
  validateDurationDays,
  resolveAllocation,
  getPlan,
} from '../pools/plans';
import { movePoolShareAtomic } from '../pamm';
import { config } from '../config';

const router = Router();

const CreateSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  plan: z.enum(['normal', 'pro']),
  durationDays: z.number().int().positive().max(3650),
  forcePoolAllocation: z.record(z.string(), z.number()).optional(),
});

router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const body = CreateSchema.parse(req.body);
    const { amount, plan, durationDays } = body;
    validateInvestmentAmount(plan, amount, { bypassMinDeposit: !!req.user.bypassMinDeposit });
    validateDurationDays(durationDays);
    const allocation = resolveAllocation(plan, req.user.forcePoolAllocation ?? body.forcePoolAllocation);

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.investment.create({
        data: {
          userId: req.user!.id,
          amount,
          plan,
          durationDays,
          startDate,
          endDate,
          status: 'active',
          poolAllocation: allocation,
        },
      });
      // Create PoolShare rows and bump pool.totalUserCapital
      for (const [poolId, pct] of Object.entries(allocation)) {
        const capital = round2(amount * pct);
        await tx.poolShare.create({
          data: {
            investmentId: inv.id,
            poolId,
            capitalInPool: capital,
            sharePct: pct,
          },
        });
        await tx.pool.update({
          where: { id: poolId },
          data: {
            totalUserCapital: { increment: capital },
            lastSyncedAt: new Date(),
          },
        });
      }
      return inv;
    });

    await writeAudit({
      actorId: req.user.id,
      action: 'investment.create',
      target: result.id,
      after: { amount, plan, durationDays, allocation, status: 'active' },
    });
    res.status(201).json({ investment: result });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const list = await prisma.investment.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { poolShares: true },
    });
    res.json({ investments: list });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const inv = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { poolShares: true, payouts: true },
    });
    if (!inv) throw new HttpError(404, 'NotFound');
    res.json({ investment: inv });
  } catch (err) {
    next(err);
  }
});

// ---- Pause / Resume ----

router.post('/:id/pause', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const inv = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!inv) throw new HttpError(404, 'NotFound');
    if (inv.status !== 'active') {
      throw new HttpError(400, 'InvalidStatusTransition', { from: inv.status, to: 'paused' });
    }
    const updated = await prisma.investment.update({
      where: { id: inv.id },
      data: { status: 'paused' },
    });
    await writeAudit({
      actorId: req.user.id,
      action: 'investment.pause',
      target: inv.id,
      before: { status: 'active' },
      after: { status: 'paused' },
    });
    res.json({ investment: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resume', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const inv = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!inv) throw new HttpError(404, 'NotFound');
    if (inv.status !== 'paused') {
      throw new HttpError(400, 'InvalidStatusTransition', { from: inv.status, to: 'active' });
    }
    const updated = await prisma.investment.update({
      where: { id: inv.id },
      data: { status: 'active' },
    });
    await writeAudit({
      actorId: req.user.id,
      action: 'investment.resume',
      target: inv.id,
      before: { status: 'paused' },
      after: { status: 'active' },
    });
    res.json({ investment: updated });
  } catch (err) {
    next(err);
  }
});

// ---- Pool toggle (Pro only) ----

router.post('/:id/toggle-pool', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const inv = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { poolShares: true },
    });
    if (!inv) throw new HttpError(404, 'NotFound');
    if (inv.plan !== 'pro') throw new HttpError(400, 'PoolToggleRequiresPro');

    // Find the share and pick the other pool
    const share = inv.poolShares[0];
    if (!share) throw new HttpError(400, 'NoPoolShare');
    const otherPool = share.poolId === 'A' ? 'B' : 'A';

    const before = { poolId: share.poolId, capital: Number(share.capitalInPool) };
    const result = await movePoolShareAtomic({
      shareId: share.id,
      fromPoolId: share.poolId,
      toPoolId: otherPool,
    });
    await writeAudit({
      actorId: req.user.id,
      action: 'investment.togglePool',
      target: inv.id,
      before,
      after: { poolId: otherPool, capital: result.capital, fromTotal: result.fromTotal, toTotal: result.toTotal },
    });
    res.json({ ok: true, from: share.poolId, to: otherPool });
  } catch (err) {
    next(err);
  }
});

// ---- Withdraw ----

router.get('/:id/withdraw-preview', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const inv = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { poolShares: true },
    });
    if (!inv) throw new HttpError(404, 'NotFound');
    const now = new Date();
    const locked = now < inv.endDate;
    const planCfg = getPlan(inv.plan);
    const totalCapital = inv.poolShares.reduce((a, s) => a + Number(s.capitalInPool), 0);
    const initialCapital = Number(inv.amount);
    const userPnL = totalCapital - initialCapital;
    const platformFee = round2(Math.max(0, userPnL) * config.PLATFORM_FEE_PCT);
    const userShare = round2(userPnL * planCfg.split);
    const netPayout = round2(totalCapital + userShare - platformFee);
    res.json({
      investmentId: inv.id,
      locked,
      endDate: inv.endDate,
      totalCapital,
      userPnL,
      platformFee,
      userShare,
      netPayout,
      status: inv.status,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/withdraw', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const inv = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { poolShares: true },
    });
    if (!inv) throw new HttpError(404, 'NotFound');
    if (!['active', 'completed'].includes(inv.status)) {
      throw new HttpError(400, 'InvalidStatusForWithdraw', { status: inv.status });
    }
    const now = new Date();
    if (now < inv.endDate) {
      res.status(423).json({
        error: 'Locked',
        reason: 'InvestmentNotMatured',
        endDate: inv.endDate,
      });
      return;
    }
    const planCfg = getPlan(inv.plan);
    const totalCapital = inv.poolShares.reduce((a, s) => a + Number(s.capitalInPool), 0);
    const initialCapital = Number(inv.amount);
    const grossPnl = round2(totalCapital - initialCapital);
    const platformFee = round2(Math.max(0, grossPnl) * config.PLATFORM_FEE_PCT);
    const userShare = round2(grossPnl * planCfg.split);
    const netPayout = round2(initialCapital + userShare - platformFee);

    const result = await prisma.$transaction(async (tx) => {
      // Decrement pool totals
      for (const share of inv.poolShares) {
        await tx.pool.update({
          where: { id: share.poolId },
          data: {
            totalUserCapital: { decrement: Number(share.capitalInPool) },
            lastSyncedAt: new Date(),
          },
        });
      }
      const payout = await tx.payout.create({
        data: {
          userId: req.user!.id,
          investmentId: inv.id,
          grossPnl,
          platformFee,
          netPayout,
          status: 'pending',
        },
      });
      await tx.investment.update({
        where: { id: inv.id },
        data: { status: 'withdrawn' },
      });
      return payout;
    });

    await writeAudit({
      actorId: req.user.id,
      action: 'investment.withdraw',
      target: inv.id,
      before: { status: inv.status },
      after: { status: 'withdrawn', payoutId: result.id, netPayout },
    });
    res.status(201).json({ payout: result });
  } catch (err) {
    next(err);
  }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default router;
