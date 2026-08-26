export type TokenSeed = {
  id: string;
  name: string;
  symbol: string;
  price: number;
  balance: number;
  change24h: number;
  image: string;
};

export const defaultTokens: TokenSeed[] = [
  {
    id: "usdt",
    name: "USDT",
    symbol: "USDT",
    price: 0.9984615385,
    balance: 65,
    change24h: -0.01,
    image: "https://assets.coingecko.com/coins/images/325/large/Tether.png",
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    price: 73.387408,
    balance: 0.05178,
    change24h: -2.55,
    image: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  },
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    price: 3720,
    balance: 0,
    change24h: 0,
    image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  },
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    price: 69250,
    balance: 0,
    change24h: 0,
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  },
  {
    id: "sui",
    name: "Sui",
    symbol: "SUI",
    price: 0.75,
    balance: 0,
    change24h: 0,
    image: "https://assets.coingecko.com/coins/images/26375/large/sui_asset.png",
  },
  {
    id: "matic",
    name: "Polygon",
    symbol: "MATIC",
    price: 0.25,
    balance: 0,
    change24h: 0,
    image: "https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png",
  },
  {
    id: "hype",
    name: "Hyperliquid",
    symbol: "HYPE",
    price: 25,
    balance: 0,
    change24h: 0,
    image: "https://assets.coingecko.com/coins/images/50882/large/hyperliquid.jpg",
  },
  {
    id: "bnb",
    name: "BNB",
    symbol: "BNB",
    price: 650,
    balance: 0,
    change24h: 0,
    image: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  },
];

export const coingeckoMap: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
  SUI: "sui",
  MATIC: "matic-network",
  HYPE: "hyperliquid",
  BNB: "binancecoin",
  TRX: "tron",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  LTC: "litecoin",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  ATOM: "cosmos",
  XLM: "stellar",
  BCH: "bitcoin-cash",
  XMR: "monero",
  PEPE: "pepe",
  WIF: "dogwifhat",
};

export const liveMarketSymbols = Object.keys(coingeckoMap);
