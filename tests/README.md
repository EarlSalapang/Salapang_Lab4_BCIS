# Tests

This folder holds the **manual / E2E test evidence** for the submission (D5). The
**automated** test suite lives with the API source and is run with:

```powershell
npm test
```

- Automated acceptance tests: `../apps/api/src/acceptance.test.ts` (AT-01 .. AT-11).
- Domain/integration tests: `../apps/api/src/catalog/*.test.ts`, `../apps/api/src/app.test.ts`.
- Integrity / backup tooling tests: `../apps/api/src/db/*.test.ts`.
- Seed dataset test: `../apps/api/src/seed/demo.test.ts`.

## acceptance-test-report

The results, AT-01..AT-12 mapping, test plan and defect log are in
`../docs/acceptance-test-report.md`.

## screenshots

Place desktop UI screenshots here (dashboard, subscriber profile, payment, GCash
verification, collection reconciliation, overdue/aging, reports). Suggested file names:

```
screenshots/
  01-login.png
  02-dashboard.png
  03-subscriber-profile.png
  04-billing-ledger.png
  05-payment-cash.png
  06-gcash-verification.png
  07-collection-reconciliation.png
  08-overdue-aging.png
  09-reports-export.png
  10-audit-trail.png
```

See `screenshots/README.md` for the capture checklist.
