"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LicenseRecord } from "@/lib/types";
import { extendLicense, listLicenses, updateLicenseStatus } from "@/lib/license";

export function AdminLicensesTable() {
  const [licenses, setLicenses] = useState<LicenseRecord[]>(() => listLicenses());

  const runAction = (key: string, action: "activate" | "deactivate" | "revoke" | "extend") => {
    try {
      if (action === "activate") {
        updateLicenseStatus(key, "active");
      }

      if (action === "deactivate") {
        updateLicenseStatus(key, "unused");
      }

      if (action === "revoke") {
        updateLicenseStatus(key, "revoked");
      }

      if (action === "extend") {
        extendLicense(key, 30);
      }

      setLicenses(listLicenses());
    } catch {
      // Keep UI resilient for MVP.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Licenses</CardTitle>
        <CardDescription>Demo license manager. Not connected to production billing.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead>
              <tr className="text-left text-[var(--muted-foreground)]">
                <th className="px-2 py-3">License key</th>
                <th className="px-2 py-3">User</th>
                <th className="px-2 py-3">Plan</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Expiration</th>
                <th className="px-2 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {licenses.map((license) => (
                <tr key={license.key}>
                  <td className="px-2 py-3 text-[var(--foreground)]">{license.key}</td>
                  <td className="px-2 py-3 text-[var(--foreground)]">{license.userEmail ?? "-"}</td>
                  <td className="px-2 py-3 text-[var(--foreground)]">{license.plan}</td>
                  <td className="px-2 py-3">
                    <Badge>{license.status}</Badge>
                  </td>
                  <td className="px-2 py-3 text-[var(--foreground)]">{license.expiration}</td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => runAction(license.key, "activate")}>Activate</Button>
                      <Button size="sm" variant="outline" onClick={() => runAction(license.key, "deactivate")}>Deactivate</Button>
                      <Button size="sm" variant="outline" onClick={() => runAction(license.key, "revoke")}>Revoke</Button>
                      <Button size="sm" variant="outline" onClick={() => runAction(license.key, "extend")}>Extend</Button>
                    </div>
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
