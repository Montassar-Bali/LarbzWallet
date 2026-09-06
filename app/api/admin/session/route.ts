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
  consumeAdminLoginAttempt,
  recordAdminAuditEvent,
} from "@/lib/admin-database";
import { AdminServiceError } from "@/lib/admin-errors";
import { adminErrorResponse, adminJson, readJsonObject } from "@/lib/admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const fingerprint = adminRequestFingerprint(request);
    const body = await readJsonObject(request);
    // Resolve administrator configuration before consuming an attempt so a
    // deployment configuration error cannot turn into a client lockout.
    const accessKeyIsValid = verifyAdminAccessKey(body.accessKey);
    await consumeAdminLoginAttempt(fingerprint);

    if (!accessKeyIsValid) {
      await recordAdminAuditEvent({
        action: "session.denied",
        requestFingerprint: fingerprint,
        eventData: { reason: "invalid_access_key" },
      });
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
