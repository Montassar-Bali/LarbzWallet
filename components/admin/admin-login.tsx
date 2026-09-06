"use client";

import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ErrorBody = {
  message?: string;
  error?: string | { message?: string };
};

function responseMessage(body: ErrorBody | null, fallback: string) {
  const error = body?.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) return error.message;
  return typeof body?.message === "string" && body.message.trim() ? body.message : fallback;
}

export function AdminLogin({ nextPath = "/admin" }: { nextPath?: string }) {
  const router = useRouter();
  const [accessKey, setAccessKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = accessKey.trim();
    if (!candidate || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessKey: candidate }),
      });
      const body = await response.json().catch(() => null) as ErrorBody | null;
      if (!response.ok) {
        const fallback = response.status === 429
          ? "Too many attempts. Wait a moment and try again."
          : "That access key is not valid.";
        throw new Error(responseMessage(body, fallback));
      }

      setAccessKey("");
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#090612] px-4 py-12 text-[#f7f5ff] sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,.28),transparent_42%),radial-gradient(circle_at_10%_100%,rgba(76,29,149,.22),transparent_38%)]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/[0.08] bg-[#100b1d]/95 p-6 shadow-[0_32px_100px_-30px_rgba(76,29,149,.85)] backdrop-blur-xl sm:p-9" aria-labelledby="admin-sign-in-title">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <span className="rounded-full border border-[#8b5cf6]/35 bg-[#8b5cf6]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#c4b5fd]">Admin</span>
        </div>

        <div className="mt-10 grid h-14 w-14 place-items-center rounded-2xl border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 text-[#c4b5fd] shadow-[0_14px_35px_-16px_rgba(139,92,246,.9)]">
          <LockKeyhole className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 id="admin-sign-in-title" className="font-display mt-6 text-3xl font-bold tracking-[-0.035em] text-white">Administrator sign in</h1>
        <p className="mt-3 text-sm leading-6 text-[#aaa2c5]">Enter the private administrator access key to continue to the Larpz control panel.</p>

        <form className="mt-8" onSubmit={submit}>
          <label htmlFor="admin-access-key" className="text-sm font-semibold text-[#ded9ed]">Access key</label>
          <div className="relative mt-2">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#746d8c]" aria-hidden="true" />
            <Input
              id="admin-access-key"
              name="accessKey"
              type={showKey ? "text" : "password"}
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={isSubmitting}
              className="h-12 border-white/[0.08] bg-[#171027] pl-10 pr-12 text-base text-white focus:border-[#8b5cf6] focus:ring-[#8b5cf6]/25"
              aria-describedby={error ? "admin-login-error" : "admin-key-help"}
            />
            <button
              type="button"
              onClick={() => setShowKey((visible) => !visible)}
              className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[#8f88a8] outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-[#a78bfa]"
              aria-label={showKey ? "Hide access key" : "Show access key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          <p id="admin-key-help" className="mt-2 text-xs leading-5 text-[#746d8c]">The key is sent securely in the request body and is never stored in this browser.</p>

          {error ? <p id="admin-login-error" role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm leading-5 text-rose-200">{error}</p> : null}

          <Button
            type="submit"
            size="lg"
            disabled={!accessKey.trim() || isSubmitting}
            className="mt-6 w-full bg-[#7c3aed] text-white shadow-[0_18px_38px_-18px_rgba(124,58,237,.9)] hover:bg-[#8b5cf6]"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
