"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Edit3, PlusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PortfolioChart } from "@/components/dashboard/portfolio-chart";
import { WalletLauncher } from "@/components/dashboard/wallet-launcher";
import { WalletSelector } from "@/components/dashboard/wallet-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type WalletThemeId } from "@/config/wallets";
import {
  applyPriceMapToTokens,
  getPortfolio,
  getTokens,
  getTransactions,
  getWalletTheme,
  setWalletTheme,
} from "@/lib/wallet";
import { formatCurrency, formatDate, formatPercentage } from "@/lib/utils";
import type { WalletActivity, WalletToken } from "@/lib/types";

const chartData = [
  { label: "Mon", value: 118450 },
  { label: "Tue", value: 120140 },
  { label: "Wed", value: 122550 },
  { label: "Thu", value: 123980 },
  { label: "Fri", value: 125300 },
  { label: "Sat", value: 127100 },
  { label: "Sun", value: 128450 },
];

async function syncLivePrices() {
  const symbols = getTokens().map((token) => token.symbol);

  try {
    const response = await fetch(`/api/prices?symbols=${symbols.join(",")}`);
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { prices: Record<string, number> };
    applyPriceMapToTokens(payload.prices);
  } catch {
    // Keep local fallback prices when API is unavailable.
  }
}

export function DashboardHomeView() {
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [activity, setActivity] = useState<WalletActivity[]>([]);
  const [walletTheme, setWalletThemeState] = useState<WalletThemeId>(() => getWalletTheme());

  useEffect(() => {
    syncLivePrices().finally(() => {
      setTokens(getTokens());
      setActivity(getTransactions());
    });
  }, []);

  const portfolio = useMemo(() => {
    if (tokens.length === 0) {
      return getPortfolio();
    }

    const totalValue = tokens.reduce((sum, token) => sum + token.price * token.balance, 0);
    const weightedChange =
      totalValue === 0
        ? 0
        : tokens.reduce((sum, token) => {
            const tokenValue = token.price * token.balance;
            return sum + (tokenValue / totalValue) * token.change24h;
          }, 0);
    const topAssets = [...tokens]
      .sort((a, b) => b.price * b.balance - a.price * a.balance)
      .slice(0, 4);

    return {
      totalValue,
      change24h: weightedChange,
      topAssets,
    };
  }, [tokens]);

  return (
    <div className="space-y-6">
      <WalletLauncher
        value={walletTheme}
        onChange={(next) => {
          setWalletTheme(next);
          setWalletThemeState(next);
          window.dispatchEvent(new Event("wallet-theme-change"));
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>Wallet Selector</CardTitle>
          <CardDescription>
            Choose a wallet interface style for your simulator experience.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WalletSelector
            value={walletTheme}
            onChange={(next) => {
              setWalletTheme(next);
              setWalletThemeState(next);
              window.dispatchEvent(new Event("wallet-theme-change"));
            }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardDescription>Total Portfolio</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(portfolio.totalValue || 128_450.25)}</CardTitle>
            <p className="text-sm text-emerald-300">{formatPercentage(portfolio.change24h || 4.82)} · 24h</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Simulation Status</CardDescription>
            <CardTitle>Active</CardTitle>
            <Badge className="w-fit border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300">SIMULATION</Badge>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Quick Safety Check</CardDescription>
            <CardTitle>No Real Transactions</CardTitle>
            <p className="text-xs text-[var(--muted-foreground)]">
              Larpz Wallet simulator cannot connect to wallets or blockchains.
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Chart</CardTitle>
            <CardDescription>Fictional trend data for simulation displays.</CardDescription>
          </CardHeader>
          <CardContent>
            <PortfolioChart data={chartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump into the most common demo tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full justify-start" variant="outline" asChild>
              <Link href="/dashboard/tokens">
                <PlusCircle className="h-4 w-4" />
                Add Token
              </Link>
            </Button>
            <Button className="w-full justify-start" variant="outline" asChild>
              <Link href="/dashboard/tokens">
                <Edit3 className="h-4 w-4" />
                Edit Balance
              </Link>
            </Button>
            <Button className="w-full justify-start" variant="outline" asChild>
              <Link href="/dashboard/activity">
                <ArrowUpRight className="h-4 w-4" />
                Simulate Send
              </Link>
            </Button>
            <Button className="w-full justify-start" variant="outline" asChild>
              <Link href="/dashboard/activity">
                <ArrowDownRight className="h-4 w-4" />
                Simulate Receive
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Assets</CardTitle>
            <CardDescription>Fictional holdings displayed for your demo portfolio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {portfolio.topAssets.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card-soft)] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-[var(--foreground)]">{token.symbol}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{token.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--foreground)]">
                    {formatCurrency(token.price * token.balance)}
                  </p>
                  <p className={token.change24h >= 0 ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>
                    {formatPercentage(token.change24h)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Every entry is marked as simulated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.slice(0, 5).map((record) => (
              <div key={record.id} className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-[var(--foreground)]">{record.counterpartyLabel}</p>
                  <p className="text-sm text-[var(--foreground)]">
                    {record.type === "receive" ? "+" : "-"}
                    {record.amount} {record.tokenSymbol}
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <span>{formatDate(record.date)}</span>
                  <span>•</span>
                  <span>{record.note}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
