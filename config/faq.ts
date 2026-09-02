export type FaqItem = {
  question: string;
  answer: string;
};

export const faqItems: FaqItem[] = [
  {
    question: "Is Larpz Wallet a real crypto wallet?",
    answer:
      "No. Larpz Wallet is an entertainment app only — it does not hold, send, receive, or interact with any real crypto assets. No seed phrases or private keys are ever asked for or stored. It is a display app that shows custom balances on a realistic wallet interface.",
  },
  {
    question: "Will it look exactly like the real crypto apps?",
    answer:
      "Yes. Each wallet is designed to be pixel-perfect — identical to the real app on mobile. Prices are pulled live from CoinGecko, the 24-hour chart is interactive, and the send flow screens look and behave like the real thing.",
  },
  {
    question: "Does it work on iPhone and Android?",
    answer:
      "Yes. Larpz Wallet is a PWA (Progressive Web App) that installs directly to your home screen. Use Safari on iOS or Chrome on Android — no App Store download required.",
  },
  {
    question: "Can I add custom tokens or memecoins?",
    answer:
      "Yes. On the apps, you can add any Solana or Ethereum token by contract address. The app fetches the live price and token image from DexScreener automatically.",
  },
  {
    question: "How do I receive my license key after purchase?",
    answer:
      "Delivery is fully automated. Once your crypto payment is detected on-chain, your unique license key is generated and displayed on the order status page — usually within a few minutes. No manual steps needed.",
  },
  {
    question: "What's the difference between the wallets?",
    answer:
      "All plans include all four wallets. The fake Ghost Wallet supports custom memecoins. The fake Trust Wallet has a multi-chain look with BTC, ETH, SOL, TRX, and BNB. Larpz Wallet provides a hardware-wallet-inspired interface with BTC, SOL, ETH, TRX, and BNB. The fake Exodus wallet shows a multi-chain portfolio view. Switch between them anytime from your dashboard.",
  },
  {
    question: "Is my payment anonymous?",
    answer:
      "Crypto payments (SOL, ETH, BNB, BTC, TRX, USDT) require no personal information at all — no account, no email. Card payments (credit card, Apple Pay, Google Pay) require an email address, which is passed directly to the payment processor and is not stored by us. Either way, your license key is all you need to use the app.",
  },
];
