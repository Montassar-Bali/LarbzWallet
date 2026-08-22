import { Logo } from "@/components/brand/logo";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <Logo className="self-start" />
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl border border-white/[0.06] bg-[linear-gradient(145deg,rgba(159,135,255,0.18),rgba(9,6,19,0.95)_65%,rgba(122,92,255,0.16))] p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d5c8ff]">Create Workspace</p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white">Set up your wallet simulator in minutes.</h1>
            <p className="mt-4 max-w-xl text-sm text-zinc-500">
              Larpz Wallet is designed for demonstrations, entertainment, UI walkthroughs, and testing.
            </p>
          </section>
          <RegisterForm />
        </div>
      </div>
    </main>
  );
}
