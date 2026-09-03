export type WalletThemeId = "ghost" | "ledger" | "trust";

export type WalletTheme = {
  id: WalletThemeId;
  name: string;
  description: string;
  palette: {
    background: string;
    card: string;
    accent: string;
    text: string;
  };
};

export const walletThemes: WalletTheme[] = [
  {
    id: "ghost",
    name: "Download Now",
    description: "The full mobile wallet experience shown in your preview — install it to your home screen.",
    palette: {
      background: "#0e0a1d",
      card: "#171230",
      accent: "#9f87ff",
      text: "#efeaff",
    },
  },
  {
    id: "ledger",
    name: "Larpz Wallet",
    description: "Larpz's mobile portfolio experience with live markets and shared demo accounts.",
    palette: {
      background: "#000000",
      card: "#171717",
      accent: "#a995f2",
      text: "#ffffff",
    },
  },
  {
    id: "trust",
    name: "Larpz Trust Style",
    description: "Larpz Wallet's dark mobile-first Trust-style demo interface.",
    palette: {
      background: "#05060f",
      card: "#171824",
      accent: "#4437ff",
      text: "#f7f7fb",
    },
  },
];

export const defaultWalletTheme: WalletThemeId = "ghost";

// Keep each install on a distinct path. iOS can preserve the current path
// more reliably than a query string when creating a Home Screen shortcut.
export const walletInstallPaths: Record<WalletThemeId, string> = {
  ghost: "/download-wallet",
  ledger: "/ledger-wallet",
  trust: "/trust-wallet",
};
