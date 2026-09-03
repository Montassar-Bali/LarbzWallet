"use client";

import Image from "next/image";
import { useEffect, useState, type AnimationEvent, type ReactNode } from "react";

import { TrustWallet } from "@/components/wallet/trust-wallet";
import { WalletRuntimeProvider } from "@/components/wallet/wallet-runtime";

const SPLASH_FALLBACK_MS = 2_800;

function TrustWalletSplash({ onComplete }: { onComplete: () => void }) {
  function finishAnimation(event: AnimationEvent<HTMLElement>) {
    if (event.target === event.currentTarget && event.animationName === "larpz-trust-splash-exit") onComplete();
  }

  return (
    <main
      data-testid="trust-splash"
      role="status"
      aria-live="polite"
      aria-label="Opening Trust Wallet"
      aria-busy="true"
      onAnimationEnd={finishAnimation}
      className="trust-wallet-splash absolute inset-0 z-[300] grid min-h-[100dvh] place-items-center overflow-hidden bg-black"
    >
      <div className="trust-splash-ambient absolute inset-0" aria-hidden="true" />
      <div className="relative flex flex-col items-center px-8 text-center">
        <div className="trust-splash-halo absolute left-1/2 top-[4.8rem] h-40 w-40 -translate-x-1/2 rounded-full" aria-hidden="true" />
        <div className="trust-splash-mark-frame relative h-[9.75rem] w-[9.75rem]" aria-hidden="true">
          <span className="trust-splash-orbit absolute inset-[-1rem] rounded-[42%] border border-[#3969ff]/20" />
          <Image
            src="/icons/wallets/trust.png"
            alt=""
            fill
            priority
            sizes="156px"
            className="object-contain [transform:scaleX(-1)]"
          />
          <span
            className="trust-splash-glint-mask absolute inset-[7%] overflow-hidden"
            style={{ clipPath: "polygon(50% 0, 88% 15%, 88% 57%, 82% 71%, 70% 84%, 50% 96%, 30% 84%, 18% 71%, 12% 57%, 12% 15%)" }}
          >
            <span className="trust-splash-glint absolute -inset-y-[12%] left-0 w-[48%] bg-[linear-gradient(105deg,transparent_12%,rgba(255,255,255,.9)_50%,transparent_88%)] mix-blend-screen" />
          </span>
        </div>
        <p className="trust-splash-brand mt-8 text-[1rem] font-black tracking-[0.34em] text-[#f5f7ff]">TRUST WALLET</p>
      </div>
      <span className="sr-only">Preparing your Trust Wallet.</span>

      <style>{`
        .trust-wallet-splash {
          animation: larpz-trust-splash-exit 2400ms cubic-bezier(.22, .8, .24, 1) both;
          color-scheme: dark;
        }

        .trust-splash-ambient {
          background:
            radial-gradient(circle at 50% 47%, rgba(26, 97, 255, .13), transparent 20%),
            radial-gradient(circle at 46% 49%, rgba(30, 243, 133, .08), transparent 27%),
            #000;
          animation: larpz-trust-ambient 2400ms ease-out both;
        }

        .trust-splash-halo {
          background: conic-gradient(from 210deg, rgba(29, 255, 135, .42), rgba(30, 92, 255, .45), rgba(29, 255, 135, .42));
          filter: blur(42px);
          opacity: 0;
          animation: larpz-trust-halo 1900ms 160ms ease-out both;
        }

        .trust-splash-mark-frame {
          filter: drop-shadow(-18px 20px 38px rgba(15, 246, 126, .15)) drop-shadow(18px 10px 34px rgba(31, 87, 255, .22));
          transform-style: preserve-3d;
          will-change: transform, opacity, filter;
          animation: larpz-trust-mark 2400ms cubic-bezier(.16, 1, .3, 1) both;
        }

        .trust-splash-orbit {
          opacity: 0;
          transform: scale(.72) rotate(12deg);
          animation: larpz-trust-orbit 1600ms 300ms cubic-bezier(.16, 1, .3, 1) both;
        }

        .trust-splash-glint {
          opacity: 0;
          transform: translateX(-180%) skewX(-12deg);
          animation: larpz-trust-glint 900ms 720ms ease-in-out both;
        }

        .trust-splash-brand {
          opacity: 0;
          transform: translateY(8px);
          animation: larpz-trust-copy 1050ms 620ms cubic-bezier(.16, 1, .3, 1) both;
        }

        @keyframes larpz-trust-splash-exit {
          0%, 82% { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }

        @keyframes larpz-trust-ambient {
          0% { opacity: .35; transform: scale(1.08); }
          45%, 82% { opacity: 1; transform: scale(1); }
          100% { opacity: .2; transform: scale(1.04); }
        }

        @keyframes larpz-trust-mark {
          0% { opacity: 0; transform: perspective(700px) translateY(18px) scale(.54) rotateY(-28deg); filter: blur(8px); }
          22% { opacity: 1; transform: perspective(700px) translateY(0) scale(1.02) rotateY(4deg); filter: blur(0); }
          47% { transform: perspective(700px) scale(1.08) rotateY(-2deg); }
          68% { transform: perspective(700px) scale(.98) rotateY(0); }
          84% { opacity: 1; transform: perspective(700px) scale(1); }
          100% { opacity: 0; transform: perspective(700px) translateY(-5px) scale(1.12); }
        }

        @keyframes larpz-trust-halo {
          0% { opacity: 0; transform: translateX(-50%) scale(.55); }
          35%, 72% { opacity: .55; transform: translateX(-50%) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) scale(1.3); }
        }

        @keyframes larpz-trust-orbit {
          0% { opacity: 0; transform: scale(.72) rotate(12deg); }
          40% { opacity: .55; }
          100% { opacity: 0; transform: scale(1.22) rotate(0); }
        }

        @keyframes larpz-trust-glint {
          0% { opacity: 0; transform: translateX(-180%) skewX(-12deg); }
          24% { opacity: .75; }
          100% { opacity: 0; transform: translateX(310%) skewX(-12deg); }
        }

        @keyframes larpz-trust-copy {
          0% { opacity: 0; transform: translateY(8px); }
          35%, 78% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-2px); }
        }
      `}</style>
    </main>
  );
}

function TrustWalletLaunch({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeoutId = window.setTimeout(() => setShowSplash(false), reducedMotion ? 120 : SPLASH_FALLBACK_MS);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="trust-wallet-font relative min-h-[100dvh] overflow-hidden bg-black">
      <div data-testid="trust-wallet-content" inert={showSplash} aria-hidden={showSplash} className={showSplash ? "pointer-events-none" : undefined}>{children}</div>
      {showSplash ? <TrustWalletSplash onComplete={() => setShowSplash(false)} /> : null}
    </div>
  );
}

export function TrustWalletWithSplash() {
  return (
    <TrustWalletLaunch>
      <WalletRuntimeProvider walletId="trust"><TrustWallet /></WalletRuntimeProvider>
    </TrustWalletLaunch>
  );
}
