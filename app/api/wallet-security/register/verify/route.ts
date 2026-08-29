import { verifyRegistrationResponse, type AuthenticatorTransportFuture, type RegistrationResponseJSON } from "@simplewebauthn/server";

import { createSecuritySession, consumeChallenge, publicKeyToStored, savePasskey, validateSecurityOrigin } from "@/lib/wallet-security-store";
import { errorResponse, setSessionCookie, takeChallengeCookie } from "@/lib/wallet-security-http";
import { completeRegistration } from "@/lib/wallet-security-core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userId?: string; response?: RegistrationResponseJSON };
    if (!body.response) throw new Error("Registration response is required.");
    const { origin, rpID } = validateSecurityOrigin(request);
    await completeRegistration({
      consume: () => consumeChallengeCookie(body.userId),
      verify: async (challenge) => {
        const verification = await verifyRegistrationResponse({
          response: body.response!,
          expectedChallenge: challenge.value,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserPresence: true,
          requireUserVerification: true,
        });
        if (!verification.verified || !verification.registrationInfo) return { verified: false };
        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        return {
          verified: true,
          credential: {
            id: credential.id,
            userId: body.userId!,
            webAuthnUserId: challenge.webAuthnUserId ?? body.response!.id,
            publicKey: publicKeyToStored(credential.publicKey),
            counter: credential.counter,
            // A platform registration is deliberately kept device-internal so
            // Safari does not offer security keys or cross-device authenticators.
            transports: ["internal"] as AuthenticatorTransportFuture[],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            createdAt: new Date().toISOString(),
          },
        };
      },
      persist: async (passkey) => { await savePasskey(passkey); },
    });
    const session = await createSecuritySession(body.userId);
    await setSessionCookie(request, session.token, session.expiresAt);
    return Response.json({ verified: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function consumeChallengeCookie(userId: string | undefined) {
  return consumeChallenge(await takeChallengeCookie(), userId, "registration");
}
