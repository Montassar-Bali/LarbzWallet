import {
  adminRequestFingerprint,
  assertSameOrigin,
  requireAdminRequestSession,
} from "@/lib/admin-auth";
import { updateAdminLicense } from "@/lib/admin-database";
import { adminErrorResponse, adminJson, readJsonObject } from "@/lib/admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    requireAdminRequestSession(request);
    const [body, routeParams] = await Promise.all([readJsonObject(request), params]);
    const license = await updateAdminLicense({
      id: routeParams.id,
      action: body.action,
      days: body.days ?? body.durationDays,
      requestFingerprint: adminRequestFingerprint(request),
    });
    return adminJson({ license });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
