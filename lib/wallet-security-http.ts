import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { WalletSecurityPublicError } from "@/lib/wallet-security-core";

export const walletChallengeCookie = "phantom_wallet_challenge";
export const walletSessionCookie = "phantom_wallet_session";
export const walletSecurityNoStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
};

const localFingerprintSecret = randomBytes(32).toString("base64url");

function rateLimitSecret() {
  const secret = process.env.WALLET_SECURITY_RATE_LIMIT_SECRET?.trim()
    || process.env.LICENSE_KEY_PEPPER?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return localFingerprintSecret;
  throw new WalletSecurityPublicError("Wallet security rate limiting is not configured.", 503);
}

export function recoveryPinRequestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = (forwarded || request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 160);
  return createHmac("sha256", rateLimitSecret())
    .update(`wallet-recovery-pin:${address}`, "utf8")
    .digest("hex");
}

export function securityJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(walletSecurityNoStoreHeaders)) headers.set(key, value);
  return Response.json(data, { ...init, headers });
}

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
  const safe = error instanceof WalletSecurityPublicError;
  if (!safe) {
    const errorType = error instanceof Error ? error.name : typeof error;
    console.error(`Wallet security request failed (${errorType})`);
  }
  const response = securityJson(
    { error: safe ? error.message : "Wallet security request could not be completed." },
    { status: safe ? error.status ?? status : 500 },
  );
  if (safe && error.retryAfterSeconds) {
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
  }
  return response;
}
