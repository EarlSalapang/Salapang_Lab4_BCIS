# BCIS User Manual

**System:** BCIS Subscription Billing and Collection System
**Version:** 0.1.0
**Audience:** office staff (cashiers, collection supervisors, auditors, administrators).

This manual walks through everyday tasks in the desktop client. Screens are listed by
their navigation label in the left sidebar.

---

## 1. Getting started

### 1.1 Requirements

- A BCIS desktop installation on your PC (see the Release folder / installer).
- Network access to the BCIS API server (the office server PC).
- Your assigned username and password.

### 1.2 Signing in

1. Launch **BCIS**.
2. Enter your **Username** and **Password**.
3. Select **Sign in**.

The sign-in card shows the server status indicator (green = reachable). If sign-in
fails repeatedly, your account may be temporarily locked after too many attempts —
wait a few minutes and try again, or contact an administrator.

### 1.3 Navigation

The sidebar only shows sections your role is allowed to use. For example, a Cashier
sees Subscribers, Billing, and Payments; a Collection Supervisor additionally sees
Collections; an Auditor sees Receivables and Reports.

### 1.4 Signing out

Use **Sign out** in the sidebar footer. Always sign out on a shared workstation.

---

## 2. Dashboard

The **Dashboard** shows the current operational picture:

- Billed vs. collected totals for the period.
- Outstanding receivables and overdue counts.
- Collector performance summary.
- Quick links into the busiest workflows.

Use the date/as-of control (where shown) to change the reporting reference date.

---

## 3. Plans and collection areas (Administrators)

### 3.1 Create a service plan

1. Open **Plans & Areas**.
2. Under **Plans**, fill in **Code**, **Name**, **Service type**
   (Internet / Cable / Combo), **Monthly price**, and optional speed/channel details.
3. Select **Create plan**.

Plan codes are stored in uppercase and must be unique.

### 3.2 Create a collection area

1. Open **Plans & Areas**.
2. Under **Collection areas**, enter a **Code**, **Name**, and optional description.
3. Select **Create area**.

---

## 4. Subscribers and service accounts

### 4.1 Register a subscriber

1. Open **Subscribers**.
2. Select **New subscriber**.
3. Enter the name, contact number, address, and (optionally) a collection area.
4. Save. The system assigns a subscriber account number (for example `SUB-000123`).

### 4.2 Add a service account

1. Open the subscriber from the **Subscribers** list.
2. Select **Add service account**.
3. Choose the **Plan** and enter the installation address.
4. Save. A service account number (`SA-######`) is generated and an activation event
   is recorded.

You can suspend or reconnect an account from its detail view (see Section 8).

### 4.3 Search

Use the search box on **Subscribers** to filter by name, account number, or contact
number. Results are paginated.

---

## 5. Billing

### 5.1 Generate monthly invoices

1. Open **Billing**.
2. Choose the billing period (start/end), issue date, and due date.
3. Select **Generate invoices**.

Each active service account receives one posted invoice for the period. Running the
same period again does **not** create duplicates (already-billed accounts are skipped).

### 5.2 Review invoices and the ledger

- The invoice list lets you filter by status (`posted`, `partially_paid`, `paid`,
  `overdue`, `void`).
- Select an invoice to inspect its line items, balance, and payment history.
- The **ledger** panel shows the running debit/credit balance for the subscriber.

### 5.3 Void a draft

Open a draft invoice and select **Void** if it should not be billed.

---

## 6. Payments

### 6.1 Post a cash payment

1. Open **Payments**.
2. Select **New payment**.
3. Choose the subscriber.
4. Enter the amount and choose method **Cash**.
5. (Optional) Preview the **allocation** — the system applies the payment to the
   oldest open invoices first.
6. Save. A receipt number (`RCPT-######`) is generated. The invoice balance and the
   ledger update immediately.

A payment larger than the outstanding balance keeps the surplus as an **advance
credit** on the subscriber (no value is lost).

### 6.2 Post and verify a GCash payment

1. Create a payment with method **GCash** and enter the **reference number**.
2. Attach the proof of payment (PNG/JPEG/WEBP/PDF, up to 5 MB, up to 5 files).
3. Save. The payment starts in **Pending** — it does not affect balances yet.
4. A user with the GCash verification permission opens the payment and selects
   **Verify** (or **Reject** with a note).

> **Duplicate protection:** a reference number that was already used is rejected, so
> the same GCash transaction cannot be posted twice.

### 6.3 Reverse a payment

If a payment was posted in error:

1. Open the payment.
2. Select **Reverse** and enter a reason.

The original payment remains visible; a linked reversal is created, invoice balances
are restored, and the action is recorded in the audit trail with your user and the
reason. A payment can be reversed only once.

### 6.4 Print or preview a receipt

Use **Print receipt** / **Preview** on a posted payment to produce the receipt.

---

## 7. Collections (Collection Supervisors)

### 7.1 Prepare a batch and route sheet

1. Open **Collections**.
2. Select **New batch**, choose the collector and route date.
3. The batch lists assigned accounts with their current bill and arrears.

### 7.2 Record collections during the route

1. Open the batch and select **Start**.
2. For each account, post the collection as a payment linked to the batch, or mark it
   **Skipped**.
3. When the route is complete, select **Submit**.

### 7.3 Remit and reconcile

1. Select **Remit** and enter the amount handed over plus a reference number.
2. The system displays the **difference**. A short remittance shows a **shortage** and
   cannot be silently treated as balanced.
3. After reviewing, select **Reconcile**, then **Close**.

The **Collector report** shows expected, collected, remitted, and shortage totals per
collector.

---

## 8. Receivables and service control

### 8.1 Review aging and overdue accounts

1. Open **Receivables**.
2. Switch between the **Aging** summary and the **Overdue** list.
3. Filter by collection area or minimum days overdue.

Aging buckets group outstanding balances by how long they have been due.

### 8.2 Suspend a service account

1. Find the account in **Receivables → Suspension candidates** (or open it directly).
2. Select **Suspend**, enter a reason.
3. The account status becomes **Suspended** and the action is recorded.

### 8.3 Reconnect a service account

Open the suspended account and select **Reconnect**, entering the reason. The
reconnection, its actor, and the timestamp are recorded.

---

## 9. Reports

1. Open **Reports**.
2. Choose a report from the catalog: Collection Summary, Billing vs. Collection,
   Revenue, AR Aging, Overdue, Collector Performance, Subscriber Master, or Statement
   of Account.
3. Adjust any date parameters, then view the on-screen table and KPIs.
4. Select **Export PDF** or **Export XLSX** and choose where to save the file.

A **Statement of Account** can be produced per subscriber for collections or disputes.

---

## 10. Administration (Administrators)

1. Open **Administration**.
2. View the user list and the available roles.
3. Select **New user**, enter the username, display name, initial password, and role.
4. Save. Share the initial password securely and have the user change it as policy
   requires.

The **Audit** view (requires the audit permission) shows recorded actions with the
actor, time, and details.

---

## 11. Backup and restore

Backups are created by the administrator on the server (they are not a desktop
button):

- **Create a backup:** on the API server run `npm run db:backup`. The backup is
  integrity-checked, checksummed, and verified before being stored in `BACKUP_DIR`.
- **Restore a backup:** run `npm run db:restore -- --file <archive>` with
  `BCIS_CONFIRM_RESTORE=yes`. The restore verifies the checksum, asks for
  confirmation, reloads the database, and re-runs the integrity checks.

Full procedure and the three-PC validation drill are in `DEPLOYMENT.md`.

---

## 12. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| "Cannot reach the server" on sign-in | API server down or network issue | Confirm the server PC is on and the status dot turns green; contact IT. |
| "Invalid username or password" | Wrong credentials | Re-type carefully; after several failures wait for the lock to clear. |
| "You do not have permission…" | Your role lacks the permission | Ask an administrator to grant the role/permission. |
| GCash payment stays Pending | Not yet verified | A verifier must open the payment and select **Verify**. |
| "Duplicate reference" | Reference already used | Check existing GCash payments; enter the correct reference. |
| Collector batch will not close | It is not reconciled, or a shortage exists | Remit the correct amount and **Reconcile** first. |
| Invoice missing after billing | Account already billed for the period | Check the invoice list; duplicates are intentionally skipped. |
| Report export fails | No write access to the chosen folder | Choose a writable location (for example Documents). |
| App shows a blank screen after update | Stale renderer bundle | Reinstall the latest release build. |

For problems you cannot resolve, note the exact message and the time, then contact the
system administrator.
