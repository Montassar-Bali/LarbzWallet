import { generateRegistrationOptions } from "@simplewebauthn/server";

import { errorResponse, readSessionCookie, securityJson, setChallengeCookie } from "@/lib/wallet-security-http";
import { hasRecoveryPin, issueChallenge, listPasskeys, validateSecurityOrigin, verifySecuritySession } from "@/lib/wallet-security-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId, userName } = await request.json() as { userId?: string; userName?: string };
    const { rpID } = validateSecurityOrigin(request);
    const sessionToken = await readSessionCookie();
    const [passkeys, pinEnabled, authenticated] = await Promise.all([
      listPasskeys(userId),
      hasRecoveryPin(userId),
      verifySecuritySession(sessionToken, userId),
    ]);
    if ((passkeys.length > 0 || pinEnabled) && !authenticated) {
      return securityJson({ error: "Unlock the wallet before adding another passkey." }, { status: 401 });
    }
    const displayName = typeof userName === "string" && userName.trim() ? userName.trim().slice(0, 64) : "Phantom wallet user";
    const options = await generateRegistrationOptions({
      rpName: "Phantom",
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: displayName,
      userDisplayName: displayName,
      attestationType: "none",
      excludeCredentials: passkeys.map((passkey) => ({ id: passkey.id, transports: ["internal"] })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    const challenge = await issueChallenge(userId, "registration", options.challenge, options.user.id);
    await setChallengeCookie(request, challenge.id);
    return securityJson(options);
  } catch (error) {
    return errorResponse(error);
  }
}
