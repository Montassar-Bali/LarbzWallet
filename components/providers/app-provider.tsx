"use client";

import { AuthProvider } from "@/components/auth/auth-provider";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
