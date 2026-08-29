import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { setChallengeCookie, errorResponse } from "@/lib/wallet-security-http";
import { issueChallenge, listPasskeys, validateSecurityOrigin } from "@/lib/wallet-security-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await request.json() as { userId?: string };
    const { rpID } = validateSecurityOrigin(request);
    const passkeys = await listPasskeys(userId);
    if (passkeys.length === 0) return Response.json({ error: "No passkey is enrolled for this wallet." }, { status: 404 });
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((passkey) => ({ id: passkey.id, transports: passkey.transports })),
      userVerification: "required",
    });
    const challenge = await issueChallenge(userId, "authentication", options.challenge);
    await setChallengeCookie(request, challenge.id);
    return Response.json(options, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
