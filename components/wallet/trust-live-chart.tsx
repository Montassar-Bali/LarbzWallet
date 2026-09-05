"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

export type TrustChartPoint = { time: number; price: number };

function useTrustChart(
  symbol: string,
  period: string,
  livePrice: number,
  retryKey: number,
  enabled = true,
) {
  const [points, setPoints] = useState<TrustChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/market-chart?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json() as { points?: TrustChartPoint[]; error?: string };
        const valid = (payload.points ?? []).filter(
          (point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0,
        );
        if (!response.ok || valid.length < 2) throw new Error(payload.error || "Live chart data is unavailable.");
        const last = valid.at(-1);
        if (livePrice > 0 && (!last || Math.abs(last.price - livePrice) > Number.EPSILON)) {
          valid.push({ time: Date.now(), price: livePrice });
        }
        if (active) setPoints(valid);
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setPoints([]);
          setError(caught instanceof Error ? caught.message : "Live chart data is unavailable.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, livePrice, period, retryKey, symbol]);

  return { points, loading, error };
}

function money(value: number, currency: string, rate: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value * rate);
}

export function TrustLiveChart({
  symbol,
  period,
  livePrice,
  currency = "USD",
  rate = 1,
  points: suppliedPoints,
}: {
  symbol: string;
  period: string;
  livePrice: number;
  currency?: string;
  rate?: number;
  points?: TrustChartPoint[];
}) {
  const [retryKey, setRetryKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const gradientId = `trust-chart-${useId().replaceAll(":", "")}`;
  const supplied = useMemo(() => (suppliedPoints ?? []).filter(
    (point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0,
  ), [suppliedPoints]);
  const remote = useTrustChart(symbol, period, livePrice, retryKey, suppliedPoints === undefined);
  const points = useMemo(
    () => suppliedPoints === undefined ? remote.points : supplied.length >= 2 ? supplied : [],
    [remote.points, supplied, suppliedPoints],
  );
  const loading = suppliedPoints === undefined ? remote.loading : false;
  const error = suppliedPoints === undefined ? remote.error : supplied.length >= 2 ? "" : "Live chart data is unavailable.";

  const chart = useMemo(() => {
    const width = 420;
    const height = 236;
    const padding = 8;
    const firstTime = points[0]?.time ?? 0;
    const lastTime = points.at(-1)?.time ?? firstTime + 1;
    const values = points.map((point) => point.price);
    const minimum = values.length ? Math.min(...values) : 0;
    const maximum = values.length ? Math.max(...values) : 1;
    const range = maximum - minimum || Math.max(maximum * 0.01, 1);
    const mapped = points.map((point) => ({
      ...point,
      x: padding + ((point.time - firstTime) / Math.max(1, lastTime - firstTime)) * (width - padding * 2),
      y: padding + ((maximum - point.price + range * 0.05) / (range * 1.1)) * (height - padding * 2),
    }));
    const line = mapped.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const area = mapped.length ? `0,${height} ${line} ${width},${height}` : "";
    return { width, height, firstTime, lastTime, mapped, line, area };
  }, [points]);

  const rising = (points.at(-1)?.price ?? livePrice) >= (points[0]?.price ?? livePrice);
  const accent = rising ? "#38e07b" : "#ff5364";
  const selected = chart.mapped[selectedIndex ?? Math.max(0, chart.mapped.length - 1)];

  function inspect(clientX: number, left: number, renderedWidth: number) {
    if (!chart.mapped.length) return;
    const ratio = Math.max(0, Math.min(1, (clientX - left) / Math.max(1, renderedWidth)));
    const targetTime = chart.firstTime + ratio * (chart.lastTime - chart.firstTime);
    let closest = 0;
    for (let index = 1; index < chart.mapped.length; index += 1) {
      if (Math.abs(chart.mapped[index].time - targetTime) < Math.abs(chart.mapped[closest].time - targetTime)) closest = index;
    }
    setSelectedIndex(closest);
  }

  if (!points.length) {
    return (
      <div data-testid="trust-token-chart" className="grid h-[clamp(12rem,27svh,18rem)] place-items-center rounded-[1.75rem] bg-white/[.025] px-7 text-center">
        {loading ? (
          <div role="status" className="text-sm text-white/50">
            <span className="mx-auto mb-4 block size-8 animate-spin rounded-full border-2 border-white/15 border-t-[#4437ff]" />
            Loading live {symbol} chart…
          </div>
        ) : (
          <div>
            <p role="alert" className="text-sm text-white/50">{error || "Live chart data is unavailable."}</p>
            {suppliedPoints === undefined ? (
              <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-full bg-white/[.08] px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#675cff]">
                <RefreshCw className="size-4" /> Try again
              </button>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="trust-token-chart"
      className="relative h-[clamp(12rem,27svh,18rem)] touch-none select-none overflow-hidden"
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
        <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl bg-[#1b1c28]/95 px-3 py-2 text-center text-xs shadow-xl" style={{ left: `${Math.max(15, Math.min(85, selected.x / chart.width * 100))}%` }}>
          <strong className="block text-sm">{money(selected.price, currency, rate)}</strong>
          <span className="mt-0.5 block text-white/45">{new Date(selected.time).toLocaleString("en-US", period === "1D" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: period === "1Y" || period === "ALL" ? "numeric" : undefined })}</span>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={`${symbol} ${period} market price chart`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity=".3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={chart.area} fill={`url(#${gradientId})`} stroke="none" />
        <polyline points={chart.line} fill="none" stroke={accent} strokeWidth="3.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {selectedIndex !== null && selected ? (
          <>
            <line x1={selected.x} x2={selected.x} y1="0" y2={chart.height} stroke="rgba(255,255,255,.24)" strokeWidth="1" />
            <circle cx={selected.x} cy={selected.y} r="6" fill={accent} stroke="#05060f" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      {loading ? <span className="absolute right-4 top-3 size-2.5 animate-pulse rounded-full bg-[#675cff]" aria-label="Refreshing chart" /> : null}
    </div>
  );
}
