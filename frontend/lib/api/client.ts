// Real axios-based API client. Falls back to mockApi on connection error
// (network failure, ECONNREFUSED, 5xx, or no base URL configured).
//
// All functions return typed promises; the components never need to know
// whether data came from the live backend or the mock.

import axios, { AxiosError, AxiosInstance } from "axios";
import { mockApi } from "./mock";
import type {
  AdminConfig,
  AdminUserRow,
  AuditLogEntry,
  DashboardData,
  Investment,
  Payout,
  PoolAllocation,
  Trade,
  User,
} from "@/lib/types";

const baseURL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:4000";

const http: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 4000,
});

// Token holder (set by AuthProvider on login/verify2fa)
let _token: string | null = null;
export function setAuthToken(t: string | null): void {
  _token = t;
  if (typeof window !== "undefined") {
    if (t) window.localStorage.setItem("bp_token", t);
    else window.localStorage.removeItem("bp_token");
  }
}
export function loadAuthToken(): string | null {
  if (_token) return _token;
  if (typeof window !== "undefined") {
    _token = window.localStorage.getItem("bp_token");
  }
  return _token;
}

http.interceptors.request.use((cfg) => {
  const t = loadAuthToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Heuristic for "is the backend even reachable?"
function isConnectionError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    const ae = err as AxiosError;
    if (ae.code === "ERR_NETWORK" || ae.code === "ECONNREFUSED") return true;
    if (!ae.response) return true;
    if (ae.response.status >= 500) return true;
  }
  return false;
}

// Wrapper: try real, fall back to mock.
async function safe<T>(real: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await real();
  } catch (err) {
    if (isConnectionError(err)) {
      // eslint-disable-next-line no-console
      console.warn("[api] backend unreachable — using mock data", err);
      return fallback();
    }
    throw err;
  }
}

export const api = {
  // Auth ----------------------------------------------------------------
  register(payload: { email: string; password: string }) {
    return safe(
      async () => (await http.post<{ user: User; token: string }>("/api/v1/auth/register", payload)).data,
      () => mockApi.register(payload),
    );
  },
  login(payload: { email: string; password: string }) {
    return safe(
      async () =>
        (
          await http.post<{ user: User; requires2fa: boolean; token: string }>(
            "/api/v1/auth/login",
            payload,
          )
        ).data,
      () => mockApi.login(payload),
    );
  },
  verify2fa(code: string) {
    return safe(
      async () => (await http.post<{ user: User; token: string }>("/api/v1/auth/2fa/verify", { code })).data,
      () => mockApi.verify2fa(code),
    );
  },
  logout() {
    return safe(async () => (await http.post("/api/v1/auth/logout")).data, () => mockApi.logout());
  },
  me() {
    return safe(async () => (await http.get<User>("/api/v1/auth/me")).data, () => mockApi.me());
  },

  // Dashboard -----------------------------------------------------------
  getDashboard() {
    return safe(
      async () => (await http.get<DashboardData>("/api/v1/dashboard")).data,
      () => mockApi.getDashboard(),
    );
  },

  // Investments ---------------------------------------------------------
  listInvestments() {
    return safe(
      async () => (await http.get<Investment[]>("/api/v1/investments")).data,
      () => mockApi.listInvestments(),
    );
  },
  getInvestment(id: string) {
    return safe(
      async () => (await http.get<Investment>(`/api/v1/investments/${id}`)).data,
      () => mockApi.getInvestment(id),
    );
  },
  createInvestment(payload: { plan: "Normal" | "Pro"; amount: number; durationDays: number }) {
    return safe(
      async () => (await http.post<Investment>("/api/v1/investments", payload)).data,
      () => mockApi.createInvestment(payload),
    );
  },
  pauseInvestment(id: string) {
    return safe(
      async () => (await http.post<Investment>(`/api/v1/investments/${id}/pause`)).data,
      () => mockApi.pauseInvestment(id),
    );
  },
  resumeInvestment(id: string) {
    return safe(
      async () => (await http.post<Investment>(`/api/v1/investments/${id}/resume`)).data,
      () => mockApi.resumeInvestment(id),
    );
  },
  requestWithdraw(id: string) {
    return safe(
      async () => (await http.post<Payout>(`/api/v1/investments/${id}/withdraw`)).data,
      () => mockApi.requestWithdraw(id),
    );
  },
  togglePools(id: string, allocation: PoolAllocation) {
    return safe(
      async () => (await http.post<Investment>(`/api/v1/investments/${id}/toggle-pools`, allocation)).data,
      () => mockApi.togglePools(id, allocation),
    );
  },

  // Trades --------------------------------------------------------------
  listTradesForInvestment(id: string) {
    return safe(
      async () => (await http.get<Trade[]>(`/api/v1/investments/${id}/trades`)).data,
      () => mockApi.listTradesForInvestment(id),
    );
  },
  listAllTrades() {
    return safe(
      async () => (await http.get<Trade[]>("/api/v1/trades")).data,
      () => mockApi.listAllTrades(),
    );
  },
  listPayouts() {
    return safe(
      async () => (await http.get<Payout[]>("/api/v1/payouts")).data,
      () => mockApi.listPayouts(),
    );
  },

  // Wallet --------------------------------------------------------------
  getDepositInfo() {
    return safe(
      async () => (await http.get<{ address: string; network: string; asset: string; minAmount: number }>("/api/v1/wallet/deposit-info")).data,
      () => mockApi.getDepositInfo(),
    );
  },
  requestWithdrawal(payload: { amount: number; address: string }) {
    return safe(
      async () => (await http.post<{ id: string; status: string }>("/api/v1/wallet/withdraw", payload)).data,
      () => mockApi.requestWithdrawal(payload),
    );
  },

  // Admin ---------------------------------------------------------------
  listUsers() {
    return safe(
      async () => (await http.get<AdminUserRow[]>("/api/v1/admin/users")).data,
      () => mockApi.listUsers(),
    );
  },
  getAuditLog() {
    return safe(
      async () => (await http.get<AuditLogEntry[]>("/api/v1/admin/audit")).data,
      () => mockApi.getAuditLog(),
    );
  },
  getAdminConfig() {
    return safe(
      async () => (await http.get<AdminConfig>("/api/v1/admin/config")).data,
      () => mockApi.getAdminConfig(),
    );
  },
  setAdminConfig(payload: Partial<AdminConfig>) {
    return safe(
      async () => (await http.put<AdminConfig>("/api/v1/admin/config", payload)).data,
      () => mockApi.setAdminConfig(payload),
    );
  },
  forcePoolAllocation(payload: PoolAllocation) {
    return safe(
      async () => (await http.post<AdminConfig>("/api/v1/admin/force-allocation", payload)).data,
      () => mockApi.forcePoolAllocation(payload),
    );
  },

  // Settings ------------------------------------------------------------
  changePassword(payload: { current: string; next: string }) {
    return safe(
      async () => (await http.post<{ ok: true }>("/api/v1/settings/password", payload)).data,
      () => mockApi.changePassword(payload),
    );
  },
  enroll2fa() {
    return safe(
      async () => (await http.post<{ secret: string; otpauthUrl: string }>("/api/v1/settings/2fa/enable")).data,
      () => mockApi.enroll2fa(),
    );
  },
  disable2fa() {
    return safe(
      async () => (await http.post<{ ok: true }>("/api/v1/settings/2fa/disable")).data,
      () => mockApi.disable2fa(),
    );
  },
  uploadKyc(payload: { fileName: string }) {
    return safe(
      async () => (await http.post<{ status: "pending" }>("/api/v1/settings/kyc", payload)).data,
      () => mockApi.uploadKyc(payload),
    );
  },
};
