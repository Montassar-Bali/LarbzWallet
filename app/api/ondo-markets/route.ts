import { NextResponse } from "next/server";

import { fetchOndoMarkets } from "@/lib/ondo-markets";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await fetchOndoMarkets();
  return NextResponse.json(snapshot, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
