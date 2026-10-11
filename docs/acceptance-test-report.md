# BCIS Acceptance-Test Report

- **System:** BCIS Subscription Billing and Collection System
- **Report date:** 2026-10-10
- **Test command:** `npm test` (runs `vitest run src` in `@bcis/api`)
- **Latest run result:** 8 test files passed, **80 tests passed, 0 failed, 1 todo** (AT-12, manual)
- **Runtime environment:** Node.js 24, Windows 11, Vitest 5.0.3

This report is the D5 "Testing Package" acceptance evidence. It maps each mandatory
acceptance test from the laboratory activity (section 7) to an automated test and
records the observed result.

## 1. Mandatory acceptance tests (AT-01 – AT-12)

| ID | Scenario | Expected result | Automated evidence | Result |
| --- | --- | --- | --- | --- |
| AT-01 | Exact payment (₱999 invoice, ₱999 payment) | Remaining ₱0; invoice PAID; ledger balanced; receipt created | `acceptance.test.ts` › *AT-01 exact payment…* | PASS |
| AT-02 | Partial payment (₱999 invoice, ₱500 payment) | Remaining ₱499; PARTIALLY_PAID; allocation and ledger correct | `acceptance.test.ts` › *AT-02 partial payment…* | PASS |
| AT-03 | Advance payment (₱1,000 monthly, ₱3,000 payment) | Allocation/credit follows policy without losing value | `acceptance.test.ts` › *AT-03 advance payment…* | PASS |
| AT-04 | Oldest-first arrears (Aug ₱999 + Sep ₱999, ₱1,200 paid) | August ₱0; September ₱798 remaining | `acceptance.test.ts` › *AT-04 oldest-first arrears…* | PASS |
| AT-05 | Duplicate GCash reference | System blocks/warns according to policy | `acceptance.test.ts` › *AT-05 duplicate GCash reference…*; `directory.test.ts` › *requires GCash verification, rejects duplicate references…* | PASS |
| AT-06 | Payment reversal | Original visible; linked reversal; balances restore; actor/reason audited | `acceptance.test.ts` › *AT-06 payment reversal…*; `directory.test.ts` › *reverses a posted payment…* | PASS |
| AT-07 | Collector balanced remittance (₱20,000/₱20,000) | Difference ₱0; batch reconciles/closes | `acceptance.test.ts` › *AT-07 collector balanced remittance…*; `directory.test.ts` › *runs a collection batch through its lifecycle… (AT-07)* | PASS |
| AT-08 | Collector shortage (₱20,000 collected, ₱19,500 remitted) | ₱500 shortage shown; cannot silently close as balanced | `acceptance.test.ts` › *AT-08 collector shortage…*; `directory.test.ts` › *records an explicit shortage… (AT-08)* | PASS |
| AT-09 | Concurrent users (three PCs post/read) | No corruption, duplicate numbering, or cross-session effect | `acceptance.test.ts` › *AT-09 concurrent users…*; `concurrency.test.ts` › *keeps invoice allocation consistent when three cashiers pay at once* | PASS |
| AT-10 | Authorization (cashier attempts admin-only operation) | Server rejects the operation even if the API is called directly | `acceptance.test.ts` › *AT-10 authorization…*; `app.test.ts` › *enforces user.manage on the server…* | PASS |
| AT-11 | Duplicate billing (generate same period twice) | No duplicate finalized invoice for the same account/period | `acceptance.test.ts` › *AT-11 duplicate billing…*; `directory.test.ts` › *generates monthly invoices once…* | PASS |
| AT-12 | Backup/restore | Restored database passes integrity check; records return | Executed drill (see §5); automated components: `db/integrity.test.ts`, `db/pg-tools.test.ts` | PASS (manual drill 2026-10-10) |

### Notes on AT-05 and AT-10

- **AT-05:** the duplicate reference is rejected at posting time (`409 Conflict`) so
  an already-used/verified reference can never be entered twice; the second attempt
  creates no ledger entry. See policy in the technical documentation, "GCash
  verification policy".
- **AT-10:** authorization is enforced by the Fastify `preHandler` on the server
  (`requirePermission`), independent of the desktop UI. A Cashier token calling
  `POST /admin/users` directly receives `403`.
- **AT-12:** the backup/restore drill requires a live PostgreSQL instance, so it is
  executed manually per `DEPLOYMENT.md` §5 using `npm run db:backup` and
  `npm run db:restore -- --file <archive>` followed by `npm run db:integrity`. The
  checksum validation, confirmation guard, and integrity-check logic are covered by
  automated tests. The drill was executed and passed on 2026-10-10 (see §2).

## 2. Live validation drill (2026-10-10)

Executed against a live PostgreSQL 18.6 instance (`localhost:5432`, database `bcis`).

| Step | Command | Observed result |
| --- | --- | --- |
| Apply schema | `npm run db:migrate` | Migrations applied cleanly |
| Load demo dataset | `npm run db:seed-demo` | 5 users, 3 areas, 7 plans, 2 collectors, 50 subscribers, 65 service accounts, 195 invoices, 61 payments (7 verified GCash), 1 reversal, 3 suspensions + 1 reconnection, **3 collection batches + 3 remittances** |
| Integrity (pre-backup) | `npm run db:integrity` | All 5 invariants PASS |
| Backup | `npm run db:backup` | Integrity-checked; `bcis-<timestamp>.dump` + verified SHA-256 written |
| Simulated data loss | `TRUNCATE payments CASCADE` | `payments = 0` |
| Restore | `npm run db:restore -- --file <dump>` | Checksum verified; restore completed; **post-restore integrity PASS** |
| Verify recovery | count query | `payments = 61` restored exactly |
| Report samples | export each report (PDF + XLSX) | 8 reports exported (see §5) |

This drill directly satisfies AT-12 and the specification's backup/restore deliverable.

## 3. Additional automated coverage (domain / integration)

| Area | Evidence (file) | Result |
| --- | --- | --- |
| Health and readiness endpoints | `app.test.ts` | PASS |
| Authentication, session revocation, credential failures | `app.test.ts` | PASS |
| Server-side RBAC on administrative routes | `app.test.ts`, `directory.test.ts` | PASS |
| Audit trail (sign-in, user creation, permission gate) | `app.test.ts` | PASS |
| Security headers and login rate limiting | `app.test.ts`, `auth/rate-limit.test.ts` | PASS |
| Plans, collection areas, subscribers, service accounts | `directory.test.ts` | PASS |
| Billing generation and ledger debits | `directory.test.ts` | PASS |
| Allocation preview, oldest-first, partial and advance credits | `directory.test.ts` | PASS |
| GCash verification, duplicate reference, rejection | `directory.test.ts` | PASS |
| Payment reversal and balance restoration | `directory.test.ts` | PASS |
| Collector batch lifecycle, shortage, permissions | `directory.test.ts` | PASS |
| Receivables: aging report, overdue list, suspension/reconnection | `directory.test.ts` | PASS |
| Reports catalog, report builders, exports, dashboard | `directory.test.ts` | PASS |
| Three-client concurrency and unique numbering | `concurrency.test.ts` | PASS |
| Integrity-check runner (violation capture and sampling) | `db/integrity.test.ts` | PASS |
| Backup/restore connection parsing and secret handling | `db/pg-tools.test.ts` | PASS |
| Minimum demonstration dataset | `seed/demo.test.ts` | PASS |

## 4. Test plan summary

- **Objective:** verify financial correctness, authorization, concurrency safety, and
  reporting against the laboratory acceptance criteria.
- **Scope:** API domain logic and HTTP flows (Fastify `inject`), in-memory and
  PostgreSQL-backed directory stores, backup/restore tooling, and the seed dataset.
- **Approach:** integration tests exercise full HTTP request/response cycles against
  the real route handlers and shared Zod contracts; the in-memory store mirrors the
  PostgreSQL store's business rules for deterministic, database-free runs.
- **Pass criteria:** every mandatory acceptance test passes; no monetary invariant is
  violated (`npm run db:integrity`); the minimum demo dataset is produced.
- **Entry/exit:** entry after `npm run build` compiles; exit when `npm test`,
  `npm run typecheck`, and `npm run lint` are all green and the manual AT-12 drill is
  recorded in the deployment log.

## 5. Manual / end-to-end evidence (desktop workflows)

The desktop client's key workflows are exercised through the same server-side flows
covered above. The following are captured manually for the submission's `tests/`
folder:

- Login as administrator and dashboard KPIs.
- Subscriber registration with Internet and Cable service accounts.
- Invoice generation, ledger view, and Statement of Account.
- Exact/partial Cash payment with receipt preview/print.
- GCash proof upload, verification, and duplicate-reference rejection.
- Collector batch creation, collection, remittance, and reconciliation.
- Payment reversal and the resulting audit entry.
- Report export to PDF and XLSX.
- Aging/overdue filtering.

The exported report samples in `reports-samples/` were generated from the live demo
dataset (8 reports, PDF + XLSX each). The desktop UI screenshots in
`tests/screenshots/` remain to be captured on the demonstration machine (checklist
provided there).

## 6. Defect log

| # | Discovered | Root cause | Fix | Regression test |
| --- | --- | --- | --- | --- |
| 1 | Electron preload failed to load under `sandbox: true` | electron-vite emitted an ESM preload while the sandboxed preload requires CommonJS, and `main` pointed at the wrong entry | Force `entryFileNames: "[name].cjs"` for the preload, set `"main": "./out/main/index.js"`, and load `../preload/index.cjs` | Build verification + manual smoke test after `npm run build` |
| 2 | Report workbook export threw `SyntaxError` in Node ESM | `exceljs` was imported as a named import, which fails under Node's ESM interop | Switched to the default import (`import ExcelJS from "exceljs"`) | `directory.test.ts` › reports and dashboard (export path), build verification |
| 3 | PDF export produced no fonts / blank text | pdfmake 0.3.x blocks local fonts through its default access policy | Set access policy to allow local/url fonts via `setLocalAccessPolicy(() => true)` and register standard Helvetica fonts | Reports export path + manual PDF sample |
| 4 | Plan creation rejected by TypeScript | `CreatePlanInput` (Zod output type) requires `reconnectionFeeCents`, which defaults at runtime but is required in the inferred type | Supplied the field explicitly in the demo seed plan definitions | `seed/demo.test.ts` |
| 5 | Suspension test mislabeled as AT-09 | AT-09 in the specification is "concurrent users", not "suspension" | Relabeled the suspension test; dedicated AT-09 concurrency test added | `acceptance.test.ts` › *AT-09 concurrent users…* |

## 7. How to reproduce

```powershell
npm install
npm run test          # 80 passed | 1 todo
npm run typecheck
npm run lint
```

For the database-backed drill (AT-12):

```powershell
# Requires a reachable PostgreSQL and the pg_dump/pg_restore client tools on PATH
npm run db:migrate
npm run db:seed-admin         # set BCIS_INITIAL_ADMIN_USERNAME / _PASSWORD
npm run db:seed-demo          # optional demo dataset (password: Bcis-demo-password-123)
npm run db:backup             # integrity-checked, checksummed archive
npm run db:integrity
# simulate loss, then restore (destructive; requires confirmation)
npm run db:restore -- --file <archive>.dump
npm run db:integrity          # must pass after restore
```
