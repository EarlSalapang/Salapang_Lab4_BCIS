import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  CollectionArea,
  CreateCollectionAreaInput,
  CreateInvoiceInput,
  CreatePlanInput,
  CreateServiceAccountInput,
  CreateSubscriberInput,
  GenerateBillingInput,
  Invoice,
  InvoiceLineItem,
  InvoiceListQuery,
  InvoiceListResponse,
  LedgerEntry,
  LedgerEntryListQuery,
  LedgerEntryListResponse,
  ServiceAccountDetail,
  ServiceAccountListQuery,
  ServiceAccountListResponse,
  ServiceAccountSummary,
  ServiceEvent,
  ServicePlan,
  SubscriberAddress,
  SubscriberDetail,
  SubscriberListQuery,
  SubscriberListResponse,
  SubscriberSummary,
  UpdateInvoiceInput,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
} from "@bcis/shared";

import { conflict, invalidRequest, notFound, type BillingGenerationResult, type DirectoryActor, type DirectoryStore } from "./types.js";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

interface PlanRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  service_type: string;
  monthly_price_cents: number;
  installation_fee_cents: number;
  reconnection_fee_cents: number;
  speed: string | null;
  channel_count: number | null;
  description: string | null;
  is_active: boolean;
  created_at: Date;
}

interface AreaRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
}

interface SubscriberRow extends QueryResultRow {
  id: string;
  account_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  contact_number: string | null;
  email: string | null;
  address_line: string | null;
  barangay: string | null;
  municipality: string | null;
  collection_area_id: string | null;
  billing_day: number | null;
  due_day: number | null;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  collection_area_name?: string | null;
  service_account_count?: string | number | null;
}

interface ServiceAccountRow extends QueryResultRow {
  id: string;
  account_number: string;
  subscriber_id: string;
  plan_id: string;
  service_type: string;
  installation_address: string;
  collection_area_id: string | null;
  activation_date: string | null;
  billing_start_date: string | null;
  billing_day: number;
  due_day: number;
  current_rate_cents: number;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  subscriber_account_number: string;
  subscriber_name: string;
  plan_code: string;
  plan_name: string;
  collection_area_name: string | null;
}

interface ServiceEventRow extends QueryResultRow {
  id: string;
  service_account_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  notes: string | null;
  changed_by_user_id: string | null;
  changed_by_name: string | null;
  occurred_at: Date;
}

function toPlan(row: PlanRow): ServicePlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    serviceType: row.service_type as ServicePlan["serviceType"],
    monthlyPriceCents: row.monthly_price_cents,
    installationFeeCents: row.installation_fee_cents,
    reconnectionFeeCents: row.reconnection_fee_cents,
    speed: row.speed,
    channelCount: row.channel_count,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}

function toArea(row: AreaRow): CollectionArea {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}

function subscriberDisplayName(row: SubscriberRow): string {
  return row.middle_name
    ? `${row.last_name}, ${row.first_name} ${row.middle_name}`
    : `${row.last_name}, ${row.first_name}`;
}

function toSubscriberSummary(row: SubscriberRow): SubscriberSummary {
  return {
    id: row.id,
    accountNumber: row.account_number,
    displayName: subscriberDisplayName(row),
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    contactNumber: row.contact_number,
    email: row.email,
    addressLine: row.address_line,
    barangay: row.barangay,
    municipality: row.municipality,
    status: row.status as SubscriberSummary["status"],
    collectionAreaId: row.collection_area_id,
    collectionAreaName: row.collection_area_name ?? null,
    billingDay: row.billing_day,
    dueDay: row.due_day,
    serviceAccountCount: Number(row.service_account_count ?? 0),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toServiceAccountSummary(row: ServiceAccountRow): ServiceAccountSummary {
  return {
    id: row.id,
    accountNumber: row.account_number,
    subscriberId: row.subscriber_id,
    subscriberName: row.subscriber_name,
    subscriberAccountNumber: row.subscriber_account_number,
    planId: row.plan_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    serviceType: row.service_type as ServiceAccountSummary["serviceType"],
    installationAddress: row.installation_address,
    collectionAreaId: row.collection_area_id,
    collectionAreaName: row.collection_area_name,
    activationDate: row.activation_date,
    billingStartDate: row.billing_start_date,
    billingDay: row.billing_day,
    dueDay: row.due_day,
    currentRateCents: row.current_rate_cents,
    status: row.status as ServiceAccountSummary["status"],
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toServiceEvent(row: ServiceEventRow): ServiceEvent {
  return {
    id: row.id,
    serviceAccountId: row.service_account_id,
    fromStatus: row.from_status as ServiceEvent["fromStatus"],
    toStatus: row.to_status as ServiceEvent["toStatus"],
    reason: row.reason,
    notes: row.notes,
    changedByUserId: row.changed_by_user_id,
    changedByName: row.changed_by_name,
    occurredAt: row.occurred_at.toISOString(),
  };
}

const SUBSCRIBER_SUMMARY_SELECT = `
  SELECT s.*, ca.name AS collection_area_name,
         count(sa.id) AS service_account_count
  FROM subscribers s
  LEFT JOIN collection_areas ca ON ca.id = s.collection_area_id
  LEFT JOIN service_accounts sa ON sa.subscriber_id = s.id
`;

const SUBSCRIBER_SUMMARY_GROUP = `GROUP BY s.id, ca.name`;

const SERVICE_ACCOUNT_SELECT = `
  SELECT sa.*,
         s.account_number AS subscriber_account_number,
         s.last_name || ', ' || s.first_name || COALESCE(' ' || s.middle_name, '') AS subscriber_name,
         sp.code AS plan_code, sp.name AS plan_name,
         ca.name AS collection_area_name
  FROM service_accounts sa
  JOIN subscribers s ON s.id = sa.subscriber_id
  JOIN service_plans sp ON sp.id = sa.plan_id
  LEFT JOIN collection_areas ca ON ca.id = sa.collection_area_id
`;

interface InvoiceRow extends QueryResultRow {
  id: string;
  invoice_number: string;
  subscriber_id: string;
  service_account_id: string | null;
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  posted_at: Date | null;
}

interface InvoiceLineRow extends QueryResultRow {
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

interface LedgerRow extends QueryResultRow {
  id: string;
  subscriber_id: string;
  service_account_id: string | null;
  invoice_id: string | null;
  entry_date: string;
  entry_type: string;
  source_type: string;
  amount_cents: number;
  balance_cents: number;
  description: string;
  created_by_user_id: string | null;
  created_at: Date;
}

function toInvoice(row: InvoiceRow, lineItems: InvoiceLineItem[]): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    subscriberId: row.subscriber_id,
    serviceAccountId: row.service_account_id ?? undefined,
    billingPeriodStart: row.billing_period_start,
    billingPeriodEnd: row.billing_period_end,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    amountPaidCents: row.amount_paid_cents,
    balanceCents: row.balance_cents,
    status: row.status as Invoice["status"],
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    postedAt: row.posted_at ? row.posted_at.toISOString() : null,
    lineItems,
  };
}

function toLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    serviceAccountId: row.service_account_id,
    invoiceId: row.invoice_id,
    entryDate: row.entry_date,
    entryType: row.entry_type as LedgerEntry["entryType"],
    sourceType: row.source_type as LedgerEntry["sourceType"],
    amountCents: row.amount_cents,
    balanceCents: row.balance_cents,
    description: row.description,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function normalizeInvoiceLineItem(item: InvoiceLineItem): InvoiceLineItem {
  const quantity = item.quantity ?? 1;
  const amountCents = item.amountCents || quantity * item.unitPriceCents;
  return { ...item, quantity, amountCents };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === UNIQUE_VIOLATION;
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === FOREIGN_KEY_VIOLATION;
}

function mapPlanWriteError(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict("A service plan with that code already exists.");
  throw error;
}

function mapAreaWriteError(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict("A collection area with that code already exists.");
  throw error;
}

export class PostgresDirectoryStore implements DirectoryStore {
  constructor(private readonly pool: Pool) {}

  async listPlans(includeInactive: boolean): Promise<ServicePlan[]> {
    const result = await this.pool.query<PlanRow>(
      `SELECT * FROM service_plans
       WHERE $1::boolean OR is_active = true
       ORDER BY service_type, name`,
      [includeInactive],
    );
    return result.rows.map(toPlan);
  }

  async createPlan(input: CreatePlanInput): Promise<ServicePlan> {
    try {
      const result = await this.pool.query<PlanRow>(
        `INSERT INTO service_plans
           (code, name, service_type, monthly_price_cents, installation_fee_cents,
            reconnection_fee_cents, speed, channel_count, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          input.code,
          input.name,
          input.serviceType,
          input.monthlyPriceCents,
          input.installationFeeCents,
          input.reconnectionFeeCents,
          input.speed ?? null,
          input.channelCount ?? null,
          input.description ?? null,
        ],
      );
      return toPlan(result.rows[0]!);
    } catch (error) {
      mapPlanWriteError(error);
    }
  }

  async updatePlan(id: string, input: UpdatePlanInput): Promise<ServicePlan> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const setColumn = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.code !== undefined) setColumn("code", input.code);
    if (input.name !== undefined) setColumn("name", input.name);
    if (input.serviceType !== undefined) setColumn("service_type", input.serviceType);
    if (input.monthlyPriceCents !== undefined) setColumn("monthly_price_cents", input.monthlyPriceCents);
    if (input.installationFeeCents !== undefined) setColumn("installation_fee_cents", input.installationFeeCents);
    if (input.reconnectionFeeCents !== undefined) setColumn("reconnection_fee_cents", input.reconnectionFeeCents);
    if (input.speed !== undefined) setColumn("speed", input.speed ?? null);
    if (input.channelCount !== undefined) setColumn("channel_count", input.channelCount ?? null);
    if (input.description !== undefined) setColumn("description", input.description ?? null);
    if (input.isActive !== undefined) setColumn("is_active", input.isActive);
    assignments.push("updated_at = now()");
    values.push(id);

    try {
      const result = await this.pool.query<PlanRow>(
        `UPDATE service_plans SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`,
        values,
      );
      const row = result.rows[0];
      if (!row) throw notFound("Service plan");
      return toPlan(row);
    } catch (error) {
      mapPlanWriteError(error);
    }
  }

  async listCollectionAreas(): Promise<CollectionArea[]> {
    const result = await this.pool.query<AreaRow>(
      `SELECT * FROM collection_areas WHERE is_active = true ORDER BY name`,
    );
    return result.rows.map(toArea);
  }

  async createCollectionArea(input: CreateCollectionAreaInput): Promise<CollectionArea> {
    try {
      const result = await this.pool.query<AreaRow>(
        `INSERT INTO collection_areas (code, name, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.code, input.name, input.description ?? null],
      );
      return toArea(result.rows[0]!);
    } catch (error) {
      mapAreaWriteError(error);
    }
  }

  async listSubscribers(query: SubscriberListQuery): Promise<SubscriberListResponse> {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (query.query) {
      values.push(`%${query.query}%`);
      const parameter = `$${values.length}`;
      filters.push(`(s.account_number ILIKE ${parameter} OR s.first_name ILIKE ${parameter}
        OR s.middle_name ILIKE ${parameter} OR s.last_name ILIKE ${parameter}
        OR s.contact_number ILIKE ${parameter} OR s.email ILIKE ${parameter}
        OR s.address_line ILIKE ${parameter} OR s.barangay ILIKE ${parameter}
        OR s.municipality ILIKE ${parameter})`);
    }
    if (query.status) {
      values.push(query.status);
      filters.push(`s.status = $${values.length}`);
    }
    if (query.collectionAreaId) {
      values.push(query.collectionAreaId);
      filters.push(`s.collection_area_id = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM subscribers s ${where}`,
      values,
    );

    const pageSize = query.pageSize;
    const offset = (query.page - 1) * pageSize;
    const result = await this.pool.query<SubscriberRow>(
      `${SUBSCRIBER_SUMMARY_SELECT}
       ${where}
       ${SUBSCRIBER_SUMMARY_GROUP}
       ORDER BY s.last_name, s.first_name, s.account_number
       LIMIT ${pageSize} OFFSET ${offset}`,
      values,
    );

    return {
      subscribers: result.rows.map(toSubscriberSummary),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: query.page,
      pageSize,
    };
  }

  async getSubscriber(id: string): Promise<SubscriberDetail | null> {
    const result = await this.pool.query<SubscriberRow>(
      `${SUBSCRIBER_SUMMARY_SELECT}
       WHERE s.id = $1
       ${SUBSCRIBER_SUMMARY_GROUP}`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;

    const addresses = await this.pool.query<{
      id: string;
      label: string;
      line1: string;
      line2: string | null;
      barangay: string | null;
      municipality: string | null;
      is_default: boolean;
    }>(
      `SELECT id, label, line1, line2, barangay, municipality, is_default
       FROM subscriber_addresses
       WHERE subscriber_id = $1
       ORDER BY is_default DESC, created_at`,
      [id],
    );

    const serviceAccounts = await this.pool.query<ServiceAccountRow>(
      `${SERVICE_ACCOUNT_SELECT}
       WHERE sa.subscriber_id = $1
       ORDER BY sa.created_at DESC`,
      [id],
    );

    const summary = toSubscriberSummary(row);
    const subscriberAddresses: SubscriberAddress[] = addresses.rows.map((address) => ({
      id: address.id,
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      barangay: address.barangay,
      municipality: address.municipality,
      isDefault: address.is_default,
    }));

    return {
      ...summary,
      notes: row.notes,
      addresses: subscriberAddresses,
      serviceAccounts: serviceAccounts.rows.map(toServiceAccountSummary),
    };
  }

  async createSubscriber(input: CreateSubscriberInput): Promise<SubscriberDetail> {
    const client = await this.pool.connect();
    let subscriberId: string;
    try {
      await client.query("BEGIN");
      if (input.collectionAreaId) {
        await assertAreaAvailable(client, input.collectionAreaId);
      }
      const accountNumber = await nextNumber(client, "subscriber_account", "SUB-");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO subscribers
           (account_number, first_name, middle_name, last_name, contact_number, email,
            address_line, barangay, municipality, collection_area_id, billing_day, due_day, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          accountNumber,
          input.firstName,
          input.middleName ?? null,
          input.lastName,
          input.contactNumber ?? null,
          input.email ?? null,
          input.addressLine ?? null,
          input.barangay ?? null,
          input.municipality ?? null,
          input.collectionAreaId ?? null,
          input.billingDay ?? null,
          input.dueDay ?? null,
          input.notes ?? null,
        ],
      );
      subscriberId = inserted.rows[0]!.id;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isForeignKeyViolation(error)) throw invalidRequest("The selected collection area is unavailable.");
      throw error;
    } finally {
      client.release();
    }
    return this.requireSubscriber(subscriberId);
  }

  async updateSubscriber(id: string, input: UpdateSubscriberInput): Promise<SubscriberDetail> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const setColumn = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.firstName !== undefined) setColumn("first_name", input.firstName);
    if (input.middleName !== undefined) setColumn("middle_name", input.middleName ?? null);
    if (input.lastName !== undefined) setColumn("last_name", input.lastName);
    if (input.contactNumber !== undefined) setColumn("contact_number", input.contactNumber ?? null);
    if (input.email !== undefined) setColumn("email", input.email ?? null);
    if (input.addressLine !== undefined) setColumn("address_line", input.addressLine ?? null);
    if (input.barangay !== undefined) setColumn("barangay", input.barangay ?? null);
    if (input.municipality !== undefined) setColumn("municipality", input.municipality ?? null);
    if (input.collectionAreaId !== undefined) setColumn("collection_area_id", input.collectionAreaId ?? null);
    if (input.billingDay !== undefined) setColumn("billing_day", input.billingDay ?? null);
    if (input.dueDay !== undefined) setColumn("due_day", input.dueDay ?? null);
    if (input.status !== undefined) setColumn("status", input.status);
    if (input.notes !== undefined) setColumn("notes", input.notes ?? null);
    assignments.push("updated_at = now()");
    values.push(id);

    try {
      const result = await this.pool.query<{ id: string }>(
        `UPDATE subscribers SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING id`,
        values,
      );
      if (result.rowCount !== 1) throw notFound("Subscriber");
    } catch (error) {
      if (isForeignKeyViolation(error)) throw invalidRequest("The selected collection area is unavailable.");
      throw error;
    }
    return this.requireSubscriber(id);
  }

  async listServiceAccounts(query: ServiceAccountListQuery): Promise<ServiceAccountListResponse> {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (query.query) {
      values.push(`%${query.query}%`);
      const parameter = `$${values.length}`;
      filters.push(`(sa.account_number ILIKE ${parameter} OR s.account_number ILIKE ${parameter}
        OR s.first_name ILIKE ${parameter} OR s.last_name ILIKE ${parameter}
        OR sa.installation_address ILIKE ${parameter} OR sp.name ILIKE ${parameter}
        OR sp.code ILIKE ${parameter})`);
    }
    if (query.status) {
      values.push(query.status);
      filters.push(`sa.status = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM service_accounts sa
       JOIN subscribers s ON s.id = sa.subscriber_id
       JOIN service_plans sp ON sp.id = sa.plan_id
       ${where}`,
      values,
    );

    const pageSize = query.pageSize;
    const offset = (query.page - 1) * pageSize;
    const result = await this.pool.query<ServiceAccountRow>(
      `${SERVICE_ACCOUNT_SELECT}
       ${where}
       ORDER BY sa.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values,
    );

    return {
      serviceAccounts: result.rows.map(toServiceAccountSummary),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: query.page,
      pageSize,
    };
  }

  async getServiceAccount(id: string): Promise<ServiceAccountDetail | null> {
    const result = await this.pool.query<ServiceAccountRow>(
      `${SERVICE_ACCOUNT_SELECT} WHERE sa.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const events = await this.pool.query<ServiceEventRow>(
      `SELECT e.*, u.display_name AS changed_by_name
       FROM service_events e
       LEFT JOIN users u ON u.id = e.changed_by_user_id
       WHERE e.service_account_id = $1
       ORDER BY e.occurred_at DESC, e.id DESC`,
      [id],
    );
    return {
      ...toServiceAccountSummary(row),
      events: events.rows.map(toServiceEvent),
    };
  }

  async createServiceAccount(
    subscriberId: string,
    input: CreateServiceAccountInput,
    actor: DirectoryActor,
  ): Promise<ServiceAccountDetail> {
    const client = await this.pool.connect();
    let serviceAccountId: string;
    try {
      await client.query("BEGIN");
      const subscriber = await client.query<{
        id: string;
        billing_day: number | null;
        due_day: number | null;
        collection_area_id: string | null;
      }>(
        `SELECT id, billing_day, due_day, collection_area_id FROM subscribers WHERE id = $1`,
        [subscriberId],
      );
      const subscriberRow = subscriber.rows[0];
      if (!subscriberRow) throw notFound("Subscriber");

      const plan = await client.query<PlanRow>(
        `SELECT * FROM service_plans WHERE id = $1`,
        [input.planId],
      );
      const planRow = plan.rows[0];
      if (!planRow) throw invalidRequest("The selected plan is unavailable.");
      if (!planRow.is_active) throw invalidRequest("That plan is inactive. Choose an active plan.");

      const collectionAreaId = input.collectionAreaId ?? subscriberRow.collection_area_id;
      if (input.collectionAreaId) await assertAreaAvailable(client, input.collectionAreaId);

      const accountNumber = await nextNumber(client, "service_account", "SA-");
      const today = new Date().toISOString().slice(0, 10);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO service_accounts
           (account_number, subscriber_id, plan_id, service_type, installation_address,
            collection_area_id, activation_date, billing_start_date, billing_day, due_day,
            current_rate_cents, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE', $12)
         RETURNING id`,
        [
          accountNumber,
          subscriberId,
          planRow.id,
          planRow.service_type,
          input.installationAddress,
          collectionAreaId,
          input.activationDate ?? today,
          input.billingStartDate ?? today,
          input.billingDay ?? subscriberRow.billing_day ?? 1,
          input.dueDay ?? subscriberRow.due_day ?? 15,
          input.currentRateCents ?? planRow.monthly_price_cents,
          input.notes ?? null,
        ],
      );
      serviceAccountId = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO service_events (service_account_id, from_status, to_status, notes, changed_by_user_id)
         VALUES ($1, NULL, 'ACTIVE', $2, $3)`,
        [serviceAccountId, "Service account created", actor.userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) throw conflict("A service account with that number already exists.");
      if (isForeignKeyViolation(error)) throw invalidRequest("The selected subscriber, plan, or area is unavailable.");
      throw error;
    } finally {
      client.release();
    }
    return this.requireServiceAccount(serviceAccountId);
  }

  async updateServiceAccount(
    id: string,
    input: UpdateServiceAccountInput,
    actor: DirectoryActor,
  ): Promise<ServiceAccountDetail> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<ServiceAccountRow>(
        `SELECT * FROM service_accounts WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const current = existing.rows[0];
      if (!current) throw notFound("Service account");

      const assignments: string[] = [];
      const values: unknown[] = [];
      const setColumn = (column: string, value: unknown) => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };

      if (input.installationAddress !== undefined) setColumn("installation_address", input.installationAddress);
      if (input.billingDay !== undefined) setColumn("billing_day", input.billingDay);
      if (input.dueDay !== undefined) setColumn("due_day", input.dueDay);
      if (input.activationDate !== undefined) setColumn("activation_date", input.activationDate);
      if (input.notes !== undefined) setColumn("notes", input.notes ?? null);

      if (input.planId !== undefined) {
        const plan = await client.query<PlanRow>(`SELECT * FROM service_plans WHERE id = $1`, [input.planId]);
        const planRow = plan.rows[0];
        if (!planRow) throw invalidRequest("The selected plan is unavailable.");
        if (!planRow.is_active) throw invalidRequest("That plan is inactive. Choose an active plan.");
        setColumn("plan_id", planRow.id);
        setColumn("service_type", planRow.service_type);
        setColumn(
          "current_rate_cents",
          input.currentRateCents !== undefined ? input.currentRateCents : planRow.monthly_price_cents,
        );
      } else if (input.currentRateCents !== undefined) {
        setColumn("current_rate_cents", input.currentRateCents);
      }

      const statusChanged = input.status !== undefined && input.status !== current.status;
      if (statusChanged) setColumn("status", input.status);
      assignments.push("updated_at = now()");
      values.push(id);

      const updated = await client.query<{ id: string }>(
        `UPDATE service_accounts SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING id`,
        values,
      );
      if (updated.rowCount !== 1) throw notFound("Service account");

      if (statusChanged) {
        await client.query(
          `INSERT INTO service_events (service_account_id, from_status, to_status, reason, changed_by_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, current.status, input.status, input.reason ?? null, actor.userId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isForeignKeyViolation(error)) throw invalidRequest("The selected plan is unavailable.");
      throw error;
    } finally {
      client.release();
    }
    return this.requireServiceAccount(id);
  }

  async listInvoices(query: InvoiceListQuery): Promise<InvoiceListResponse> {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (query.query) {
      values.push(`%${query.query}%`);
      filters.push(`invoice_number ILIKE $${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      filters.push(`status = $${values.length}`);
    }
    if (query.subscriberId) {
      values.push(query.subscriberId);
      filters.push(`subscriber_id = $${values.length}`);
    }
    if (query.serviceAccountId) {
      values.push(query.serviceAccountId);
      filters.push(`service_account_id = $${values.length}`);
    }
    if (query.from) {
      values.push(query.from);
      filters.push(`billing_period_start >= $${values.length}`);
    }
    if (query.to) {
      values.push(query.to);
      filters.push(`billing_period_end <= $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM invoices ${where}`,
      values,
    );
    const pageSize = query.pageSize;
    const offset = (query.page - 1) * pageSize;
    const result = await this.pool.query<InvoiceRow>(
      `SELECT * FROM invoices ${where}
       ORDER BY issue_date DESC, created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values,
    );

    return {
      invoices: result.rows.map((row) => toInvoice(row, [])),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: query.page,
      pageSize,
    };
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const result = await this.pool.query<InvoiceRow>(`SELECT * FROM invoices WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    const lineItems = await this.pool.query<InvoiceLineRow>(
      `SELECT description, quantity, unit_price_cents, amount_cents
       FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at ASC`,
      [id],
    );
    return toInvoice(row, lineItems.rows.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      amountCents: line.amount_cents,
    })));
  }

  async createInvoice(input: CreateInvoiceInput, _actor: DirectoryActor): Promise<Invoice> {
    const lineItems = input.lineItems.map(normalizeInvoiceLineItem);
    const subtotalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
    if (subtotalCents <= 0) throw invalidRequest("An invoice must have a positive amount.");

    const client = await this.pool.connect();
    let invoiceId = "";
    try {
      await client.query("BEGIN");
      await requireSubscriberExists(client, input.subscriberId);
      if (input.serviceAccountId) {
        await requireAccountForSubscriber(client, input.serviceAccountId, input.subscriberId);
      }
      await assertNoExistingInvoice(
        client,
        input.subscriberId,
        input.serviceAccountId ?? null,
        input.billingPeriodStart,
        input.billingPeriodEnd,
      );
      const invoiceNumber = await nextNumber(client, "invoice", "INV-");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (invoice_number, subscriber_id, service_account_id, billing_period_start, billing_period_end,
            issue_date, due_date, subtotal_cents, tax_cents, total_cents, amount_paid_cents, balance_cents,
            status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $8, 0, $8, 'draft', $9)
         RETURNING id`,
        [
          invoiceNumber,
          input.subscriberId,
          input.serviceAccountId ?? null,
          input.billingPeriodStart,
          input.billingPeriodEnd,
          input.issueDate,
          input.dueDate,
          subtotalCents,
          input.notes ?? null,
        ],
      );
      invoiceId = inserted.rows[0]!.id;
      await insertInvoiceLineItems(client, invoiceId, lineItems);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isForeignKeyViolation(error)) throw invalidRequest("The selected subscriber or service account is unavailable.");
      throw error;
    } finally {
      client.release();
    }
    return (await this.getInvoice(invoiceId))!;
  }

  async updateInvoice(id: string, input: UpdateInvoiceInput, actor: DirectoryActor): Promise<Invoice> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query<InvoiceRow>(`SELECT * FROM invoices WHERE id = $1 FOR UPDATE`, [id]);
      const current = currentResult.rows[0];
      if (!current) throw notFound("Invoice");
      if (current.status === "void" && input.status && input.status !== "void") {
        throw conflict("A void invoice cannot change status.");
      }
      const nextStatus = input.status ?? current.status;
      const assignments = ["status = $1", "updated_at = now()"];
      const values: unknown[] = [nextStatus];
      if (input.notes !== undefined) {
        values.push(input.notes ?? null);
        assignments.push(`notes = $${values.length}`);
      }
      const posting = input.status === "posted" && current.status !== "posted";
      if (posting) {
        if (current.balance_cents <= 0) throw invalidRequest("Only invoices with an outstanding balance can be posted.");
        assignments.push("posted_at = now()");
      }
      values.push(id);
      await client.query(
        `UPDATE invoices SET ${assignments.join(", ")} WHERE id = $${values.length}`,
        values,
      );
      if (input.status === "posted" && current.status !== "posted") {
        await postLedgerEntry(client, current, actor, "debit", "invoice", current.total_cents, "Invoice posted");
      } else if (input.status === "void" && current.status === "posted") {
        await postLedgerEntry(
          client,
          current,
          actor,
          "credit",
          "reversal",
          current.total_cents - current.amount_paid_cents,
          "Invoice voided",
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return (await this.getInvoice(id))!;
  }

  async generateInvoices(input: GenerateBillingInput, actor: DirectoryActor): Promise<BillingGenerationResult> {
    const client = await this.pool.connect();
    const createdIds: string[] = [];
    let skipped = 0;
    try {
      await client.query("BEGIN");
      const params: unknown[] = [];
      let filter = `WHERE sa.status NOT IN ('TERMINATED', 'DISCONNECTED')`;
      if (input.serviceAccountIds && input.serviceAccountIds.length > 0) {
        params.push(input.serviceAccountIds);
        filter += ` AND sa.id = ANY($${params.length}::uuid[])`;
      }
      const accounts = await client.query<{
        id: string;
        subscriber_id: string;
        current_rate_cents: number;
        plan_name: string;
      }>(
        `SELECT sa.id, sa.subscriber_id, sa.current_rate_cents, sp.name AS plan_name
         FROM service_accounts sa JOIN service_plans sp ON sp.id = sa.plan_id
         ${filter}`,
        params,
      );
      for (const account of accounts.rows) {
        const duplicate = await client.query<{ id: string }>(
          `SELECT id FROM invoices
           WHERE subscriber_id = $1 AND service_account_id IS NOT DISTINCT FROM $2
             AND billing_period_start = $3 AND billing_period_end = $4
             AND status <> 'void'
           LIMIT 1`,
          [account.subscriber_id, account.id, input.billingPeriodStart, input.billingPeriodEnd],
        );
        if (duplicate.rowCount) {
          skipped += 1;
          continue;
        }
        const invoiceNumber = await nextNumber(client, "invoice", "INV-");
        const inserted = await client.query<InvoiceRow>(
          `INSERT INTO invoices
             (invoice_number, subscriber_id, service_account_id, billing_period_start, billing_period_end,
              issue_date, due_date, subtotal_cents, tax_cents, total_cents, amount_paid_cents, balance_cents,
              status, posted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $8, 0, $8, 'posted', now())
           RETURNING *`,
          [
            invoiceNumber,
            account.subscriber_id,
            account.id,
            input.billingPeriodStart,
            input.billingPeriodEnd,
            input.issueDate,
            input.dueDate,
            account.current_rate_cents,
          ],
        );
        const invoiceRow = inserted.rows[0]!;
        await insertInvoiceLineItems(client, invoiceRow.id, [{
          description: `Monthly service fee (${account.plan_name})`,
          quantity: 1,
          unitPriceCents: account.current_rate_cents,
          amountCents: account.current_rate_cents,
        }]);
        await postLedgerEntry(
          client,
          invoiceRow,
          actor,
          "debit",
          "invoice",
          account.current_rate_cents,
          "Monthly billing posted",
        );
        createdIds.push(invoiceRow.id);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) throw conflict("An invoice already exists for that account and billing period.");
      throw error;
    } finally {
      client.release();
    }
    const created: Invoice[] = [];
    for (const id of createdIds) {
      const invoice = await this.getInvoice(id);
      if (invoice) created.push(invoice);
    }
    return { created, skipped };
  }

  async listLedgerEntries(query: LedgerEntryListQuery): Promise<LedgerEntryListResponse> {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (query.subscriberId) {
      values.push(query.subscriberId);
      filters.push(`subscriber_id = $${values.length}`);
    }
    if (query.invoiceId) {
      values.push(query.invoiceId);
      filters.push(`invoice_id = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM ledger_entries ${where}`,
      values,
    );
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query<LedgerRow>(
      `SELECT * FROM ledger_entries ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ${query.pageSize} OFFSET ${offset}`,
      values,
    );
    return {
      entries: result.rows.map(toLedgerEntry),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async requireSubscriber(id: string): Promise<SubscriberDetail> {
    const subscriber = await this.getSubscriber(id);
    if (!subscriber) throw notFound("Subscriber");
    return subscriber;
  }

  private async requireServiceAccount(id: string): Promise<ServiceAccountDetail> {
    const account = await this.getServiceAccount(id);
    if (!account) throw notFound("Service account");
    return account;
  }
}

async function nextNumber(client: PoolClient, sequenceName: string, prefix: string): Promise<string> {
  await client.query(
    `INSERT INTO number_counters (name, last_value) VALUES ($1, 0) ON CONFLICT (name) DO NOTHING`,
    [sequenceName],
  );
  const result = await client.query<{ last_value: number }>(
    `UPDATE number_counters
     SET last_value = last_value + 1, updated_at = now()
     WHERE name = $1
     RETURNING last_value`,
    [sequenceName],
  );
  const value = result.rows[0]?.last_value;
  if (value === undefined) throw invalidRequest("Unable to allocate a record number.");
  return `${prefix}${String(value).padStart(6, "0")}`;
}

async function assertAreaAvailable(client: PoolClient, areaId: string): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM collection_areas WHERE id = $1 AND is_active = true`,
    [areaId],
  );
  if (result.rowCount !== 1) throw invalidRequest("The selected collection area is unavailable.");
}

async function requireSubscriberExists(client: PoolClient, subscriberId: string): Promise<void> {
  const result = await client.query<{ id: string }>(`SELECT id FROM subscribers WHERE id = $1`, [subscriberId]);
  if (result.rowCount !== 1) throw invalidRequest("The selected subscriber is unavailable.");
}

async function requireAccountForSubscriber(
  client: PoolClient,
  serviceAccountId: string,
  subscriberId: string,
): Promise<void> {
  const result = await client.query<{ subscriber_id: string }>(
    `SELECT subscriber_id FROM service_accounts WHERE id = $1`,
    [serviceAccountId],
  );
  const row = result.rows[0];
  if (!row) throw invalidRequest("The selected service account is unavailable.");
  if (row.subscriber_id !== subscriberId) {
    throw invalidRequest("The service account does not belong to the selected subscriber.");
  }
}

async function assertNoExistingInvoice(
  client: PoolClient,
  subscriberId: string,
  serviceAccountId: string | null,
  billingPeriodStart: string,
  billingPeriodEnd: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM invoices
     WHERE subscriber_id = $1 AND service_account_id IS NOT DISTINCT FROM $2
       AND billing_period_start = $3 AND billing_period_end = $4
       AND status <> 'void'
     LIMIT 1`,
    [subscriberId, serviceAccountId, billingPeriodStart, billingPeriodEnd],
  );
  if (result.rowCount) {
    throw conflict("An invoice already exists for that account and billing period.");
  }
}

async function insertInvoiceLineItems(
  client: PoolClient,
  invoiceId: string,
  lineItems: InvoiceLineItem[],
): Promise<void> {
  for (const item of lineItems) {
    await client.query(
      `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price_cents, amount_cents)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, item.description, item.quantity ?? 1, item.unitPriceCents, item.amountCents],
    );
  }
}

interface InvoiceLedgerContext {
  id: string;
  subscriber_id: string;
  service_account_id: string | null;
  issue_date: string;
}

async function postLedgerEntry(
  client: PoolClient,
  invoice: InvoiceLedgerContext,
  actor: DirectoryActor,
  entryType: "debit" | "credit",
  sourceType: "invoice" | "payment" | "adjustment" | "reversal",
  amountCents: number,
  description: string,
): Promise<void> {
  const balanceResult = await client.query<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS balance
     FROM ledger_entries WHERE subscriber_id = $1`,
    [invoice.subscriber_id],
  );
  const previous = Number(balanceResult.rows[0]?.balance ?? 0);
  const delta = entryType === "debit" ? amountCents : -amountCents;
  await client.query(
    `INSERT INTO ledger_entries
       (subscriber_id, service_account_id, invoice_id, entry_date, entry_type, source_type, amount_cents, balance_cents, description, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      invoice.subscriber_id,
      invoice.service_account_id,
      invoice.id,
      invoice.issue_date,
      entryType,
      sourceType,
      amountCents,
      previous + delta,
      description,
      actor.userId,
    ],
  );
}
