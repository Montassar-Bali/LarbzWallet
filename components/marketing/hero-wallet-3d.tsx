"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useCallback, useRef } from "react";

import { formatCurrency, formatPercentage } from "@/lib/utils";

const tokenRows = [
  { symbol: "BTC", name: "Bitcoin", value: 58_862, change: 2.9, color: "#f7931a" },
  { symbol: "ETH", name: "Ethereum", value: 27_900, change: 3.6, color: "#627eea" },
  { symbol: "SOL", name: "Solana", value: 26_941, change: 5.2, color: "#9945ff" },
];

const activityRows = [
  { type: "receive" as const, label: "Demo Sponsor", amount: "+4,000 USDT", time: "Today" },
  { type: "send" as const, label: "Creator Wallet", amount: "-14.20 SOL", time: "Yesterday" },
];

function MiniWalletCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        ...style,
        background: "linear-gradient(135deg, rgba(110,231,183,0.12), rgba(10,10,15,0.95) 60%, rgba(129,140,248,0.08))",
      }}
    >
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f]/90 p-4 backdrop-blur-sm">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-emerald-200/60">Mirage</p>
        <p className="mt-1 font-display text-lg font-bold text-white">Simulation Wallet</p>
        <p className="mt-6 text-[11px] tracking-[0.22em] text-white/40">**** **** **** 2048</p>
      </div>
    </div>
  );
}

function PortfolioCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={style}>
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f]/95 p-4 backdrop-blur-sm">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Total Portfolio</p>
        <p className="mt-2 font-display text-2xl font-bold text-white">{formatCurrency(128_450.25)}</p>
        <p className="mt-1 text-xs font-medium text-emerald-400">{formatPercentage(4.82)} · 24h</p>
        <div
          className="mt-3 h-14 rounded-xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(110,231,183,0.15), rgba(10,10,15,0.9) 50%, rgba(129,140,248,0.1))",
          }}
        />
      </div>
    </div>
  );
}

function TokenCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={style}>
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f]/95 p-3 backdrop-blur-sm">
        {tokenRows.map((token) => (
          <div key={token.symbol} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <div
                className="h-6 w-6 rounded-full"
                style={{ background: `${token.color}30`, border: `1px solid ${token.color}50` }}
              />
              <div>
                <p className="text-xs font-semibold text-white">{token.symbol}</p>
                <p className="text-[10px] text-zinc-500">{token.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-white">{formatCurrency(token.value)}</p>
              <p className="text-[10px] font-medium text-emerald-400">{formatPercentage(token.change)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={style}>
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f]/95 p-3 backdrop-blur-sm">
        {activityRows.map((activity) => (
          <div key={activity.label} className="flex items-center justify-between border-b border-white/[0.04] py-2 last:border-0">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/[0.04]">
                {activity.type === "receive" ? (
                  <ArrowDownLeft className="h-3 w-3 text-emerald-400" />
                ) : (
                  <ArrowUpRight className="h-3 w-3 text-indigo-400" />
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-white">{activity.label}</p>
                <p className="text-[9px] uppercase tracking-wider text-zinc-600">Simulated</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-xs font-medium ${activity.type === "receive" ? "text-emerald-400" : "text-indigo-400"}`}>
                {activity.amount}
              </p>
              <p className="text-[10px] text-zinc-600">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroWallet3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { stiffness: 100, damping: 30 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [3, -3]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-3, 3]), springConfig);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (reduceMotion || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
      mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
    },
    [mouseX, mouseY, reduceMotion],
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto h-[420px] w-full max-w-[460px] sm:h-[480px] lg:h-[520px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: "1200px" }}
    >
      {/* Glow behind wallet */}
      <div className="absolute inset-0 z-0">
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/[0.08] blur-[80px]" />
        <div className="absolute left-[30%] top-[60%] h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/[0.06] blur-[60px]" />
      </div>

      {/* Activity card — deepest layer */}
      <motion.div
        className="absolute right-0 top-[5%] z-10 w-[220px] sm:w-[240px]"
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
        initial={reduceMotion ? undefined : { opacity: 0, x: 40, y: 20 }}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
          transition={reduceMotion ? undefined : { repeat: Infinity, duration: 7, ease: "easeInOut" }}
          style={{ transform: "translateZ(-60px)" }}
        >
          <ActivityCard />
        </motion.div>
      </motion.div>

      {/* Token card — mid layer */}
      <motion.div
        className="absolute left-0 top-[18%] z-20 w-[220px] sm:w-[250px]"
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
        initial={reduceMotion ? undefined : { opacity: 0, x: -40, y: 20 }}
        animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
          transition={reduceMotion ? undefined : { repeat: Infinity, duration: 8, ease: "easeInOut", delay: 1 }}
          style={{ transform: "translateZ(-30px)" }}
        >
          <TokenCard />
        </motion.div>
      </motion.div>

      {/* Main portfolio card — front layer */}
      <motion.div
        className="absolute left-1/2 top-[25%] z-30 w-[260px] -translate-x-1/2 sm:w-[280px]"
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
        initial={reduceMotion ? undefined : { opacity: 0, y: 30, scale: 0.95 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
          transition={reduceMotion ? undefined : { repeat: Infinity, duration: 6, ease: "easeInOut" }}
        >
          <PortfolioCard />
        </motion.div>
      </motion.div>

      {/* Wallet card — bottom accent */}
      <motion.div
        className="absolute bottom-[5%] left-1/2 z-20 w-[240px] -translate-x-1/2 sm:w-[260px]"
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
        initial={reduceMotion ? undefined : { opacity: 0, y: 40 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, 6, 0] }}
          transition={reduceMotion ? undefined : { repeat: Infinity, duration: 9, ease: "easeInOut", delay: 2 }}
          style={{ transform: "translateZ(-45px)" }}
        >
          <MiniWalletCard />
        </motion.div>
      </motion.div>
    </div>
  );
}
