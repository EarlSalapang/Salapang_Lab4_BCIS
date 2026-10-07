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
| `npm run package --workspace @bcis/desktop` | Build the Windows installer |

## Security and project status

Electron runs with context isolation enabled, Node integration disabled and a sandboxed renderer. Only the Electron main process communicates with the API and holds the in-memory bearer token. The API offers login, session lookup, logout/lock, user listing/creation, and role listing; all administrative routes enforce permissions server-side, and the owner role cannot be assigned after bootstrap. The application still lacks subscriber, billing, payments, collections, and audit-history workflows; it is not ready for real subscriber or payment data.
