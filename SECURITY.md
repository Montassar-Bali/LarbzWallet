# Security and client handoff

## Product boundary

Larpz Wallet is a wallet **simulator**. It must not request, import, store, or transmit real seed phrases or private keys, and simulated balances must never be presented as real on-chain funds.

The shared demo-ledger owner/link flow is not a production authentication boundary. Do not use it to protect real funds, personal data, or other sensitive records without replacing it with server-verified authorization.

## Secrets

- Never commit or deliver `.env.local`, `.env`, `.vercel`, database dumps, provider credentials, or production logs.
- Give the client a clean `.env.example`; configure real values directly in the client's hosting provider and mark production values as sensitive/write-only.
- Use a client-owned database and client-owned API-provider accounts. Do not leave personal credentials in the transferred deployment.
- Rotate every credential that was pasted into chat, shown in a screenshot, used in a preview deployment, or shared with another person. Redeploy with the replacement first, verify it, and then revoke the old credential.
- In production, prefer `ADMIN_ACCESS_KEY_HASH` and leave `ADMIN_ACCESS_KEY` unset. The administrator still enters the normal key; only its SHA-256 digest is stored by the server.
- `ADMIN_SESSION_SECRET`, `LICENSE_KEY_PEPPER`, `WALLET_SECURITY_RATE_LIMIT_SECRET`, and `WALLET_SECURITY_PIN_PEPPER` must be separate random values of at least 32 characters.
- Rotating `LICENSE_KEY_PEPPER` invalidates existing issued license keys. Rotate it before issuing production keys, or coordinate a key migration/regeneration.
- Rotating `WALLET_SECURITY_PIN_PEPPER` invalidates upgraded recovery PINs. Coordinate a PIN reset or migration before changing it.

## Required production configuration

- `DATABASE_URL`
- `ADMIN_ACCESS_KEY_HASH`
- `ADMIN_SESSION_SECRET`
- `LICENSE_KEY_PEPPER`
- `WALLET_SECURITY_RATE_LIMIT_SECRET`
- `WALLET_SECURITY_PIN_PEPPER`
- At least one configured market-data provider appropriate to the enabled market views

Never prefix a server credential with `NEXT_PUBLIC_`.

## Delivery checklist

1. Start from a clean commit and run the lint, typecheck, unit-test, production-build, mobile-smoke, and production dependency-audit commands.
2. Enable repository secret scanning and review the complete Git history before making a repository public or transferring it.
3. Use a clean clone or `git archive HEAD` for a source-only delivery. Do not zip the working directory.
4. Transfer the Vercel project, domain, database, API-provider projects, and source repository to accounts controlled by the client.
5. Verify the production environment variables and redeploy. Test administrator login, license creation and activation, passkey/PIN recovery, market data, and all three wallet shells.
6. Remove your own team, database, domain, Git, and provider access after the client confirms ownership.
7. Keep a written list of intentionally unresolved demo-only limitations in the handoff acceptance notes.

## Reporting a vulnerability

Send security reports privately to the project owner. Do not include live credentials, private user data, or a working exploit in a public issue.
