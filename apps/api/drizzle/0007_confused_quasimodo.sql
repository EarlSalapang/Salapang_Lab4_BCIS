CREATE TABLE "batch_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"current_bill_cents" integer DEFAULT 0 NOT NULL,
	"arrears_cents" integer DEFAULT 0 NOT NULL,
	"expected_cents" integer DEFAULT 0 NOT NULL,
	"collected_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_accounts_status_check" CHECK (status IN ('PENDING', 'PARTIAL', 'COLLECTED', 'SKIPPED'))
);
--> statement-breakpoint
CREATE TABLE "collection_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" text NOT NULL,
	"collector_id" uuid NOT NULL,
	"collection_area_id" uuid,
	"route_date" date NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"expected_cents" integer DEFAULT 0 NOT NULL,
	"cash_collected_cents" integer DEFAULT 0 NOT NULL,
	"non_cash_collected_cents" integer DEFAULT 0 NOT NULL,
	"remitted_cents" integer,
	"shortage_cents" integer DEFAULT 0 NOT NULL,
	"overage_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"opened_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"remitted_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_batches_batch_number_unique" UNIQUE("batch_number"),
	CONSTRAINT "collection_batches_status_check" CHECK (status IN ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REMITTED', 'RECONCILED', 'CLOSED', 'CANCELLED')),
	CONSTRAINT "collection_batches_amounts_check" CHECK (expected_cents >= 0 AND cash_collected_cents >= 0 AND non_cash_collected_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "collector_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collector_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"collection_area_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collector_remittances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference_number" text,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collector_remittances_amount_check" CHECK (amount_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "collectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collectors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "collector_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "collection_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "batch_accounts" ADD CONSTRAINT "batch_accounts_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_accounts" ADD CONSTRAINT "batch_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_accounts_batch_idx" ON "batch_accounts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batch_accounts_subscriber_idx" ON "batch_accounts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_accounts_batch_subscriber_idx" ON "batch_accounts" USING btree ("batch_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "collection_batches_collector_idx" ON "collection_batches" USING btree ("collector_id");--> statement-breakpoint
CREATE INDEX "collection_batches_status_idx" ON "collection_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "collection_batches_route_date_idx" ON "collection_batches" USING btree ("route_date");--> statement-breakpoint
CREATE INDEX "collector_assignments_collector_idx" ON "collector_assignments" USING btree ("collector_id");--> statement-breakpoint
CREATE INDEX "collector_assignments_subscriber_idx" ON "collector_assignments" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "collector_assignments_active_idx" ON "collector_assignments" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_assignments_collector_subscriber_idx" ON "collector_assignments" USING btree ("collector_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "collector_remittances_batch_idx" ON "collector_remittances" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_remittances_batch_unique_idx" ON "collector_remittances" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_collection_batch_id_collection_batches_id_fk" FOREIGN KEY ("collection_batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_collector_idx" ON "payments" USING btree ("collector_id");--> statement-breakpoint
CREATE INDEX "payments_batch_idx" ON "payments" USING btree ("collection_batch_id");