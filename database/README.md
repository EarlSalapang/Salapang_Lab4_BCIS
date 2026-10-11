# Database

The BCIS database is PostgreSQL. This folder groups the database deliverables (D1).

## Contents

- `migrations/` — how to generate and apply schema migrations.
- `seeds/` — how to bootstrap roles/permissions and load the demo dataset.

## Canonical locations in the monorepo

| Artifact | Canonical path |
| --- | --- |
| Drizzle schema | `../apps/api/src/db/schema.ts` |
| Committed SQL migrations | `../apps/api/drizzle/*.sql` |
| Migration journal/snapshots | `../apps/api/drizzle/meta/` |
| Admin / role bootstrap | `../apps/api/src/seed-admin.ts` |
| Demo dataset | `../apps/api/src/seed/demo.ts` (CLI: `../apps/api/src/seed-demo.ts`) |
| Integrity checks | `../apps/api/src/db/integrity.ts` |
| Backup / restore | `../apps/api/src/backup.ts`, `../apps/api/src/restore.ts` |

## Typical setup

```powershell
docker compose up -d postgres
npm run db:migrate        # apply committed migrations
npm run db:seed-admin     # with BCIS_INITIAL_ADMIN_* set
npm run db:seed-demo      # optional demonstration dataset
```

See `../DEPLOYMENT.md` for the full server procedure.
