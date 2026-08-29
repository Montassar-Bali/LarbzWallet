import { generateRegistrationOptions } from "@simplewebauthn/server";

import { setChallengeCookie, errorResponse } from "@/lib/wallet-security-http";
import { issueChallenge, listPasskeys, validateSecurityOrigin } from "@/lib/wallet-security-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId, userName } = await request.json() as { userId?: string; userName?: string };
    const { rpID } = validateSecurityOrigin(request);
    const passkeys = await listPasskeys(userId);
    const displayName = typeof userName === "string" && userName.trim() ? userName.trim().slice(0, 64) : "Phantom wallet user";
    const options = await generateRegistrationOptions({
      rpName: "Phantom Wallet Simulator",
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
    return Response.json(options, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
