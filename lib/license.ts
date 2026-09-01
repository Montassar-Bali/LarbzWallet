import {
  normalizeLicenseKey,
  readStorage,
  storageKeys,
  writeStorage,
} from "@/lib/storage";
import type { LicenseRecord, LicenseStatus } from "@/lib/types";

const seedLicenses: LicenseRecord[] = [
  {
    key: "DEMO-STAR-6FB3-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-A703-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-6F5A-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-1356-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-2013-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-5EE4-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-4130-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-71A9-2028",
    plan: "starter",
    status: "unused",
    expiration: "2028-12-31",
  },
  {
    key: "DEMO-STAR-EFA5-2027",
    plan: "starter",
    status: "unused",
    expiration: "2027-12-31",
  },
  {
    key: "DEMO-STAR-518D-2027",
    plan: "starter",
    status: "unused",
    expiration: "2027-12-31",
  },
  {
    key: "DEMO-STAR-0010-2027",
    plan: "starter",
    status: "unused",
    expiration: "2027-12-31",
  },
  {
    key: "DEMO-STAR-0009-2027",
    plan: "starter",
    status: "unused",
    expiration: "2027-12-31",
  },
  {
    key: "DEMO-STAR-0008-2027",
    plan: "starter",
    status: "unused",
    expiration: "2027-12-31",
  },
  {
    key: "DEMO-STAR-0007-2027",
    plan: "starter",
    status: "unused",
    expiration: "2027-12-31",
  },
  {
    key: "DEMO-STAR-0006-2027",
    plan: "starter",
    status: "unused",
    expiration: "2027-12-31",
  },
  {
    key: "DEMO-STAR-0005-2026",
    plan: "starter",
    status: "unused",
    expiration: "2026-12-31",
  },
  {
    key: "DEMO-STAR-0004-2026",
    plan: "starter",
    status: "unused",
    expiration: "2026-12-31",
  },
  {
    key: "DEMO-STAR-0003-2026",
    plan: "starter",
    status: "unused",
    expiration: "2026-12-31",
  },
  {
    key: "DEMO-STAR-0002-2026",
    plan: "starter",
    status: "unused",
    expiration: "2026-12-31",
  },
  {
    key: "DEMO-STAR-0001-2026",
    plan: "starter",
    status: "unused",
    expiration: "2026-12-31",
  },
  {
    key: "DEMO-PRO1-USER-2026",
    plan: "pro",
    status: "active",
    expiration: "2027-12-31",
    userId: "usr_demo",
    userEmail: "demo@larpz.app",
    activatedAt: "2026-02-12T09:15:00.000Z",
  },
  {
    key: "DEMO-PRO1-ACTI-2026",
    plan: "pro",
    status: "active",
    expiration: "2027-12-31",
    userId: "usr_admin",
    userEmail: "admin@larpz.app",
    activatedAt: "2026-01-05T11:45:00.000Z",
  },
  {
    key: "DEMO-LIFE-REVO-2026",
    plan: "lifetime",
    status: "revoked",
    expiration: "2099-12-31",
  },
  {
    key: "DEMO-PRO1-EXPD-2025",
    plan: "pro",
    status: "expired",
    expiration: "2025-12-31",
  },
];

function getAllLicenses() {
  const licenses = readStorage<LicenseRecord[]>(storageKeys.licenses, []);
  if (licenses.length === 0) {
    writeStorage(storageKeys.licenses, seedLicenses);
    return seedLicenses;
  }

  const knownKeys = new Set(licenses.map((license) => license.key));
  const missingSeeds = seedLicenses.filter((license) => !knownKeys.has(license.key));
  if (missingSeeds.length > 0) {
    const merged = [...licenses, ...missingSeeds];
    writeStorage(storageKeys.licenses, merged);
    return merged;
  }

  return licenses;
}

function saveLicenses(records: LicenseRecord[]) {
  writeStorage(storageKeys.licenses, records);
}

export function getLicense(key: string) {
  const normalized = normalizeLicenseKey(key);
  return getAllLicenses().find((license) => license.key === normalized) ?? null;
}

export function saveLicense(next: LicenseRecord) {
  const licenses = getAllLicenses();
  const index = licenses.findIndex((license) => license.key === next.key);

  if (index >= 0) {
    licenses[index] = next;
  } else {
    licenses.push(next);
  }

  saveLicenses(licenses);
  return next;
}

export function issueDemoLicense(plan: LicenseRecord["plan"]) {
  const prefix = plan === "starter" ? "STAR" : plan === "pro" ? "PRO1" : "LIFE";
  const key = `DEMO-${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString().slice(-4)}`;
  const expiration = new Date();
  if (plan === "starter") expiration.setDate(expiration.getDate() + 7);
  else if (plan === "pro") expiration.setMonth(expiration.getMonth() + 1);
  else expiration.setFullYear(expiration.getFullYear() + 99);

  return saveLicense({
    key,
    plan,
    status: "unused",
    expiration: expiration.toISOString().slice(0, 10),
  });
}

export function validateLicense(key: string) {
  const license = getLicense(key);
  if (!license) {
    return { valid: false, status: "unused" as LicenseStatus, reason: "License key not found." };
  }

  if (license.status === "revoked") {
    return { valid: false, status: license.status, reason: "License has been revoked." };
  }

  if (license.status === "expired") {
    return { valid: false, status: license.status, reason: "License has expired." };
  }

  const expiresAt = new Date(license.expiration).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return { valid: false, status: "expired" as LicenseStatus, reason: "License has expired." };
  }

  if (license.status === "active") {
    return {
      valid: true,
      status: license.status,
      reason: "Reusable license is active and valid.",
      license,
    };
  }

  return {
    valid: true,
    status: license.status,
    reason: "License is valid and ready to activate.",
    license,
  };
}

export function activateLicense(key: string, user?: { id: string; email: string }) {
  const normalized = normalizeLicenseKey(key);
  const found = getLicense(normalized);

  if (!found) {
    throw new Error("License key not found.");
  }

  if (found.status === "revoked") {
    throw new Error("License has been revoked.");
  }

  if (found.status === "expired") {
    throw new Error("License has expired.");
  }

  const next: LicenseRecord = {
    ...found,
    status: "active",
    userId: user?.id ?? found.userId,
    userEmail: user?.email ?? found.userEmail,
    activatedAt: new Date().toISOString(),
  };

  saveLicense(next);
  return next;
}

export function getLicenseStatus(key: string): LicenseStatus {
  const license = getLicense(key);
  if (!license) {
    return "unused";
  }

  return license.status;
}

export function listLicenses() {
  return getAllLicenses();
}

export function updateLicenseStatus(key: string, status: LicenseStatus) {
  const license = getLicense(key);
  if (!license) {
    throw new Error("License key not found.");
  }

  const next: LicenseRecord = {
    ...license,
    status,
  };

  saveLicense(next);
  return next;
}

export function extendLicense(key: string, days: number) {
  const license = getLicense(key);
  if (!license) {
    throw new Error("License key not found.");
  }

  const now = new Date(license.expiration);
  now.setDate(now.getDate() + days);

  const next: LicenseRecord = {
    ...license,
    status: "active",
    expiration: now.toISOString().slice(0, 10),
  };

  saveLicense(next);
  return next;
}
