import {
  adminRequestFingerprint,
  adminSessionCookieName,
  adminSessionCookieOptions,
  assertSameOrigin,
  createAdminSession,
  verifyAdminAccessKey,
} from "@/lib/admin-auth";
import {
  clearAdminLoginFailures,
  enforceAdminLoginRateLimit,
  recordAdminAuditEvent,
  recordAdminLoginFailure,
} from "@/lib/admin-database";
import { AdminServiceError } from "@/lib/admin-errors";
import { adminErrorResponse, adminJson, readJsonObject } from "@/lib/admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const fingerprint = adminRequestFingerprint(request);
    await enforceAdminLoginRateLimit(fingerprint);
    const body = await readJsonObject(request);

    if (!verifyAdminAccessKey(body.accessKey)) {
      await recordAdminLoginFailure(fingerprint);
      throw new AdminServiceError("UNAUTHORIZED", 401, "The administrator access key is not valid.");
    }

    await clearAdminLoginFailures(fingerprint);
    const session = createAdminSession();
    await recordAdminAuditEvent({
      action: "session.created",
      requestFingerprint: fingerprint,
    });
    const response = adminJson({ authenticated: true, expiresAt: session.expiresAt });
    response.cookies.set(adminSessionCookieName, session.token, adminSessionCookieOptions());
    return response;
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const response = adminJson({ authenticated: false });
    response.cookies.set(adminSessionCookieName, "", {
      ...adminSessionCookieOptions(),
      expires: new Date(0),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return adminErrorResponse(error);
  }
}
