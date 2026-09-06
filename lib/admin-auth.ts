import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminServiceError } from "@/lib/admin-errors";

export const adminSessionCookieName = "larpz_admin_session";
export const adminSessionLifetimeSeconds = 8 * 60 * 60;

type AdminSessionPayload = {
  v: 1;
  iat: number;
  exp: number;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    const dummy = Buffer.alloc(leftBuffer.length);
    timingSafeEqual(leftBuffer, dummy);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function configuredAccessKeyDigest() {
  const configuredHash = process.env.ADMIN_ACCESS_KEY_HASH?.trim().toLowerCase();
  if (configuredHash) {
    if (!/^[a-f0-9]{64}$/.test(configuredHash)) {
      throw new AdminServiceError(
        "SERVER_NOT_CONFIGURED",
        503,
        "Administrator access is not configured correctly.",
      );
    }
    return Buffer.from(configuredHash, "hex");
  }

  const fallback = process.env.ADMIN_ACCESS_KEY;
  if (fallback) return sha256(fallback);
  throw new AdminServiceError("SERVER_NOT_CONFIGURED", 503, "Administrator access is not configured.");
}

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new AdminServiceError(
      "SERVER_NOT_CONFIGURED",
      503,
      "Administrator sessions are not configured.",
    );
  }
  return secret;
}

function encodePayload(payload: AdminSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", sessionSecret()).update(encodedPayload, "utf8").digest();
}

export function verifyAdminAccessKey(value: unknown) {
  const candidate = typeof value === "string" && value.length <= 1024 ? value : "";
  return constantTimeEqual(sha256(candidate), configuredAccessKeyDigest());
}

export function createAdminSession(now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload: AdminSessionPayload = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + adminSessionLifetimeSeconds,
  };
  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload).toString("base64url");
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyAdminSessionToken(value: unknown, now = Date.now()) {
  if (typeof value !== "string" || value.length > 2048) return false;
  const [encodedPayload, encodedSignature, extra] = value.split(".");
  if (!encodedPayload || !encodedSignature || extra) return false;

  let suppliedSignature: Buffer;
  let payload: AdminSessionPayload;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return false;
    payload = decoded as AdminSessionPayload;
  } catch {
    return false;
  }

  const signatureMatches = constantTimeEqual(suppliedSignature, signPayload(encodedPayload));
  const currentTime = Math.floor(now / 1000);
  return signatureMatches
    && payload.v === 1
    && Number.isInteger(payload.iat)
    && Number.isInteger(payload.exp)
    && payload.iat > 0
    && payload.iat <= currentTime + 60
    && payload.exp > currentTime
    && payload.exp - payload.iat === adminSessionLifetimeSeconds;
}

function cookieValue(header: string | null, name: string) {
  if (!header) return "";
  for (const entry of header.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (rawName !== name) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return "";
    }
  }
  return "";
}

export function hasValidAdminRequestSession(request: Request) {
  return verifyAdminSessionToken(cookieValue(request.headers.get("cookie"), adminSessionCookieName));
}

export async function hasValidAdminSession() {
  const value = (await cookies()).get(adminSessionCookieName)?.value;
  return verifyAdminSessionToken(value);
}

export async function requireAdminPageSession(nextPath: string) {
  if (await hasValidAdminSession()) return true;
  const safeNextPath = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/admin";
  redirect(`/admin/login?next=${encodeURIComponent(safeNextPath)}`);
}

export function requireAdminRequestSession(request: Request) {
  if (!hasValidAdminRequestSession(request)) {
    throw new AdminServiceError("UNAUTHORIZED", 401, "Administrator authentication is required.");
  }
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionLifetimeSeconds,
    priority: "high" as const,
  };
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;

  if (!origin || origin === "null") {
    throw new AdminServiceError("FORBIDDEN", 403, "A same-origin request is required.");
  }
  try {
    if (new URL(origin).origin !== expectedOrigin) {
      throw new AdminServiceError("FORBIDDEN", 403, "A same-origin request is required.");
    }
  } catch (error) {
    if (error instanceof AdminServiceError) throw error;
    throw new AdminServiceError("FORBIDDEN", 403, "A same-origin request is required.");
  }
}

export function adminRequestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHmac("sha256", sessionSecret()).update(`admin-login:${address}`, "utf8").digest("hex");
}
