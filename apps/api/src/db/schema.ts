import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const applicationSettings = pgTable("application_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
});

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
}, (table) => [primaryKey({ columns: [table.userId, table.roleId] })]);

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull().references(() => permissions.key, { onDelete: "restrict" }),
}, (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })]);

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [index("user_sessions_expires_at_idx").on(table.expiresAt)]);

export const numberCounters = pgTable("number_counters", {
  name: text("name").primaryKey(),
  lastValue: integer("last_value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectionAreas = pgTable("collection_areas", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const servicePlans = pgTable("service_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  installationFeeCents: integer("installation_fee_cents").notNull().default(0),
  reconnectionFeeCents: integer("reconnection_fee_cents").notNull().default(0),
  speed: text("speed"),
  channelCount: integer("channel_count"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("service_plans_service_type_idx").on(table.serviceType),
  check("service_plans_service_type_check", sql`service_type IN ('INTERNET', 'CABLE', 'COMBO')`),
  check("service_plans_price_check", sql`monthly_price_cents >= 0 AND installation_fee_cents >= 0 AND reconnection_fee_cents >= 0`),
]);

export const subscribers = pgTable("subscribers", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountNumber: text("account_number").notNull().unique(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  contactNumber: text("contact_number"),
  email: text("email"),
  addressLine: text("address_line"),
  barangay: text("barangay"),
  municipality: text("municipality"),
  collectionAreaId: uuid("collection_area_id").references(() => collectionAreas.id, { onDelete: "set null" }),
  billingDay: integer("billing_day"),
  dueDay: integer("due_day"),
  status: text("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("subscribers_name_idx").on(table.lastName, table.firstName),
  index("subscribers_contact_idx").on(table.contactNumber),
  index("subscribers_status_idx").on(table.status),
  index("subscribers_collection_area_idx").on(table.collectionAreaId),
  check("subscribers_status_check", sql`status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'TERMINATED')`),
  check("subscribers_billing_day_check", sql`(billing_day IS NULL OR billing_day BETWEEN 1 AND 28) AND (due_day IS NULL OR due_day BETWEEN 1 AND 28)`),
]);

export const subscriberAddresses = pgTable("subscriber_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Address"),
  line1: text("line1").notNull(),
  line2: text("line2"),
  barangay: text("barangay"),
  municipality: text("municipality"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("subscriber_addresses_subscriber_idx").on(table.subscriberId)]);

export const serviceAccounts = pgTable("service_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountNumber: text("account_number").notNull().unique(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  planId: uuid("plan_id").notNull().references(() => servicePlans.id, { onDelete: "restrict" }),
  serviceType: text("service_type").notNull(),
  installationAddress: text("installation_address").notNull(),
  collectionAreaId: uuid("collection_area_id").references(() => collectionAreas.id, { onDelete: "set null" }),
  activationDate: date("activation_date", { mode: "string" }),
  billingStartDate: date("billing_start_date", { mode: "string" }),
  billingDay: integer("billing_day").notNull().default(1),
  dueDay: integer("due_day").notNull().default(15),
  currentRateCents: integer("current_rate_cents").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("service_accounts_subscriber_idx").on(table.subscriberId),
  index("service_accounts_plan_idx").on(table.planId),
  index("service_accounts_status_idx").on(table.status),
  index("service_accounts_collection_area_idx").on(table.collectionAreaId),
  check("service_accounts_service_type_check", sql`service_type IN ('INTERNET', 'CABLE', 'COMBO')`),
  check("service_accounts_status_check", sql`status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED')`),
  check("service_accounts_days_check", sql`billing_day BETWEEN 1 AND 28 AND due_day BETWEEN 1 AND 28`),
  check("service_accounts_rate_check", sql`current_rate_cents >= 0`),
]);

export const serviceEvents = pgTable("service_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  notes: text("notes"),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("service_events_account_idx").on(table.serviceAccountId),
  index("service_events_occurred_at_idx").on(table.occurredAt),
  check("service_events_status_check", sql`to_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED')`),
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  serviceAccountId: uuid("service_account_id").references(() => serviceAccounts.id, { onDelete: "restrict" }),
  billingPeriodStart: date("billing_period_start", { mode: "string" }).notNull(),
  billingPeriodEnd: date("billing_period_end", { mode: "string" }).notNull(),
  issueDate: date("issue_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  balanceCents: integer("balance_cents").notNull(),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
}, (table) => [
  index("invoices_subscriber_idx").on(table.subscriberId),
  index("invoices_service_account_idx").on(table.serviceAccountId),
  index("invoices_status_idx").on(table.status),
  index("invoices_due_date_idx").on(table.dueDate),
  index("invoices_period_idx").on(table.billingPeriodStart, table.billingPeriodEnd),
  check("invoices_status_check", sql`status IN ('draft', 'posted', 'paid', 'partially_paid', 'void', 'overdue')`),
]);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("invoice_line_items_invoice_idx").on(table.invoiceId),
]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  serviceAccountId: uuid("service_account_id").references(() => serviceAccounts.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  entryDate: date("entry_date", { mode: "string" }).notNull(),
  entryType: text("entry_type").notNull(),
  sourceType: text("source_type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  balanceCents: integer("balance_cents").notNull(),
  description: text("description").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ledger_entries_subscriber_idx").on(table.subscriberId),
  index("ledger_entries_invoice_idx").on(table.invoiceId),
  index("ledger_entries_entry_date_idx").on(table.entryDate),
  check("ledger_entries_type_check", sql`entry_type IN ('debit', 'credit')`),
  check("ledger_entries_source_check", sql`source_type IN ('invoice', 'payment', 'adjustment', 'reversal')`),
  check("ledger_entries_amount_check", sql`amount_cents <> 0`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptNumber: text("receipt_number").notNull().unique(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull().default("cash"),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  status: text("status").notNull().default("posted"),
  verificationNote: text("verification_note"),
  paymentDate: timestamp("payment_date", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  collectorId: uuid("collector_id").references(() => collectors.id, { onDelete: "set null" }),
  collectionBatchId: uuid("collection_batch_id").references(() => collectionBatches.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payments_subscriber_idx").on(table.subscriberId),
  index("payments_status_idx").on(table.status),
  index("payments_method_idx").on(table.method),
  index("payments_payment_date_idx").on(table.paymentDate),
  index("payments_reference_idx").on(table.referenceNumber),
  index("payments_collector_idx").on(table.collectorId),
  index("payments_batch_idx").on(table.collectionBatchId),
  check("payments_amount_check", sql`amount_cents > 0`),
  check("payments_method_check", sql`method IN ('cash', 'gcash', 'bank_transfer', 'cheque', 'other')`),
  check("payments_status_check", sql`status IN ('pending', 'posted', 'reversed', 'rejected')`),
]);

export const paymentProofs = pgTable("payment_proofs", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payment_proofs_payment_idx").on(table.paymentId),
  check("payment_proofs_size_check", sql`size_bytes > 0`),
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payment_allocations_payment_idx").on(table.paymentId),
  index("payment_allocations_invoice_idx").on(table.invoiceId),
  check("payment_allocations_amount_check", sql`amount_cents > 0`),
]);

export const paymentReversals = pgTable("payment_reversals", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id").notNull().unique().references(() => payments.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  reversedByUserId: uuid("reversed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectors = pgTable("collectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactNumber: text("contact_number"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectorAssignments = pgTable("collector_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  collectorId: uuid("collector_id").notNull().references(() => collectors.id, { onDelete: "restrict" }),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "cascade" }),
  collectionAreaId: uuid("collection_area_id").references(() => collectionAreas.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("collector_assignments_collector_idx").on(table.collectorId),
  index("collector_assignments_subscriber_idx").on(table.subscriberId),
  index("collector_assignments_active_idx").on(table.isActive),
  uniqueIndex("collector_assignments_collector_subscriber_idx").on(table.collectorId, table.subscriberId),
]);

export const collectionBatches = pgTable("collection_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchNumber: text("batch_number").notNull().unique(),
  collectorId: uuid("collector_id").notNull().references(() => collectors.id, { onDelete: "restrict" }),
  collectionAreaId: uuid("collection_area_id").references(() => collectionAreas.id, { onDelete: "set null" }),
  routeDate: date("route_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("OPEN"),
  expectedCents: integer("expected_cents").notNull().default(0),
  cashCollectedCents: integer("cash_collected_cents").notNull().default(0),
  nonCashCollectedCents: integer("non_cash_collected_cents").notNull().default(0),
  remittedCents: integer("remitted_cents"),
  shortageCents: integer("shortage_cents").notNull().default(0),
  overageCents: integer("overage_cents").notNull().default(0),
  notes: text("notes"),
  openedByUserId: uuid("opened_by_user_id").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  remittedAt: timestamp("remitted_at", { withTimezone: true }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedByUserId: uuid("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("collection_batches_collector_idx").on(table.collectorId),
  index("collection_batches_status_idx").on(table.status),
  index("collection_batches_route_date_idx").on(table.routeDate),
  check("collection_batches_status_check", sql`status IN ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REMITTED', 'RECONCILED', 'CLOSED', 'CANCELLED')`),
  check("collection_batches_amounts_check", sql`expected_cents >= 0 AND cash_collected_cents >= 0 AND non_cash_collected_cents >= 0`),
]);

export const batchAccounts = pgTable("batch_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => collectionBatches.id, { onDelete: "cascade" }),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "cascade" }),
  currentBillCents: integer("current_bill_cents").notNull().default(0),
  arrearsCents: integer("arrears_cents").notNull().default(0),
  expectedCents: integer("expected_cents").notNull().default(0),
  collectedCents: integer("collected_cents").notNull().default(0),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("batch_accounts_batch_idx").on(table.batchId),
  index("batch_accounts_subscriber_idx").on(table.subscriberId),
  uniqueIndex("batch_accounts_batch_subscriber_idx").on(table.batchId, table.subscriberId),
  check("batch_accounts_status_check", sql`status IN ('PENDING', 'PARTIAL', 'COLLECTED', 'SKIPPED')`),
]);

export const collectorRemittances = pgTable("collector_remittances", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => collectionBatches.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("collector_remittances_batch_idx").on(table.batchId),
  uniqueIndex("collector_remittances_batch_unique_idx").on(table.batchId),
  check("collector_remittances_amount_check", sql`amount_cents >= 0`),
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorDisplayName: text("actor_display_name").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("audit_events_occurred_at_idx").on(table.occurredAt),
  index("audit_events_action_idx").on(table.action),
  index("audit_events_actor_idx").on(table.actorUserId),
  index("audit_events_entity_idx").on(table.entityType, table.entityId),
]);

export const serviceSuspensions = pgTable("service_suspensions", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "cascade" }),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "cascade" }),
  reason: text("reason"),
  notes: text("notes"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }).notNull().defaultNow(),
  suspendedByUserId: uuid("suspended_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reconnectedAt: timestamp("reconnected_at", { withTimezone: true }),
  reconnectedByUserId: uuid("reconnected_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reconnectionReason: text("reconnection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("service_suspensions_account_idx").on(table.serviceAccountId),
  index("service_suspensions_subscriber_idx").on(table.subscriberId),
  index("service_suspensions_reconnected_idx").on(table.reconnectedAt),
]);
