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
    balance: 0,
    change24h: -0.01,
    image: "https://assets.coingecko.com/coins/images/325/large/Tether.png",
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    price: 73.387408,
    balance: 0.09413,
    change24h: -2.55,
    image: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  },
  {
    id: "bfs",
    name: "BFS",
    symbol: "BFS",
    price: 0.05 / 176.12138,
    balance: 176.12138,
    change24h: 0.01,
    image: "/bfs-coin.svg",
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
  WIF: "dogwifcoin",
};

export const liveMarketSymbols = Object.keys(coingeckoMap);

export const liveTokenNames: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  USDT: "Tether",
  USDC: "USD Coin",
  SUI: "Sui",
  MATIC: "Polygon",
  HYPE: "Hyperliquid",
  BNB: "BNB",
  TRX: "TRON",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  AVAX: "Avalanche",
  DOT: "Polkadot",
  LINK: "Chainlink",
  LTC: "Litecoin",
  TON: "Toncoin",
  SHIB: "Shiba Inu",
  NEAR: "NEAR",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  ATOM: "Cosmos",
  XLM: "Stellar",
  BCH: "Bitcoin Cash",
  XMR: "Monero",
  PEPE: "Pepe",
  WIF: "dogwifhat",
  BFS: "BFS",
};

export const tokenLogoFallbacks: Record<string, string> = {
  BTC: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
  ETH: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
  SOL: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png",
  USDT: "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
  USDC: "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png",
  SUI: "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
  MATIC: "https://coin-images.coingecko.com/coins/images/4713/large/polygon.png",
  HYPE: "https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg",
  BNB: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  TRX: "https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png",
  XRP: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  DOGE: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
  ADA: "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
  AVAX: "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  DOT: "https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg",
  LINK: "https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png",
  LTC: "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png",
  TON: "https://coin-images.coingecko.com/coins/images/17980/large/Gram_Circular_Badge.png",
  SHIB: "https://coin-images.coingecko.com/coins/images/11939/large/shiba.png",
  NEAR: "https://coin-images.coingecko.com/coins/images/10365/large/near.jpg",
  APT: "https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Symbol-Black-RGB-1x.png",
  ARB: "https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg",
  OP: "https://coin-images.coingecko.com/coins/images/25244/large/Token.png",
  ATOM: "https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png",
  XLM: "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg",
  BCH: "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
  XMR: "https://coin-images.coingecko.com/coins/images/69/large/monero_logo.png",
  PEPE: "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
  WIF: "https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg",
  BFS: "/bfs-coin.svg",
};

const defaultTokenBySymbol = new Map(defaultTokens.map((token) => [token.symbol, token]));

export const walletMarketSymbols = [...new Set([...liveMarketSymbols, "BFS"])];

export const canonicalWalletTokens: TokenSeed[] = walletMarketSymbols.map((symbol) => {
  const seed = defaultTokenBySymbol.get(symbol);
  return {
    id: seed?.id ?? `market-${symbol.toLowerCase()}`,
    name: liveTokenNames[symbol] ?? seed?.name ?? symbol,
    symbol,
    price: seed?.price ?? 0,
    balance: 0,
    change24h: seed?.change24h ?? 0,
    image: tokenLogoFallbacks[symbol] ?? seed?.image ?? "",
  };
});
