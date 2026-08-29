"use client";

import { useEffect, useRef } from "react";

type PriceMap = Record<string, number>;
type ChangeMap = Record<string, number>;
type ImageMap = Record<string, string>;
type MarketCapMap = Record<string, number>;

export function useLivePrices(
  symbols: string[],
  onUpdate: (
    prices: PriceMap,
    changes: ChangeMap,
    images: ImageMap,
    marketCaps: MarketCapMap,
  ) => void,
) {
  const symbolKey = Array.from(
    new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  ).join(",");

  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!symbolKey) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/prices?symbols=${encodeURIComponent(symbolKey)}`,
          { cache: "no-store" },
        );

        if (!response.ok) return;

        const payload = (await response.json()) as {
          prices?: PriceMap;
          changes?: ChangeMap;
          images?: ImageMap;
          marketCaps?: MarketCapMap;
        };

        if (!cancelled && payload.prices) {
          onUpdateRef.current(
            payload.prices,
            payload.changes ?? {},
            payload.images ?? {},
            payload.marketCaps ?? {},
          );
        }
      } catch {
        // Keep locally seeded quotes if the provider is unavailable.
      }
    };

    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [symbolKey]);
}
