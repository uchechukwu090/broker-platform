import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import { HttpError } from '../middleware/error';

const router = Router();

router.use(requireAuth, requireRole('admin', 'owner'));

router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        plan: true,
        twoFactorEnabled: true,
        kycStatus: true,
        createdAt: true,
      },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

const UpdateUserSchema = z.object({
  role: z.enum(['user', 'admin', 'owner']).optional(),
  plan: z.enum(['normal', 'pro']).optional(),
  kycStatus: z.enum(['none', 'pending', 'verified', 'rejected']).optional(),
});

router.patch('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, 'NotFound');
    const data = UpdateUserSchema.parse(req.body);
    const after = await prisma.user.update({ where: { id: req.params.id }, data });
    await writeAudit({
      actorId: req.user.id,
      action: 'user.update',
      target: after.id,
      before: { role: before.role, plan: before.plan, kycStatus: before.kycStatus },
      after: { role: after.role, plan: after.plan, kycStatus: after.kycStatus },
    });
    res.json({ user: after });
  } catch (err) {
    next(err);
  }
});

router.get('/payouts', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const payouts = await prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true } }, investment: { select: { id: true } } },
    });
    res.json({ payouts });
  } catch (err) {
    next(err);
  }
});

const PayoutStatusSchema = z.object({ status: z.enum(['pending', 'approved', 'paid']) });

router.patch('/payouts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const before = await prisma.payout.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, 'NotFound');
    const { status } = PayoutStatusSchema.parse(req.body);
    const after = await prisma.payout.update({ where: { id: req.params.id }, data: { status } });
    await writeAudit({
      actorId: req.user.id,
      action: 'payout.statusChange',
      target: after.id,
      before: { status: before.status },
      after: { status: after.status },
    });
    res.json({ payout: after });
  } catch (err) {
    next(err);
  }
});

router.get('/audit', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

router.get('/pools', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pools = await prisma.pool.findMany();
    res.json({ pools });
  } catch (err) {
    next(err);
  }
});

export default router;
