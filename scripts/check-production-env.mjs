import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const requestedEnvFile = process.argv[2];

if (requestedEnvFile) {
  if (!existsSync(requestedEnvFile)) {
    console.error(`Environment check failed: ${requestedEnvFile} does not exist.`);
    process.exit(1);
  }
  loadEnvFile(requestedEnvFile);
}

const errors = [];
const warnings = [];
const value = (name) => process.env[name]?.trim() ?? "";
const requireLength = (name, minimum) => {
  if (value(name).length < minimum) {
    errors.push(`${name} must contain at least ${minimum} characters.`);
  }
};

if (!value("DATABASE_URL")) {
  errors.push("DATABASE_URL is required for persistent production storage.");
}

const adminHash = value("ADMIN_ACCESS_KEY_HASH");
const rawAdminKey = value("ADMIN_ACCESS_KEY");
if (!adminHash && !rawAdminKey) {
  errors.push("ADMIN_ACCESS_KEY_HASH is required for administrator access.");
} else if (adminHash && !/^[a-f0-9]{64}$/i.test(adminHash)) {
  errors.push("ADMIN_ACCESS_KEY_HASH must be a 64-character SHA-256 hex digest.");
} else if (!adminHash && rawAdminKey) {
  errors.push("Hash the administrator key into ADMIN_ACCESS_KEY_HASH and leave ADMIN_ACCESS_KEY unset for production.");
}
if (adminHash && rawAdminKey) {
  errors.push("Set only ADMIN_ACCESS_KEY_HASH in production; remove ADMIN_ACCESS_KEY.");
}

requireLength("ADMIN_SESSION_SECRET", 32);
requireLength("LICENSE_KEY_PEPPER", 32);
requireLength("WALLET_SECURITY_RATE_LIMIT_SECRET", 32);
requireLength("WALLET_SECURITY_PIN_PEPPER", 32);

const independentSecrets = [
  "ADMIN_SESSION_SECRET",
  "LICENSE_KEY_PEPPER",
  "WALLET_SECURITY_RATE_LIMIT_SECRET",
  "WALLET_SECURITY_PIN_PEPPER",
];
for (let index = 0; index < independentSecrets.length; index += 1) {
  for (let comparison = index + 1; comparison < independentSecrets.length; comparison += 1) {
    const first = independentSecrets[index];
    const second = independentSecrets[comparison];
    if (value(first) && value(first) === value(second)) {
      errors.push(`${first} and ${second} must be different values.`);
    }
  }
}

for (const name of Object.keys(process.env)) {
  if (!name.startsWith("NEXT_PUBLIC_") || !value(name)) continue;
  if (/(ADMIN|API.*KEY|ACCESS.*KEY|CREDENTIAL|DATABASE|PASSWORD|PEPPER|POSTGRES|PRIVATE|SECRET|TOKEN)/i.test(name)) {
    errors.push(`${name} appears to expose a server credential to the browser.`);
  }
}

if (!value("COINGECKO_API_KEY") && !value("CRYPTO_API_KEY")) {
  warnings.push("No primary crypto-price provider key is configured; fallback display data may be used.");
}
if (!value("ONDO_API_KEY") && !value("BLOCKDAEMON_API_KEY")) {
  warnings.push("No Ondo-compatible provider key is configured; the Ondo market view may be unavailable.");
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`Error: ${error}`);
  console.error(`Production environment check failed with ${errors.length} error(s). No secret values were printed.`);
  process.exit(1);
}

console.log("Production environment check passed. No secret values were printed.");
