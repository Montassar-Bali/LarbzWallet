import { Bell, HandCoins, ShieldAlert, Smartphone, Wallet } from "lucide-react";

export const featureItems = [
  {
    title: "Custom Balances",
    description: "Set any balance for any token. Show off millions or keep it subtle — it's your call.",
    icon: Wallet,
  },
  {
    title: "Pixel-Perfect UI",
    description: "Designed to look identical to popular wallets. Perfect for screenshots, videos, or flexing on your group chat.",
    icon: Smartphone,
  },
  {
    title: "No Data Collected",
    description: "We don't ask for seed phrases, private keys, or personal information. Completely safe to use.",
    icon: ShieldAlert,
  },
  {
    title: "Send Between Users",
    description: "Send crypto to other Larpz Wallet users and have it appear live in their wallet — instantly.",
    icon: HandCoins,
  },
  {
    title: "Custom Receive Alerts",
    description: "Trigger real push notifications that show you receiving crypto — on cue, from any device.",
    icon: Bell,
  },
  {
    title: "iOS & Android",
    description: "Installs as a PWA on any modern smartphone. No app store required.",
    icon: Smartphone,
  },
];
