import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";

import { AdminServiceError } from "@/lib/admin-errors";

const generatedKeyAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const loginWindowMinutes = 15;
const loginAttemptLimit = 5;
const activationWindowMinutes = 10;
const activationAttemptLimit = 10;

type LicenseRow = {
  id: string;
  key_prefix: string;
  key_suffix: string;
  label: string;
  email: string;
  plan: string;
  status: "unused" | "active" | "revoked";
  expires_at: string | Date | null;
  activation_count: number | string;
  last_activated_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type LoginRateLimitRow = {
  failed_attempts: number | string;
  blocked_until: string | Date | null;
};

type LicenseExpirationRow = {
  expires_at: string | Date | null;
};

export type AdminLicenseStatus = "unused" | "active" | "revoked" | "expired";

export type AdminLicenseDto = {
  id: string;
  key: string;
  maskedKey: string;
  keyHint: string;
  label: string;
  email: string;
  plan: string;
  status: AdminLicenseStatus;
  expiresAt: string | null;
  expiration: string | null;
  activationCount: number;
  lastActivatedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicLicenseDto = Pick<AdminLicenseDto, "id" | "plan" | "status" | "expiresAt"> & {
  expiration: string;
};

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim()
    || process.env.STORAGE_URL?.trim()
    || process.env.POSTGRES_URL?.trim();
  if (!url) {
    throw new AdminServiceError(
      "SERVER_NOT_CONFIGURED",
      503,
      "License storage is not configured.",
    );
  }
  return url;
}

function licenseKeyPepper() {
  const pepper = process.env.LICENSE_KEY_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new AdminServiceError(
      "SERVER_NOT_CONFIGURED",
      503,
      "License key protection is not configured.",
    );
  }
  return pepper;
}

let schemaUrl = "";
let schemaPromise: Promise<void> | null = null;

async function ensureAdminSchema() {
  const url = databaseUrl();
  if (schemaUrl !== url) {
    schemaUrl = url;
    schemaPromise = null;
  }
  if (!schemaPromise) {
    const sql = neon(url);
    schemaPromise = sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext('larpz_admin_schema_v2'))`,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_admin_licenses (
          id TEXT PRIMARY KEY,
          key_digest TEXT NOT NULL UNIQUE,
          key_prefix TEXT NOT NULL,
          key_suffix TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT 'Unlabeled',
          email TEXT NOT NULL DEFAULT '',
          plan TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'active', 'revoked')),
          expires_at TIMESTAMPTZ,
          activation_count BIGINT NOT NULL DEFAULT 0 CHECK (activation_count >= 0),
          last_activated_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`ALTER TABLE larpz_admin_licenses ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT 'Unlabeled'`,
      sql`ALTER TABLE larpz_admin_licenses ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''`,
      sql`ALTER TABLE larpz_admin_licenses DROP CONSTRAINT IF EXISTS larpz_admin_licenses_status_check`,
      sql`
        UPDATE larpz_admin_licenses
        SET status = CASE WHEN status = 'expired' THEN 'active' ELSE 'revoked' END
        WHERE status NOT IN ('unused', 'active', 'revoked')
      `,
      sql`ALTER TABLE larpz_admin_licenses ADD CONSTRAINT larpz_admin_licenses_status_check CHECK (status IN ('unused', 'active', 'revoked'))`,
      sql`ALTER TABLE larpz_admin_licenses ALTER COLUMN status SET DEFAULT 'unused'`,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_admin_audit_log (
          id TEXT PRIMARY KEY,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          target_id TEXT,
          request_fingerprint TEXT,
          event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_license_activation_rate_limits (
          identifier_digest TEXT PRIMARY KEY,
          failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
          window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          blocked_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_admin_login_rate_limits (
          identifier_digest TEXT PRIMARY KEY,
          failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
          window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          blocked_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS larpz_admin_licenses_created_idx ON larpz_admin_licenses (created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_admin_licenses_status_idx ON larpz_admin_licenses (status, expires_at)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_admin_audit_created_idx ON larpz_admin_audit_log (created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_admin_rate_limit_updated_idx ON larpz_admin_login_rate_limits (updated_at)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_activation_rate_limit_updated_idx ON larpz_license_activation_rate_limits (updated_at)`,
    ]).then(() => undefined).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function asIsoDate(value: string | Date | null) {
  return value === null ? null : new Date(value).toISOString();
}

function maskedKey(prefix: string, suffix: string) {
  return `${prefix}-••••-••••-${suffix}`;
}

function licenseDto(row: LicenseRow): AdminLicenseDto {
  const expiresAt = asIsoDate(row.expires_at);
  const status: AdminLicenseStatus = row.status === "revoked"
    ? "revoked"
    : expiresAt !== null && Date.parse(expiresAt) <= Date.now()
      ? "expired"
      : row.status;
  const key = maskedKey(row.key_prefix, row.key_suffix);
  const activatedAt = asIsoDate(row.last_activated_at);
  return {
    id: row.id,
    key,
    maskedKey: key,
    keyHint: key,
    label: row.label,
    email: row.email,
    plan: row.plan,
    status,
    expiresAt,
    expiration: expiresAt,
    activationCount: Number(row.activation_count),
    lastActivatedAt: activatedAt,
    activatedAt,
    createdAt: asIsoDate(row.created_at)!,
    updatedAt: asIsoDate(row.updated_at)!,
  };
}

function normalizeLabel(value: unknown) {
  if (value === undefined || value === null || value === "") return "Unassigned";
  if (typeof value !== "string") throw new AdminServiceError("BAD_REQUEST", 400, "Enter a valid license label.");
  const label = value.trim();
  if (label.length > 80) throw new AdminServiceError("BAD_REQUEST", 400, "License labels must contain no more than 80 characters.");
  return label || "Unassigned";
}

function normalizeEmail(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new AdminServiceError("BAD_REQUEST", 400, "Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (!email) return "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminServiceError("BAD_REQUEST", 400, "Enter a valid email address.");
  }
  return email;
}

function normalizePlan(value: unknown) {
  if (value === undefined) return "starter";
  if (typeof value !== "string") {
    throw new AdminServiceError("BAD_REQUEST", 400, "Enter a valid license plan.");
  }
  const plan = value.trim().toLowerCase();
  if (plan !== "starter" && plan !== "pro" && plan !== "lifetime") {
    throw new AdminServiceError("BAD_REQUEST", 400, "Choose the starter, pro, or lifetime plan.");
  }
  return plan;
}

function normalizeDurationDays(value: unknown, fallback: number | null) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 3650) {
    throw new AdminServiceError("BAD_REQUEST", 400, "Duration must be between 1 and 3650 days.");
  }
  return value as number;
}

function normalizeExpiration(value: unknown, plan: string, durationDays: unknown) {
  if (value === null) return null;
  if (value !== undefined) {
    if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
      throw new AdminServiceError("BAD_REQUEST", 400, "Enter a valid expiration date.");
    }
    const expiration = new Date(value);
    if (expiration.getTime() <= Date.now()) {
      throw new AdminServiceError("BAD_REQUEST", 400, "The expiration date must be in the future.");
    }
    return expiration.toISOString();
  }
  if (plan.toLowerCase() === "lifetime") return null;
  const days = normalizeDurationDays(durationDays, 30)!;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function newRawLicenseKey() {
  let compact = "";
  do {
    const bytes = randomBytes(16);
    compact = Array.from(bytes, (byte) => generatedKeyAlphabet[byte & 31]).join("");
  } while (compact.startsWith("DEMO"));
  return compact.match(/.{4}/g)!.join("-");
}

export function normalizeLicenseKey(value: unknown) {
  if (typeof value !== "string" || value.length > 100) {
    throw new AdminServiceError("BAD_REQUEST", 400, "Enter a valid license key.");
  }
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z0-9]{16}$/.test(compact)) {
    throw new AdminServiceError(
      "BAD_REQUEST",
      400,
      "Enter the complete license key in XXXX-XXXX-XXXX-XXXX format.",
    );
  }
  return compact.match(/.{4}/g)!.join("-");
}

function keyDigest(normalizedKey: string) {
  return createHmac("sha256", licenseKeyPepper()).update(normalizedKey, "utf8").digest("hex");
}

function newId(prefix: "lic" | "audit") {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

function normalizedFingerprint(value: string | undefined) {
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

async function appendAuditEvent({
  actor,
  action,
  targetId,
  requestFingerprint,
  eventData = {},
}: {
  actor: "admin" | "license";
  action: string;
  targetId?: string;
  requestFingerprint?: string;
  eventData?: Record<string, unknown>;
}) {
  const sql = neon(databaseUrl());
  await sql`
    INSERT INTO larpz_admin_audit_log
      (id, actor, action, target_id, request_fingerprint, event_data)
    VALUES
      (${newId("audit")}, ${actor}, ${action}, ${targetId ?? null},
       ${normalizedFingerprint(requestFingerprint)}, ${JSON.stringify(eventData)}::jsonb)
  `;
}

export async function recordAdminAuditEvent(input: {
  action: string;
  targetId?: string;
  requestFingerprint?: string;
  eventData?: Record<string, unknown>;
}) {
  await ensureAdminSchema();
  await appendAuditEvent({ actor: "admin", ...input });
}

function enforceConsumedRateLimit(rows: LoginRateLimitRow[], message: string) {
  const row = rows[0];
  if (!row) {
    throw new AdminServiceError("DATABASE_ERROR", 500, "The request could not be completed.");
  }

  const blockedUntil = row.blocked_until ? new Date(row.blocked_until).getTime() : 0;
  if (!Number.isFinite(blockedUntil)) {
    throw new AdminServiceError("DATABASE_ERROR", 500, "The request could not be completed.");
  }
  if (blockedUntil > Date.now()) {
    throw new AdminServiceError(
      "RATE_LIMITED",
      429,
      message,
      Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)),
    );
  }
}

export async function consumeAdminLoginAttempt(identifierDigest: string) {
  await ensureAdminSchema();
  const sql = neon(databaseUrl());
  const rows = await sql`
    INSERT INTO larpz_admin_login_rate_limits
      (identifier_digest, failed_attempts, window_started_at, blocked_until, updated_at)
    VALUES (${identifierDigest}, 1, NOW(), NULL, NOW())
    ON CONFLICT (identifier_digest) DO UPDATE SET
      failed_attempts = CASE
        WHEN larpz_admin_login_rate_limits.blocked_until > NOW()
          THEN larpz_admin_login_rate_limits.failed_attempts
        WHEN larpz_admin_login_rate_limits.window_started_at <= NOW() - (${loginWindowMinutes} * INTERVAL '1 minute')
          THEN 1
        ELSE larpz_admin_login_rate_limits.failed_attempts + 1
      END,
      window_started_at = CASE
        WHEN larpz_admin_login_rate_limits.blocked_until > NOW()
          THEN larpz_admin_login_rate_limits.window_started_at
        WHEN larpz_admin_login_rate_limits.window_started_at <= NOW() - (${loginWindowMinutes} * INTERVAL '1 minute')
          THEN NOW()
        ELSE larpz_admin_login_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN larpz_admin_login_rate_limits.blocked_until > NOW()
          THEN larpz_admin_login_rate_limits.blocked_until
        -- This function runs before the credential result is acted on. Keep
        -- the configured number of attempts eligible and block the next one.
        WHEN (CASE
          WHEN larpz_admin_login_rate_limits.window_started_at <= NOW() - (${loginWindowMinutes} * INTERVAL '1 minute')
            THEN 1
          ELSE larpz_admin_login_rate_limits.failed_attempts + 1
        END) > ${loginAttemptLimit}
          THEN NOW() + (${loginWindowMinutes} * INTERVAL '1 minute')
        ELSE NULL
      END,
      updated_at = NOW()
    RETURNING failed_attempts, blocked_until
  ` as LoginRateLimitRow[];
  enforceConsumedRateLimit(rows, "Too many sign-in attempts. Try again later.");
}

export async function clearAdminLoginFailures(identifierDigest: string) {
  await ensureAdminSchema();
  const sql = neon(databaseUrl());
  await sql`DELETE FROM larpz_admin_login_rate_limits WHERE identifier_digest = ${identifierDigest}`;
}

export async function consumeLicenseActivationAttempt(identifierDigest: string) {
  await ensureAdminSchema();
  const sql = neon(databaseUrl());
  const rows = await sql`
    INSERT INTO larpz_license_activation_rate_limits
      (identifier_digest, failed_attempts, window_started_at, blocked_until, updated_at)
    VALUES (${identifierDigest}, 1, NOW(), NULL, NOW())
    ON CONFLICT (identifier_digest) DO UPDATE SET
      failed_attempts = CASE
        WHEN larpz_license_activation_rate_limits.blocked_until > NOW()
          THEN larpz_license_activation_rate_limits.failed_attempts
        WHEN larpz_license_activation_rate_limits.window_started_at <= NOW() - (${activationWindowMinutes} * INTERVAL '1 minute')
          THEN 1
        ELSE larpz_license_activation_rate_limits.failed_attempts + 1
      END,
      window_started_at = CASE
        WHEN larpz_license_activation_rate_limits.blocked_until > NOW()
          THEN larpz_license_activation_rate_limits.window_started_at
        WHEN larpz_license_activation_rate_limits.window_started_at <= NOW() - (${activationWindowMinutes} * INTERVAL '1 minute')
          THEN NOW()
        ELSE larpz_license_activation_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN larpz_license_activation_rate_limits.blocked_until > NOW()
          THEN larpz_license_activation_rate_limits.blocked_until
        -- Activation is attempted only after this reservation succeeds, so
        -- the configured number of attempts must remain eligible.
        WHEN (CASE
          WHEN larpz_license_activation_rate_limits.window_started_at <= NOW() - (${activationWindowMinutes} * INTERVAL '1 minute')
            THEN 1
          ELSE larpz_license_activation_rate_limits.failed_attempts + 1
        END) > ${activationAttemptLimit}
          THEN NOW() + (${activationWindowMinutes} * INTERVAL '1 minute')
        ELSE NULL
      END,
      updated_at = NOW()
    RETURNING failed_attempts, blocked_until
  ` as LoginRateLimitRow[];
  enforceConsumedRateLimit(rows, "Too many activation attempts. Try again later.");
}

export async function clearLicenseActivationFailures(identifierDigest: string) {
  await ensureAdminSchema();
  const sql = neon(databaseUrl());
  await sql`DELETE FROM larpz_license_activation_rate_limits WHERE identifier_digest = ${identifierDigest}`;
}

export async function listAdminLicenses() {
  await ensureAdminSchema();
  const sql = neon(databaseUrl());
  const rows = await sql`
    SELECT id, key_prefix, key_suffix, label, email, plan, status, expires_at,
      activation_count, last_activated_at, created_at, updated_at
    FROM larpz_admin_licenses
    ORDER BY created_at DESC
    LIMIT 1000
  ` as LicenseRow[];
  return rows.map(licenseDto);
}

export async function createAdminLicense({
  label: rawLabel,
  email: rawEmail,
  plan: rawPlan,
  expiresInDays,
  expiresAt,
  requestFingerprint,
}: {
  label: unknown;
  email: unknown;
  plan?: unknown;
  expiresInDays?: unknown;
  expiresAt?: unknown;
  requestFingerprint?: string;
}) {
  await ensureAdminSchema();
  const label = normalizeLabel(rawLabel);
  const email = normalizeEmail(rawEmail);
  const plan = normalizePlan(rawPlan);
  const expiration = normalizeExpiration(expiresAt, plan, expiresInDays);
  const sql = neon(databaseUrl());

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rawKey = newRawLicenseKey();
    const digest = keyDigest(rawKey);
    const id = newId("lic");
    try {
      const rows = await sql`
        WITH created AS (
          INSERT INTO larpz_admin_licenses
            (id, key_digest, key_prefix, key_suffix, label, email, plan, status, expires_at)
          VALUES
            (${id}, ${digest}, ${rawKey.slice(0, 4)}, ${rawKey.slice(-4)}, ${label}, ${email}, ${plan}, 'unused', ${expiration})
          RETURNING id, key_prefix, key_suffix, label, email, plan, status, expires_at,
            activation_count, last_activated_at, created_at, updated_at
        ), logged AS (
          INSERT INTO larpz_admin_audit_log
            (id, actor, action, target_id, request_fingerprint, event_data)
          SELECT ${newId("audit")}, 'admin', 'license.created', created.id,
            ${normalizedFingerprint(requestFingerprint)},
            ${JSON.stringify({ label, email, plan, expiresAt: expiration })}::jsonb
          FROM created
          RETURNING target_id
        )
        SELECT created.*
        FROM created
        INNER JOIN logged ON logged.target_id = created.id
      ` as LicenseRow[];
      return { rawKey, key: rawKey, license: licenseDto(rows[0]) };
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
      if (code !== "23505" || attempt === 3) throw error;
    }
  }
  throw new AdminServiceError("CONFLICT", 409, "A unique license key could not be created.");
}

function normalizeLicenseId(value: unknown) {
  if (typeof value !== "string" || !/^lic_[a-f0-9]{32}$/.test(value)) {
    throw new AdminServiceError("BAD_REQUEST", 400, "A valid license identifier is required.");
  }
  return value;
}

export async function updateAdminLicense({
  id: rawId,
  action,
  days: rawDays,
  requestFingerprint,
}: {
  id: unknown;
  action: unknown;
  days?: unknown;
  requestFingerprint?: string;
}) {
  await ensureAdminSchema();
  const id = normalizeLicenseId(rawId);
  if (action !== "revoke" && action !== "reactivate" && action !== "extend") {
    throw new AdminServiceError("BAD_REQUEST", 400, "Choose revoke, reactivate, or extend.");
  }
  const days = action === "extend" ? normalizeDurationDays(rawDays, 30)! : null;
  const extensionDays = days ?? 0;
  const sql = neon(databaseUrl());
  if (action === "extend") {
    const existing = await sql`
      SELECT expires_at
      FROM larpz_admin_licenses
      WHERE id = ${id}
      LIMIT 1
    ` as LicenseExpirationRow[];
    if (!existing[0]) throw new AdminServiceError("NOT_FOUND", 404, "License not found.");
    if (existing[0].expires_at === null) {
      throw new AdminServiceError("BAD_REQUEST", 400, "Lifetime licenses never expire and cannot be extended.");
    }
  }
  const eventData = days === null ? {} : { days };
  const rows = await sql`
    WITH changed AS (
      UPDATE larpz_admin_licenses
      SET status = CASE
          WHEN ${action} = 'revoke' THEN 'revoked'
          WHEN ${action} = 'reactivate' THEN 'active'
          ELSE status
        END,
        revoked_at = CASE
          WHEN ${action} = 'revoke' THEN NOW()
          WHEN ${action} = 'reactivate' THEN NULL
          ELSE revoked_at
        END,
        expires_at = CASE
          WHEN ${action} = 'extend' AND expires_at IS NOT NULL
            THEN GREATEST(expires_at, NOW()) + (${extensionDays} * INTERVAL '1 day')
          ELSE expires_at
        END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, key_prefix, key_suffix, label, email, plan, status, expires_at,
        activation_count, last_activated_at, created_at, updated_at
    ), logged AS (
      INSERT INTO larpz_admin_audit_log
        (id, actor, action, target_id, request_fingerprint, event_data)
      SELECT ${newId("audit")}, 'admin', ${`license.${action}`}, changed.id,
        ${normalizedFingerprint(requestFingerprint)}, ${JSON.stringify(eventData)}::jsonb
      FROM changed
      RETURNING target_id
    )
    SELECT changed.*
    FROM changed
    INNER JOIN logged ON logged.target_id = changed.id
  ` as LicenseRow[];
  if (!rows[0]) throw new AdminServiceError("NOT_FOUND", 404, "License not found.");
  return licenseDto(rows[0]);
}

export async function activateLicense(rawKey: unknown, requestFingerprint?: string) {
  await ensureAdminSchema();
  const normalizedKey = normalizeLicenseKey(rawKey);
  const digest = keyDigest(normalizedKey);
  const sql = neon(databaseUrl());
  const activatedRows = await sql`
    WITH activated AS (
      UPDATE larpz_admin_licenses
      SET status = 'active',
        activation_count = activation_count + 1,
        last_activated_at = NOW(),
        updated_at = NOW()
      WHERE key_digest = ${digest}
        AND status IN ('unused', 'active')
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id, key_prefix, key_suffix, label, email, plan, status, expires_at,
        activation_count, last_activated_at, created_at, updated_at
    ), logged AS (
      INSERT INTO larpz_admin_audit_log
        (id, actor, action, target_id, request_fingerprint, event_data)
      SELECT ${newId("audit")}, 'license', 'license.activated', activated.id,
        ${normalizedFingerprint(requestFingerprint)}, '{}'::jsonb
      FROM activated
      RETURNING target_id
    )
    SELECT activated.*
    FROM activated
    INNER JOIN logged ON logged.target_id = activated.id
  ` as LicenseRow[];

  if (!activatedRows[0]) {
    const rows = await sql`
      SELECT id, key_prefix, key_suffix, label, email, plan, status, expires_at,
        activation_count, last_activated_at, created_at, updated_at
      FROM larpz_admin_licenses
      WHERE key_digest = ${digest}
      LIMIT 1
    ` as LicenseRow[];
    const row = rows[0];
    if (!row) throw new AdminServiceError("NOT_FOUND", 404, "License key not found.");
    if (row.status === "revoked") {
      throw new AdminServiceError("LICENSE_REVOKED", 410, "This license key has been revoked.");
    }
    throw new AdminServiceError("LICENSE_EXPIRED", 410, "This license key has expired.");
  }

  const adminLicense = licenseDto(activatedRows[0]);
  return {
    id: adminLicense.id,
    plan: adminLicense.plan,
    status: adminLicense.status,
    expiresAt: adminLicense.expiresAt,
    expiration: adminLicense.expiresAt ?? "9999-12-31T23:59:59.999Z",
  } satisfies PublicLicenseDto;
}
