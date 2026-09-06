"use client";

import {
  Check,
  Clipboard,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AdminLicenseStatus = "unused" | "active" | "expired" | "revoked";

export type AdminLicenseDto = {
  id: string;
  keyHint: string;
  label: string;
  email: string;
  plan: string;
  status: AdminLicenseStatus;
  expiration: string | null;
  createdAt: string;
  activatedAt: string | null;
  activationCount: number;
};

type ApiErrorBody = {
  message?: string;
  error?: string | { message?: string };
};

type LicenseListBody = {
  licenses?: unknown;
};

type CreatedLicenseBody = {
  license?: unknown;
  rawKey?: unknown;
};

type LicenseAction = "revoke" | "reactivate" | "extend";

const licenseStatuses: AdminLicenseStatus[] = ["unused", "active", "expired", "revoked"];

function isLicenseStatus(value: unknown): value is AdminLicenseStatus {
  return typeof value === "string" && licenseStatuses.includes(value as AdminLicenseStatus);
}

function parseLicense(value: unknown): AdminLicenseDto | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AdminLicenseDto>;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.keyHint !== "string"
    || typeof candidate.label !== "string"
    || typeof candidate.plan !== "string"
    || !isLicenseStatus(candidate.status)
    || (candidate.expiration !== null && typeof candidate.expiration !== "string")
    || typeof candidate.createdAt !== "string"
  ) return null;

  return {
    id: candidate.id,
    keyHint: candidate.keyHint,
    label: candidate.label,
    email: typeof candidate.email === "string" ? candidate.email : "",
    plan: candidate.plan,
    status: candidate.status,
    expiration: candidate.expiration ?? null,
    createdAt: candidate.createdAt,
    activatedAt: typeof candidate.activatedAt === "string" ? candidate.activatedAt : null,
    activationCount: typeof candidate.activationCount === "number" && Number.isFinite(candidate.activationCount)
      ? candidate.activationCount
      : 0,
  };
}

export function parseAdminLicenses(payload: unknown) {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload as LicenseListBody).licenses
      : null;
  return Array.isArray(source)
    ? source.map(parseLicense).filter((license): license is AdminLicenseDto => license !== null)
    : [];
}

function apiMessage(body: ApiErrorBody | null, fallback: string) {
  const error = body?.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) return error.message;
  return typeof body?.message === "string" && body.message.trim() ? body.message : fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusClass(status: AdminLicenseStatus) {
  if (status === "active") return "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300";
  if (status === "revoked") return "border-rose-400/25 bg-rose-400/[0.08] text-rose-300";
  if (status === "expired") return "border-amber-400/25 bg-amber-400/[0.08] text-amber-300";
  return "border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#c4b5fd]";
}

function LicenseStatusBadge({ status }: { status: AdminLicenseStatus }) {
  return <Badge className={statusClass(status)}>{status}</Badge>;
}

export function AdminLicensesTable() {
  const [licenses, setLicenses] = useState<AdminLicenseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminLicenseStatus>("all");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("starter");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [rawKey, setRawKey] = useState("");
  const [rawKeyLabel, setRawKeyLabel] = useState("");
  const [copied, setCopied] = useState(false);

  const loadLicenses = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/licenses", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      const body = await response.json().catch(() => null) as (LicenseListBody & ApiErrorBody) | null;
      if (!response.ok) throw new Error(apiMessage(body, "Unable to load access keys."));
      if (!signal?.aborted) setLicenses(parseAdminLicenses(body));
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : "Unable to load access keys.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadLicenses(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadLicenses]);

  const visibleLicenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return licenses.filter((license) => {
      const matchesStatus = statusFilter === "all" || license.status === statusFilter;
      const matchesQuery = !normalizedQuery || [license.label, license.email, license.keyHint, license.plan]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesStatus && matchesQuery;
    });
  }, [licenses, query, statusFilter]);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const duration = plan === "lifetime" ? null : Number.parseInt(expiresInDays, 10);
    if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 3650)) {
      setMutationError("Choose a duration from 1 to 3650 days.");
      return;
    }

    setIsGenerating(true);
    setMutationError("");
    setCopied(false);
    try {
      const response = await fetch("/api/admin/licenses", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: label.trim(),
          email: email.trim(),
          plan,
          ...(duration === null ? {} : { expiresInDays: duration }),
        }),
      });
      const body = await response.json().catch(() => null) as (CreatedLicenseBody & ApiErrorBody) | null;
      if (!response.ok) throw new Error(apiMessage(body, "Unable to generate an access key."));
      const created = parseLicense(body?.license);
      if (!body || typeof body.rawKey !== "string" || !body.rawKey || !created) {
        throw new Error("The server returned an incomplete access key response.");
      }

      setRawKey(body.rawKey);
      setRawKeyLabel(created.label || "Unassigned");
      setLicenses((current) => [created, ...current.filter((license) => license.id !== created.id)]);
      setLabel("");
      setEmail("");
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Unable to generate an access key.");
    } finally {
      setIsGenerating(false);
    }
  };

  const runAction = async (license: AdminLicenseDto, action: LicenseAction) => {
    const actionKey = `${license.id}:${action}`;
    if (pendingAction) return;
    setPendingAction(actionKey);
    setMutationError("");
    try {
      const response = await fetch(`/api/admin/licenses/${encodeURIComponent(license.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(action === "extend" ? { action, days: 30 } : { action }),
      });
      const body = await response.json().catch(() => null) as (CreatedLicenseBody & ApiErrorBody) | null;
      if (!response.ok) throw new Error(apiMessage(body, `Unable to ${action} this access key.`));
      const updated = parseLicense(body?.license);
      if (!updated) throw new Error("The server returned an incomplete access key response.");
      setLicenses((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : `Unable to ${action} this access key.`);
    } finally {
      setPendingAction("");
    }
  };

  const copyRawKey = async () => {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
    } catch {
      setMutationError("Copying failed. Select the key and copy it manually.");
    }
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9f87ff]">Administration</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">Access Keys</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9a94ba]">Issue, search, extend, and revoke wallet access without exposing full keys in the list.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { void loadLicenses(); }} disabled={loading} className="self-start border-white/[0.09] text-white hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/10 sm:self-auto">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden border-[#8b5cf6]/15 bg-[#100b1d]/90">
        <CardHeader className="border-b border-white/[0.06]">
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#a78bfa]" aria-hidden="true" /> Generate access key</CardTitle>
          <CardDescription>The raw key is shown once after generation. Store it securely before dismissing it.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 sm:pt-6">
          <form onSubmit={generate} className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_.8fr_.8fr_auto] xl:items-end">
            <label className="block text-sm font-semibold text-[#ded9ed]">Label <span className="font-normal text-[#746d8c]">(optional)</span>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Client or campaign" className="mt-2 border-white/[0.08] bg-[#171027] focus:border-[#8b5cf6] focus:ring-[#8b5cf6]/25" />
            </label>
            <label className="block text-sm font-semibold text-[#ded9ed]">Email <span className="font-normal text-[#746d8c]">(optional)</span>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} placeholder="owner@example.com" className="mt-2 border-white/[0.08] bg-[#171027] focus:border-[#8b5cf6] focus:ring-[#8b5cf6]/25" />
            </label>
            <label className="block text-sm font-semibold text-[#ded9ed]">Plan
              <select value={plan} onChange={(event) => setPlan(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-[#171027] px-3 text-sm text-white outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/25">
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#ded9ed]">Duration
              <select value={plan === "lifetime" ? "never" : expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} disabled={plan === "lifetime"} className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-[#171027] px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:text-[#746d8c] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/25">
                {plan === "lifetime" ? <option value="never">Never</option> : null}
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </select>
            </label>
            <Button type="submit" disabled={isGenerating} className="h-11 bg-[#7c3aed] text-white hover:bg-[#8b5cf6] md:col-span-2 xl:col-span-1">
              {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
              {isGenerating ? "Generating…" : "Generate"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {rawKey ? (
        <section aria-labelledby="generated-key-title" className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-5 shadow-[0_20px_60px_-30px_rgba(252,211,77,.45)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300">Copy once</p>
              <h2 id="generated-key-title" className="mt-2 text-xl font-bold text-white">Access key for {rawKeyLabel}</h2>
              <p className="mt-1 text-sm leading-6 text-amber-100/65">This full key will disappear when dismissed or when you leave this page.</p>
            </div>
            <button type="button" onClick={() => { setRawKey(""); setRawKeyLabel(""); setCopied(false); }} aria-label="Dismiss generated access key" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-amber-100/60 outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-amber-300"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <code className="min-w-0 flex-1 select-all overflow-x-auto rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3 font-mono text-sm text-amber-50">{rawKey}</code>
            <Button type="button" variant="outline" onClick={() => { void copyRawKey(); }} className="border-amber-300/25 text-amber-100 hover:bg-amber-300/10">
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy key"}
            </Button>
          </div>
        </section>
      ) : null}

      {mutationError ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200">{mutationError}</p> : null}

      <Card className="overflow-hidden border-white/[0.07] bg-[#100b1d]/90">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Issued keys</CardTitle>
              <CardDescription>{licenses.length} total access {licenses.length === 1 ? "key" : "keys"}. Only masked key hints are retained here.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_160px]">
              <label className="relative block">
                <span className="sr-only">Search access keys</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#746d8c]" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search label, email, or key" className="border-white/[0.08] bg-[#171027] pl-10 focus:border-[#8b5cf6] focus:ring-[#8b5cf6]/25" />
              </label>
              <label>
                <span className="sr-only">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | AdminLicenseStatus)} className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#171027] px-3 text-sm text-white outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/25">
                  <option value="all">All statuses</option>
                  {licenseStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                </select>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[#9a94ba]" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-[#a78bfa]" aria-hidden="true" /> Loading access keys…</div>
          ) : loadError ? (
            <div className="px-5 py-12 text-center sm:px-6"><p role="alert" className="text-sm text-rose-200">{loadError}</p><Button type="button" variant="outline" onClick={() => { void loadLicenses(); }} className="mt-5 border-white/[0.09] text-white">Try again</Button></div>
          ) : visibleLicenses.length === 0 ? (
            <div className="px-5 py-14 text-center sm:px-6"><KeyRound className="mx-auto h-8 w-8 text-[#746d8c]" aria-hidden="true" /><p className="mt-4 font-semibold text-white">No access keys found</p><p className="mt-2 text-sm text-[#9a94ba]">Generate a key or adjust your search and filter.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <caption className="sr-only">Issued administrator access keys</caption>
                <thead className="bg-white/[0.025] text-[11px] uppercase tracking-[0.12em] text-[#746d8c]">
                  <tr>
                    <th scope="col" className="px-5 py-4 font-semibold">Key</th>
                    <th scope="col" className="px-4 py-4 font-semibold">Owner</th>
                    <th scope="col" className="px-4 py-4 font-semibold">Plan</th>
                    <th scope="col" className="px-4 py-4 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-4 font-semibold">Expires</th>
                    <th scope="col" className="px-4 py-4 font-semibold">Activations</th>
                    <th scope="col" className="px-5 py-4 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {visibleLicenses.map((license) => (
                    <tr key={license.id} className="transition hover:bg-white/[0.025]">
                      <td className="px-5 py-4 align-top"><code className="whitespace-nowrap rounded-lg bg-white/[0.04] px-2 py-1 font-mono text-xs text-[#d8d2ea]">{license.keyHint}</code><p className="mt-2 max-w-48 truncate font-semibold text-white">{license.label || "Unassigned"}</p></td>
                      <td className="px-4 py-4 align-top text-[#b7b0cb]">{license.email || "—"}<p className="mt-1 text-xs text-[#746d8c]">Created {formatDate(license.createdAt)}</p></td>
                      <td className="px-4 py-4 align-top capitalize text-[#d8d2ea]">{license.plan}</td>
                      <td className="px-4 py-4 align-top"><LicenseStatusBadge status={license.status} /></td>
                      <td className="px-4 py-4 align-top text-[#d8d2ea]">{formatDate(license.expiration)}</td>
                      <td className="px-4 py-4 align-top text-[#d8d2ea]">{license.activationCount}<p className="mt-1 text-xs text-[#746d8c]">{license.activatedAt ? `Last ${formatDate(license.activatedAt)}` : "Never activated"}</p></td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          {license.status === "revoked" ? <Button type="button" size="sm" variant="outline" disabled={Boolean(pendingAction)} onClick={() => { void runAction(license, "reactivate"); }} className="border-emerald-400/20 text-emerald-300 hover:bg-emerald-400/[0.08]">{pendingAction === `${license.id}:reactivate` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Reactivate</Button> : license.status !== "expired" ? <Button type="button" size="sm" variant="outline" disabled={Boolean(pendingAction)} onClick={() => { void runAction(license, "revoke"); }} className="border-rose-400/20 text-rose-300 hover:bg-rose-400/[0.08]">{pendingAction === `${license.id}:revoke` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Revoke</Button> : null}
                          {license.expiration !== null ? <Button type="button" size="sm" variant="outline" disabled={Boolean(pendingAction) || license.status === "revoked"} onClick={() => { void runAction(license, "extend"); }} className="border-[#8b5cf6]/25 text-[#c4b5fd] hover:bg-[#8b5cf6]/10">{pendingAction === `${license.id}:extend` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Extend 30d</Button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
