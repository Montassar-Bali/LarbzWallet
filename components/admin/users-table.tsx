"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUsers, saveUsers } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

export function AdminUsersTable() {
  const [users, setUsers] = useState<AppUser[]>(() => getUsers());

  const toggleStatus = (id: string) => {
    const next: AppUser[] = users.map((user) => {
      if (user.id !== id) {
        return user;
      }

      return {
        ...user,
        status: user.status === "active" ? "inactive" : "active",
      };
    });

    setUsers(next);
    saveUsers(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Basic local user management for MVP admin usage.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead>
              <tr className="text-left text-[var(--muted-foreground)]">
                <th className="px-2 py-3">User</th>
                <th className="px-2 py-3">Email</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">License</th>
                <th className="px-2 py-3">Created date</th>
                <th className="px-2 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-2 py-3 text-[var(--foreground)]">{user.name}</td>
                  <td className="px-2 py-3 text-[var(--foreground)]">{user.email}</td>
                  <td className="px-2 py-3">
                    <Badge>{user.status}</Badge>
                  </td>
                  <td className="px-2 py-3 text-[var(--foreground)]">{user.licenseKey ?? "-"}</td>
                  <td className="px-2 py-3 text-[var(--foreground)]">
                    {new Date(user.createdAt).toLocaleDateString("en-US")}
                  </td>
                  <td className="px-2 py-3">
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(user.id)}>
                      {user.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
