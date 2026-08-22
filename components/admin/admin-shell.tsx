"use client";

import { LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/licenses", label: "Licenses", icon: ShieldCheck },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto grid min-h-screen max-w-[1500px] md:grid-cols-[240px_1fr]">
        <aside className="border-r border-[var(--border)] px-4 py-6">
          <Logo href="/admin" compact />
          <Badge className="mt-4 border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300">Admin</Badge>
          <nav className="mt-6 space-y-1">
            {adminNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                    active
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "text-[var(--muted-foreground)] hover:bg-white/5 hover:text-[var(--foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted-foreground)]">
            Signed in: {user?.email}
          </div>
          <Button className="mt-3 w-full" variant="outline" onClick={logout}>
            Logout
          </Button>
          <Button className="mt-2 w-full" variant="ghost" asChild>
            <Link href="/dashboard">Back to Wallet</Link>
          </Button>
        </aside>

        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
