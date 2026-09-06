import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminLogin } from "@/components/admin/admin-login";
import { hasValidAdminSession } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Sign in",
};

function safeNextPath(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/admin") && !candidate.startsWith("//")
    ? candidate
    : "/admin";
}

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const query = await searchParams;
  const nextPath = safeNextPath(query.next);
  if (await hasValidAdminSession()) redirect(nextPath);
  return <AdminLogin nextPath={nextPath} />;
}
