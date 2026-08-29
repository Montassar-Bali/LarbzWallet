import "server-only";

import { cookies } from "next/headers";

export const walletChallengeCookie = "phantom_wallet_challenge";
export const walletSessionCookie = "phantom_wallet_session";

export function secureCookieFor(request: Request) {
  return new URL(request.url).protocol === "https:";
}

export async function setChallengeCookie(request: Request, challengeId: string) {
  const store = await cookies();
  store.set(walletChallengeCookie, challengeId, {
    httpOnly: true,
    secure: secureCookieFor(request),
    sameSite: "strict",
    path: "/api/wallet-security",
    maxAge: 5 * 60,
  });
}

export async function takeChallengeCookie() {
  const store = await cookies();
  const value = store.get(walletChallengeCookie)?.value;
  store.delete(walletChallengeCookie);
  return value;
}

export async function setSessionCookie(request: Request, token: string, expiresAt: number) {
  const store = await cookies();
  store.set(walletSessionCookie, token, {
    httpOnly: true,
    secure: secureCookieFor(request),
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function readSessionCookie() {
  return (await cookies()).get(walletSessionCookie)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(walletSessionCookie);
}

export function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Wallet security request failed.";
  return Response.json({ error: message }, { status });
}
