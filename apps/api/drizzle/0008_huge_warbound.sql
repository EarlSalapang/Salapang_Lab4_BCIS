CREATE TABLE "service_suspensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"reason" text,
	"notes" text,
	"suspended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_by_user_id" uuid,
	"reconnected_at" timestamp with time zone,
	"reconnected_by_user_id" uuid,
	"reconnection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_suspensions" ADD CONSTRAINT "service_suspensions_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_suspensions" ADD CONSTRAINT "service_suspensions_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_suspensions" ADD CONSTRAINT "service_suspensions_suspended_by_user_id_users_id_fk" FOREIGN KEY ("suspended_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_suspensions" ADD CONSTRAINT "service_suspensions_reconnected_by_user_id_users_id_fk" FOREIGN KEY ("reconnected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_suspensions_account_idx" ON "service_suspensions" USING btree ("service_account_id");--> statement-breakpoint
CREATE INDEX "service_suspensions_subscriber_idx" ON "service_suspensions" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "service_suspensions_reconnected_idx" ON "service_suspensions" USING btree ("reconnected_at");