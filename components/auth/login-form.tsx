"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("demo@larpz.app");
  const [password, setPassword] = useState("Demo123!");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ email, password, persistent: remember });
      const nextPath =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      router.push(nextPath ?? "/dashboard");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to sign in.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Login</CardTitle>
        <CardDescription>
          Simulation environment only. No real wallet, chain, or custody access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-[var(--muted-foreground)]">
              Email
            </label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-[var(--muted-foreground)]">
              Password
            </label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="inline-flex items-center gap-2 text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[var(--border)]"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
            <Link href="#" className="text-[var(--primary)] hover:underline">
              Forgot password
            </Link>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </Button>
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            Need an account?{" "}
            <Link href="/register" className="text-[var(--primary)] hover:underline">
              Register
            </Link>
          </p>
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            Already purchased?{" "}
            <Link href="/activate" className="text-[var(--primary)] hover:underline">
              Activate license
            </Link>
          </p>
          <p className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-3 text-xs text-[var(--muted-foreground)]">
            Demo user: <strong>demo@larpz.app / Demo123!</strong><br />
            Admin user: <strong>admin@larpz.app / Admin123!</strong>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
