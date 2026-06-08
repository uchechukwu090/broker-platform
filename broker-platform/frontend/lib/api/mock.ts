// Mock data layer used when the backend is not reachable.
// All shapes match lib/types.ts (Prisma-aligned).

import type {
  AdminConfig,
  AdminUserRow,
  AuditLogEntry,
  DashboardData,
  EquityPoint,
  Investment,
  PoolAllocation,
  Payout,
  Trade,
  User,
} from "@/lib/types";

// ---- Mock store (mutable) ------------------------------------------------

const NOW = () => new Date();

function isoDaysAgo(days: number): string {
  const d = NOW();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function isoDaysAhead(days: number): string {
  const d = NOW();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const MOCK_USER: User = {
  id: "u_demo_001",
  email: "demo@broker.local",
  role: "owner",
  plan: "Pro",
  twoFactorEnabled: false,
  kycStatus: "approved",
  createdAt: isoDaysAgo(45),
};

const MOCK_NORMAL_USER: User = {
  ...MOCK_USER,
  id: "u_normal_002",
  email: "alice@broker.local",
  role: "user",
  plan: "Normal",
};

const MOCK_INVESTMENTS: Investment[] = [
  {
    id: "inv_001",
    userId: MOCK_USER.id,
    amount: 2500,
    plan: "Pro",
    durationDays: 14,
    startDate: isoDaysAgo(5),
    endDate: isoDaysAhead(9),
    status: "active",
    poolAllocation: { A: 50, B: 50 },
    currentEquity: 2684.32,
    realizedPnl: 184.32,
    unrealizedPnl: 0,
  },
  {
    id: "inv_002",
    userId: MOCK_USER.id,
    amount: 1000,
    plan: "Normal",
    durationDays: 7,
    startDate: isoDaysAgo(20),
    endDate: isoDaysAgo(13),
    status: "withdrawn",
    poolAllocation: { A: 100, B: 0 },
    currentEquity: 1083.5,
    realizedPnl: 83.5,
    unrealizedPnl: 0,
  },
  {
    id: "inv_003",
    userId: MOCK_NORMAL_USER.id,
    amount: 500,
    plan: "Normal",
    durationDays: 10,
    startDate: isoDaysAgo(2),
    endDate: isoDaysAhead(8),
    status: "active",
    poolAllocation: { A: 100, B: 0 },
    currentEquity: 512.4,
    realizedPnl: 12.4,
    unrealizedPnl: 0,
  },
];

const SYMBOLS_POOL_A = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"];
const SYMBOLS_POOL_B = ["XAUUSD"];

function makeTrades(investmentId: string, count: number, poolId: "A" | "B"): Trade[] {
  const symbols = poolId === "A" ? SYMBOLS_POOL_A : SYMBOLS_POOL_B;
  const out: Trade[] = [];
  for (let i = 0; i < count; i++) {
    const sym = symbols[i % symbols.length];
    const dir = i % 2 === 0 ? "buy" : "sell";
    const pnl = (Math.random() - 0.45) * 80;
    const open = 1.05 + Math.random() * 100;
    const close = open + (Math.random() - 0.5) * 2;
    out.push({
      id: `trd_${poolId}_${investmentId}_${i}`,
      poolId,
      investmentId,
      ticket: `${poolId}${100000 + i}`,
      symbol: sym,
      type: dir,
      lotSize: Number((0.05 + Math.random() * 0.5).toFixed(2)),
      openPrice: Number(open.toFixed(4)),
      closePrice: Number(close.toFixed(4)),
      pnl: Number(pnl.toFixed(2)),
      openedAt: isoDaysAgo(5 - i * 0.2),
      closedAt: isoDaysAgo(4 - i * 0.2),
      eaSource: poolId === "A" ? "signal" : "wickbot",
    });
  }
  return out;
}

const MOCK_TRADES: Trade[] = [
  ...makeTrades("inv_001", 8, "A"),
  ...makeTrades("inv_001", 6, "B"),
  ...makeTrades("inv_002", 4, "A"),
  ...makeTrades("inv_003", 3, "A"),
];

const MOCK_PAYOUTS: Payout[] = [
  {
    id: "po_001",
    userId: MOCK_USER.id,
    investmentId: "inv_002",
    grossPnl: 83.5,
    platformFee: 25.05,
    netPayout: 58.45,
    status: "paid",
    createdAt: isoDaysAgo(12),
  },
];

const MOCK_AUDIT: AuditLogEntry[] = [
  {
    id: "al_001",
    actorId: MOCK_USER.id,
    actorEmail: MOCK_USER.email,
    action: "POOL_TOGGLE",
    target: "inv_001",
    before: { A: 30, B: 70 },
    after: { A: 50, B: 50 },
    createdAt: isoDaysAgo(2),
  },
  {
    id: "al_002",
    actorId: MOCK_USER.id,
    actorEmail: MOCK_USER.email,
    action: "FORCE_POOL_ALLOCATION",
    target: "global",
    before: { A: 60, B: 40 },
    after: { A: 55, B: 45 },
    createdAt: isoDaysAgo(1),
  },
];

const MOCK_ADMIN_USERS: AdminUserRow[] = [
  {
    id: MOCK_USER.id,
    email: MOCK_USER.email,
    role: MOCK_USER.role,
    plan: MOCK_USER.plan,
    kycStatus: MOCK_USER.kycStatus,
    totalInvested: 3500,
    totalPnl: 267.82,
    createdAt: MOCK_USER.createdAt,
  },
  {
    id: MOCK_NORMAL_USER.id,
    email: MOCK_NORMAL_USER.email,
    role: MOCK_NORMAL_USER.role,
    plan: MOCK_NORMAL_USER.plan,
    kycStatus: MOCK_NORMAL_USER.kycStatus,
    totalInvested: 500,
    totalPnl: 12.4,
    createdAt: MOCK_NORMAL_USER.createdAt,
  },
  {
    id: "u_003",
    email: "bob@broker.local",
    role: "user",
    plan: "Pro",
    kycStatus: "pending",
    totalInvested: 1500,
    totalPnl: 0,
    createdAt: isoDaysAgo(3),
  },
];

const MOCK_CONFIG: AdminConfig = {
  minDepositNormal: 100,
  minDepositPro: 1000,
  platformFeePct: 30,
  forcePoolAllocation: null,
};

// ---- Helpers -------------------------------------------------------------

function buildEquityCurve(days: number, startEquity: number, endEquity: number): EquityPoint[] {
  const points: EquityPoint[] = [];
  const total = endEquity - startEquity;
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1);
    // smooth line + small noise
    const noise = (Math.random() - 0.5) * (total * 0.1);
    const eq = startEquity + total * t + noise;
    const d = NOW();
    d.setDate(d.getDate() - (days - 1 - i));
    points.push({ date: d.toISOString().slice(0, 10), equity: Number(eq.toFixed(2)) });
  }
  return points;
}

function delay<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ---- Public mock API surface --------------------------------------------

export const mockApi = {
  // Auth ----------------------------------------------------------------
  async register(payload: { email: string; password: string }) {
    return delay({ user: { ...MOCK_USER, email: payload.email, id: `u_${Date.now()}` }, token: "mock-token" });
  },
  async login(payload: { email: string; password: string }) {
    return delay({ user: { ...MOCK_USER, email: payload.email }, requires2fa: false, token: "mock-token" });
  },
  async verify2fa(_code: string) {
    return delay({ user: MOCK_USER, token: "mock-token" });
  },
  async logout() {
    return delay({ ok: true });
  },
  async me() {
    return delay(MOCK_USER);
  },

  // Dashboard -----------------------------------------------------------
  async getDashboard(): Promise<DashboardData> {
    const curve = buildEquityCurve(30, 2500, 2684.32);
    return delay({
      user: MOCK_USER,
      pnlToday: 42.18,
      equityCurve: curve,
      poolAllocation: { A: 50, B: 50 },
      activeInvestments: 1,
      daysUntilUnlock: 9,
      plan: MOCK_USER.plan,
      nextUnlockDate: isoDaysAhead(9),
    });
  },

  // Investments ---------------------------------------------------------
  async listInvestments(): Promise<Investment[]> {
    return delay(MOCK_INVESTMENTS);
  },
  async getInvestment(id: string): Promise<Investment | null> {
    return delay(MOCK_INVESTMENTS.find((i) => i.id === id) ?? null);
  },
  async createInvestment(payload: {
    plan: "Normal" | "Pro";
    amount: number;
    durationDays: number;
  }): Promise<Investment> {
    const newInv: Investment = {
      id: `inv_${Date.now()}`,
      userId: MOCK_USER.id,
      amount: payload.amount,
      plan: payload.plan,
      durationDays: payload.durationDays,
      startDate: new Date().toISOString(),
      endDate: isoDaysAhead(payload.durationDays),
      status: "active",
      poolAllocation:
        payload.plan === "Normal" ? { A: 100, B: 0 } : { A: 50, B: 50 },
      currentEquity: payload.amount,
      realizedPnl: 0,
      unrealizedPnl: 0,
    };
    MOCK_INVESTMENTS.unshift(newInv);
    return delay(newInv);
  },
  async pauseInvestment(id: string): Promise<Investment> {
    const inv = MOCK_INVESTMENTS.find((i) => i.id === id);
    if (!inv) throw new Error("Not found");
    inv.status = "paused";
    return delay({ ...inv });
  },
  async resumeInvestment(id: string): Promise<Investment> {
    const inv = MOCK_INVESTMENTS.find((i) => i.id === id);
    if (!inv) throw new Error("Not found");
    inv.status = "active";
    return delay({ ...inv });
  },
  async requestWithdraw(id: string): Promise<Payout> {
    const inv = MOCK_INVESTMENTS.find((i) => i.id === id);
    if (!inv) throw new Error("Not found");
    const p: Payout = {
      id: `po_${Date.now()}`,
      userId: inv.userId,
      investmentId: inv.id,
      grossPnl: inv.realizedPnl,
      platformFee: Number((inv.realizedPnl * 0.3).toFixed(2)),
      netPayout: Number((inv.realizedPnl * 0.7).toFixed(2)),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    MOCK_PAYOUTS.unshift(p);
    return delay(p);
  },
  async togglePools(id: string, allocation: PoolAllocation): Promise<Investment> {
    const inv = MOCK_INVESTMENTS.find((i) => i.id === id);
    if (!inv) throw new Error("Not found");
    inv.poolAllocation = { ...allocation };
    return delay({ ...inv });
  },

  // Trades --------------------------------------------------------------
  async listTradesForInvestment(id: string): Promise<Trade[]> {
    return delay(MOCK_TRADES.filter((t) => t.investmentId === id));
  },
  async listAllTrades(): Promise<Trade[]> {
    return delay(MOCK_TRADES);
  },
  async listPayouts(): Promise<Payout[]> {
    return delay(MOCK_PAYOUTS);
  },

  // Wallet --------------------------------------------------------------
  async getDepositInfo() {
    return delay({
      address: "TXm2HxRf9Pq7YvKw8Nc3Lb6JhGtFrDs2Wc",
      network: "TRC-20",
      asset: "USDT",
      minAmount: 50,
    });
  },
  async requestWithdrawal(payload: { amount: number; address: string }) {
    return delay({ id: `wd_${Date.now()}`, status: "pending", ...payload });
  },

  // Admin ---------------------------------------------------------------
  async listUsers(): Promise<AdminUserRow[]> {
    return delay(MOCK_ADMIN_USERS);
  },
  async getAuditLog(): Promise<AuditLogEntry[]> {
    return delay(MOCK_AUDIT);
  },
  async getAdminConfig(): Promise<AdminConfig> {
    return delay({ ...MOCK_CONFIG });
  },
  async setAdminConfig(payload: Partial<AdminConfig>): Promise<AdminConfig> {
    Object.assign(MOCK_CONFIG, payload);
    return delay({ ...MOCK_CONFIG });
  },
  async forcePoolAllocation(payload: PoolAllocation): Promise<AdminConfig> {
    MOCK_CONFIG.forcePoolAllocation = { ...payload };
    MOCK_AUDIT.unshift({
      id: `al_${Date.now()}`,
      actorId: MOCK_USER.id,
      actorEmail: MOCK_USER.email,
      action: "FORCE_POOL_ALLOCATION",
      target: "global",
      before: null,
      after: { ...payload },
      createdAt: new Date().toISOString(),
    });
    return delay({ ...MOCK_CONFIG });
  },

  // Settings ------------------------------------------------------------
  async changePassword(_payload: { current: string; next: string }) {
    return delay({ ok: true });
  },
  async enroll2fa() {
    return delay({ secret: "JBSWY3DPEHPK3PXP", otpauthUrl: "otpauth://totp/Broker:demo@broker.local?secret=JBSWY3DPEHPK3PXP" });
  },
  async disable2fa() {
    return delay({ ok: true });
  },
  async uploadKyc(_payload: { fileName: string }) {
    return delay({ status: "pending" });
  },
};
