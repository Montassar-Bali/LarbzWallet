import { NextRequest, NextResponse } from "next/server";

import { fetchCryptoPrices } from "@/lib/crypto-prices";

export async function GET(request: NextRequest) {
  const symbolsRaw = request.nextUrl.searchParams.get("symbols") ?? "BTC,ETH,SOL,USDT,USDC";
  const symbols = symbolsRaw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  try {
    const prices = await fetchCryptoPrices(symbols);
    return NextResponse.json({ prices }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        prices: {},
        error: "Unable to fetch live display prices. Fallback prices remain active.",
      },
      { status: 200 },
    );
  }
}
