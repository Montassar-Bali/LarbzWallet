import { clearSessionCookie, errorResponse, readSessionCookie } from "@/lib/wallet-security-http";
import { deletePasskeys, hasRecoveryPin, listPasskeys, verifySecuritySession } from "@/lib/wallet-security-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId");
    const token = await readSessionCookie();
    const [passkeys, pinEnabled, authenticated] = await Promise.all([
      listPasskeys(userId),
      hasRecoveryPin(userId),
      verifySecuritySession(token, userId),
    ]);
    return Response.json({ enrolled: passkeys.length > 0, credentialCount: passkeys.length, pinEnabled, authenticated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json() as { userId?: string };
    if (!await verifySecuritySession(await readSessionCookie(), userId)) return Response.json({ error: "Unlock the wallet before disabling biometrics." }, { status: 401 });
    await deletePasskeys(userId);
    await clearSessionCookie();
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
