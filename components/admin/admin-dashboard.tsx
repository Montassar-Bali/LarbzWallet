"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listLicenses } from "@/lib/license";
import { getUsers } from "@/lib/auth";

export function AdminDashboardView() {
  const users = getUsers();
  const licenses = listLicenses();

  const activeUsers = users.filter((user) => user.status === "active").length;
  const activeLicenses = licenses.filter((license) => license.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-[var(--foreground)]">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Basic MVP controls for users and demo license states.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Users</CardDescription>
            <CardTitle>{users.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active Users</CardDescription>
            <CardTitle>{activeUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active Licenses</CardDescription>
            <CardTitle>{activeLicenses}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Revenue Placeholder</CardDescription>
            <CardTitle>$12,490</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Safety Reminder</CardTitle>
          <CardDescription>
            Larpz Wallet is a demo-only product. Admin tools do not control real funds or chains.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">
            All balances, transactions, and wallet records in this admin dashboard are simulated data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
