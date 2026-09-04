"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import styles from "./ledger-wallet.module.css";
import type { WalletToken } from "@/lib/types";

type ChartPoint = {
  time: number;
  value: number;
};

type MarketPoint = {
  time: number;
  price: number;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function chartDate(time: number, period: string) {
  return new Intl.DateTimeFormat("en-US", period === "1D"
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: period === "1Y" || period === "ALL" ? "numeric" : undefined })
    .format(new Date(time));
}

export function LedgerPortfolioChart({
  tokens,
  period,
  currency,
  rate,
  total,
  marketApiKey,
  additionalBalances,
}: {
  tokens: WalletToken[];
  period: string;
  currency: string;
  rate: number;
  total: number;
  marketApiKey: string;
  additionalBalances: Record<string, number>;
}) {
  const [rawPoints, setRawPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const gradientId = `ledger-portfolio-${useId().replaceAll(":", "")}`;
  const holdingsKey = useMemo(() => JSON.stringify([...tokens]
    .map((token) => ({ symbol: token.symbol, amount: token.balance + (additionalBalances[token.symbol] ?? 0), price: token.price }))
    .filter((token) => token.amount > 0 && token.price > 0)
    .sort((a, b) => b.amount * b.price - a.amount * a.price)
    .slice(0, 4)
    .map(({ symbol, amount }) => ({ symbol, amount }))), [additionalBalances, tokens]);
  const holdings = useMemo(() => JSON.parse(holdingsKey) as { symbol: string; amount: number }[], [holdingsKey]);
  const points = useMemo(() => {
    const lastValue = rawPoints.at(-1)?.value ?? 0;
    const scale = lastValue > 0 ? total / lastValue : 1;
    return rawPoints.map((point) => ({
      time: point.time,
      value: point.value * scale,
    }));
  }, [rawPoints, total]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setSelectedIndex(null);
      setError("");

      if (!holdings.length) {
        const now = Date.now();
        setRawPoints([
          { time: now - 60 * 60 * 1000, value: 0 },
          { time: now, value: 0 },
        ]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const responses = await Promise.all(holdings.map(async (holding) => {
          const response = await fetch(`/api/market-chart?symbol=${encodeURIComponent(holding.symbol)}&period=${encodeURIComponent(period)}`, {
            cache: "no-store",
            signal: controller.signal,
            headers: marketApiKey ? { "x-larpz-market-api-key": marketApiKey } : undefined,
          });
          const payload = await response.json() as { points?: MarketPoint[]; error?: string };
          const validPoints = Array.isArray(payload.points)
            ? payload.points.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0)
            : [];
          if (!response.ok || validPoints.length < 2) return null;
          return { ...holding, points: validPoints };
        }));

        const series = responses.filter((value): value is NonNullable<typeof value> => value !== null);
        if (!series.length) throw new Error("Portfolio chart data is temporarily unavailable.");
        const pointCount = Math.max(...series.map((item) => item.points.length));
        const aggregate = Array.from({ length: pointCount }, (_, index) => {
          const ratio = pointCount <= 1 ? 0 : index / (pointCount - 1);
          let timestamp = 0;
          const value = series.reduce((sum, item) => {
            const point = item.points[Math.round(ratio * (item.points.length - 1))];
            timestamp = Math.max(timestamp, point.time);
            return sum + point.price * item.amount * rate;
          }, 0);
          return { time: timestamp || Date.now(), value };
        });
        if (!cancelled) setRawPoints(aggregate);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setRawPoints([]);
          setError(caught instanceof Error ? caught.message : "Portfolio chart data is temporarily unavailable.");
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
  }, [holdings, marketApiKey, period, rate, retryKey]);

  const chart = useMemo(() => {
    const width = 430;
    const height = 178;
    const verticalPadding = 18;
    const firstTime = points[0]?.time ?? 0;
    const lastTime = points.at(-1)?.time ?? firstTime + 1;
    const values = points.map((point) => point.value);
    const minimum = values.length ? Math.min(...values) : 0;
    const maximum = values.length ? Math.max(...values) : 1;
    const range = maximum - minimum || Math.max(maximum * 0.01, 1);
    const mapped = points.map((point) => ({
      ...point,
      x: ((point.time - firstTime) / Math.max(1, lastTime - firstTime)) * width,
      y: verticalPadding + ((maximum - point.value) / range) * (height - verticalPadding * 2),
    }));
    const line = mapped.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const area = mapped.length ? `0,${height} ${line} ${width},${height}` : "";
    return { width, height, firstTime, lastTime, mapped, line, area };
  }, [points]);

  const selected = selectedIndex === null ? null : chart.mapped[selectedIndex];

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
      <div data-testid="ledger-portfolio-chart" className={styles.portfolioChartState}>
        {loading ? (
          <div role="status"><span className={styles.chartSpinner} />Loading portfolio chart…</div>
        ) : (
          <div>
            <p role="alert">{error || "Portfolio chart data is temporarily unavailable."}</p>
            <button type="button" onClick={() => setRetryKey((value) => value + 1)}><RefreshCw size={16} />Try again</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="ledger-portfolio-chart"
      className={styles.portfolioChart}
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
      onPointerCancel={() => setSelectedIndex(null)}
      onPointerLeave={() => setSelectedIndex(null)}
    >
      {selected ? (
        <div className={styles.chartTooltip} style={{ left: `${Math.max(16, Math.min(84, selected.x / chart.width * 100))}%` }}>
          <strong>{money(selected.value, currency)}</strong>
          <span>{chartDate(selected.time, period)}</span>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img" aria-label={`Portfolio ${period} value chart`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#b3a3fc" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#b3a3fc" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={chart.area} fill={`url(#${gradientId})`} stroke="none" />
        <polyline points={chart.line} fill="none" stroke="#b3a3fc" strokeWidth="2.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {selected ? (
          <>
            <line x1={selected.x} x2={selected.x} y1="0" y2={chart.height} stroke="rgba(255,255,255,.24)" strokeWidth="1" />
            <circle cx={selected.x} cy={selected.y} r="5.5" fill="#f6f3ff" stroke="#9f8df1" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      {loading ? <span className={styles.chartRefreshing} aria-label="Refreshing portfolio chart" /> : null}
    </div>
  );
}
