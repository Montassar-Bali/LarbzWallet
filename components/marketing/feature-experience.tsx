"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgeDollarSign, HandCoins, Smartphone, Wallet } from "lucide-react";
import { useState } from "react";

import { ScrollReveal } from "@/components/effects/scroll-reveal";
import { formatCurrency, formatPercentage } from "@/lib/utils";

const features = [
  {
    id: "balances",
    icon: BadgeDollarSign,
    title: "Custom Balances",
    description:
      "Set portfolio values that match your story. Whether it's a $500 student demo or a $2M whale walkthrough, every number is yours to control.",
    accent: "emerald",
  },
  {
    id: "tokens",
    icon: Wallet,
    title: "Custom Tokens",
    description:
      "Create fictional assets with branded symbols, pricing, and icons. Perfect for client pitches, educational content, or creative projects.",
    accent: "indigo",
  },
  {
    id: "transactions",
    icon: HandCoins,
    title: "Simulated Transactions",
    description:
      "Generate realistic send and receive records with timestamps, labels, and status indicators — without touching any real blockchain.",
    accent: "amber",
  },
  {
    id: "pwa",
    icon: Smartphone,
    title: "Mobile PWA",
    description:
      "Install directly from the browser on iPhone, Android, or desktop. Runs as a standalone app with full offline capability.",
    accent: "sky",
  },
];

const accentColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  emerald: { bg: "bg-emerald-400/[0.06]", border: "border-emerald-400/20", text: "text-emerald-300", glow: "rgba(110,231,183,0.08)" },
  indigo: { bg: "bg-indigo-400/[0.06]", border: "border-indigo-400/20", text: "text-indigo-300", glow: "rgba(129,140,248,0.08)" },
  amber: { bg: "bg-amber-400/[0.06]", border: "border-amber-400/20", text: "text-amber-300", glow: "rgba(251,191,36,0.08)" },
  sky: { bg: "bg-sky-400/[0.06]", border: "border-sky-400/20", text: "text-sky-300", glow: "rgba(56,189,248,0.08)" },
};

function BalancesPreview() {
  return (
    <div className="space-y-3 p-1">
      <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Total Portfolio</p>
        <motion.p
          key="balance-animated"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1 font-display text-3xl font-bold text-white"
        >
          {formatCurrency(128_450.25)}
        </motion.p>
        <p className="mt-0.5 text-sm font-medium text-emerald-400">{formatPercentage(4.82)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "24h High", value: "$131,200" },
          { label: "24h Low", value: "$126,800" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-white/[0.04] bg-white/[0.015] p-3">
            <p className="text-[10px] text-zinc-600">{item.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokensPreview() {
  const tokens = [
    { symbol: "ACME", name: "Acme Token", price: 42.5, change: 12.4, color: "#ff6b6b" },
    { symbol: "DEMO", name: "Demo Coin", price: 1.25, change: -2.1, color: "#4ecdc4" },
    { symbol: "TEST", name: "Test Protocol", price: 890, change: 5.7, color: "#ffe66d" },
  ];

  return (
    <div className="space-y-2 p-1">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Custom Tokens</p>
      {tokens.map((token, i) => (
        <motion.div
          key={token.symbol}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold" style={{ background: `${token.color}20`, color: token.color }}>
              {token.symbol.slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{token.symbol}</p>
              <p className="text-[11px] text-zinc-600">{token.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-zinc-300">{formatCurrency(token.price)}</p>
            <p className={`text-[11px] font-medium ${token.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatPercentage(token.change)}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function TransactionsPreview() {
  const txns = [
    { type: "receive", from: "Demo Sponsor", amount: "+4,000 USDT", time: "Just now", status: "Completed" },
    { type: "send", from: "Creator Wallet", amount: "-14.20 SOL", time: "2m ago", status: "Completed" },
    { type: "receive", from: "Training Sandbox", amount: "+0.42 ETH", time: "5m ago", status: "Pending" },
  ];

  return (
    <div className="space-y-2 p-1">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Activity</p>
      {txns.map((tx, i) => (
        <motion.div
          key={tx.from}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">{tx.from}</p>
            <p className={`text-sm font-semibold ${tx.type === "receive" ? "text-emerald-400" : "text-indigo-400"}`}>
              {tx.amount}
            </p>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-zinc-700">Simulated</p>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${tx.status === "Completed" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
              <p className="text-[10px] text-zinc-600">{tx.time}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function PwaPreview() {
  return (
    <div className="flex flex-col items-center p-4 text-center">
      <div className="relative">
        <div className="h-48 w-24 rounded-2xl border-2 border-white/[0.08] bg-[#0a0a0f] p-1">
          <div className="h-full rounded-xl bg-gradient-to-b from-emerald-400/[0.04] to-transparent p-2">
            <div className="mx-auto mt-1 h-1 w-6 rounded-full bg-white/10" />
            <div className="mt-3 text-center">
              <p className="text-[7px] font-bold text-emerald-300/70">VS</p>
              <p className="text-[6px] text-zinc-500">Mirage</p>
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full rounded bg-white/[0.04]" />
              <div className="h-1.5 w-3/4 rounded bg-white/[0.03]" />
              <div className="h-1.5 w-1/2 rounded bg-white/[0.02]" />
            </div>
          </div>
        </div>
        <motion.div
          className="absolute -bottom-2 -right-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-1.5"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Smartphone className="h-4 w-4 text-emerald-300" />
        </motion.div>
      </div>
      <p className="mt-4 text-sm font-medium text-white">Install from Browser</p>
      <p className="mt-1 text-[11px] text-zinc-600">Works on iOS, Android & Desktop</p>
    </div>
  );
}

const previews: Record<string, () => React.ReactNode> = {
  balances: () => <BalancesPreview />,
  tokens: () => <TokensPreview />,
  transactions: () => <TransactionsPreview />,
  pwa: () => <PwaPreview />,
};

export function FeatureExperience() {
  const [activeFeature, setActiveFeature] = useState("balances");
  const reduceMotion = useReducedMotion();

  return (
    <section id="features" className="relative section-padding px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Features
            </span>
            <h2 className="mt-5 font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl" style={{ letterSpacing: "-0.02em" }}>
              Everything you need.
              <br />
              <span className="text-zinc-500">Nothing you don&apos;t.</span>
            </h2>
          </div>
        </ScrollReveal>

        <div className="mt-16 grid items-start gap-8 lg:mt-24 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Left: Feature list */}
          <div className="space-y-2">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const isActive = activeFeature === feature.id;
              const colors = accentColors[feature.accent];

              return (
                <ScrollReveal key={feature.id} delay={index * 0.08}>
                  <button
                    type="button"
                    onClick={() => setActiveFeature(feature.id)}
                    className={`group w-full rounded-2xl border p-5 text-left transition-all duration-300 sm:p-6 ${
                      isActive
                        ? `border-white/[0.08] bg-white/[0.03]`
                        : "border-transparent bg-transparent hover:bg-white/[0.015]"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${colors.border} ${colors.bg}`}>
                        <Icon className={`h-5 w-5 ${colors.text}`} />
                      </div>
                      <div>
                        <h3 className={`font-display text-lg font-bold transition-colors ${isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                          {feature.title}
                        </h3>
                        <p className={`mt-1.5 text-sm leading-relaxed transition-colors ${isActive ? "text-zinc-400" : "text-zinc-600"}`}>
                          {feature.description}
                        </p>
                      </div>
                    </div>
                    {isActive && (
                      <motion.div
                        layoutId="feature-indicator"
                        className="mt-4 h-px w-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${colors.glow}, transparent)` }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Right: Interactive preview */}
          <ScrollReveal variant="scale" className="hidden lg:block">
            <div className="sticky top-32">
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0f] p-6">
                {/* Glow behind preview */}
                <div
                  className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl opacity-60 blur-[80px] transition-colors duration-700"
                  style={{ background: accentColors[features.find((f) => f.id === activeFeature)?.accent ?? "emerald"].glow }}
                />

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeFeature}
                    initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                  >
                    {previews[activeFeature]?.()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
