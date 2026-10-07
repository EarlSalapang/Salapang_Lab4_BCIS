CREATE TABLE "collection_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_areas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "number_counters" (
	"name" text PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"installation_address" text NOT NULL,
	"collection_area_id" uuid,
	"activation_date" date,
	"billing_start_date" date,
	"billing_day" integer DEFAULT 1 NOT NULL,
	"due_day" integer DEFAULT 15 NOT NULL,
	"current_rate_cents" integer NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_accounts_account_number_unique" UNIQUE("account_number"),
	CONSTRAINT "service_accounts_service_type_check" CHECK (service_type IN ('INTERNET', 'CABLE', 'COMBO')),
	CONSTRAINT "service_accounts_status_check" CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED')),
	CONSTRAINT "service_accounts_days_check" CHECK (billing_day BETWEEN 1 AND 28 AND due_day BETWEEN 1 AND 28),
	CONSTRAINT "service_accounts_rate_check" CHECK (current_rate_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"notes" text,
	"changed_by_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_events_status_check" CHECK (to_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED'))
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"service_type" text NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"installation_fee_cents" integer DEFAULT 0 NOT NULL,
	"reconnection_fee_cents" integer DEFAULT 0 NOT NULL,
	"speed" text,
	"channel_count" integer,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_code_unique" UNIQUE("code"),
	CONSTRAINT "service_plans_service_type_check" CHECK (service_type IN ('INTERNET', 'CABLE', 'COMBO')),
	CONSTRAINT "service_plans_price_check" CHECK (monthly_price_cents >= 0 AND installation_fee_cents >= 0 AND reconnection_fee_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriber_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"label" text DEFAULT 'Address' NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"barangay" text,
	"municipality" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"contact_number" text,
	"email" text,
	"address_line" text,
	"barangay" text,
	"municipality" text,
	"collection_area_id" uuid,
	"billing_day" integer,
	"due_day" integer,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_account_number_unique" UNIQUE("account_number"),
	CONSTRAINT "subscribers_status_check" CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'TERMINATED')),
	CONSTRAINT "subscribers_billing_day_check" CHECK ((billing_day IS NULL OR billing_day BETWEEN 1 AND 28) AND (due_day IS NULL OR due_day BETWEEN 1 AND 28))
);
--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_plan_id_service_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."service_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_addresses" ADD CONSTRAINT "subscriber_addresses_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_accounts_subscriber_idx" ON "service_accounts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "service_accounts_plan_idx" ON "service_accounts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "service_accounts_status_idx" ON "service_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_accounts_collection_area_idx" ON "service_accounts" USING btree ("collection_area_id");--> statement-breakpoint
CREATE INDEX "service_events_account_idx" ON "service_events" USING btree ("service_account_id");--> statement-breakpoint
CREATE INDEX "service_events_occurred_at_idx" ON "service_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "service_plans_service_type_idx" ON "service_plans" USING btree ("service_type");--> statement-breakpoint
CREATE INDEX "subscriber_addresses_subscriber_idx" ON "subscriber_addresses" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscribers_name_idx" ON "subscribers" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "subscribers_contact_idx" ON "subscribers" USING btree ("contact_number");--> statement-breakpoint
CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscribers_collection_area_idx" ON "subscribers" USING btree ("collection_area_id");