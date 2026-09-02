import { walletMarketSymbols } from "@/config/tokens";

export const ledgerCurrencies = [
  { code: "USD", label: "$ USD", rate: 1 },
  { code: "EUR", label: "€ EUR", rate: 0.92 },
  { code: "GBP", label: "£ GBP", rate: 0.78 },
  { code: "CAD", label: "CA$ CAD", rate: 1.37 },
  { code: "AUD", label: "A$ AUD", rate: 1.52 },
  { code: "JPY", label: "¥ JPY", rate: 147 },
  { code: "CNY", label: "¥ CNY", rate: 7.2 },
  { code: "INR", label: "₹ INR", rate: 83.5 },
  { code: "BRL", label: "R$ BRL", rate: 5.1 },
  { code: "SEK", label: "kr SEK", rate: 10.7 },
  { code: "NOK", label: "kr NOK", rate: 10.9 },
  { code: "CHF", label: "CHF CHF", rate: 0.88 },
] as const;

export type LedgerCurrencyCode = (typeof ledgerCurrencies)[number]["code"];
export type LedgerColorScheme = "dark" | "light";
export type LedgerActionPreference = "receive-first" | "send-first";
export type LedgerTokenNetwork = "ethereum" | "solana";

export type LedgerCustomToken = {
  id: string;
  network: LedgerTokenNetwork;
  contractAddress: string;
  name: string;
  symbol: string;
  price: number;
};

export type LedgerWalletSettings = {
  currency: LedgerCurrencyCode;
  marketApiKey: string;
  proKeyEnabled: boolean;
  actionPreference: LedgerActionPreference;
  colorScheme: LedgerColorScheme;
  language: "en";
  customTokens: LedgerCustomToken[];
};

export const defaultLedgerWalletSettings: LedgerWalletSettings = {
  currency: "USD",
  marketApiKey: "",
  proKeyEnabled: false,
  actionPreference: "receive-first",
  colorScheme: "dark",
  language: "en",
  customTokens: [],
};

const ethereumAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const solanaAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const reservedTokenSymbols = new Set(walletMarketSymbols);

export function validateLedgerTokenAddress(network: LedgerTokenNetwork, value: string) {
  const address = value.trim();
  if (!address) return "Enter a contract address.";
  if (network === "ethereum" && !ethereumAddressPattern.test(address)) {
    return "Enter a valid 0x Ethereum contract address.";
  }
  if (network === "solana" && !solanaAddressPattern.test(address)) {
    return "Enter a valid Solana base58 token address.";
  }
  return "";
}

function isCurrencyCode(value: unknown): value is LedgerCurrencyCode {
  return typeof value === "string" && ledgerCurrencies.some((currency) => currency.code === value);
}

function isCustomToken(value: unknown): value is LedgerCustomToken {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<LedgerCustomToken>;
  return typeof token.id === "string"
    && (token.network === "ethereum" || token.network === "solana")
    && typeof token.contractAddress === "string"
    && !validateLedgerTokenAddress(token.network, token.contractAddress)
    && typeof token.name === "string"
    && Boolean(token.name.trim())
    && typeof token.symbol === "string"
    && Boolean(token.symbol.trim())
    && !reservedTokenSymbols.has(token.symbol.trim().toUpperCase())
    && typeof token.price === "number"
    && Number.isFinite(token.price)
    && token.price >= 0;
}

export function normalizeLedgerWalletSettings(value: unknown): LedgerWalletSettings {
  if (!value || typeof value !== "object") return { ...defaultLedgerWalletSettings };
  const settings = value as Partial<LedgerWalletSettings>;
  return {
    currency: isCurrencyCode(settings.currency) ? settings.currency : defaultLedgerWalletSettings.currency,
    marketApiKey: typeof settings.marketApiKey === "string" ? settings.marketApiKey.slice(0, 180) : "",
    proKeyEnabled: settings.proKeyEnabled === true,
    actionPreference: settings.actionPreference === "send-first" ? "send-first" : "receive-first",
    colorScheme: settings.colorScheme === "light" ? "light" : "dark",
    language: "en",
    customTokens: Array.isArray(settings.customTokens) ? settings.customTokens.filter(isCustomToken).slice(0, 30) : [],
  };
}

export function validateLedgerSettings(settings: LedgerWalletSettings) {
  if (settings.marketApiKey && settings.marketApiKey.trim().length < 8) {
    return "The optional market API key must contain at least 8 characters.";
  }
  const seenContracts = new Set<string>();
  const seenSymbols = new Set<string>();
  for (const token of settings.customTokens) {
    const addressError = validateLedgerTokenAddress(token.network, token.contractAddress);
    if (addressError) return `${token.symbol || "Custom token"}: ${addressError}`;
    const contractKey = `${token.network}:${token.contractAddress.toLowerCase()}`;
    if (seenContracts.has(contractKey)) return "Each custom-token contract can only be added once.";
    seenContracts.add(contractKey);
    const symbol = token.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return "Custom-token symbols must use 2–10 letters or numbers.";
    if (reservedTokenSymbols.has(symbol)) return `${symbol} is already included in the built-in asset catalogue.`;
    if (seenSymbols.has(symbol)) return "Each custom-token symbol must be unique.";
    seenSymbols.add(symbol);
  }
  return "";
}
