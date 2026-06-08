// Core domain types — mirror the backend Prisma schema in SPEC.md.

export type UserRole = "user" | "admin" | "owner";
export type PlanTier = "Normal" | "Pro";
export type KycStatus = "none" | "pending" | "approved" | "rejected";
export type InvestmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "withdrawn";
export type PayoutStatus = "pending" | "approved" | "paid" | "rejected";
export type TradeDirection = "buy" | "sell";
export type EaSource = "signal" | "wickbot";
export type PoolId = "A" | "B";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  twoFactorEnabled: boolean;
  kycStatus: KycStatus;
  createdAt: string;
}

export interface PoolAllocation {
  A: number; // 0..100
  B: number; // 0..100
}

export interface Investment {
  id: string;
  userId: string;
  amount: number;
  plan: PlanTier;
  durationDays: number;
  startDate: string;
  endDate: string;
  status: InvestmentStatus;
  poolAllocation: PoolAllocation;
  currentEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface Trade {
  id: string;
  poolId: PoolId;
  investmentId: string;
  ticket: string;
  symbol: string;
  type: TradeDirection;
  lotSize: number;
  openPrice: number;
  closePrice: number | null;
  pnl: number;
  openedAt: string;
  closedAt: string | null;
  eaSource: EaSource;
}

export interface Payout {
  id: string;
  userId: string;
  investmentId: string;
  grossPnl: number;
  platformFee: number;
  netPayout: number;
  status: PayoutStatus;
  createdAt: string;
}

export interface EquityPoint {
  date: string; // ISO date
  equity: number;
}

export interface DashboardData {
  user: User;
  pnlToday: number;
  equityCurve: EquityPoint[];
  poolAllocation: PoolAllocation;
  activeInvestments: number;
  daysUntilUnlock: number;
  plan: PlanTier;
  nextUnlockDate: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  kycStatus: KycStatus;
  totalInvested: number;
  totalPnl: number;
  createdAt: string;
}

export interface AdminConfig {
  minDepositNormal: number;
  minDepositPro: number;
  platformFeePct: number;
  forcePoolAllocation: PoolAllocation | null;
}

export interface ApiError {
  message: string;
  code?: string;
}
