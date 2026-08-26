import { NextRequest, NextResponse } from "next/server";

import { liveMarketSymbols } from "@/config/tokens";
import { fetchCryptoPrices } from "@/lib/crypto-prices";

export async function GET(request: NextRequest) {
  const symbolsRaw =
    request.nextUrl.searchParams.get("symbols") ?? liveMarketSymbols.join(",");
  const symbols = symbolsRaw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z0-9]{2,12}$/.test(symbol))
    .slice(0, 100);

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
