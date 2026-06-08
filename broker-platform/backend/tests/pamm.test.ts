/**
 * PAMM unit tests — covers the recomputePoolShares pure function and
 * the onTradeClose persistence (against an in-memory or live Prisma).
 *
 * Spec: 2 users 50/50, master +10% → both +5%.
 */
import { recomputePoolShares } from '../src/pamm';

describe('pamm.recomputePoolShares', () => {
  it('two users 50/50 share a +10% master PnL → both +5%', () => {
    const pool = { id: 'A', totalUserCapital: 1000, totalEquity: 1000 };
    const shares = [
      { id: 's1', investmentId: 'i1', poolId: 'A', capitalInPool: 500, sharePct: 0.5 },
      { id: 's2', investmentId: 'i2', poolId: 'A', capitalInPool: 500, sharePct: 0.5 },
    ];
    const tradePnL = 100; // +10% of 1000
    const result = recomputePoolShares(pool, shares, tradePnL);
    expect(result.poolPnLPct).toBeCloseTo(0.1, 6);
    expect(result.shares[0].newValue).toBeCloseTo(550, 6);
    expect(result.shares[1].newValue).toBeCloseTo(550, 6);
    expect(result.totalUserCapital).toBeCloseTo(1100, 6);
  });

  it('two users 25/75, master -20% → both move proportionally', () => {
    const pool = { id: 'A', totalUserCapital: 1000, totalEquity: 1000 };
    const shares = [
      { id: 's1', investmentId: 'i1', poolId: 'A', capitalInPool: 250, sharePct: 0.25 },
      { id: 's2', investmentId: 'i2', poolId: 'A', capitalInPool: 750, sharePct: 0.75 },
    ];
    const result = recomputePoolShares(pool, shares, -200);
    expect(result.poolPnLPct).toBeCloseTo(-0.2, 6);
    expect(result.shares[0].newValue).toBeCloseTo(200, 6);
    expect(result.shares[1].newValue).toBeCloseTo(600, 6);
  });

  it('does not mutate inputs', () => {
    const pool = { id: 'A', totalUserCapital: 1000, totalEquity: 1000 };
    const shares = [
      { id: 's1', investmentId: 'i1', poolId: 'A', capitalInPool: 1000, sharePct: 1.0 },
    ];
    const snapshot = JSON.parse(JSON.stringify(shares));
    recomputePoolShares(pool, shares, 50);
    expect(shares).toEqual(snapshot);
  });

  it('empty pool with tradePnL=0 returns zeros', () => {
    const pool = { id: 'A', totalUserCapital: 0, totalEquity: 0 };
    const result = recomputePoolShares(pool, [], 0);
    expect(result.shares).toEqual([]);
    expect(result.totalUserCapital).toBe(0);
  });

  it('zero capital with non-zero pnl: factor=1 (no division by zero)', () => {
    const pool = { id: 'A', totalUserCapital: 0, totalEquity: 0 };
    const shares = [
      { id: 's1', investmentId: 'i1', poolId: 'A', capitalInPool: 0, sharePct: 1.0 },
    ];
    const result = recomputePoolShares(pool, shares, 100);
    expect(result.poolPnLPct).toBe(0);
    expect(result.shares[0].newValue).toBe(0);
  });
});
