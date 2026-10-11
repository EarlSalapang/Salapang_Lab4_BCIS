# BCIS Deployment Guide

This guide covers deploying the BCIS Subscription Billing and Collection System for a small office where three desktop PCs share one centralized API and PostgreSQL database. Desktop clients never connect to PostgreSQL directly; every read and write goes through the API.

```text
3 x Electron desktop clients (office PCs)
        │  HTTPS + bearer token
        ▼
Fastify API (one central server)
        │
        ▼
PostgreSQL 17 (same server)
```

## 1. Server prerequisites

- Windows Server or Windows 10/11 Pro host for the central server (a dedicated office PC is fine).
- Node.js 22+ (Node.js 24 recommended) and npm 10+.
- PostgreSQL 16+ (PostgreSQL 17 recommended). Docker Desktop is an option for a containerized database.
- PostgreSQL **client tools** (`pg_dump`, `pg_restore`) on `PATH` for backup and restore.
- A TLS certificate and private key trusted by every office PC (see section 4).

## 2. Configure the server environment

1. Copy `.env.example` to `.env` in the project root.
2. Set a strong, unique `DATABASE_URL` password and matching `POSTGRES_*` values.
3. Set `API_HOST=0.0.0.0` so the API listens on the LAN.
4. Set `API_TLS_CERT_FILE` and `API_TLS_KEY_FILE` to your certificate paths. The API refuses to bind beyond loopback without TLS.
5. Set `LOG_LEVEL=info` and `LOG_FILE` to a path such as `C:\bcis\logs\api.log` to retain structured JSON logs.
6. Set `BACKUP_DIR` to a backed-up location such as `C:\bcis\backups`.

## 3. Initialize the database

```powershell
npm install
npm run db:migrate        # apply committed migrations (including the audit trail table)
```

Set `BCIS_INITIAL_ADMIN_USERNAME` and a 12+ character `BCIS_INITIAL_ADMIN_PASSWORD` in `.env`, then run:

```powershell
npm run db:seed-admin
```

Remove the bootstrap credentials from `.env` immediately afterward. The command creates the initial owner, the default roles/permissions, and the first audit record.

For demonstration or acceptance testing on an empty database, optionally load the sample dataset (this refuses to run if subscribers already exist):

```powershell
npm run db:seed-demo
```

## 4. TLS and firewall

- Issue a certificate for the server's hostname (for example `bcis-server.office.local`) from your internal CA or a trusted provider.
- Import the certificate's root/issuer into the **Trusted Root Certification Authorities** store on every desktop PC so the client accepts HTTPS.
- Restrict the Windows Firewall inbound rule for the API port (default 3000) to office devices only. Do not expose the API to the public internet.
- PostgreSQL only needs to be reachable by the API server. Keep its port bound to `127.0.0.1` (the provided `docker-compose.yml` already does this).

## 5. Run the API server

```powershell
npm run build --workspace @bcis/api
npm run start --workspace @bcis/api
```

For unattended operation, run the API as a Windows service (for example with NSSM) or a scheduled task that starts on boot. Logs go to `LOG_FILE` when configured.

Health checks:

- `GET /health` — API liveness.
- `GET /ready` — API plus database readiness.

## 6. Build and distribute the desktop client

On a build machine:

```powershell
npm run package --workspace @bcis/desktop
```

This produces an NSIS installer under `release/`. Install it on each office PC. Set `BCIS_API_URL` for each client — for example as a system environment variable:

```
BCIS_API_URL=https://bcis-server.office.local:3000
```

The desktop client refuses to connect to remote plain-HTTP URLs, so HTTPS is required for any non-loopback server.

## 7. Backup and restore

Backups use `pg_dump` in custom format, are checksummed with SHA-256, and are verified by listing the archive. A full integrity check runs before each backup and refuses to proceed on violation.

```powershell
npm run db:backup                       # writes to BACKUP_DIR (or --dir)
npm run db:backup -- --dir C:\bcis\backups
npm run db:integrity                    # standalone integrity check
```

Schedule `db:backup` daily with Windows Task Scheduler, and copy `BACKUP_DIR` to offline or network storage. Retain at least 30 days of archives.

Restore is destructive and requires explicit confirmation:

```powershell
$env:BCIS_CONFIRM_RESTORE = "yes"
npm run db:restore -- --file C:\bcis\backups\bcis-2026-01-01T00-00-00-000Z.dump
```

The restore verifies the `.sha256` checksum when present, runs `pg_restore --clean --if-exists`, then runs the integrity check and records an audit event. If the post-restore integrity check fails, investigate before returning the system to service.

### Integrity checks

`npm run db:integrity` verifies, among others:

- each invoice balance equals total minus amount paid,
- invoice `amount_paid_cents` matches the sum of its payment allocations,
- allocations never exceed their payment amount,
- the newest ledger balance per subscriber matches the sum of that subscriber's entries,
- no negative monetary values exist.

## 8. Three-PC concurrency validation

The billing and payment paths use database transactions with `SELECT ... FOR UPDATE` row locks, so concurrent payments from multiple clients cannot over-allocate an invoice. To validate on the deployed system:

1. Sign in on all three office PCs as users with `payment.create` (for example three Cashier accounts).
2. Create one subscriber with a single posted invoice (use **Billing → Generate**).
3. On each PC, open **Payments** for that subscriber and prepare a payment whose amount, combined across the three PCs, exceeds the invoice balance.
4. Have the three cashiers post their payments within the same few seconds.
5. Confirm the invoice is **paid**, its balance is `0`, and the allocated total across the three payments equals the invoice total. Any excess remains as an unallocated credit on the payment — it must never exceed the payment amount.
6. Run `npm run db:integrity` on the server and confirm all checks pass.

An automated version of this scenario (three independent sessions paying one invoice concurrently) runs as part of the API test suite:

```powershell
npm test --workspace @bcis/api
```

## 9. Security checklist

- [ ] TLS certificate trusted by every client; API bound beyond loopback only over HTTPS.
- [ ] Strong, unique database password and initial owner password; bootstrap credentials removed from `.env`.
- [ ] Windows Firewall limits the API port to office devices.
- [ ] `LOG_FILE` configured; logs reviewed for failed sign-ins (`auth.login_failed`).
- [ ] Audit trail reviewed periodically via `GET /admin/audit` (restricted by the `audit.view` permission).
- [ ] Daily backups scheduled, stored offline, and restore tested quarterly.
- [ ] `npm run db:integrity` scheduled alongside backups.
- [ ] Only the central server runs PostgreSQL; clients never receive database credentials.
- [ ] Login rate limiting (per client IP) and five-attempt account lock are active.

## 10. Maintenance commands

| Command | Purpose |
| --- | --- |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:seed-admin` | One-time initial owner and role bootstrap |
| `npm run db:seed-demo` | Load the demonstration dataset (empty catalog only) |
| `npm run db:integrity` | Verify monetary/ledger/audit invariants |
| `npm run db:backup` | Create a verified, checksummed backup |
| `npm run db:restore -- --file <archive>` | Restore (requires `BCIS_CONFIRM_RESTORE=yes`) |
| `npm test --workspace @bcis/api` | Run the API test suite, including the three-client concurrency test |
