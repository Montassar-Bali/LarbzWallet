"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { walletThemes } from "@/config/wallets";
import { getLicense } from "@/lib/license";
import {
  getTokens,
  getTransactions,
  getWalletTheme,
  resetWalletSimulation,
  setWalletTheme,
} from "@/lib/wallet";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function SettingsPanel() {
  const { user, refresh } = useAuth();
  const [notice, setNotice] = useState("");
  const [tokenCount, setTokenCount] = useState(() => getTokens().length);
  const [activityCount, setActivityCount] = useState(() => getTransactions().length);
  const [theme, setTheme] = useState(() => getWalletTheme());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notifications, setNotifications] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") {
      setNotice("Notifications are not supported in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifications(permission === "granted");
    setNotice(permission === "granted" ? "Notifications enabled for this browser." : "Notification permission was not granted.");
    if (permission === "granted") new Notification("Larpz Wallet", { body: "Simulated receive alerts are enabled." });
  };

  const license = user?.licenseKey ? getLicense(user.licenseKey) : null;

  const handleReset = () => {
    resetWalletSimulation();
    setTokenCount(getTokens().length);
    setActivityCount(getTransactions().length);
    refresh();
    setNotice("Simulation data reset to default demo state.");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>Profile details for this local simulation environment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4">
            <p className="text-[var(--muted-foreground)]">Name</p>
            <p className="text-[var(--foreground)]">{user?.name}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4">
            <p className="text-[var(--muted-foreground)]">Email</p>
            <p className="text-[var(--foreground)]">{user?.email}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4">
            <p className="text-[var(--muted-foreground)]">License</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-[var(--foreground)]">{user?.licenseKey ?? "Not activated"}</p>
              {license ? <Badge>{license.status}</Badge> : null}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4">
            <p className="text-[var(--muted-foreground)]">Wallet interface</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {walletThemes.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  variant={option.id === theme ? "primary" : "outline"}
                  onClick={() => {
                    setWalletTheme(option.id);
                    setTheme(option.id);
                    setNotice(`${option.name} selected as active wallet interface.`);
                  }}
                >
                  {option.name}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device Features</CardTitle>
          <CardDescription>Enable optional browser features for this local simulation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={enableNotifications}>
            {notifications ? "Send Test Notification" : "Enable Notifications"}
          </Button>
          {notifications ? <Button variant="outline" onClick={() => new Notification("Simulated Receive", { body: "You received 1.00 BTC in the demo wallet." })}>Preview Receive Alert</Button> : null}
          {installPrompt ? <Button onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }}>Add App to Home Screen</Button> : <p className="text-xs text-[var(--muted-foreground)]">Use your browser menu to install the PWA when no install prompt is available.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulation Controls</CardTitle>
          <CardDescription>
            Reset local wallet data without impacting any real account or blockchain state.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 text-sm">
            <p className="text-[var(--muted-foreground)]">Tracked tokens: {tokenCount}</p>
            <p className="text-[var(--muted-foreground)]">Activity records: {activityCount}</p>
          </div>
          <Button variant="outline" onClick={handleReset}>
            Reset Demo Wallet Data
          </Button>
          <p className="text-xs text-[var(--muted-foreground)]">
            Demo wallet - all balances and transactions are simulated.
          </p>
          {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
