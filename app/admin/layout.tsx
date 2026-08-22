import { AdminShell } from "@/components/admin/admin-shell";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AuthGuard requireAdmin>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
