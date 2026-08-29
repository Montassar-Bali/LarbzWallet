import { errorResponse, readSessionCookie, setSessionCookie } from "@/lib/wallet-security-http";
import { createSecuritySession, hasRecoveryPin, listPasskeys, setRecoveryPin, verifyRecoveryPin, verifySecuritySession } from "@/lib/wallet-security-store";
import { completeRecoveryUnlock } from "@/lib/wallet-security-core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId, pin, action } = await request.json() as { userId?: string; pin?: string; action?: "set" | "verify" };
    if (typeof pin !== "string") throw new Error("Recovery PIN is required.");
    if (action === "set") {
      const [pinExists, passkeys, authenticated] = await Promise.all([
        hasRecoveryPin(userId),
        listPasskeys(userId),
        verifySecuritySession(await readSessionCookie(), userId),
      ]);
      if ((pinExists || passkeys.length > 0) && !authenticated) return Response.json({ error: "Unlock the wallet before changing the recovery PIN." }, { status: 401 });
      await setRecoveryPin(userId, pin);
      const session = await createSecuritySession(userId);
      await setSessionCookie(request, session.token, session.expiresAt);
      return Response.json({ saved: true, authenticated: true });
    }
    if (action === "verify") {
      let session: Awaited<ReturnType<typeof createSecuritySession>> | undefined;
      try {
        await completeRecoveryUnlock({
          verifyPin: () => verifyRecoveryPin(userId, pin),
          createSession: async () => { session = await createSecuritySession(userId); },
        });
      } catch (error) {
        return errorResponse(error, 401);
      }
      await setSessionCookie(request, session!.token, session!.expiresAt);
      return Response.json({ verified: true, authenticated: true });
    }
    throw new Error("Unknown recovery action.");
  } catch (error) {
    return errorResponse(error);
  }
}
