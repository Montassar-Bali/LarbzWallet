"use client";

import { type MotionValue, motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { ScrollReveal } from "@/components/effects/scroll-reveal";
import { formatCurrency, formatPercentage } from "@/lib/utils";

const stories = [
  {
    label: "01",
    headline: "Meet your simulated wallet.",
    description: "A pixel-perfect digital wallet built entirely for demonstration. Every screen, every interaction — designed to feel real.",
  },
  {
    label: "02",
    headline: "The interface is yours.",
    description: "Customize balances, tokens, and portfolio values to match any scenario you need to present.",
  },
  {
    label: "03",
    headline: "Every detail is customizable.",
    description: "Add custom tokens with branded icons, set specific price points, and build the exact portfolio your demo requires.",
  },
  {
    label: "04",
    headline: "Every interaction feels real.",
    description: "Simulated sends, receives, and activity history that look indistinguishable from a production wallet.",
  },
  {
    label: "05",
    headline: "Nothing touches the real blockchain.",
    description: "Zero risk. Zero real assets. Pure simulation built for safe, compelling demonstrations.",
  },
];

function FloatingWalletScene({ progress }: { progress: MotionValue<number> }) {
  const scale = useTransform(progress, [0, 0.3, 0.6, 1], [0.85, 1, 1.05, 0.95]);
  const y = useTransform(progress, [0, 0.3, 0.6, 1], [40, 0, -20, 10]);
  const rotateY = useTransform(progress, [0, 0.25, 0.5, 0.75, 1], [8, 0, -5, 3, 0]);
  const opacity = useTransform(progress, [0, 0.05, 0.9, 1], [0, 1, 1, 0.7]);

  return (
    <motion.div
      className="relative mx-auto w-full max-w-[300px]"
      style={{
        scale: scale as unknown as number,
        y: y as unknown as number,
        rotateY: rotateY as unknown as number,
        opacity: opacity as unknown as number,
        perspective: 1000,
      }}
    >
      {/* Main wallet card */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f] p-5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-emerald-300/50">Mirage</p>
            <p className="font-display text-lg font-bold text-white">Wallet</p>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300/80">
            Simulation
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Total Portfolio</p>
          <p className="mt-1 font-display text-2xl font-bold text-white">{formatCurrency(128_450.25)}</p>
          <p className="mt-0.5 text-xs font-medium text-emerald-400">{formatPercentage(4.82)} · 24h</p>
        </div>

        <div className="mt-3 space-y-1.5">
          {[
            { s: "BTC", n: "Bitcoin", v: 58_862, c: 2.9, col: "#f7931a" },
            { s: "ETH", n: "Ethereum", v: 27_900, c: 3.6, col: "#627eea" },
            { s: "SOL", n: "Solana", v: 26_941, c: 5.2, col: "#9945ff" },
          ].map((t) => (
            <div key={t.s} className="flex items-center justify-between rounded-lg bg-white/[0.015] px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full" style={{ background: `${t.col}25`, border: `1px solid ${t.col}40` }} />
                <span className="text-xs font-medium text-white">{t.s}</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-300">{formatCurrency(t.v)}</p>
                <p className="text-[10px] text-emerald-400">{formatPercentage(t.c)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Glow */}
      <div className="absolute -inset-10 -z-10 rounded-full bg-emerald-400/[0.04] blur-[60px]" />
    </motion.div>
  );
}

export function ScrollExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  return (
    <section ref={containerRef} className="relative section-padding px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: Sticky wallet scene */}
          <div className="hidden lg:block">
            <div className="sticky top-32">
              <FloatingWalletScene progress={scrollYProgress} />
            </div>
          </div>

          {/* Right: Story sections */}
          <div className="space-y-32 lg:space-y-48">
            {stories.map((story, index) => (
              <ScrollReveal
                key={story.label}
                variant="slide-up"
                delay={0.05}
              >
                <div className="relative">
                  <span className="font-display text-6xl font-extrabold text-white/[0.03] sm:text-8xl">
                    {story.label}
                  </span>
                  <h3 className="mt-2 font-display text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl" style={{ letterSpacing: "-0.02em" }}>
                    {story.headline}
                  </h3>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-zinc-500 sm:text-lg">
                    {story.description}
                  </p>
                  {index === stories.length - 1 && (
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/[0.04] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Simulation disclaimer
                    </div>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* Mobile wallet — shown inline on mobile */}
        <div className="mt-16 lg:hidden">
          <ScrollReveal variant="scale">
            <FloatingWalletScene progress={scrollYProgress} />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
