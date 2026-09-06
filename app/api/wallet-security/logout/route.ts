import { clearSessionCookie, errorResponse, readSessionCookie, securityJson } from "@/lib/wallet-security-http";
import { revokeSecuritySession } from "@/lib/wallet-security-store";

export const runtime = "nodejs";

export async function POST() {
  try {
    await revokeSecuritySession(await readSessionCookie());
    await clearSessionCookie();
    return securityJson({ locked: true });
  } catch (error) {
    return errorResponse(error);
  }
}
