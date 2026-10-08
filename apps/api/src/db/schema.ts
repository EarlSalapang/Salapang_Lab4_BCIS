export export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  serviceAccountId: uuid("service_account_id").references(() => serviceAccounts.id, { onDelete: "restrict" }),
  billingPeriodStart: date("billing_period_start").notNull(),
  billingPeriodEnd: date("billing_period_end").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  balanceCents: integer("balance_cents").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
}, (table) => ({
  invoicesSubscriberIdx: index("invoices_subscriber_idx").on(table.subscriberId),
  invoicesStatusIdx: index("invoices_status_idx").on(table.status),
  invoicesDueDateIdx: index("invoices_due_date_idx").on(table.dueDate),
  invoicesPeriodIdx: index("invoices_period_idx").on(table.billingPeriodStart, table.billingPeriodEnd),
  invoicesStatusCheck: check("invoices_status_check", sql`status IN ('draft','posted','paid','partially_paid','void','overdue')`),
}));

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  lineItemsInvoiceIdx: index("invoice_line_items_invoice_idx").on(table.invoiceId),
}));

