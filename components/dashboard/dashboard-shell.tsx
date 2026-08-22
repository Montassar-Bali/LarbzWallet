"use client";

import {
  Activity,
  Coins,
  Gauge,
  LayoutGrid,
  LogOut,
  Settings,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWalletTheme } from "@/lib/wallet";
import { walletThemes } from "@/config/wallets";

const dashboardNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/dashboard/portfolio", label: "Portfolio", icon: Gauge },
  { href: "/dashboard/tokens", label: "Tokens", icon: Coins },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavLinks({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex", mobile ? "w-full items-center justify-around gap-1" : "flex-col gap-1") }>
      {dashboardNav.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
              mobile ? "flex-1 flex-col py-2 text-[11px]" : "",
              active
                ? "bg-emerald-400/10 text-emerald-200"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-white",
            )}
          >
            <Icon className={cn("h-4 w-4", mobile && "h-5 w-5")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [themeId, setThemeId] = useState(() => getWalletTheme());
  const theme = walletThemes.find((item) => item.id === themeId) ?? walletThemes[0];

  useEffect(() => {
    const handleThemeChange = () => setThemeId(getWalletTheme());
    window.addEventListener("wallet-theme-change", handleThemeChange);
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) manifest.href = `/manifests/${themeId}.webmanifest`;
    return () => window.removeEventListener("wallet-theme-change", handleThemeChange);
  }, [themeId]);

  return (
    <div
      className="min-h-screen bg-[var(--background)] pb-24 md:pb-0"
      style={{
        "--background": theme.palette.background,
        "--card": theme.palette.card,
        "--card-soft": `${theme.palette.card}cc`,
        "--primary": theme.palette.accent,
        "--ring": theme.palette.accent,
      } as React.CSSProperties}
    >
      <div className="mx-auto grid min-h-screen max-w-[1600px] md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-[var(--border)] px-4 py-6 md:flex md:flex-col">
          <Logo href="/dashboard" />
          <div className="mt-6">
            <Badge className="border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300/80">SIMULATION</Badge>
          </div>
          <div className="mt-6">
            <NavLinks />
          </div>
          <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--foreground)]">Signed in as</p>
            <p className="text-xs text-[var(--muted-foreground)]">{user?.email}</p>
            {user?.role === "admin" ? (
              <Link
                href="/admin"
                className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline"
              >
                <Shield className="h-3.5 w-3.5" />
                Open Admin Panel
              </Link>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.04] bg-[#050507]/80 px-4 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-3">
              <Logo compact className="md:hidden" href="/dashboard" />
              <Badge className="border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300/80">SIMULATION</Badge>
            </div>
            <div className="flex items-center gap-3">
              <p className="hidden text-sm text-[var(--muted-foreground)] sm:block">
                {user?.name ?? "Larpz User"}
              </p>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.04] bg-[#050507]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
            <NavLinks mobile />
          </div>
        </div>
      </div>
    </div>
  );
}
