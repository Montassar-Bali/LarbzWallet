"use client";

import { Download, Laptop, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { walletThemes, type WalletThemeId } from "@/config/wallets";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

type WalletLauncherProps = {
  value: WalletThemeId;
  onChange: (value: WalletThemeId) => void;
};

const launchOptions: { id: WalletThemeId; label: string; icon: typeof Sparkles }[] = [
  { id: "ledger", label: "Get Larpz Wallet", icon: Laptop },
  { id: "trust", label: "Get Larpz Trust Style", icon: ShieldCheck },
];

export function WalletLauncher({ value, onChange }: WalletLauncherProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const active = walletThemes.find((theme) => theme.id === value) ?? walletThemes[0];

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
      return;
    }
    alert("On iPhone or iPad, use Share, then Add to Home Screen. The selected wallet design will open from the installed app.");
  };

  return (
    <Card
      className="overflow-hidden border-white/10"
      style={{ background: `linear-gradient(145deg, ${active.palette.background}, ${active.palette.card})` }}
    >
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/80">
          <span className="h-2 w-2 rounded-full bg-emerald-300" /> License Active
        </div>
        <CardTitle className="text-4xl sm:text-5xl">Your Dashboard.</CardTitle>
        <CardDescription className="mx-auto max-w-xl text-sm leading-6">
          Choose a wallet style, install it from your browser, and customize your fictional portfolio. Everything is simulation-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="mx-auto flex w-full max-w-sm justify-center" onClick={install}>
          <Download className="h-4 w-4" /> Download Now
        </Button>
        <div className="grid gap-3 sm:grid-cols-3">
          {launchOptions.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant={value === id ? "primary" : "outline"}
              className="h-auto min-h-12 justify-center whitespace-normal text-center"
              onClick={() => onChange(id)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Button>
          ))}
        </div>
        <p className="text-center text-xs text-white/50">Active design: {active.name}. Use Share → Add to Home Screen on iOS.</p>
      </CardContent>
    </Card>
  );
}
