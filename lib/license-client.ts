import { getLicense, saveLicense, validateLicense } from "@/lib/license";
import { normalizeLicenseKey } from "@/lib/storage";
import type { LicenseRecord, LicenseStatus } from "@/lib/types";

type LicenseActivationResponse = {
  valid?: boolean;
  license?: {
    plan?: unknown;
    status?: unknown;
    expiration?: unknown;
  };
  error?: unknown;
  code?: unknown;
};

const licenseKeyPattern = /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/;
const licensePlans = new Set<LicenseRecord["plan"]>(["starter", "pro", "lifetime"]);
const licenseStatuses = new Set<LicenseStatus>(["active", "expired", "unused", "revoked"]);

function localDemoLicensesAreAllowed() {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname === "::1";
}

function serverErrorMessage(payload: LicenseActivationResponse | null, response: Response) {
  return typeof payload?.error === "string" && payload.error.trim()
    ? payload.error
    : response.statusText || "The license activation service rejected this key.";
}

function validServerLicense(value: LicenseActivationResponse["license"]): value is {
  plan: LicenseRecord["plan"];
  status: LicenseStatus;
  expiration: string;
} {
  return Boolean(
    value
    && typeof value.plan === "string"
    && licensePlans.has(value.plan as LicenseRecord["plan"])
    && typeof value.status === "string"
    && licenseStatuses.has(value.status as LicenseStatus)
    && typeof value.expiration === "string"
    && value.expiration.trim(),
  );
}

/**
 * Activates a license against the server and mirrors the authoritative fields
 * into the existing browser license store. Reserved DEMO keys only work in a
 * development build or on localhost; deployed builds fail closed against the
 * server so cached, revoked, or unknown production keys cannot bypass it.
 */
export async function activateLicenseWithServer(rawLicenseKey: string): Promise<LicenseRecord> {
  const licenseKey = normalizeLicenseKey(rawLicenseKey);
  if (!licenseKeyPattern.test(licenseKey)) {
    throw new Error("Enter your complete activation key.");
  }

  const localValidation = validateLicense(licenseKey);
  const localFallback = localValidation.valid ? localValidation.license : undefined;

  // Legacy checkout/test licenses are intentionally browser-local demo data.
  // Server-issued keys never use the reserved DEMO prefix.
  if (
    localFallback
    && licenseKey.startsWith("DEMO-")
    && localDemoLicensesAreAllowed()
  ) return localFallback;

  let response: Response;
  try {
    response = await fetch("/api/licenses/activate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: licenseKey }),
      cache: "no-store",
    });
  } catch {
    throw new Error("The license activation service is unavailable. Please try again.");
  }

  const payload = await response.json().catch(() => null) as LicenseActivationResponse | null;
  if (!response.ok) {
    throw new Error(serverErrorMessage(payload, response));
  }

  if (payload?.valid !== true || !validServerLicense(payload.license)) {
    throw new Error(serverErrorMessage(payload, response));
  }

  const existing = getLicense(licenseKey);
  return saveLicense({
    ...existing,
    key: licenseKey,
    plan: payload.license.plan,
    status: payload.license.status,
    expiration: payload.license.expiration,
    activatedAt: existing?.activatedAt
      ?? (payload.license.status === "active" ? new Date().toISOString() : undefined),
  });
}
