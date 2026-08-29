import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";

import { createSecuritySession, consumeChallenge, findPasskey, publicKeyFromStored, updatePasskeyCounter, validateSecurityOrigin } from "@/lib/wallet-security-store";
import { errorResponse, setSessionCookie, takeChallengeCookie } from "@/lib/wallet-security-http";
import { completeAuthentication } from "@/lib/wallet-security-core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userId?: string; response?: AuthenticationResponseJSON };
    if (!body.response) throw new Error("Authentication response is required.");
    const { origin, rpID } = validateSecurityOrigin(request);
    let credentialId = "";
    await completeAuthentication({
      consume: () => consumeChallengeCookie(body.userId),
      verify: async (challenge) => {
        const passkey = await findPasskey(body.userId, body.response!.id);
        if (!passkey) throw new Error("Passkey not found for this wallet.");
        credentialId = passkey.id;
        const verification = await verifyAuthenticationResponse({
          response: body.response!,
          expectedChallenge: challenge.value,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: passkey.id,
            publicKey: publicKeyFromStored(passkey),
            counter: passkey.counter,
            transports: passkey.transports,
          },
          requireUserVerification: true,
        });
        return { verified: verification.verified, newCounter: verification.authenticationInfo.newCounter };
      },
      updateCounter: (counter) => updatePasskeyCounter(body.userId!, credentialId, counter),
    });
    const session = await createSecuritySession(body.userId);
    await setSessionCookie(request, session.token, session.expiresAt);
    return Response.json({ verified: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function consumeChallengeCookie(userId: string | undefined) {
  return consumeChallenge(await takeChallengeCookie(), userId, "authentication");
}
