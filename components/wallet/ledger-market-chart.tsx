"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

type MarketChartPoint = {
  time: number;
  price: number;
};

function useLedgerMarketChart(symbol: string, period: string, livePrice: number, retryKey: number, marketApiKey: string) {
  const [points, setPoints] = useState<MarketChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/market-chart?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: marketApiKey ? { "x-larpz-market-api-key": marketApiKey } : undefined,
          },
        );
        const payload = await response.json() as { points?: MarketChartPoint[]; error?: string };
        if (!response.ok || !Array.isArray(payload.points) || payload.points.length < 2) {
          throw new Error(payload.error || "Live chart data is unavailable.");
        }
        const next = payload.points.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0);
        if (next.length < 2) throw new Error("Live chart data is unavailable.");
        const lastPoint = next.at(-1);
        if (livePrice > 0 && (!lastPoint || Math.abs(lastPoint.price - livePrice) > Number.EPSILON)) {
          next.push({ time: Date.now(), price: livePrice });
        }
        if (!cancelled) setPoints(next);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setPoints([]);
          setError(caught instanceof Error ? caught.message : "Live chart data is unavailable.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [livePrice, marketApiKey, period, retryKey, symbol]);

  return { points, loading, error };
}

function chartMoney(value: number, currency: string, rate: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value * rate);
}

export function LedgerMarketChart({ symbol, period, livePrice, currency, rate, marketApiKey }: { symbol: string; period: string; livePrice: number; currency: string; rate: number; marketApiKey: string }) {
  const [retryKey, setRetryKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const gradientId = `ledger-chart-${useId().replaceAll(":", "")}`;
  const { points, loading, error } = useLedgerMarketChart(symbol, period, livePrice, retryKey, marketApiKey);

  const chart = useMemo(() => {
    const width = 420;
    const height = 250;
    const padding = 8;
    const firstTime = points[0]?.time ?? 0;
    const lastTime = points.at(-1)?.time ?? firstTime + 1;
    const values = points.map((point) => point.price);
    const minimum = values.length ? Math.min(...values) : 0;
    const maximum = values.length ? Math.max(...values) : 1;
    const rawRange = maximum - minimum;
    const range = rawRange || Math.max(maximum * 0.01, 1);
    const mapped = points.map((point) => ({
      ...point,
      x: padding + ((point.time - firstTime) / Math.max(1, lastTime - firstTime)) * (width - padding * 2),
      y: padding + ((maximum - point.price + range * 0.05) / (range * 1.1)) * (height - padding * 2),
    }));
    const line = mapped.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const area = mapped.length ? `0,${height} ${line} ${width},${height}` : "";
    return { width, height, firstTime, lastTime, mapped, line, area };
  }, [points]);

  const positive = (points.at(-1)?.price ?? livePrice) >= (points[0]?.price ?? livePrice);
  const accent = positive ? "#5bd87b" : "#f57a87";
  const selected = chart.mapped[selectedIndex ?? Math.max(0, chart.mapped.length - 1)];

  function inspect(clientX: number, left: number, renderedWidth: number) {
    if (!chart.mapped.length) return;
    const ratio = Math.max(0, Math.min(1, (clientX - left) / Math.max(1, renderedWidth)));
    const target = chart.firstTime + ratio * (chart.lastTime - chart.firstTime);
    let closest = 0;
    for (let index = 1; index < chart.mapped.length; index += 1) {
      if (Math.abs(chart.mapped[index].time - target) < Math.abs(chart.mapped[closest].time - target)) closest = index;
    }
    setSelectedIndex(closest);
  }

  if (!points.length) {
    return (
      <div data-testid="ledger-asset-chart" className="grid h-[clamp(13rem,29svh,20rem)] place-items-center rounded-[1.5rem] bg-white/[0.025] px-7 text-center">
        {loading ? (
          <div role="status" className="text-sm text-white/55">
            <span className="mx-auto mb-4 block size-8 animate-spin rounded-full border-2 border-white/15 border-t-[#a99bf7]" />
            Loading live {symbol} chart…
          </div>
        ) : (
          <div>
            <p role="alert" className="text-sm text-white/55">{error || "Live chart data is unavailable."}</p>
            <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-sm font-semibold">
              <RefreshCw className="size-4" /> Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="ledger-asset-chart"
      className="relative h-[clamp(13rem,29svh,20rem)] touch-none select-none overflow-hidden"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const bounds = event.currentTarget.getBoundingClientRect();
        inspect(event.clientX, bounds.left, bounds.width);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        inspect(event.clientX, bounds.left, bounds.width);
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onPointerLeave={() => setSelectedIndex(null)}
    >
      {selectedIndex !== null && selected ? (
        <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl bg-[#242326]/95 px-3 py-2 text-center text-xs shadow-xl" style={{ left: `${Math.max(15, Math.min(85, selected.x / chart.width * 100))}%` }}>
          <strong className="block text-sm">{chartMoney(selected.price, currency, rate)}</strong>
          <span className="mt-0.5 block text-white/45">{new Date(selected.time).toLocaleString("en-US", period === "1D" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: period === "1Y" || period === "ALL" ? "numeric" : undefined })}</span>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={`${symbol} ${period} market price chart`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={chart.area} fill={`url(#${gradientId})`} stroke="none" />
        <polyline points={chart.line} fill="none" stroke={accent} strokeWidth="3.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {selectedIndex !== null && selected ? (
          <>
            <line x1={selected.x} x2={selected.x} y1="0" y2={chart.height} stroke="rgba(255,255,255,.25)" strokeWidth="1" />
            <circle cx={selected.x} cy={selected.y} r="6" fill={accent} stroke="#000" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      {loading ? <span className="absolute right-4 top-3 size-2.5 animate-pulse rounded-full bg-[#a99bf7]" aria-label="Refreshing chart" /> : null}
    </div>
  );
}
