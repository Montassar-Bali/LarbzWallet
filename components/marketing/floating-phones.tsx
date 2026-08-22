"use client";

import { motion, useReducedMotion } from "framer-motion";

import { ScrollReveal } from "@/components/effects/scroll-reveal";
import { IPhoneFrame } from "@/components/ui/iphone-frame";
import { WalletScreenContent } from "@/components/wallet/wallet-phone";

const phones: Array<{
  variant: "portfolio" | "details" | "activity" | "wallet";
  rotate: number;
  y: number;
  delay: number;
  floatDuration: number;
  floatDistance: number;
}> = [
  { variant: "portfolio", rotate: -5, y: 24, delay: 0, floatDuration: 6, floatDistance: 12 },
  { variant: "details", rotate: -1.5, y: -12, delay: 0.12, floatDuration: 7, floatDistance: 16 },
  { variant: "activity", rotate: 1.5, y: -18, delay: 0.24, floatDuration: 8, floatDistance: 14 },
  { variant: "wallet", rotate: 5, y: 18, delay: 0.36, floatDuration: 6.5, floatDistance: 10 },
];

export function FloatingPhones() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative section-padding overflow-hidden px-4 sm:px-6 lg:px-8">
      {/* Atmospheric glow behind phones */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/[0.03] blur-[120px]" />
        <div className="absolute left-[30%] top-[60%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/[0.04] blur-[80px]" />
      </div>

      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Experience
            </span>
            <h2
              className="mt-5 font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl"
              style={{ letterSpacing: "-0.02em" }}
            >
              Four screens.
              <br />
              <span className="text-zinc-500">One seamless wallet.</span>
            </h2>
            <p className="mt-4 text-base text-zinc-500 sm:text-lg">
              Every interface is built for presentations, walkthroughs, and content creation.
            </p>
          </div>
        </ScrollReveal>

        {/* Floating iPhones row */}
        <div
          className="relative mx-auto mt-16 flex items-center justify-center gap-3 sm:gap-5 lg:mt-24 lg:gap-6 xl:gap-8"
          style={{ perspective: "1400px" }}
        >
          {phones.map((phone) => (
            <motion.div
              key={phone.variant}
              className="relative w-[150px] shrink-0 sm:w-[180px] md:w-[210px] lg:w-[240px] xl:w-[260px]"
              initial={
                reduceMotion
                  ? undefined
                  : { opacity: 0, y: 80, rotateY: phone.rotate * 3 }
              }
              whileInView={
                reduceMotion
                  ? undefined
                  : { opacity: 1, y: 0, rotateY: 0 }
              }
              viewport={{ once: true, amount: 0.15 }}
              transition={{
                duration: 0.9,
                delay: phone.delay,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              style={{
                transform: `translateY(${phone.y}px) rotate(${phone.rotate}deg)`,
                transformStyle: "preserve-3d",
              }}
            >
              {/* Float animation wrapper */}
              <motion.div
                animate={
                  reduceMotion
                    ? undefined
                    : { y: [0, -phone.floatDistance, 0] }
                }
                transition={
                  reduceMotion
                    ? undefined
                    : {
                        repeat: Infinity,
                        duration: phone.floatDuration,
                        ease: "easeInOut",
                      }
                }
              >
                <IPhoneFrame>
                  <WalletScreenContent variant={phone.variant} />
                </IPhoneFrame>

                {/* Reflection / shadow beneath */}
                <div
                  className="mx-auto mt-6 h-6 w-[70%] rounded-full opacity-40 blur-2xl"
                  style={{
                    background:
                      "radial-gradient(ellipse, rgba(110,231,183,0.12), transparent 70%)",
                  }}
                />
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Label row */}
        <div className="mx-auto mt-12 flex max-w-3xl items-center justify-center gap-6 sm:gap-10 lg:mt-16">
          {["Portfolio", "Token Detail", "Activity", "Wallet"].map(
            (label, i) => (
              <ScrollReveal key={label} delay={i * 0.08}>
                <p className="text-center text-[11px] font-medium uppercase tracking-wider text-zinc-600 sm:text-xs">
                  {label}
                </p>
              </ScrollReveal>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
