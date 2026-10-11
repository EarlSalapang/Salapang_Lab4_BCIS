# Entity–Relationship Diagram

Rendered artifacts: **`erd.png`** (2484×960) and **`erd.svg`** in this folder. The
Mermaid source below is the same diagram embedded in `technical-documentation.md`, and
the schema of record is `../apps/api/src/db/schema.ts`.

To re-render after editing, paste the block below into any Mermaid renderer
(for example the VS Code "Markdown Preview Mermaid Support" extension, the Mermaid Live
Editor at https://mermaid.live, or the GitHub file preview) and export the image.

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : has
  ROLES ||--o{ USER_ROLES : assigned
  ROLES ||--o{ ROLE_PERMISSIONS : grants
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : in
  USERS ||--o{ USER_SESSIONS : opens

  COLLECTION_AREAS ||--o{ SUBSCRIBERS : groups
  SUBSCRIBERS ||--o{ SUBSCRIBER_ADDRESSES : has
  SUBSCRIBERS ||--o{ SERVICE_ACCOUNTS : owns
  SERVICE_PLANS ||--o{ SERVICE_ACCOUNTS : priced_by
  COLLECTION_AREAS ||--o{ SERVICE_ACCOUNTS : located_in
  SERVICE_ACCOUNTS ||--o{ SERVICE_EVENTS : logs
  SERVICE_ACCOUNTS ||--o{ SERVICE_SUSPENSIONS : controls

  SUBSCRIBERS ||--o{ INVOICES : billed
  SERVICE_ACCOUNTS ||--o{ INVOICES : for
  INVOICES ||--o{ INVOICE_LINE_ITEMS : contains
  SUBSCRIBERS ||--o{ LEDGER_ENTRIES : has
  INVOICES ||--o{ LEDGER_ENTRIES : sources

  SUBSCRIBERS ||--o{ PAYMENTS : pays
  PAYMENTS ||--o{ PAYMENT_ALLOCATIONS : allocates
  INVOICES ||--o{ PAYMENT_ALLOCATIONS : receives
  PAYMENTS ||--o{ PAYMENT_PROOFS : attaches
  PAYMENTS ||--|| PAYMENT_REVERSALS : reversed_by

  COLLECTORS ||--o{ COLLECTOR_ASSIGNMENTS : assigned
  SUBSCRIBERS ||--o{ COLLECTOR_ASSIGNMENTS : assigned_to
  COLLECTORS ||--o{ COLLECTION_BATCHES : runs
  COLLECTION_BATCHES ||--o{ BATCH_ACCOUNTS : lists
  SUBSCRIBERS ||--o{ BATCH_ACCOUNTS : in
  COLLECTION_BATCHES ||--o{ COLLECTOR_REMITTANCES : remitted
  COLLECTION_BATCHES ||--o{ PAYMENTS : collects

  USERS ||--o{ AUDIT_EVENTS : acts
  USERS ||--o{ PAYMENTS : records
```
