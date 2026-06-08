/**
 * Pool toggle / share-move atomicity tests.
 *
 * Spec: A→B transfer is atomic, totals preserved.
 *
 * The onTradeClose-style transactional helper is exercised with a mocked
 * Prisma client. We assert that the totals invariant
 *   (sum(Pool.totalUserCapital)) across A and B
 * is preserved across the move.
 */
import { movePoolShareAtomic } from '../src/pamm';
import { PrismaClient } from '@prisma/client';

jest.mock('../src/utils/prisma', () => {
  const mPrisma: any = {
    $transaction: jest.fn(),
    pool: { findUnique: jest.fn(), update: jest.fn() },
    poolShare: { findUnique: jest.fn(), update: jest.fn() },
  };
  return { prisma: mPrisma };
});

import { prisma } from '../src/utils/prisma';

const mPrisma = prisma as any;

describe('pool toggle atomicity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves a share from A to B and preserves total capital', async () => {
    mPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        poolShare: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'share-1',
            investmentId: 'inv-1',
            poolId: 'A',
            capitalInPool: 600,
            sharePct: 0.5,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        pool: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: 'A', totalUserCapital: 1000 })
            .mockResolvedValueOnce({ id: 'B', totalUserCapital: 400 }),
          update: jest.fn().mockResolvedValue({}),
        },
        pool_update_calls: [] as any[],
      };
      // capture updates via spying
      const origUpdate = tx.pool.update;
      tx.pool.update = jest.fn(async (args: any) => {
        tx.pool_update_calls.push(args);
        return origUpdate(args);
      });
      const result = await fn(tx);
      // Invariant: sum of totals across A and B stays at 1400
      const aUpdate = tx.pool_update_calls.find((c: any) => c.where.id === 'A');
      const bUpdate = tx.pool_update_calls.find((c: any) => c.where.id === 'B');
      expect(aUpdate.data.totalUserCapital).toBe(400); // 1000 - 600
      expect(bUpdate.data.totalUserCapital).toBe(1000); // 400 + 600
      // Total preserved
      expect(aUpdate.data.totalUserCapital + bUpdate.data.totalUserCapital).toBe(1400);
      return result;
    });

    const result = await movePoolShareAtomic({
      shareId: 'share-1',
      fromPoolId: 'A',
      toPoolId: 'B',
    });

    expect(result.fromPoolId).toBe('A');
    expect(result.toPoolId).toBe('B');
    expect(result.capital).toBe(600);
    expect(result.fromTotal).toBe(400);
    expect(result.toTotal).toBe(1000);
  });

  it('rejects if share is not in source pool', async () => {
    mPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        poolShare: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'share-1',
            investmentId: 'inv-1',
            poolId: 'B', // mismatched
            capitalInPool: 600,
            sharePct: 0.5,
          }),
        },
      };
      return fn(tx);
    });

    await expect(
      movePoolShareAtomic({ shareId: 'share-1', fromPoolId: 'A', toPoolId: 'B' }),
    ).rejects.toThrow('share not in source pool');
  });

  it('rejects if source pool missing', async () => {
    mPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        poolShare: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'share-1',
            investmentId: 'inv-1',
            poolId: 'A',
            capitalInPool: 600,
            sharePct: 0.5,
          }),
        },
        pool: {
          findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'B', totalUserCapital: 100 }),
        },
      };
      return fn(tx);
    });

    await expect(
      movePoolShareAtomic({ shareId: 'share-1', fromPoolId: 'A', toPoolId: 'B' }),
    ).rejects.toThrow('pool not found');
  });
});
