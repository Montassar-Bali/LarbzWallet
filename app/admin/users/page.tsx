import { redirect } from "next/navigation";

import { requireAdminPageSession } from "@/lib/admin-auth";

export default async function AdminUsersPage() {
  await requireAdminPageSession("/admin/users");
  redirect("/admin/licenses");
}
