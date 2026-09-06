# Larpz Wallet

Larpz Wallet is a mobile-first crypto-wallet **simulator** built with Next.js. It is intended for demonstrations and interface testing only. It does not connect to real wallets or custody real funds, and it must never ask users for seed phrases or private keys.

## Local setup

Requirements: Node.js 22 (the pinned version is in `.nvmrc`) and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`.env.local` is ignored by Git. Never commit it or include it in a source archive.

## Production environment

Configure these as server-only variables in the client's hosting account:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string for licenses, audit/rate-limit data, shared demo data, and wallet security records |
| `ADMIN_ACCESS_KEY_HASH` | SHA-256 digest of the private administrator key |
| `ADMIN_SESSION_SECRET` | A random 32+ character administrator-session signing secret |
| `LICENSE_KEY_PEPPER` | A different random 32+ character license-key hashing secret |
| `WALLET_SECURITY_RATE_LIMIT_SECRET` | A separate random 32+ character HMAC secret for recovery-PIN request throttling |
| `WALLET_SECURITY_PIN_PEPPER` | A separate random 32+ character pepper for recovery-PIN hashes |
| `COINGECKO_API_KEY` or `CRYPTO_API_KEY` | Primary market-price provider |
| `ONDO_API_KEY` or `BLOCKDAEMON_API_KEY` | Ondo-compatible market provider |

Optional variables and provider notes are documented in `.env.example`. Do not use a `NEXT_PUBLIC_` prefix for any secret.

To hash a normal administrator key without placing the raw key in production hosting:

```bash
node --env-file=.env.local scripts/hash-admin-access-key.mjs
```

Copy only the printed digest to `ADMIN_ACCESS_KEY_HASH` in production, then leave `ADMIN_ACCESS_KEY` unset there. Validate a local handoff configuration without printing any secret values:

```bash
node scripts/check-production-env.mjs .env.local
```

Changing `LICENSE_KEY_PEPPER` makes previously issued keys unverifiable. Rotate it before production keys are issued, or regenerate/migrate those keys deliberately.

## Wallet security storage

Production Face ID/passkey credentials, recovery PIN hashes, one-time challenges, unlock sessions, and PIN rate limits are stored in PostgreSQL through `DATABASE_URL`. Production fails closed when the database is missing. Challenges are consumed atomically and expired challenges/sessions are cleaned up.

Recovery-PIN verification is bounded per wallet identifier and privacy-preserving request fingerprint. Configure the dedicated `WALLET_SECURITY_RATE_LIMIT_SECRET` in production; `LICENSE_KEY_PEPPER` is accepted only as a server-side fallback.

New recovery-PIN hashes also use `WALLET_SECURITY_PIN_PEPPER`. Existing unpeppered hashes are upgraded automatically after the next successful verification. Changing the PIN pepper invalidates already-upgraded PINs, so rotate it only with a deliberate PIN reset or migration plan.

Local development and tests use `.data/wallet-security.json` when `DATABASE_URL` is absent. `WALLET_SECURITY_DATA_FILE` can override that local-only path. The database tables and indexes are initialized on first use, so the initial database role needs schema-creation privileges.

## PWA

The production build generates the Serwist service worker. Generated `public/sw.js` and worker bundles are ignored and must not be committed. Pages, APIs, administrator routes, activation routes, and wallet-security routes remain network-only; only same-origin static assets are runtime-cached.

## Verification

Before a deployment or client handoff, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:mobile
npm audit --omit=dev --audit-level=high
```

The repository CI workflow performs the non-device checks on pushes and pull requests.

## Security and handoff

Read [SECURITY.md](./SECURITY.md) before transferring the source or deployment. The shared demo-ledger owner/link mechanism is intentionally not a production authentication boundary and must not protect real funds or sensitive data.
