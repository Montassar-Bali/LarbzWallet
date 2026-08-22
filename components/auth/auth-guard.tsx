"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";

type AuthGuardProps = {
  children: React.ReactNode;
  requireAdmin?: boolean;
};

export function AuthGuard({ children, requireAdmin }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (requireAdmin && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, pathname, requireAdmin, router, user]);

  if (loading || !user || (requireAdmin && user.role !== "admin")) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Badge>Simulation Mode</Badge>
        <p className="text-sm text-[var(--muted-foreground)]">Checking access permissions...</p>
      </div>
    );
  }

  return <>{children}</>;
}
