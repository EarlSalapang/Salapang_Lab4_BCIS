import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
