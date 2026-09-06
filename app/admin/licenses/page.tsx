import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminLicensesTable } from "@/components/admin/licenses-table";
import { requireAdminPageSession } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Access Keys",
};

export default async function AdminLicensesPage() {
  await requireAdminPageSession("/admin/licenses");

  return (
    <AdminShell>
      <AdminLicensesTable />
    </AdminShell>
  );
}
