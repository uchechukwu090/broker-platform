import { config } from '../config';
import { HttpError } from '../middleware/error';
import type { Plan } from '@prisma/client';

export interface PlanConfig {
  name: Plan;
  minDeposit: number;
  split: number; // user's share of PnL
  defaultAllocation: Record<string, number>; // pool id -> percent
  minDays: number;
}

export const PLANS: Record<Plan, PlanConfig> = {
  normal: {
    name: 'normal',
    minDeposit: config.PLAN_NORMAL_MIN,
    split: config.SPLIT_NORMAL,
    defaultAllocation: { A: 1.0, B: 0.0 },
    minDays: config.MIN_INVEST_DAYS,
  },
  pro: {
    name: 'pro',
    minDeposit: config.PLAN_PRO_MIN,
    split: config.SPLIT_PRO,
    defaultAllocation: { A: 0.5, B: 0.5 },
    minDays: config.MIN_INVEST_DAYS,
  },
};

export function getPlan(plan: Plan): PlanConfig {
  return PLANS[plan];
}

export function validateInvestmentAmount(plan: Plan, amount: number, opts: { bypassMinDeposit?: boolean }) {
  const cfg = PLANS[plan];
  if (!opts.bypassMinDeposit && amount < cfg.minDeposit) {
    throw new HttpError(400, 'BelowMinimumDeposit', {
      plan,
      min: cfg.minDeposit,
      provided: amount,
    });
  }
}

export function validateDurationDays(days: number) {
  if (days < config.MIN_INVEST_DAYS) {
    throw new HttpError(400, 'BelowMinimumDuration', {
      min: config.MIN_INVEST_DAYS,
      provided: days,
    });
  }
}

export function resolveAllocation(
  plan: Plan,
  override: Record<string, number> | null | undefined,
): Record<string, number> {
  if (override) {
    // Validate override sums to 1.0
    const total = Object.values(override).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.0001) {
      throw new HttpError(400, 'InvalidAllocation', { total });
    }
    return override;
  }
  return { ...PLANS[plan].defaultAllocation };
}
