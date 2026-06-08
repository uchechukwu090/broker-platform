/**
 * Plan validation tests.
 *
 * Spec: $50 normal rejected, $50 owner accepted.
 */
import { validateInvestmentAmount, validateDurationDays, resolveAllocation, PLANS, getPlan } from '../src/pools/plans';
import { HttpError } from '../src/middleware/error';

describe('plans validation', () => {
  it('rejects $50 normal (below $100 min)', () => {
    expect(() => validateInvestmentAmount('normal', 50, { bypassMinDeposit: false })).toThrow(HttpError);
  });

  it('accepts $50 for owner (bypass)', () => {
    expect(() => validateInvestmentAmount('normal', 50, { bypassMinDeposit: true })).not.toThrow();
  });

  it('accepts $100 normal at the boundary', () => {
    expect(() => validateInvestmentAmount('normal', 100, { bypassMinDeposit: false })).not.toThrow();
  });

  it('rejects $500 pro (below $1000 min)', () => {
    expect(() => validateInvestmentAmount('pro', 500, { bypassMinDeposit: false })).toThrow(HttpError);
  });

  it('accepts $500 pro for owner', () => {
    expect(() => validateInvestmentAmount('pro', 500, { bypassMinDeposit: true })).not.toThrow();
  });

  it('default allocation: normal → A 100%', () => {
    expect(resolveAllocation('normal', null)).toEqual({ A: 1.0, B: 0.0 });
  });

  it('default allocation: pro → A 50% / B 50%', () => {
    const a = resolveAllocation('pro', null);
    expect(a.A).toBeCloseTo(0.5, 6);
    expect(a.B).toBeCloseTo(0.5, 6);
  });

  it('override allocation summing to 1.0 is accepted', () => {
    expect(resolveAllocation('pro', { A: 0.3, B: 0.7 })).toEqual({ A: 0.3, B: 0.7 });
  });

  it('override allocation not summing to 1.0 is rejected', () => {
    expect(() => resolveAllocation('pro', { A: 0.3, B: 0.6 })).toThrow(HttpError);
  });

  it('plan config exposes expected fields', () => {
    const cfg = getPlan('normal');
    expect(cfg.name).toBe('normal');
    expect(cfg.minDays).toBe(3);
  });
});
