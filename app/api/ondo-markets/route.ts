import { NextResponse } from "next/server";

import { fetchOndoMarkets } from "@/lib/ondo-markets";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await fetchOndoMarkets();
  const status = snapshot.status === "unconfigured"
    ? 503
    : snapshot.status === "unauthorized" || snapshot.status === "unavailable"
      ? 502
      : 200;

  return NextResponse.json(snapshot, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
