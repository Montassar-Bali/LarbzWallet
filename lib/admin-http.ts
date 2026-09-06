import "server-only";

import { NextResponse } from "next/server";

import { AdminServiceError, asAdminServiceError } from "@/lib/admin-errors";

export const adminNoStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
};

export function adminJson(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...adminNoStoreHeaders, ...Object.fromEntries(new Headers(init.headers).entries()) },
  });
}

export function adminErrorResponse(error: unknown) {
  const safe = asAdminServiceError(error);
  const response = adminJson({ error: safe.message, code: safe.code }, { status: safe.status });
  if (safe.retryAfterSeconds) response.headers.set("Retry-After", String(safe.retryAfterSeconds));
  return response;
}

export async function readJsonObject(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > 16_384) throw new Error("too large");
    const rawBody = await request.text();
    if (!rawBody || rawBody.length > 16_384) throw new Error("invalid size");
    const value = JSON.parse(rawBody) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new AdminServiceError("BAD_REQUEST", 400, "A valid JSON request body is required.");
  }
}
