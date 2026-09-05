"use client";

import { useEffect, useState } from "react";

import type { WalletToken } from "@/lib/types";

export type OndoNetworkChainId = "ethereum-1" | "bsc-56" | "solana-900";

export type OndoMarketAsset = WalletToken & {
  underlyingTicker?: string;
  assetClass?: string;
  instrumentType?: string;
  totalHolders?: number;
  tradableSessions?: string[];
  priceHistory24h: { time: number; price: number }[];
  addresses: {
    networkChainId: OndoNetworkChainId;
    address: string;
    decimals: number;
  }[];
};

export type OndoMarketStatus = "idle" | "loading" | "ready" | "partial" | "stale" | "unauthorized" | "unconfigured" | "error";

type OndoMarketSnapshot = {
  assets: OndoMarketAsset[];
  status: OndoMarketStatus;
  updatedAt?: string;
};

const emptySnapshot: OndoMarketSnapshot = { assets: [], status: "idle" };

function finiteNumber(value: unknown, minimum = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : undefined;
}

function safeText(value: unknown, maximum = 120) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeImage(value: unknown) {
  const candidate = safeText(value, 500);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function parseAsset(value: unknown): OndoMarketAsset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const symbol = safeText(record.symbol, 24);
  const name = safeText(record.name, 160);
  const price = finiteNumber(record.price, Number.EPSILON);
  if (!/^[A-Za-z0-9._-]{2,24}$/.test(symbol) || !name || price === undefined) return null;

  const history = Array.isArray(record.priceHistory24h)
    ? record.priceHistory24h.flatMap((point) => {
        if (!point || typeof point !== "object") return [];
        const candidate = point as Record<string, unknown>;
        const time = finiteNumber(candidate.time, 1);
        const historyPrice = finiteNumber(candidate.price, Number.EPSILON);
        return time !== undefined && historyPrice !== undefined ? [{ time, price: historyPrice }] : [];
      }).sort((left, right) => left.time - right.time).slice(-180)
    : [];
  const sessions = Array.isArray(record.tradableSessions)
    ? record.tradableSessions.map((session) => safeText(session, 40)).filter(Boolean).slice(0, 8)
    : undefined;
  const timestamp = safeText(record.updatedAt, 80);
  const updatedAt = Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : new Date().toISOString();
  const addresses = Array.isArray(record.addresses)
    ? record.addresses.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const candidate = entry as Record<string, unknown>;
        const networkChainIdValue = safeText(candidate.networkChainId, 32);
        if (networkChainIdValue !== "ethereum-1" && networkChainIdValue !== "bsc-56" && networkChainIdValue !== "solana-900") return [];
        const networkChainId = networkChainIdValue as OndoNetworkChainId;
        const address = safeText(candidate.address, 128);
        const decimals = finiteNumber(candidate.decimals);
        if (!address || decimals === undefined || !Number.isInteger(decimals) || decimals > 255) return [];
        return [{ networkChainId, address, decimals }];
      }).slice(0, 8)
    : [];

  return {
    id: safeText(record.id, 100) || `ondo-${symbol.toLowerCase()}`,
    name,
    symbol,
    price,
    balance: 0,
    change24h: finiteNumber(record.change24h, -Number.MAX_VALUE) ?? 0,
    image: safeImage(record.image),
    marketCap: finiteNumber(record.marketCap),
    volume24h: finiteNumber(record.volume24h),
    updatedAt,
    underlyingTicker: safeText(record.underlyingTicker, 24) || undefined,
    assetClass: safeText(record.assetClass, 60) || undefined,
    instrumentType: safeText(record.instrumentType, 60) || undefined,
    totalHolders: finiteNumber(record.totalHolders),
    tradableSessions: sessions,
    priceHistory24h: history,
    addresses,
  };
}

export function useOndoMarkets(enabled: boolean, refreshKey = 0) {
  const [snapshot, setSnapshot] = useState<OndoMarketSnapshot>(emptySnapshot);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let controller: AbortController | undefined;

    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      setSnapshot((current) => ({ ...current, status: current.assets.length ? current.status : "loading" }));
      try {
        const response = await fetch("/api/ondo-markets", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          assets?: unknown[];
          configured?: boolean;
          status?: "live" | "partial" | "stale" | "unauthorized" | "unavailable" | "unconfigured";
          updatedAt?: string;
          error?: string;
        };
        if (cancelled) return;
        const assets = (payload.assets ?? []).map(parseAsset).filter((asset): asset is OndoMarketAsset => Boolean(asset));
        const hasUsableAssets = assets.length > 0;
        let status: OndoMarketStatus = "ready";
        if (payload.configured === false || payload.status === "unconfigured") status = "unconfigured";
        else if (payload.status === "unauthorized") status = "unauthorized";
        else if (!response.ok || payload.status === "unavailable" || (!hasUsableAssets && Boolean(payload.error))) status = "error";
        else if (payload.status === "partial") status = "partial";
        else if (payload.status === "stale") status = "stale";
        setSnapshot({ assets, status, updatedAt: safeText(payload.updatedAt, 80) || undefined });
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setSnapshot((current) => ({ ...current, status: "error" }));
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [enabled, refreshKey]);

  return snapshot;
}
