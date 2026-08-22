import type { Metadata } from "next";

import { AuthGuard } from "@/components/auth/auth-guard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const metadata: Metadata = {
  title: { absolute: "Crypto Wallet Simulator" },
  icons: {
    icon: [{ url: "/dashboard/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/dashboard/icon.svg", type: "image/svg+xml" }],
  },
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
