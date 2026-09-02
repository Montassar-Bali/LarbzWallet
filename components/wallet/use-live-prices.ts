"use client";

import { useEffect, useRef } from "react";

type PriceMap = Record<string, number>;
type ChangeMap = Record<string, number>;
type ImageMap = Record<string, string>;
type MarketCapMap = Record<string, number>;
type VolumeMap = Record<string, number>;

export function useLivePrices(
  symbols: string[],
  onUpdate: (
    prices: PriceMap,
    changes: ChangeMap,
    images: ImageMap,
    marketCaps: MarketCapMap,
    changes1h: ChangeMap,
    changes7d: ChangeMap,
    volumes24h: VolumeMap,
  ) => void,
  refreshKey = 0,
  onSettled?: (success: boolean) => void,
  marketApiKey = "",
) {
  const symbolKey = Array.from(
    new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  ).join(",");

  const onUpdateRef = useRef(onUpdate);
  const onSettledRef = useRef(onSettled);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (!symbolKey) return;

    let cancelled = false;

    const refresh = async () => {
      let success = false;
      try {
        const response = await fetch(
          `/api/prices?symbols=${encodeURIComponent(symbolKey)}`,
          {
            cache: "no-store",
            headers: marketApiKey ? { "x-larpz-market-api-key": marketApiKey } : undefined,
          },
        );

        if (!response.ok) throw new Error(`Price request failed with ${response.status}.`);

        const payload = (await response.json()) as {
          prices?: PriceMap;
          changes?: ChangeMap;
          images?: ImageMap;
          marketCaps?: MarketCapMap;
          changes1h?: ChangeMap;
          changes7d?: ChangeMap;
          volumes24h?: VolumeMap;
          error?: string;
        };

        const hasUsableQuote = Object.values(payload.prices ?? {}).some(
          (price) => Number.isFinite(price) && price >= 0,
        );

        if (!cancelled && !payload.error && payload.prices && hasUsableQuote) {
          success = true;
          onUpdateRef.current(
            payload.prices,
            payload.changes ?? {},
            payload.images ?? {},
            payload.marketCaps ?? {},
            payload.changes1h ?? {},
            payload.changes7d ?? {},
            payload.volumes24h ?? {},
          );
        }
      } catch {
        // Keep locally seeded quotes if the provider is unavailable.
      } finally {
        if (!cancelled) onSettledRef.current?.(success);
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
  }, [marketApiKey, refreshKey, symbolKey]);
}
