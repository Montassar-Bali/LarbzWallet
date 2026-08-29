import { clearSessionCookie, readSessionCookie } from "@/lib/wallet-security-http";
import { revokeSecuritySession } from "@/lib/wallet-security-store";

export const runtime = "nodejs";

export async function POST() {
  await revokeSecuritySession(await readSessionCookie());
  await clearSessionCookie();
  return Response.json({ locked: true });
}
