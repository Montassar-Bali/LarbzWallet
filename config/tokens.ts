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
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    price: 69250,
    balance: 0.85,
    change24h: 2.9,
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  },
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    price: 3720,
    balance: 7.5,
    change24h: 3.6,
    image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    price: 188.4,
    balance: 143,
    change24h: 5.2,
    image: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    price: 1,
    balance: 35000,
    change24h: 0.01,
    image: "https://assets.coingecko.com/coins/images/325/large/Tether.png",
  },
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    price: 1,
    balance: 42000,
    change24h: -0.02,
    image: "https://assets.coingecko.com/coins/images/6319/large/usdc.png",
  },
];

export const coingeckoMap: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
};
