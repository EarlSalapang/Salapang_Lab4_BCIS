CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_id" uuid,
	"invoice_id" uuid,
	"entry_date" date NOT NULL,
	"entry_type" text NOT NULL,
	"source_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"balance_cents" integer NOT NULL,
	"description" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_type_check" CHECK (entry_type IN ('debit', 'credit')),
	CONSTRAINT "ledger_entries_source_check" CHECK (source_type IN ('invoice', 'payment', 'adjustment', 'reversal')),
	CONSTRAINT "ledger_entries_amount_check" CHECK (amount_cents <> 0)
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_subscriber_idx" ON "ledger_entries" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_invoice_idx" ON "ledger_entries" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_entry_date_idx" ON "ledger_entries" USING btree ("entry_date");