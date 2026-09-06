import { clearSessionCookie, errorResponse, readSessionCookie, securityJson } from "@/lib/wallet-security-http";
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
    return securityJson({ enrolled: passkeys.length > 0, credentialCount: passkeys.length, pinEnabled, authenticated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json() as { userId?: string };
    if (!await verifySecuritySession(await readSessionCookie(), userId)) {
      return securityJson({ error: "Unlock the wallet before disabling biometrics." }, { status: 401 });
    }
    await deletePasskeys(userId);
    await clearSessionCookie();
    return securityJson({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
