# Seeds

Two seed scripts are provided.

## 1. Admin and roles bootstrap (required, once)

Creates the initial owner account, the default roles and permissions, and the first
audit record.

```powershell
# set BCIS_INITIAL_ADMIN_USERNAME and BCIS_INITIAL_ADMIN_PASSWORD in .env first
npm run db:seed-admin
```

## 2. Demonstration dataset (optional, empty catalog only)

Loads the minimum demonstration dataset: 5 role-based users, 3 collection areas,
7 plans (3 Internet, 2 Cable, 2 Combo), 2 collectors, 50 subscribers, 65 service
accounts, 3 billing months of invoices, mixed cash/GCash/partial/advance payments,
a reversed payment, 10+ overdue accounts across aging buckets, suspension/reconnection
history, and 3 collector batches (collections, remittances, reconciliation, one with a
shortage).

```powershell
npm run db:seed-demo
```

Demo staff password: `Bcis-demo-password-123`.

The command refuses to run if subscribers already exist. See `../../apps/api/src/seed/demo.ts`.
