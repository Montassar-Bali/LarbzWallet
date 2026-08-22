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
    name: "Ledger Style",
    description: "Minimal enterprise look with grayscale surfaces and strong numeric hierarchy.",
    palette: {
      background: "#0d0f12",
      card: "#161a20",
      accent: "#a3e635",
      text: "#f1f5f9",
    },
  },
  {
    id: "trust",
    name: "Trust Style",
    description: "Clear blue interface for familiar mobile-first wallet interactions.",
    palette: {
      background: "#06162b",
      card: "#0b233f",
      accent: "#4ea6ff",
      text: "#e6f2ff",
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
