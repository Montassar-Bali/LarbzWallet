import { NextRequest, NextResponse } from "next/server";

import { fetchCryptoPrices } from "@/lib/crypto-prices";

export async function GET(request: NextRequest) {
  const symbolsRaw = request.nextUrl.searchParams.get("symbols") ?? "BTC,ETH,SOL,USDT,USDC";
  const symbols = symbolsRaw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  try {
    const snapshot = await fetchCryptoPrices(symbols);
    return NextResponse.json(snapshot, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        prices: {},
        changes: {},
        error: "Unable to fetch live display prices. Fallback prices remain active.",
      },
      { status: 200 },
    );
  }
}
