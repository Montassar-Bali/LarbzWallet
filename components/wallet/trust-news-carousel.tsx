"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TrustNewsId = "security" | "stable-swap" | "bstocks" | "hyperliquid";

type TrustNewsItem = {
  id: TrustNewsId;
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  dismissible?: boolean;
};

type TrustNewsCarouselProps = {
  onSecurity: () => void;
  onStableSwap: () => void;
  onBStocks: () => void;
  onHyperliquid: () => void;
};

const ROTATION_MS = 4_800;

const trustNews: readonly TrustNewsItem[] = [
  {
    id: "security",
    title: "Secure your wallet",
    subtitle: "Secure your recovery phrase",
    image: "/assets/trust-news-security.png",
    imageAlt: "Recovery phrase security",
    dismissible: true,
  },
  {
    id: "stable-swap",
    title: "0% swap fees on selected stables",
    subtitle: "Applicable to same-chain swaps only",
    image: "/assets/trust-news-stable.png",
    imageAlt: "Stablecoin",
  },
  {
    id: "bstocks",
    title: "bStocks now live, 0% fees",
    subtitle: "Buy now",
    image: "/assets/trust-news-bstocks.png",
    imageAlt: "bStocks",
  },
  {
    id: "hyperliquid",
    title: "Explore Hyperliquid: 200+ markets",
    subtitle: "Explore now",
    image: "/assets/trust-news-hyperliquid.png",
    imageAlt: "Hyperliquid",
  },
] as const;

export function TrustNewsCarousel({ onSecurity, onStableSwap, onBStocks, onHyperliquid }: TrustNewsCarouselProps) {
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<TrustNewsId>(trustNews[0].id);
  const [dismissedIds, setDismissedIds] = useState<TrustNewsId[]>([]);
  const dragged = useRef(false);
  const releaseDragTimer = useRef<number | null>(null);

  const visibleNews = useMemo(
    () => trustNews.filter((item) => !dismissedIds.includes(item.id)),
    [dismissedIds],
  );
  const activeIndex = Math.max(0, visibleNews.findIndex((item) => item.id === activeId));
  const active = visibleNews[activeIndex];

  const advance = useCallback(() => {
    if (visibleNews.length < 2) return;
    setActiveId(visibleNews[(activeIndex + 1) % visibleNews.length].id);
  }, [activeIndex, visibleNews]);

  useEffect(() => {
    if (reduceMotion || visibleNews.length < 2) return;
    const intervalId = window.setInterval(advance, ROTATION_MS);
    return () => window.clearInterval(intervalId);
  }, [advance, reduceMotion, visibleNews.length]);

  useEffect(() => () => {
    if (releaseDragTimer.current !== null) window.clearTimeout(releaseDragTimer.current);
  }, []);

  if (!active) return null;

  const actions: Record<TrustNewsId, () => void> = {
    security: onSecurity,
    "stable-swap": onStableSwap,
    bstocks: onBStocks,
    hyperliquid: onHyperliquid,
  };

  function dismiss(item: TrustNewsItem) {
    const next = visibleNews[(activeIndex + 1) % visibleNews.length];
    if (next && next.id !== item.id) setActiveId(next.id);
    setDismissedIds((current) => current.includes(item.id) ? current : [...current, item.id]);
  }

  return (
    <section
      data-testid="trust-announcement-carousel"
      data-announcement-count={visibleNews.length}
      data-announcement-order={visibleNews.map((item) => item.id).join(",")}
      data-active-announcement={active.id}
      data-rotation-ms={ROTATION_MS}
      data-transition-direction="up"
      aria-label="Wallet news"
      aria-roledescription="carousel"
      className="relative mt-7 h-[4.55rem] w-full touch-none overflow-hidden rounded-[1.2rem] border border-white/[.055] bg-[#11111a]"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={active.id}
          data-testid="trust-announcement-slide"
          data-announcement-id={active.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${activeIndex + 1} of ${visibleNews.length}`}
          initial={reduceMotion ? { opacity: 1 } : { y: "100%", opacity: 0.35 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: "-100%", opacity: 0.2 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.34, ease: [0.22, 0.8, 0.24, 1] }}
          drag={reduceMotion ? false : "y"}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.16, bottom: 0.035 }}
          onDragStart={() => {
            dragged.current = true;
            if (releaseDragTimer.current !== null) window.clearTimeout(releaseDragTimer.current);
          }}
          onDragEnd={(_, info) => {
            if (info.offset.y < -26 || info.velocity.y < -260) advance();
            releaseDragTimer.current = window.setTimeout(() => {
              dragged.current = false;
              releaseDragTimer.current = null;
            }, 0);
          }}
          className="absolute inset-0 flex items-center gap-2 px-2.5"
        >
          <button
            type="button"
            aria-label={`${active.title}. ${active.subtitle}`}
            onClick={() => {
              if (!dragged.current) actions[active.id]();
            }}
            className="absolute inset-0 rounded-[1.15rem] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#8179ff]"
          />

          <span aria-hidden="true" className="pointer-events-none w-1.5 shrink-0 text-center text-[18px]/none font-black text-white/55">i</span>
          <span className="pointer-events-none relative size-9 shrink-0 overflow-hidden rounded-[.65rem]">
            <Image
              data-testid="trust-announcement-image"
              src={active.image}
              alt={active.imageAlt}
              fill
              sizes="36px"
              unoptimized
              className="object-contain"
            />
          </span>
          <span className={`pointer-events-none min-w-0 flex-1 ${active.dismissible ? "pr-8" : "pr-1"}`}>
            <strong className="block truncate text-[16px]/[20px] font-extrabold tracking-[-.018em] text-white">{active.title}</strong>
            <span className="block truncate text-[14px]/[18px] font-semibold text-white/38">{active.subtitle}</span>
          </span>

          {active.dismissible ? (
            <button
              type="button"
              aria-label={`Dismiss ${active.title}`}
              onClick={(event) => {
                event.stopPropagation();
                dismiss(active);
              }}
              className="absolute right-1.5 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full text-white/28 active:bg-white/[.05] focus-visible:outline-2 focus-visible:outline-[#8179ff]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </motion.div>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">{active.title}. {active.subtitle}</span>
      <button type="button" aria-label="Next wallet news" onClick={advance} className="sr-only">Next wallet news</button>
    </section>
  );
}
