export type SiteConfig = {
  siteName: string;
  siteDescription: string;
  logo: {
    mark: string;
    wordmark: string;
    image: string;
    mascot: string;
  };
  primaryColor: string;
  accentColor: string;
  supportEmail: string;
  url: string;
  socialLinks: {
    x: string;
    telegram: string;
    github: string;
  };
};

export const siteConfig: SiteConfig = {
  siteName: "Larpz Wallet",
  siteDescription:
    "The #1 fake crypto wallet app for demonstrations, entertainment, and content creation. All balances and transactions are simulated.",
  logo: {
    mark: "LW",
    wordmark: "Larpz Wallet",
    image: "/images/larpz-logo.jpeg",
    mascot: "/images/larpz-ghost.jpeg",
  },
  primaryColor: "#9f87ff",
  accentColor: "#7a5cff",
  supportEmail: "support@larpzwallet.app",
  url: "https://larpzwallet.app",
  socialLinks: {
    x: "https://x.com",
    telegram: "https://t.me/larpzwalletcom",
    github: "https://github.com",
  },
};
