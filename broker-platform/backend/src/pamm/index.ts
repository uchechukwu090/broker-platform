import { prisma } from '../utils/prisma';

export interface PoolShareInput {
  id: string;
  investmentId: string;
  poolId: string;
  capitalInPool: number; // current value
  sharePct: number; // computed snapshot (not strictly needed for recompute)
}

export interface PoolInput {
  id: string;
  totalUserCapital: number; // sum of capital across active shares
  totalEquity: number; // total equity (capital + realized + unrealized)
}

export interface RecomputeResult {
  poolId: string;
  totalUserCapital: number;
  totalEquity: number;
  poolPnLPct: number;
  shares: Array<{ id: string; investmentId: string; newValue: number; sharePct: number }>;
}

/**
 * Pure function — recompute pool share values after a trade close.
 *
 *   newValue(i) = capitalInPool(i) * (1 + poolPnLPct)
 *
 *   poolPnLPct = tradePnL / totalUserCapital (before this trade)
 *
 * The function never mutates the input arrays.
 */
export function recomputePoolShares(
  pool: PoolInput,
  shares: PoolShareInput[],
  tradePnL: number,
): RecomputeResult {
  if (shares.length === 0) {
    return {
      poolId: pool.id,
      totalUserCapital: 0,
      totalEquity: 0,
      poolPnLPct: 0,
      shares: [],
    };
  }
  const capitalBefore = pool.totalUserCapital;
  const poolPnLPct = capitalBefore > 0 ? tradePnL / capitalBefore : 0;
  const factor = 1 + poolPnLPct;
  const recomputed = shares.map((s) => {
    const newValue = round2(s.capitalInPool * factor);
    return { id: s.id, investmentId: s.investmentId, newValue, sharePct: s.sharePct };
  });
  const totalUserCapital = round2(recomputed.reduce((acc, s) => acc + s.newValue, 0));
  const totalEquity = round2(totalUserCapital); // simplified: equity = user capital post-PnL
  return { poolId: pool.id, totalUserCapital, totalEquity, poolPnLPct, shares: recomputed };
}

/**
 * Persist recompute results. Wraps in a Prisma transaction so all share
 * updates and the pool total are updated atomically.
 */
export async function onTradeClose(poolId: string, tradePnL: number): Promise<RecomputeResult> {
  const pool = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error(`pool ${poolId} not found`);
  const shares = await prisma.poolShare.findMany({ where: { poolId } });
  const poolInput: PoolInput = {
    id: pool.id,
    totalUserCapital: Number(pool.totalUserCapital),
    totalEquity: Number(pool.totalEquity),
  };
  const shareInputs: PoolShareInput[] = shares.map((s) => ({
    id: s.id,
    investmentId: s.investmentId,
    poolId: s.poolId,
    capitalInPool: Number(s.capitalInPool),
    sharePct: Number(s.sharePct),
  }));
  const result = recomputePoolShares(poolInput, shareInputs, tradePnL);

  await prisma.$transaction(async (tx) => {
    for (const s of result.shares) {
      await tx.poolShare.update({
        where: { id: s.id },
        data: {
          capitalInPool: s.newValue,
          lastUpdated: new Date(),
        },
      });
    }
    await tx.pool.update({
      where: { id: poolId },
      data: {
        totalUserCapital: result.totalUserCapital,
        totalEquity: result.totalEquity,
        lastSyncedAt: new Date(),
      },
    });
  });

  return result;
}

/**
 * Move a PoolShare atomically from one pool to another. Used by Pro
 * investment pool toggle. Returns the new share record.
 */
export async function movePoolShareAtomic(params: {
  shareId: string;
  fromPoolId: string;
  toPoolId: string;
}) {
  const { shareId, fromPoolId, toPoolId } = params;
  return prisma.$transaction(async (tx) => {
    const share = await tx.poolShare.findUnique({ where: { id: shareId } });
    if (!share) throw new Error('share not found');
    if (share.poolId !== fromPoolId) throw new Error('share not in source pool');
    const [fromPool, toPool] = await Promise.all([
      tx.pool.findUnique({ where: { id: fromPoolId } }),
      tx.pool.findUnique({ where: { id: toPoolId } }),
    ]);
    if (!fromPool || !toPool) throw new Error('pool not found');

    const capital = Number(share.capitalInPool);
    const fromNewCapital = round2(Number(fromPool.totalUserCapital) - capital);
    const toNewCapital = round2(Number(toPool.totalUserCapital) + capital);

    await tx.poolShare.update({
      where: { id: share.id },
      data: { poolId: toPoolId, lastUpdated: new Date() },
    });
    await tx.pool.update({
      where: { id: fromPoolId },
      data: { totalUserCapital: fromNewCapital, lastSyncedAt: new Date() },
    });
    await tx.pool.update({
      where: { id: toPoolId },
      data: { totalUserCapital: toNewCapital, lastSyncedAt: new Date() },
    });
    return {
      shareId: share.id,
      investmentId: share.investmentId,
      fromPoolId,
      toPoolId,
      capital,
      fromTotal: fromNewCapital,
      toTotal: toNewCapital,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
