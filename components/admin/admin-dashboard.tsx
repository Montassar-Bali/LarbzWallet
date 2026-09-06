"use client";

import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock3,
  KeyRound,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseAdminLicenses, type AdminLicenseDto } from "@/components/admin/licenses-table";

type Summary = {
  total: number;
  active: number;
  unused: number;
  expired: number;
  revoked: number;
};

type DashboardBody = {
  licenses?: unknown;
  summary?: Partial<Summary>;
  message?: string;
  error?: string | { message?: string };
};

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function errorMessage(body: DashboardBody | null) {
  const error = body?.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) return error.message;
  return body?.message?.trim() || "Unable to load the admin dashboard.";
}

function calculatedSummary(licenses: AdminLicenseDto[]): Summary {
  return {
    total: licenses.length,
    active: licenses.filter((license) => license.status === "active").length,
    unused: licenses.filter((license) => license.status === "unused").length,
    expired: licenses.filter((license) => license.status === "expired").length,
    revoked: licenses.filter((license) => license.status === "revoked").length,
  };
}

function mergeSummary(server: Partial<Summary> | undefined, fallback: Summary): Summary {
  const value = (key: keyof Summary) => {
    const candidate = server?.[key];
    return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : fallback[key];
  };
  return { total: value("total"), active: value("active"), unused: value("unused"), expired: value("expired"), revoked: value("revoked") };
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; tone: string }) {
  return (
    <Card className="border-white/[0.07] bg-[#100b1d]/90">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium text-[#9a94ba]">{label}</p><p className="mt-3 text-3xl font-bold tracking-[-0.04em] text-white tabular-nums">{value}</p></div>
          <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden={true} /></span>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#746d8c]">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function AdminDashboardView() {
  const [licenses, setLicenses] = useState<AdminLicenseDto[]>([]);
  const [serverSummary, setServerSummary] = useState<Partial<Summary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/licenses", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      const body = await response.json().catch(() => null) as DashboardBody | null;
      if (!response.ok) throw new Error(errorMessage(body));
      if (!signal?.aborted) {
        setLicenses(parseAdminLicenses(body));
        setServerSummary(body?.summary ?? {});
      }
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Unable to load the admin dashboard.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const summary = useMemo(() => mergeSummary(serverSummary, calculatedSummary(licenses)), [licenses, serverSummary]);
  const recent = useMemo(() => [...licenses].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 5), [licenses]);

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9f87ff]">Administration</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9a94ba]">A secure overview of issued Larpz Wallet access keys.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { void load(); }} disabled={loading} className="self-start border-white/[0.09] text-white hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/10 sm:self-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-5 py-5" role="alert">
          <p className="text-sm text-rose-200">{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => { void load(); }} className="mt-4 border-rose-300/20 text-rose-100">Try again</Button>
        </div>
      ) : null}

      {loading && licenses.length === 0 ? (
        <div className="flex min-h-52 items-center justify-center gap-3 rounded-2xl border border-white/[0.07] bg-[#100b1d]/90 text-sm text-[#9a94ba]" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-[#a78bfa]" aria-hidden="true" /> Loading dashboard…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total keys" value={summary.total} detail={`${summary.unused} waiting for first activation`} icon={KeyRound} tone="bg-[#8b5cf6]/10 text-[#c4b5fd]" />
            <MetricCard label="Active" value={summary.active} detail="Keys that currently grant wallet access" icon={CheckCircle2} tone="bg-emerald-400/[0.08] text-emerald-300" />
            <MetricCard label="Expired" value={summary.expired} detail="Keys that reached their expiration date" icon={Clock3} tone="bg-amber-400/[0.08] text-amber-300" />
            <MetricCard label="Revoked" value={summary.revoked} detail="Keys manually blocked by an administrator" icon={Ban} tone="bg-rose-400/[0.08] text-rose-300" />
          </div>

          <Card className="overflow-hidden border-white/[0.07] bg-[#100b1d]/90">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-white/[0.06]">
              <div><CardTitle>Recently issued</CardTitle><CardDescription>The latest access keys, shown only by their masked hints.</CardDescription></div>
              <Button asChild variant="ghost" className="shrink-0 text-[#c4b5fd] hover:bg-[#8b5cf6]/10 hover:text-white"><Link href="/admin/licenses">Manage keys <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              {recent.length === 0 ? <div className="px-5 py-12 text-center text-sm text-[#9a94ba]">No access keys have been issued yet.</div> : (
                <ul className="divide-y divide-white/[0.06]">
                  {recent.map((license) => (
                    <li key={license.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6">
                      <div className="min-w-0"><p className="truncate font-semibold text-white">{license.label || "Unassigned"}</p><p className="mt-1 truncate text-sm text-[#9a94ba]">{license.email || "No email"} · <code className="font-mono text-xs">{license.keyHint}</code></p></div>
                      <Badge className={license.status === "active" ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300" : license.status === "revoked" ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-300" : license.status === "expired" ? "border-amber-400/25 bg-amber-400/[0.08] text-amber-300" : "border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd]"}>{license.status}</Badge>
                      <p className="text-xs text-[#746d8c] sm:text-right">{dateLabel(license.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
