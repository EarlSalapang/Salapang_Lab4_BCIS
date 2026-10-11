# Migrations

Committed migrations live in `../../apps/api/drizzle/` and are applied with:

```powershell
npm run db:migrate
```

To change the schema:

1. Edit `../../apps/api/src/db/schema.ts`.
2. Generate a migration: `npm run db:generate`.
3. Review the generated SQL in `../../apps/api/drizzle/`.
4. Apply it: `npm run db:migrate`.

Do not hand-edit applied migrations; always add a new one.
