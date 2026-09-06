import {
  adminRequestFingerprint,
  assertSameOrigin,
  requireAdminRequestSession,
} from "@/lib/admin-auth";
import { createAdminLicense, listAdminLicenses } from "@/lib/admin-database";
import { adminErrorResponse, adminJson, readJsonObject } from "@/lib/admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAdminRequestSession(request);
    return adminJson({ licenses: await listAdminLicenses() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireAdminRequestSession(request);
    const body = await readJsonObject(request);
    const created = await createAdminLicense({
      label: body.label,
      email: body.email,
      plan: body.plan,
      expiresInDays: body.expiresInDays ?? body.durationDays,
      expiresAt: body.expiresAt,
      requestFingerprint: adminRequestFingerprint(request),
    });
    return adminJson(created, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
