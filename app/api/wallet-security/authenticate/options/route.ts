import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { errorResponse, securityJson, setChallengeCookie } from "@/lib/wallet-security-http";
import { issueChallenge, listPasskeys, validateSecurityOrigin } from "@/lib/wallet-security-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await request.json() as { userId?: string };
    const { rpID } = validateSecurityOrigin(request);
    const passkeys = await listPasskeys(userId);
    if (passkeys.length === 0) {
      return securityJson({ error: "Face ID is not enabled for this wallet on this device." }, { status: 404 });
    }
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((passkey) => ({ id: passkey.id, transports: ["internal"] })),
      userVerification: "required",
    });
    const challenge = await issueChallenge(userId, "authentication", options.challenge);
    await setChallengeCookie(request, challenge.id);
    return securityJson(options);
  } catch (error) {
    return errorResponse(error);
  }
}
