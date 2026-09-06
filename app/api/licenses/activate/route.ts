import { createHmac } from "node:crypto";

import { assertSameOrigin } from "@/lib/admin-auth";
import {
  activateLicense,
  clearLicenseActivationFailures,
  consumeLicenseActivationAttempt,
} from "@/lib/admin-database";
import { AdminServiceError } from "@/lib/admin-errors";
import { adminErrorResponse, adminJson, readJsonObject } from "@/lib/admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function activationRequestFingerprint(request: Request) {
  const pepper = process.env.LICENSE_KEY_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new AdminServiceError(
      "SERVER_NOT_CONFIGURED",
      503,
      "License key protection is not configured.",
    );
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHmac("sha256", pepper).update(`license-activation:${address}`, "utf8").digest("hex");
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const fingerprint = activationRequestFingerprint(request);
    await consumeLicenseActivationAttempt(fingerprint);
    const license = await activateLicense(body.key, fingerprint);
    await clearLicenseActivationFailures(fingerprint);
    return adminJson({ valid: true, license });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
