"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getCurrentUser, loginUser, loginWithLicenseKey, logoutUser, persistWalletOwnerIdCookie, registerUser } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  login: (input: { email: string; password: string; persistent?: boolean }) => Promise<AppUser>;
  loginWithLicense: (licenseKey: string) => Promise<AppUser>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    persistent?: boolean;
  }) => Promise<AppUser>;
  logout: () => void;
  refresh: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(() => {
    const next = getCurrentUser();
    if (next) persistWalletOwnerIdCookie(next.id);
    setUser(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const login = useCallback(async (input: { email: string; password: string; persistent?: boolean }) => {
    const account = await loginUser(input);
    setUser(account);
    return account;
  }, []);

  const loginWithLicense = useCallback(async (licenseKey: string) => {
    const account = await loginWithLicenseKey(licenseKey);
    setUser(account);
    return account;
  }, []);

  const register = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      persistent?: boolean;
    }) => {
      const account = await registerUser(input);
      setUser(account);
      return account;
    },
    [],
  );

  const logout = useCallback(() => {
    void fetch("/api/wallet-security/logout", { method: "POST", credentials: "same-origin" });
    window.sessionStorage.removeItem("phantom_wallet_unlocked_at");
    logoutUser();
    setUser(null);
    router.push("/activate");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      loginWithLicense,
      register,
      logout,
      refresh,
    }),
    [loading, login, loginWithLicense, logout, refresh, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
