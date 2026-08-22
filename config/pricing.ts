export type TierFeature = {
  label: string;
  included: boolean;
};

export type PricingTier = {
  id: string;
  name: string;
  badge?: string;
  price: number;
  period: string;
  features: TierFeature[];
  highlighted?: boolean;
};

export const pricingTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    price: 30,
    period: "7 days access",
    features: [
      { label: "Full app access on iOS & Android", included: true },
      { label: "All wallets (Ghost, Ledger, Trust Wallet, Exodus)", included: true },
      { label: "Free PDF money guide", included: true },
      { label: "Unlimited custom balances & tokens", included: true },
      { label: "Priority Telegram support", included: false },
      { label: "Early access to new features", included: false },
    ],
  },
  {
    id: "popular",
    name: "Most Popular",
    badge: "Most Popular",
    price: 100,
    period: "1 month access",
    highlighted: true,
    features: [
      { label: "Full app access on iOS & Android", included: true },
      { label: "All wallets (Ghost, Ledger, Trust Wallet, Exodus)", included: true },
      { label: "Free PDF money guide", included: true },
      { label: "Unlimited custom balances & tokens", included: true },
      { label: "Priority Telegram support", included: true },
      { label: "Early access to new features", included: false },
    ],
  },
  {
    id: "best-value",
    name: "Best Value",
    price: 300,
    period: "Lifetime access",
    features: [
      { label: "Full app access on iOS & Android", included: true },
      { label: "All wallets (Ghost, Ledger, Trust Wallet, Exodus)", included: true },
      { label: "Free PDF money guide", included: true },
      { label: "Unlimited custom balances & tokens", included: true },
      { label: "Priority Telegram support", included: true },
      { label: "Early access to new features", included: true },
    ],
  },
];

export const buyTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    price: 30,
    period: "7 days access",
    features: [
      { label: "Full app access", included: true },
      { label: "All wallets (Ghost, Ledger, Trust, Exodus)", included: true },
      { label: "Free PDF money guide", included: true },
      { label: "1 device", included: true },
    ],
  },
  {
    id: "popular",
    name: "Most Popular",
    badge: "Most Popular",
    price: 100,
    period: "1 month access",
    highlighted: true,
    features: [
      { label: "Full app access", included: true },
      { label: "All wallets (Ghost, Ledger, Trust, Exodus)", included: true },
      { label: "Free PDF money guide", included: true },
      { label: "2 devices", included: true },
      { label: "Priority support", included: true },
    ],
  },
  {
    id: "best-value",
    name: "Best Value",
    price: 300,
    period: "Lifetime access",
    features: [
      { label: "Full app access", included: true },
      { label: "All wallets (Ghost, Ledger, Trust, Exodus)", included: true },
      { label: "Free PDF money guide", included: true },
      { label: "3 devices", included: true },
      { label: "Priority support", included: true },
      { label: "Early access to features", included: true },
    ],
  },
];
