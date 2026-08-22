"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WalletToken } from "@/lib/types";
import { getTokens } from "@/lib/wallet";
import { formatCurrency, formatPercentage } from "@/lib/utils";

export function PortfolioView() {
  const [tokens] = useState<WalletToken[]>(() => getTokens());
  const portfolio = useMemo(() => {
    const totalValue = tokens.reduce((sum, token) => sum + token.price * token.balance, 0);
    const change24h =
      totalValue === 0
        ? 0
        : tokens.reduce((sum, token) => {
            const tokenValue = token.price * token.balance;
            return sum + (tokenValue / totalValue) * token.change24h;
          }, 0);

    return { totalValue, change24h };
  }, [tokens]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Total Balance</CardTitle>
          <CardDescription>Fictional portfolio values used for demonstrations.</CardDescription>
          <p className="font-display text-4xl text-[var(--foreground)]">{formatCurrency(portfolio.totalValue)}</p>
          <p className="text-sm text-emerald-300">{formatPercentage(portfolio.change24h)} · 24h</p>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Allocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tokens.map((token) => {
              const value = token.price * token.balance;
              const share = portfolio.totalValue > 0 ? (value / portfolio.totalValue) * 100 : 0;

              return (
                <div key={token.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{token.symbol}</span>
                    <span className="text-[var(--muted-foreground)]">{share.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--card-soft)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(29,196,255,0.9),rgba(53,243,163,0.9))]"
                      style={{ width: `${Math.max(share, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Token List</CardTitle>
            <CardDescription>
              All displayed assets are demo-only and do not imply real cryptocurrency ownership.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card-soft)] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-[var(--foreground)]">{token.symbol}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{token.balance.toLocaleString()} {token.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--foreground)]">{formatCurrency(token.price)}</p>
                  <p className={token.change24h >= 0 ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>
                    {formatPercentage(token.change24h)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
