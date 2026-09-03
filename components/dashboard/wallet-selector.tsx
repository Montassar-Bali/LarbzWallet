"use client";

import { walletThemes, type WalletThemeId } from "@/config/wallets";

import { Button } from "@/components/ui/button";

type WalletSelectorProps = {
  value: WalletThemeId;
  onChange: (value: WalletThemeId) => void;
};

export function WalletSelector({ value, onChange }: WalletSelectorProps) {
  const activeTheme = walletThemes.find((theme) => theme.id === value) ?? walletThemes[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {walletThemes.map((theme) => (
          <Button
            key={theme.id}
            type="button"
            variant={value === theme.id ? "primary" : "outline"}
            onClick={() => onChange(theme.id)}
            className="justify-start"
          >
            {theme.name}
          </Button>
        ))}
      </div>

      <div
        className="rounded-2xl border border-white/10 p-4"
        style={{
          background: `linear-gradient(135deg, ${activeTheme.palette.background}, ${activeTheme.palette.card})`,
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300">Active Wallet Interface</p>
        <h3 className="mt-2 font-display text-2xl text-white">{activeTheme.name}</h3>
        <p className="mt-2 max-w-xl text-sm text-zinc-300">{activeTheme.description}</p>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 p-3" style={{ background: `${activeTheme.palette.background}cc` }}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">Portfolio</p>
            <p className="mt-1 text-lg font-semibold" style={{ color: activeTheme.palette.text }}>
              $24,369.42
            </p>
            <p className="text-xs" style={{ color: activeTheme.palette.accent }}>
              +5.61%
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-3" style={{ background: `${activeTheme.palette.background}cc` }}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">Top Token</p>
            <p className="mt-1 text-lg font-semibold" style={{ color: activeTheme.palette.text }}>
              BTC
            </p>
            <p className="text-xs" style={{ color: activeTheme.palette.accent }}>
              $4,678.32
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-3" style={{ background: `${activeTheme.palette.background}cc` }}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">Status</p>
            <p className="mt-1 text-lg font-semibold" style={{ color: activeTheme.palette.text }}>
              ACTIVE
            </p>
            <p className="text-xs" style={{ color: activeTheme.palette.accent }}>
              Live wallet
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
