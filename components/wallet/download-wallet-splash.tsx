"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { DownloadWallet } from "@/components/wallet/download-wallet";

const SPLASH_DURATION_MS = 5_000;

function DownloadWalletSplash() {
  return (
    <main
      className="fixed inset-0 z-[100] flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#a295f3]"
      aria-label="Loading Phantom"
      role="status"
    >
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          <filter id="larpz-splash-color-correct" colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="linear" slope="1.10714" intercept="-0.10714" />
              <feFuncG type="linear" slope="1.10417" intercept="-0.10417" />
              <feFuncB type="linear" slope="0.92308" intercept="0.07692" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      <div
        className="relative h-[150px] w-[150px]"
        style={{
          animation: "larpz-splash-mark 5s cubic-bezier(0.22, 1, 0.36, 1) both",
          filter: "url(#larpz-splash-color-correct)",
        }}
      >
        <Image
          src="/assets/logo.png"
          alt=""
          fill
          priority
          sizes="150px"
          className="object-contain"
        />
      </div>

      <style>{`
        @keyframes larpz-splash-mark {
          0% {
            opacity: 0;
            transform: scale(0.72) rotate(-7deg);
          }
          13% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
          34% {
            transform: scale(1.06) rotate(1deg);
          }
          52% {
            transform: scale(0.97) rotate(0deg);
          }
          72% {
            transform: scale(1) rotate(0deg);
          }
          91% {
            opacity: 1;
            transform: scale(1.02) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: scale(1.08) rotate(0deg);
          }
        }
      `}</style>
    </main>
  );
}

export function DownloadWalletWithSplash() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return showSplash ? <DownloadWalletSplash /> : <DownloadWallet />;
}
