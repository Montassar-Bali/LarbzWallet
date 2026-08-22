import { ArrowDownLeft, ArrowUpRight, Bell, ChevronRight, ShieldCheck } from "lucide-react";

import { cn, formatCurrency, formatPercentage } from "@/lib/utils";

type ScreenVariant = "portfolio" | "details" | "activity" | "wallet";

type WalletPhoneProps = {
  variant: ScreenVariant;
  className?: string;
};

const tokenRows = [
  { symbol: "BTC", name: "Bitcoin", value: 58_862, change: 2.9, color: "#f7931a" },
  { symbol: "ETH", name: "Ethereum", value: 27_900, change: 3.6, color: "#627eea" },
  { symbol: "SOL", name: "Solana", value: 26_941, change: 5.2, color: "#9945ff" },
];

const activityRows = [
  { type: "receive", label: "Demo Sponsor", amount: "+4,000 USDT", time: "Today, 08:50" },
  { type: "send", label: "Creator Wallet", amount: "-14.20 SOL", time: "Yesterday, 16:10" },
  { type: "receive", label: "Training Sandbox", amount: "+0.42 ETH", time: "Yesterday, 10:22" },
];

function PortfolioScreen() {
  return (
    <>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Total Portfolio</p>
        <p className="mt-2 font-display text-3xl font-bold text-white">{formatCurrency(128_450.25)}</p>
        <p className="mt-1 text-sm font-medium text-emerald-400">{formatPercentage(4.82)} · 24h</p>
        <div
          className="mt-4 h-20 rounded-xl"
          style={{
            background:
              "radial-gradient(circle at 15% 20%, rgba(110,231,183,0.2), transparent 45%), radial-gradient(circle at 85% 80%, rgba(129,140,248,0.15), transparent 50%), #0a0a0f",
          }}
        />
      </div>
      <div className="mt-4 space-y-2">
        {tokenRows.map((token) => (
          <div key={token.symbol} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full" style={{ background: `${token.color}20`, border: `1px solid ${token.color}40` }} />
              <div>
                <p className="text-sm font-medium text-white">{token.symbol}</p>
                <p className="text-xs text-zinc-600">{token.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-white">{formatCurrency(token.value)}</p>
              <p className="text-xs font-medium text-emerald-400">{formatPercentage(token.change)}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
function DetailsScreen() {
  return (
    <>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Token Detail</p>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="font-display text-2xl font-bold text-white">SOL</p>
            <p className="text-xs text-zinc-600">Solana</p>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
            {formatPercentage(5.2)}
          </span>
        </div>
        <p className="mt-4 text-xl font-semibold text-white">{formatCurrency(188.4)}</p>
        <p className="text-xs text-zinc-600">Balance: 143.00 SOL</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.04]">
          Simulate Send
        </button>
        <button className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.04]">
          Simulate Receive
        </button>
      </div>
      <div
        className="mt-3 h-24 rounded-xl border border-white/[0.04]"
        style={{
          background:
            "linear-gradient(125deg, rgba(110,231,183,0.1), rgba(129,140,248,0.05) 60%, transparent)",
        }}
      />
    </>
  );
}

function ActivityScreen() {
  return (
    <>
      <div className="space-y-2">
        {activityRows.map((activity) => (
          <div key={`${activity.label}-${activity.time}`} className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">{activity.label}</p>
              <p className={cn("text-sm font-medium", activity.type === "receive" ? "text-emerald-400" : "text-indigo-400")}>
                {activity.amount}
              </p>
            </div>
            <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-zinc-700">Simulated Transaction</p>
            <p className="mt-1 text-xs text-zinc-600">{activity.time}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function WalletScreen() {
  return (
    <>
      <div
        className="rounded-2xl border border-white/[0.06] p-4"
        style={{
          background:
            "linear-gradient(130deg, rgba(110,231,183,0.15), rgba(10,10,15,0.9) 55%, rgba(129,140,248,0.1))",
        }}
      >
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-200/60">Mirage Card</p>
        <p className="mt-3 font-display text-2xl font-bold text-white">Simulation Wallet</p>
        <p className="mt-8 text-sm tracking-[0.22em] text-white/40">**** **** **** 2048</p>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-3">
          <span className="flex items-center gap-2 text-sm text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Secure Simulation Mode
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-700" />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-3">
          <span className="flex items-center gap-2 text-sm text-zinc-400">
            <Bell className="h-4 w-4 text-indigo-400" />
            Demo Alerts
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-700" />
        </div>
      </div>
    </>
  );
}

export function WalletPhone({ variant, className }: WalletPhoneProps) {
  return (
    <div className={cn("rounded-[2.4rem] border border-white/[0.06] bg-[#050507] p-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)]", className)}>
      <div
        className="rounded-[2rem] border border-white/[0.04] p-4"
        style={{ background: "linear-gradient(180deg, #0c0c14, #060608)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-300/50">Mirage</p>
            <p className="font-display text-lg font-bold text-white">Wallet</p>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300/80">
            Simulation
          </span>
        </div>
        {variant === "portfolio" ? <PortfolioScreen /> : null}
        {variant === "details" ? <DetailsScreen /> : null}
        {variant === "activity" ? <ActivityScreen /> : null}
        {variant === "wallet" ? <WalletScreen /> : null}
        <div className="mt-5 grid grid-cols-4 gap-2 rounded-xl border border-white/[0.04] bg-white/[0.01] p-2">
          <button className="flex items-center justify-center rounded-lg bg-emerald-400/[0.08] p-2 text-emerald-300">
            <ArrowDownLeft className="h-4 w-4" />
          </button>
          <button className="flex items-center justify-center rounded-lg bg-white/[0.02] p-2 text-zinc-500">
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <button className="flex items-center justify-center rounded-lg bg-white/[0.02] p-2 text-zinc-500">
            <Bell className="h-4 w-4" />
          </button>
          <button className="flex items-center justify-center rounded-lg bg-white/[0.02] p-2 text-zinc-500">
            <ShieldCheck className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bare wallet screen content — no phone bezel.
 * Designed to be wrapped by an IPhoneFrame component.
 */
export function WalletScreenContent({ variant, className }: WalletPhoneProps) {
  return (
    <div
      className={cn("p-4", className)}
      style={{ background: "linear-gradient(180deg, #0c0c14, #060608)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-300/50">Mirage</p>
          <p className="font-display text-base font-bold text-white">Wallet</p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-emerald-300/80">
          Simulation
        </span>
      </div>
      {variant === "portfolio" ? <PortfolioScreen /> : null}
      {variant === "details" ? <DetailsScreen /> : null}
      {variant === "activity" ? <ActivityScreen /> : null}
      {variant === "wallet" ? <WalletScreen /> : null}
      <div className="mt-4 grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.04] bg-white/[0.01] p-1.5">
        <button className="flex items-center justify-center rounded-lg bg-emerald-400/[0.08] p-1.5 text-emerald-300">
          <ArrowDownLeft className="h-3.5 w-3.5" />
        </button>
        <button className="flex items-center justify-center rounded-lg bg-white/[0.02] p-1.5 text-zinc-500">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
        <button className="flex items-center justify-center rounded-lg bg-white/[0.02] p-1.5 text-zinc-500">
          <Bell className="h-3.5 w-3.5" />
        </button>
        <button className="flex items-center justify-center rounded-lg bg-white/[0.02] p-1.5 text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
