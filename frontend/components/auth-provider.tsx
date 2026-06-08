"use client";

import * as React from "react";
import { api, loadAuthToken, setAuthToken } from "@/lib/api/client";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  pending2faEmail: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ requires2fa: boolean }>;
  register: (email: string, password: string) => Promise<void>;
  verify2fa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    loading: true,
    pending2faEmail: null,
  });

  const refresh = React.useCallback(async () => {
    try {
      const u = await api.me();
      setState((s) => ({ ...s, user: u, loading: false }));
    } catch {
      setState((s) => ({ ...s, user: null, loading: false }));
    }
  }, []);

  React.useEffect(() => {
    // Try restore session from token
    const t = loadAuthToken();
    if (!t) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    refresh();
  }, [refresh]);

  const login: AuthContextValue["login"] = async (email, password) => {
    const res = await api.login({ email, password });
    if (res.requires2fa) {
      setState((s) => ({ ...s, pending2faEmail: email }));
      return { requires2fa: true };
    }
    setAuthToken(res.token);
    setState({ user: res.user, loading: false, pending2faEmail: null });
    return { requires2fa: false };
  };

  const register: AuthContextValue["register"] = async (email, password) => {
    const res = await api.register({ email, password });
    setAuthToken(res.token);
    setState({ user: res.user, loading: false, pending2faEmail: null });
  };

  const verify2fa: AuthContextValue["verify2fa"] = async (code) => {
    const res = await api.verify2fa(code);
    setAuthToken(res.token);
    setState({ user: res.user, loading: false, pending2faEmail: null });
  };

  const logout: AuthContextValue["logout"] = async () => {
    try {
      await api.logout();
    } finally {
      setAuthToken(null);
      setState({ user: null, loading: false, pending2faEmail: null });
    }
  };

  const value = React.useMemo<AuthContextValue>(
    () => ({ ...state, login, register, verify2fa, logout, refresh }),
    [state, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
