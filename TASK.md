# BCIS Subscription Billing and Collection System - Implementation Task List
Generated from BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.pdf

## Phases Overview (From PDF)
1. Analysis and Project Foundation
2. Authentication and RBAC
3. Plans, Subscribers and Service Accounts (COMPLETE - Phase 3)
4. Billing and Ledger Engine
5. Payments, Allocation and Receipts
6. Collector and Remittance Management
7. Receivables and Service Control
8. Reports, Dashboard and Printing
9. Backup, Hardening and Deployment

## Remaining Phases (4-9)

## Phase 4 - Billing and Ledger Engine
### Required Work
Implement monthly billing, invoice numbering, line items, duplicate-billing prevention, due dates, invoice states and ledger debit posting.
### Checkpoint Evidence
Billing generator; invoice view; ledger entries; billing unit/integration tests.

## Phase 5 - Payments, Allocation and Receipts
### Required Work
Implement Cash/GCash/etc., oldest-first allocation, partial and advance payment handling, receipts, proof attachments, reversals and audit trail.
### Checkpoint Evidence
Payment screen; allocation preview; receipt; GCash verification; reversal workflow; tests.

## Phase 6 - Collector and Remittance Management
### Required Work
Implement collection areas, routes, collector assignments, batches, printable route sheet, collection recording, remittance, shortage/overage and reconciliation.
### Checkpoint Evidence
Collection batch lifecycle; reconciliation screen; collector report; tests.

## Phase 7 - Receivables and Service Control
### Required Work
Implement outstanding/overdue lists, AR aging, follow-up filters, suspension candidates, suspension records and reconnection workflow.
### Checkpoint Evidence
Aging report; overdue dashboard; suspension/reconnection history.

## Phase 8 - Reports, Dashboard and Printing
### Required Work
Implement management KPIs, monthly collection reports, revenue/AR/collector reports, Subscriber SOA, PDF/XLSX export and print layouts.
### Checkpoint Evidence
Dashboard; at least 6 required reports; PDF/XLSX evidence.

## Phase 9 - Backup, Hardening and Deployment
### Required Work
Implement backup/restore procedure, integrity check, error logging, security review, LAN deployment and three-PC concurrency validation.
### Checkpoint Evidence
Backup/restore test; installer; deployment guide; three-client concurrency test.
