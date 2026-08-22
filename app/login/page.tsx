import { Logo } from "@/components/brand/logo";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <Logo className="self-start" />
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl border border-white/[0.06] bg-[linear-gradient(145deg,rgba(159,135,255,0.18),rgba(9,6,19,0.95)_65%,rgba(122,92,255,0.16))] p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d5c8ff]">Larpz Access</p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white">Welcome back to your simulation workspace.</h1>
            <p className="mt-4 max-w-xl text-sm text-zinc-500">
              Demo wallet only. No private keys, no seed phrases, no real blockchain activity.
            </p>
          </section>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
