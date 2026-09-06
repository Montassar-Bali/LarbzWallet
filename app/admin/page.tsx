import type { Metadata } from "next";

import { AdminDashboardView } from "@/components/admin/admin-dashboard";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPageSession } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminPage() {
  await requireAdminPageSession("/admin");

  return (
    <AdminShell>
      <AdminDashboardView />
    </AdminShell>
  );
}
