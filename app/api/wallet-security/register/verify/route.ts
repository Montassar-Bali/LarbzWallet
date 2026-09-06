import { verifyRegistrationResponse, type AuthenticatorTransportFuture, type RegistrationResponseJSON } from "@simplewebauthn/server";

import { createSecuritySession, consumeChallenge, hasRecoveryPin, listPasskeys, publicKeyToStored, savePasskey, validateSecurityOrigin, verifySecuritySession } from "@/lib/wallet-security-store";
import { errorResponse, readSessionCookie, securityJson, setSessionCookie, takeChallengeCookie } from "@/lib/wallet-security-http";
import { completeRegistration, WalletSecurityPublicError } from "@/lib/wallet-security-core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userId?: string; response?: RegistrationResponseJSON };
    if (!body.response) throw new WalletSecurityPublicError("Registration response is required.");
    const { origin, rpID } = validateSecurityOrigin(request);
    const sessionToken = await readSessionCookie();
    const [passkeys, pinEnabled, authenticated] = await Promise.all([
      listPasskeys(body.userId),
      hasRecoveryPin(body.userId),
      verifySecuritySession(sessionToken, body.userId),
    ]);
    if ((passkeys.length > 0 || pinEnabled) && !authenticated) {
      throw new WalletSecurityPublicError("Unlock the wallet before adding another passkey.", 401);
    }
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
      persist: async (passkey) => { await savePasskey(passkey, sessionToken); },
    });
    const session = await createSecuritySession(body.userId);
    await setSessionCookie(request, session.token, session.expiresAt);
    return securityJson({ verified: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function consumeChallengeCookie(userId: string | undefined) {
  return consumeChallenge(await takeChallengeCookie(), userId, "registration");
}
