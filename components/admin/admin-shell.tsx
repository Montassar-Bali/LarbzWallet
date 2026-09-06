"use client";

import {
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/licenses", label: "Access Keys", icon: KeyRound },
] as const;

function AdminNavigation({ pathname, compact = false }: { pathname: string; compact?: boolean }) {
  return (
    <nav aria-label="Admin navigation" className={cn(compact ? "grid grid-cols-2 gap-2" : "space-y-2")}>
      {adminNav.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/admin"
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[#a78bfa]",
              compact && "justify-center px-2",
              active
                ? "bg-[#7c3aed] text-white shadow-[0_12px_28px_-16px_rgba(124,58,237,.9)]"
                : "text-[#aaa2c5] hover:bg-white/[0.06] hover:text-white",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Sign out failed. Please try again.");
      router.replace("/admin/login");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Sign out failed. Please try again.");
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#090612] text-[#f7f5ff]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(124,58,237,.22),transparent_30%),radial-gradient(circle_at_92%_80%,rgba(91,33,182,.15),transparent_34%)]" />

      <div className="relative mx-auto min-h-dvh max-w-[1600px] md:grid md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-r border-white/[0.07] bg-[#0d0918]/90 px-5 py-7 backdrop-blur-xl md:flex md:flex-col">
          <div className="flex items-center justify-between gap-3">
            <Logo href="/admin" />
            <Badge className="border-[#8b5cf6]/35 bg-[#8b5cf6]/10 text-[#c4b5fd]">Admin</Badge>
          </div>

          <div className="mt-10">
            <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#746d8c]">Workspace</p>
            <AdminNavigation pathname={pathname} />
          </div>

          <div className="mt-auto space-y-2 border-t border-white/[0.07] pt-5">
            <Button asChild variant="ghost" className="w-full justify-start text-[#aaa2c5] hover:bg-white/[0.06]">
              <Link href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View website
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start border-white/[0.09] text-white hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/10"
              onClick={() => { void logout(); }}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </Button>
            {logoutError ? <p role="alert" className="px-2 pt-1 text-xs leading-5 text-rose-300">{logoutError}</p> : null}
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0d0918]/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
            <div className="flex items-center justify-between gap-3">
              <Logo href="/admin" />
              <div className="flex items-center gap-1">
                <Button asChild variant="ghost" size="sm" className="px-2 text-[#aaa2c5]">
                  <Link href="/" target="_blank" rel="noreferrer" aria-label="View website">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-2 text-[#aaa2c5]"
                  onClick={() => { void logout(); }}
                  disabled={isLoggingOut}
                  aria-label={isLoggingOut ? "Signing out" : "Sign out"}
                >
                  {isLoggingOut ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <AdminNavigation pathname={pathname} compact />
            </div>
            {logoutError ? <p role="alert" className="mt-2 text-xs text-rose-300">{logoutError}</p> : null}
          </header>

          <main className="px-4 py-7 sm:px-7 sm:py-9 xl:px-10 xl:py-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
