# BCIS Subscription Billing and Collection System - Implementation Task List
Generated from BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.pdf

## Phases Overview (From PDF)
1. Analysis and Project Foundation
2. Authentication and RBAC
3. Plans, Subscribers and Service Accounts (COMPLETE - Phase 3)
4. Billing and Ledger Engine (COMPLETE - Phase 4)
5. Payments, Allocation and Receipts (COMPLETE - Phase 5)
6. Collector and Remittance Management (COMPLETE - Phase 6)
7. Receivables and Service Control (COMPLETE - Phase 7)
8. Reports, Dashboard and Printing (COMPLETE - Phase 8)
9. Backup, Hardening and Deployment (COMPLETE - Phase 9)
10. QA, Documentation and Defense (IN PROGRESS - Phase 10)

## Remaining Phases

Phase 9 is complete. Phase 10 (QA, Documentation and Defense) is in progress.

Phase 10 completed so far:
- Demonstration dataset: `npm run db:seed-demo` loads the specification's minimum dataset (5 role-based users, 3 collection areas, 7 plans across Internet/Cable/Combo, 2 collectors, 50 subscribers, 65 service accounts, 3 billing months of invoices, mixed cash/GCash/partial/advance payments, a reversed payment, 10+ overdue accounts across aging buckets, suspension/reconnection history, and 3 collector batches with collections, remittances and reconciliation including a shortage). Logic in `apps/api/src/seed/demo.ts`, CLI in `apps/api/src/seed-demo.ts`, and automated coverage in `apps/api/src/seed/demo.test.ts`.
- Acceptance tests mapped and evidenced: AT-01..AT-11 automated in `apps/api/src/acceptance.test.ts`; AT-12 (backup/restore) executed as a live drill. Results, test plan, live-validation table and defect log in `docs/acceptance-test-report.md`.
- Technical documentation: `docs/technical-documentation.md` (requirements, architecture/modules, endpoint catalog and RBAC matrix, API/IPC design, security model, ERD + data dictionary, deployment, limitations, rubric traceability).
- User manual: `docs/user-manual.md`. ERD: `docs/erd.md`.
- Live validation against a real PostgreSQL instance: migrations applied, demo seed loaded, integrity checks passed, and a full backup → simulated loss → restore drill recovered all records with a post-restore integrity pass.
- Report samples exported to `reports-samples/` (all 8 reports as PDF + XLSX) from the live demo dataset.
- Windows installer built: `release/BCIS Billing Setup 0.1.0.exe` (via `npm run package --workspace @bcis/desktop`).
- Submission folder structure assembled: `docs/`, `database/`, `tests/` (with `screenshots/`), `reports-samples/`, `release/`, plus source under `apps/` and `packages/`.
- Full gate green: typecheck, lint, 80 tests passed + 1 todo.

Phase 10 still outstanding:
- Capture live UI screenshots into `tests/screenshots/` (checklist in that folder) using the demo dataset.
- Smoke-test the built installer (install and launch on a clean Windows machine).
- Prepare presentation/defense material.


