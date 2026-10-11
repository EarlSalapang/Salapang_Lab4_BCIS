# BCIS Subscription Billing and Collection System

An AI-assisted desktop application for subscription billing, collections and subscriber ledgers. The project is structured for three office PCs to use one centralized API and PostgreSQL database; desktop clients never connect directly to PostgreSQL.

## Architecture

```text
Electron + React desktop clients
           │ typed, restricted IPC
           ▼
       Fastify API  ───── Drizzle ORM ───── PostgreSQL
```

`apps/desktop` is the Windows desktop client, `apps/api` is the central application server, and `packages/shared` contains validated API contracts shared by both. Business operations and authorization belong in the API. Authentication uses scrypt-hashed passwords, database-backed revocable sessions (only token hashes are stored), role-based permissions, and a 15-minute account lock after five failed login attempts. Desktop sessions remain in the Electron main process and are not persisted to renderer storage.

## Requirements

- Node.js 22 or newer (Node.js 24 recommended)
- npm 10 or newer
- PostgreSQL 16 or newer, or Docker Desktop for the local database

## Local development

1. Copy `.env.example` to `.env` and set a private local PostgreSQL password. The checked-in values are examples only.
2. Start PostgreSQL with `docker compose up -d postgres`, or configure `DATABASE_URL` for an existing database.
3. Install dependencies with `npm install`.
4. Apply the committed migrations with `npm run db:migrate`.
5. Set `BCIS_INITIAL_ADMIN_USERNAME` and a unique, 12-or-more-character `BCIS_INITIAL_ADMIN_PASSWORD` in `.env`, then run `npm run db:seed-admin`. This one-time command creates the initial owner and default roles/permissions; remove the bootstrap credentials from `.env` immediately afterward.
6. Start the API and desktop app with `npm run dev`.

For demonstrations or acceptance testing, run `npm run db:seed-demo` against an empty catalog (after `db:migrate` and `db:seed-admin`). It creates five role-based users (password `Bcis-demo-password-123`), three collection areas, seven plans, two collectors, fifty subscribers with sixty-plus service accounts, three months of invoices, and mixed cash/GCash/partial/advance payments including a reversal, overdue accounts across aging buckets, and suspension/reconnection history. The command refuses to run if subscribers already exist.

The API listens on `http://127.0.0.1:3000` by default. `GET /health` checks API liveness; `GET /ready` checks database readiness. Loopback is for local development only. For a LAN deployment, provide trusted `API_TLS_CERT_FILE` and `API_TLS_KEY_FILE` paths, set `API_HOST=0.0.0.0` on the API server, and set `BCIS_API_URL=https://<server-hostname>:3000` on each desktop client. The server refuses to bind beyond loopback without TLS, and the desktop refuses remote HTTP URLs. Ensure the certificate is trusted by all office PCs and restrict the firewall to office devices.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API and desktop development processes |
| `npm run build` | Build API and Electron renderer/main/preload bundles |
| `npm run typecheck` | Type-check each workspace |
| `npm run lint` | Run ESLint |
| `npm test` | Run API tests |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:seed-admin` | One-time initial owner and role bootstrap |
| `npm run db:seed-demo` | Load the demonstration dataset (5 users, 7 plans, 50 subscribers, 3 billing months) |
| `npm run db:integrity` | Verify invoice, payment, ledger and monetary invariants |
| `npm run db:backup` | Create a verified, checksummed PostgreSQL backup |
| `npm run db:restore -- --file <archive>` | Restore a backup (requires `BCIS_CONFIRM_RESTORE=yes`) |
| `npm run package --workspace @bcis/desktop` | Build the Windows installer |

See [DEPLOYMENT.md](DEPLOYMENT.md) for the LAN deployment, backup/restore, TLS and three-PC concurrency validation procedure.

## Documentation

| Document | Description |
| --- | --- |
| [docs/technical-documentation.md](docs/technical-documentation.md) | Requirements, architecture, modules, ERD/data dictionary, API/IPC design, security model |
| [docs/user-manual.md](docs/user-manual.md) | End-user guide for every workflow |
| [docs/acceptance-test-report.md](docs/acceptance-test-report.md) | AT-01..AT-12 results, test plan and defect log |
| [docs/erd.md](docs/erd.md) | Entity–relationship diagram (Mermaid) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Server setup, TLS, backup/restore, three-PC validation |

## Submission layout

The required deliverables (D1–D8) map onto the repository as follows:

```
docs/            technical-documentation.md, user-manual.md, erd.md, acceptance-test-report.md
database/        migrations/ and seeds/ (pointers to the canonical sources)
tests/           README + screenshots/ (UI evidence); automated tests live in apps/api/src
reports-samples/ exported report PDF/XLSX samples
release/         built installer
apps/, packages/ source (D1)
```

## Security and project status

Electron runs with context isolation enabled, Node integration disabled and a sandboxed renderer. Only the Electron main process communicates with the API and holds the in-memory bearer token. The API offers authentication, user/role administration, the subscriber and service-account directory, plan and collection management, billing and the ledger, payments with allocation and receipts, collector batching and remittance, receivables and service control (suspension/reconnection), business reports and dashboard, and an append-only audit trail. All routes enforce permissions server-side, the owner role cannot be assigned after bootstrap, login attempts are rate limited per client and locked after repeated failures, responses carry hardening headers, and database writes use transactions with row locks so concurrent clients cannot over-allocate invoices.

The system is suitable for internal office use on a trusted LAN with TLS. It has not been hardened for direct public-internet exposure; keep the API restricted to office devices and review the checklist in [DEPLOYMENT.md](DEPLOYMENT.md) before using real subscriber or payment data.
