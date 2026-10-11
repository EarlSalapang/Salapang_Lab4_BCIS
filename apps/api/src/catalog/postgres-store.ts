import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  AllocationPreview,
  AllocationPreviewInput,
  BatchAccount,
  CollectionArea,
  CollectionBatch,
  CollectionBatchListQuery,
  CollectionBatchListResponse,
  Collector,
  CollectorAssignment,
  CollectorReport,
  CreateCollectionAreaInput,
  CreateCollectorAssignmentInput,
  CreateCollectionBatchInput,
  CreateCollectorInput,
  CreateInvoiceInput,
  CreatePaymentInput,
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
  Payment,
  PaymentAllocation,
  PaymentListQuery,
  PaymentListResponse,
  PaymentProof,
  PaymentProofInput,
  PaymentReversal,
  ReconcileCollectionBatchInput,
  RemitCollectionBatchInput,
  ReversePaymentInput,
  RouteSheet,
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
  UpdateCollectorInput,
  UpdateInvoiceInput,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
  VerifyPaymentInput,
  AgingReport,
  AgingReportRow,
  OverdueList,
  SuspensionList,
  SuspensionCandidate,
  ServiceSuspension,
  SuspendServiceAccountInput,
  ReconnectServiceAccountInput,
  BillingGenerationResult,
} from "@bcis/shared";

import { AGING_BUCKET_DEFINITIONS, bucketIndexForDays, emptyAgingBuckets } from "./receivables.js";
import {
  conflict,
  invalidRequest,
  notFound,
  type DirectoryActor,
  type DirectoryStore,
  type DateRange,
  type InvoiceFact,
  type PaymentFact,
  type LedgerFact,
} from "./types.js";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const uploadsRoot = process.env.BCIS_UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads");

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

interface ServiceSuspensionRow extends QueryResultRow {
  id: string;
  service_account_id: string;
  subscriber_id: string;
  reason: string | null;
  notes: string | null;
  suspended_at: Date;
  suspended_by_user_id: string | null;
  reconnected_at: Date | null;
  reconnected_by_user_id: string | null;
  reconnection_reason: string | null;
}

interface OpenInvoiceReportRow extends QueryResultRow {
  subscriber_id: string;
  account_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  service_account_id: string | null;
  service_account_number: string;
  balance_cents: number;
  overdue_days: number;
}

interface OverdueInvoiceRow extends QueryResultRow {
  id: string;
  invoice_number: string;
  subscriber_id: string;
  subscriber_account_number: string;
  subscriber_name: string;
  issue_date: string;
  due_date: string;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  status: string;
  overdue_days: number;
}

function toServiceSuspension(row: ServiceSuspensionRow): ServiceSuspension {
  return {
    id: row.id,
    serviceAccountId: row.service_account_id,
    subscriberId: row.subscriber_id,
    reason: row.reason,
    notes: row.notes,
    suspendedAt: row.suspended_at.toISOString(),
    suspendedByUserId: row.suspended_by_user_id,
    reconnectedAt: row.reconnected_at ? row.reconnected_at.toISOString() : null,
    reconnectedByUserId: row.reconnected_by_user_id,
    reconnectionReason: row.reconnection_reason,
  };
}

function formatSubscriberName(firstName: string, middleName: string | null, lastName: string): string {
  return middleName ? `${lastName}, ${firstName} ${middleName}` : `${lastName}, ${firstName}`;
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

interface PaymentRow extends QueryResultRow {
  id: string;
  receipt_number: string;
  subscriber_id: string;
  amount_cents: number;
  method: string;
  reference_number: string | null;
  notes: string | null;
  status: string;
  verification_note: string | null;
  payment_date: Date;
  verified_at: Date | null;
  verified_by_user_id: string | null;
  created_by_user_id: string | null;
  collector_id: string | null;
  collection_batch_id: string | null;
  created_at: Date;
  updated_at: Date;
  subscriber_account_number: string;
  subscriber_name: string;
  allocated_cents: string;
}

interface PaymentAllocationRow extends QueryResultRow {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount_cents: number;
  created_at: Date;
  invoice_number: string;
}

interface PaymentProofRow extends QueryResultRow {
  id: string;
  payment_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_by_user_id: string | null;
  created_at: Date;
}

interface PaymentReversalRow extends QueryResultRow {
  id: string;
  payment_id: string;
  reason: string;
  reversed_by_user_id: string | null;
  created_at: Date;
}

interface AllocatableInvoiceRow extends QueryResultRow {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  status: string;
}

interface CollectorRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  contact_number: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CollectorAssignmentRow extends QueryResultRow {
  id: string;
  collector_id: string;
  collector_name: string;
  subscriber_id: string;
  subscriber_account_number: string;
  subscriber_name: string;
  collection_area_id: string | null;
  collection_area_name: string | null;
  is_active: boolean;
  assigned_at: Date;
}

interface CollectionBatchRow extends QueryResultRow {
  id: string;
  batch_number: string;
  collector_id: string;
  collector_name: string;
  collection_area_id: string | null;
  collection_area_name: string | null;
  route_date: string;
  status: string;
  expected_cents: number;
  cash_collected_cents: number;
  non_cash_collected_cents: number;
  remitted_cents: number | null;
  shortage_cents: number;
  overage_cents: number;
  notes: string | null;
  opened_by_user_id: string | null;
  submitted_at: Date | null;
  remitted_at: Date | null;
  reconciled_at: Date | null;
  closed_at: Date | null;
  closed_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface BatchAccountRow extends QueryResultRow {
  id: string;
  batch_id: string;
  subscriber_id: string;
  subscriber_account_number: string;
  subscriber_name: string;
  address_line: string | null;
  current_bill_cents: number;
  arrears_cents: number;
  expected_cents: number;
  collected_cents: number;
  status: string;
}

interface CollectorReportRow extends QueryResultRow {
  collector_id: string;
  collector_name: string;
  batches: string;
  expected_cents: string;
  collected_cents: string;
  remitted_cents: string;
  shortage_cents: string;
  overage_cents: string;
}

interface InvoiceFactRow extends QueryResultRow {
  id: string;
  invoice_number: string;
  subscriber_id: string;
  service_account_id: string | null;
  issue_date: string;
  due_date: string;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  status: string;
  subscriber_account_number: string;
  subscriber_name: string;
  plan_name: string | null;
  service_type: string | null;
  collection_area_name: string | null;
}

interface PaymentFactRow extends QueryResultRow {
  id: string;
  receipt_number: string;
  subscriber_id: string;
  subscriber_account_number: string;
  subscriber_name: string;
  amount_cents: number;
  method: string;
  status: string;
  payment_date: Date;
  collector_id: string | null;
  collection_batch_id: string | null;
}

interface LedgerFactRow extends QueryResultRow {
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
  created_at: Date;
}

function toCollector(row: CollectorRow): Collector {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactNumber: row.contact_number,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toCollectorAssignment(row: CollectorAssignmentRow): CollectorAssignment {
  return {
    id: row.id,
    collectorId: row.collector_id,
    collectorName: row.collector_name,
    subscriberId: row.subscriber_id,
    subscriberAccountNumber: row.subscriber_account_number,
    subscriberName: row.subscriber_name,
    collectionAreaId: row.collection_area_id,
    collectionAreaName: row.collection_area_name,
    isActive: row.is_active,
    assignedAt: row.assigned_at.toISOString(),
  };
}

function toCollectionBatch(row: CollectionBatchRow, accounts?: BatchAccount[]): CollectionBatch {
  const collectedCents = row.cash_collected_cents + row.non_cash_collected_cents;
  const remittedCents = row.remitted_cents;
  return {
    id: row.id,
    batchNumber: row.batch_number,
    collectorId: row.collector_id,
    collectorName: row.collector_name,
    collectionAreaId: row.collection_area_id,
    collectionAreaName: row.collection_area_name,
    routeDate: row.route_date,
    status: row.status as CollectionBatch["status"],
    expectedCents: row.expected_cents,
    cashCollectedCents: row.cash_collected_cents,
    nonCashCollectedCents: row.non_cash_collected_cents,
    collectedCents,
    remittedCents,
    differenceCents: remittedCents === null ? null : collectedCents - remittedCents,
    shortageCents: row.shortage_cents,
    overageCents: row.overage_cents,
    notes: row.notes,
    openedByUserId: row.opened_by_user_id,
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
    remittedAt: row.remitted_at ? row.remitted_at.toISOString() : null,
    reconciledAt: row.reconciled_at ? row.reconciled_at.toISOString() : null,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    accounts,
  };
}

function toBatchAccount(row: BatchAccountRow): BatchAccount {
  return {
    id: row.id,
    batchId: row.batch_id,
    subscriberId: row.subscriber_id,
    subscriberAccountNumber: row.subscriber_account_number,
    subscriberName: row.subscriber_name,
    addressLine: row.address_line,
    currentBillCents: row.current_bill_cents,
    arrearsCents: row.arrears_cents,
    expectedCents: row.expected_cents,
    collectedCents: row.collected_cents,
    status: row.status as BatchAccount["status"],
  };
}

const BATCH_SELECT = `SELECT b.*, c.name AS collector_name, a.name AS collection_area_name
  FROM collection_batches b
  JOIN collectors c ON c.id = b.collector_id
  LEFT JOIN collection_areas a ON a.id = b.collection_area_id`;

const BATCH_ACCOUNT_SELECT = `SELECT ba.*, s.account_number AS subscriber_account_number,
    concat_ws(' ', s.first_name, s.middle_name, s.last_name) AS subscriber_name,
    concat_ws(', ', s.address_line, s.barangay, s.municipality) AS address_line
  FROM batch_accounts ba
  JOIN subscribers s ON s.id = ba.subscriber_id`;

function toPaymentAllocation(row: PaymentAllocationRow): PaymentAllocation {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    amountCents: row.amount_cents,
    createdAt: row.created_at.toISOString(),
  };
}

function toPaymentProof(row: PaymentProofRow): PaymentProof {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function toPaymentReversal(row: PaymentReversalRow): PaymentReversal {
  return {
    id: row.id,
    reason: row.reason,
    reversedByUserId: row.reversed_by_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function toPayment(
  row: PaymentRow,
  allocations: PaymentAllocation[] | undefined,
  proofs: PaymentProof[] | undefined,
  reversal: PaymentReversal | null | undefined,
): Payment {
  const allocatedCents = allocations
    ? allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0)
    : Number(row.allocated_cents ?? 0);
  const amountCents = row.amount_cents;
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    subscriberId: row.subscriber_id,
    subscriberAccountNumber: row.subscriber_account_number,
    subscriberName: row.subscriber_name,
    amountCents,
    allocatedCents,
    unallocatedCents: Math.max(amountCents - allocatedCents, 0),
    method: row.method as Payment["method"],
    referenceNumber: row.reference_number,
    notes: row.notes,
    status: row.status as Payment["status"],
    verificationNote: row.verification_note,
    paymentDate: row.payment_date.toISOString(),
    verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
    verifiedByUserId: row.verified_by_user_id,
    createdByUserId: row.created_by_user_id,
    collectorId: row.collector_id,
    collectionBatchId: row.collection_batch_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    allocations,
    proofs,
    reversal: reversal ?? null,
  };
}

const PAYMENT_SELECT = `
  SELECT p.*, s.account_number AS subscriber_account_number,
         trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)) AS subscriber_name,
         COALESCE((SELECT SUM(pa.amount_cents) FROM payment_allocations pa WHERE pa.payment_id = p.id), 0)::text AS allocated_cents
  FROM payments p
  JOIN subscribers s ON s.id = p.subscriber_id`;

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

  async previewAllocation(input: AllocationPreviewInput): Promise<AllocationPreview> {
    const result = await this.pool.query<AllocatableInvoiceRow>(
      `SELECT id, invoice_number, issue_date, due_date, total_cents, amount_paid_cents, balance_cents, status
       FROM invoices
       WHERE subscriber_id = $1 AND status IN ('posted', 'partially_paid', 'overdue') AND balance_cents > 0
       ORDER BY due_date ASC, issue_date ASC, created_at ASC`,
      [input.subscriberId],
    );
    return buildAllocationPreview(input.subscriberId, input.amountCents, result.rows);
  }

  async listPayments(query: PaymentListQuery): Promise<PaymentListResponse> {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (query.subscriberId) {
      values.push(query.subscriberId);
      filters.push(`p.subscriber_id = $${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      filters.push(`p.status = $${values.length}`);
    }
    if (query.method) {
      values.push(query.method);
      filters.push(`p.method = $${values.length}`);
    }
    if (query.from) {
      values.push(query.from);
      filters.push(`p.payment_date >= $${values.length}`);
    }
    if (query.to) {
      values.push(`${query.to}T23:59:59.999Z`);
      filters.push(`p.payment_date <= $${values.length}`);
    }
    if (query.query) {
      values.push(`%${query.query.toLowerCase()}%`);
      filters.push(
        `(lower(p.receipt_number) LIKE $${values.length} OR lower(s.account_number) LIKE $${values.length}
          OR lower(concat_ws(' ', s.first_name, s.middle_name, s.last_name)) LIKE $${values.length}
          OR lower(coalesce(p.reference_number, '')) LIKE $${values.length})`,
      );
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM payments p JOIN subscribers s ON s.id = p.subscriber_id ${where}`,
      values,
    );
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query<PaymentRow>(
      `${PAYMENT_SELECT} ${where}
       ORDER BY p.payment_date DESC, p.created_at DESC
       LIMIT ${query.pageSize} OFFSET ${offset}`,
      values,
    );
    return {
      payments: result.rows.map((row) => toPayment(row, undefined, undefined, undefined)),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getPayment(id: string): Promise<Payment | null> {
    const result = await this.pool.query<PaymentRow>(`${PAYMENT_SELECT} WHERE p.id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    const [allocations, proofs, reversal] = await Promise.all([
      this.pool.query<PaymentAllocationRow>(
        `SELECT pa.*, i.invoice_number FROM payment_allocations pa
         JOIN invoices i ON i.id = pa.invoice_id
         WHERE pa.payment_id = $1 ORDER BY i.due_date ASC, pa.created_at ASC`,
        [id],
      ),
      this.pool.query<PaymentProofRow>(`SELECT * FROM payment_proofs WHERE payment_id = $1 ORDER BY created_at ASC`, [id]),
      this.pool.query<PaymentReversalRow>(`SELECT * FROM payment_reversals WHERE payment_id = $1`, [id]),
    ]);
    return toPayment(
      row,
      allocations.rows.map(toPaymentAllocation),
      proofs.rows.map(toPaymentProof),
      reversal.rows[0] ? toPaymentReversal(reversal.rows[0]) : null,
    );
  }

  async createPayment(input: CreatePaymentInput, actor: DirectoryActor): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await requireSubscriberExists(client, input.subscriberId);
      if (input.method === "gcash" && input.referenceNumber) {
        await assertUniqueGcashReference(client, input.referenceNumber, null);
      }
      let collectorId: string | null = null;
      let batchId: string | null = null;
      if (input.collectionBatchId) {
        const batch = await requireBatchForUpdate(client, input.collectionBatchId);
        if (batch.status !== "OPEN" && batch.status !== "IN_PROGRESS") {
          throw conflict("Payments can only be recorded against an open or in-progress collection batch.");
        }
        const account = await client.query<{ id: string }>(
          `SELECT id FROM batch_accounts WHERE batch_id = $1 AND subscriber_id = $2`,
          [batch.id, input.subscriberId],
        );
        if (account.rowCount !== 1) {
          throw invalidRequest("The subscriber is not part of the selected collection batch.");
        }
        collectorId = batch.collector_id;
        batchId = batch.id;
      }
      const receiptNumber = await nextNumber(client, "receipt", "RCPT-");
      const status = input.method === "gcash" ? "pending" : "posted";
      const paymentDate = input.paymentDate ? new Date(input.paymentDate).toISOString() : new Date().toISOString();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO payments
           (receipt_number, subscriber_id, amount_cents, method, reference_number, notes, status, payment_date,
            created_by_user_id, collector_id, collection_batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          receiptNumber,
          input.subscriberId,
          input.amountCents,
          input.method,
          input.referenceNumber ?? null,
          input.notes ?? null,
          status,
          paymentDate,
          actor.userId,
          collectorId,
          batchId,
        ],
      );
      const paymentId = inserted.rows[0]!.id;
      for (const proof of input.proofs ?? []) {
        await this.insertPaymentProof(client, paymentId, proof, actor);
      }
      if (status === "posted") {
        await allocatePayment(client, {
          paymentId,
          subscriberId: input.subscriberId,
          amountCents: input.amountCents,
          receiptNumber,
          entryDate: paymentDate.slice(0, 10),
        }, actor);
        if (batchId) {
          await applyPaymentToBatch(client, batchId, input.subscriberId, input.amountCents, input.method);
        }
      }
      await client.query("COMMIT");
      const payment = await this.getPayment(paymentId);
      if (!payment) throw notFound("Payment");
      return payment;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyPayment(id: string, input: VerifyPaymentInput, actor: DirectoryActor): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<PaymentRow>(`${PAYMENT_SELECT} WHERE p.id = $1 FOR UPDATE`, [id]);
      const row = result.rows[0];
      if (!row) throw notFound("Payment");
      if (row.method !== "gcash") throw invalidRequest("Only GCash payments require verification.");
      if (row.status !== "pending") throw conflict("Only pending GCash payments can be verified or rejected.");
      const note = input.note ?? null;
      if (input.decision === "reject") {
        await client.query(
          `UPDATE payments SET status = 'rejected', verification_note = $2, verified_at = now(),
             verified_by_user_id = $3, updated_at = now() WHERE id = $1`,
          [id, note, actor.userId],
        );
      } else {
        if (row.reference_number) {
          await assertUniqueGcashReference(client, row.reference_number, id);
        }
        await allocatePayment(client, {
          paymentId: id,
          subscriberId: row.subscriber_id,
          amountCents: row.amount_cents,
          receiptNumber: row.receipt_number,
          entryDate: row.payment_date.toISOString().slice(0, 10),
        }, actor);
        if (row.collection_batch_id) {
          await applyPaymentToBatch(
            client,
            row.collection_batch_id,
            row.subscriber_id,
            row.amount_cents,
            row.method,
          );
        }
        await client.query(
          `UPDATE payments SET status = 'posted', verification_note = $2, verified_at = now(),
             verified_by_user_id = $3, updated_at = now() WHERE id = $1`,
          [id, note, actor.userId],
        );
      }
      await client.query("COMMIT");
      const payment = await this.getPayment(id);
      if (!payment) throw notFound("Payment");
      return payment;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reversePayment(id: string, input: ReversePaymentInput, actor: DirectoryActor): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<PaymentRow>(`${PAYMENT_SELECT} WHERE p.id = $1 FOR UPDATE`, [id]);
      const row = result.rows[0];
      if (!row) throw notFound("Payment");
      if (row.status !== "posted") throw conflict("Only posted payments can be reversed.");
      const allocations = await client.query<PaymentAllocationRow>(
        `SELECT pa.*, i.invoice_number FROM payment_allocations pa
         JOIN invoices i ON i.id = pa.invoice_id
         WHERE pa.payment_id = $1 ORDER BY pa.created_at ASC`,
        [id],
      );
      for (const allocation of allocations.rows) {
        const invoiceResult = await client.query<AllocatableInvoiceRow>(
          `SELECT id, invoice_number, issue_date, due_date, total_cents, amount_paid_cents, balance_cents, status
           FROM invoices WHERE id = $1 FOR UPDATE`,
          [allocation.invoice_id],
        );
        const invoice = invoiceResult.rows[0];
        if (!invoice || invoice.status === "void") continue;
        const amountPaid = Math.max(invoice.amount_paid_cents - allocation.amount_cents, 0);
        const balance = invoice.balance_cents + allocation.amount_cents;
        const status = amountPaid === 0 ? "posted" : balance === 0 ? "paid" : "partially_paid";
        await client.query(
          `UPDATE invoices SET amount_paid_cents = $2, balance_cents = $3, status = $4, updated_at = now() WHERE id = $1`,
          [invoice.id, amountPaid, balance, status],
        );
      }
      await client.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [id]);
      if (row.collection_batch_id) {
        await reversePaymentFromBatch(client, row.collection_batch_id, row.subscriber_id, row.amount_cents, row.method);
      }
      await postSubscriberLedgerEntry(
        client,
        { subscriberId: row.subscriber_id, entryDate: new Date().toISOString().slice(0, 10) },
        actor,
        "debit",
        "reversal",
        row.amount_cents,
        `Payment reversed ${row.receipt_number}: ${input.reason}`,
      );
      await client.query(
        `UPDATE payments SET status = 'reversed', updated_at = now() WHERE id = $1`,
        [id],
      );
      await client.query(
        `INSERT INTO payment_reversals (payment_id, reason, reversed_by_user_id) VALUES ($1, $2, $3)`,
        [id, input.reason, actor.userId],
      );
      await client.query("COMMIT");
      const payment = await this.getPayment(id);
      if (!payment) throw notFound("Payment");
      return payment;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listCollectors(includeInactive: boolean): Promise<Collector[]> {
    const result = await this.pool.query<CollectorRow>(
      `SELECT * FROM collectors WHERE $1::boolean OR is_active = true ORDER BY name`,
      [includeInactive],
    );
    return result.rows.map(toCollector);
  }

  async createCollector(input: CreateCollectorInput): Promise<Collector> {
    try {
      const result = await this.pool.query<CollectorRow>(
        `INSERT INTO collectors (code, name, contact_number) VALUES ($1, $2, $3) RETURNING *`,
        [input.code, input.name, input.contactNumber ?? null],
      );
      return toCollector(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A collector with that code already exists.");
      throw error;
    }
  }

  async updateCollector(id: string, input: UpdateCollectorInput): Promise<Collector> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const setColumn = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };
    if (input.name !== undefined) setColumn("name", input.name);
    if (input.contactNumber !== undefined) setColumn("contact_number", input.contactNumber ?? null);
    if (input.isActive !== undefined) setColumn("is_active", input.isActive);
    if (!assignments.length) throw invalidRequest("No changes were supplied.");
    assignments.push("updated_at = now()");
    values.push(id);
    const result = await this.pool.query<CollectorRow>(
      `UPDATE collectors SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!result.rows[0]) throw notFound("Collector");
    return toCollector(result.rows[0]);
  }

  async listCollectorAssignments(collectorId?: string): Promise<CollectorAssignment[]> {
    const filters = collectorId ? "WHERE ca.collector_id = $1" : "";
    const result = await this.pool.query<CollectorAssignmentRow>(
      `SELECT ca.id, ca.collector_id, c.name AS collector_name, ca.subscriber_id,
              s.account_number AS subscriber_account_number,
              concat_ws(' ', s.first_name, s.middle_name, s.last_name) AS subscriber_name,
              ca.collection_area_id, a.name AS collection_area_name, ca.is_active, ca.assigned_at
       FROM collector_assignments ca
       JOIN collectors c ON c.id = ca.collector_id
       JOIN subscribers s ON s.id = ca.subscriber_id
       LEFT JOIN collection_areas a ON a.id = ca.collection_area_id
       ${filters}
       ORDER BY c.name, s.account_number`,
      collectorId ? [collectorId] : [],
    );
    return result.rows.map(toCollectorAssignment);
  }

  async createCollectorAssignments(input: CreateCollectorAssignmentInput): Promise<CollectorAssignment[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const collector = await client.query<{ id: string }>(
        `SELECT id FROM collectors WHERE id = $1 AND is_active = true`,
        [input.collectorId],
      );
      if (collector.rowCount !== 1) throw invalidRequest("The selected collector is unavailable.");
      if (input.collectionAreaId) await assertAreaAvailable(client, input.collectionAreaId);
      for (const subscriberId of input.subscriberIds) {
        await requireSubscriberExists(client, subscriberId);
        await client.query(
          `INSERT INTO collector_assignments (collector_id, subscriber_id, collection_area_id, is_active, assigned_at)
           VALUES ($1, $2, $3, true, now())
           ON CONFLICT (collector_id, subscriber_id)
           DO UPDATE SET collection_area_id = EXCLUDED.collection_area_id, is_active = true, assigned_at = now()`,
          [input.collectorId, subscriberId, input.collectionAreaId ?? null],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.listCollectorAssignments(input.collectorId);
  }

  async removeCollectorAssignment(id: string): Promise<void> {
    const result = await this.pool.query(`DELETE FROM collector_assignments WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw notFound("Collector assignment");
  }

  async listCollectionBatches(query: CollectionBatchListQuery): Promise<CollectionBatchListResponse> {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (query.collectorId) {
      values.push(query.collectorId);
      filters.push(`b.collector_id = $${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      filters.push(`b.status = $${values.length}`);
    }
    if (query.from) {
      values.push(query.from);
      filters.push(`b.route_date >= $${values.length}`);
    }
    if (query.to) {
      values.push(query.to);
      filters.push(`b.route_date <= $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM collection_batches b ${where}`,
      values,
    );
    const offset = (query.page - 1) * query.pageSize;
    const result = await this.pool.query<CollectionBatchRow>(
      `${BATCH_SELECT} ${where} ORDER BY b.route_date DESC, b.created_at DESC LIMIT ${query.pageSize} OFFSET ${offset}`,
      values,
    );
    return {
      batches: result.rows.map((row) => toCollectionBatch(row)),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getCollectionBatch(id: string): Promise<CollectionBatch> {
    const result = await this.pool.query<CollectionBatchRow>(`${BATCH_SELECT} WHERE b.id = $1`, [id]);
    const row = result.rows[0];
    if (!row) throw notFound("Collection batch");
    const accounts = await this.loadBatchAccounts(this.pool, id);
    return toCollectionBatch(row, accounts);
  }

  async createCollectionBatch(input: CreateCollectionBatchInput, actor: DirectoryActor): Promise<CollectionBatch> {
    const client = await this.pool.connect();
    let batchId = "";
    try {
      await client.query("BEGIN");
      const collector = await client.query<{ id: string }>(
        `SELECT id FROM collectors WHERE id = $1 AND is_active = true`,
        [input.collectorId],
      );
      if (collector.rowCount !== 1) throw invalidRequest("The selected collector is unavailable.");
      if (input.collectionAreaId) await assertAreaAvailable(client, input.collectionAreaId);
      const batchNumber = await nextNumber(client, "collection_batch", "BATCH-");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO collection_batches
           (batch_number, collector_id, collection_area_id, route_date, status, notes, opened_by_user_id)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6)
         RETURNING id`,
        [batchNumber, input.collectorId, input.collectionAreaId ?? null, input.routeDate, input.notes ?? null, actor.userId],
      );
      batchId = inserted.rows[0]!.id;
      const assignments = await client.query<{ subscriber_id: string }>(
        `SELECT subscriber_id FROM collector_assignments
         WHERE collector_id = $1 AND is_active = true
           AND ($2::uuid IS NULL OR collection_area_id = $2)
         ORDER BY subscriber_id`,
        [input.collectorId, input.collectionAreaId ?? null],
      );
      let expectedTotal = 0;
      for (const assignment of assignments.rows) {
        const balances = await client.query<{ arrears_cents: string; current_cents: string }>(
          `SELECT
             COALESCE(SUM(CASE WHEN due_date < $2::date THEN balance_cents ELSE 0 END), 0)::text AS arrears_cents,
             COALESCE(SUM(CASE WHEN due_date >= $2::date THEN balance_cents ELSE 0 END), 0)::text AS current_cents
           FROM invoices
           WHERE subscriber_id = $1 AND status IN ('posted', 'partially_paid', 'overdue') AND balance_cents > 0`,
          [assignment.subscriber_id, input.routeDate],
        );
        const arrears = Number(balances.rows[0]?.arrears_cents ?? 0);
        const current = Number(balances.rows[0]?.current_cents ?? 0);
        expectedTotal += arrears + current;
        await client.query(
          `INSERT INTO batch_accounts (batch_id, subscriber_id, current_bill_cents, arrears_cents, expected_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [batchId, assignment.subscriber_id, current, arrears, arrears + current],
        );
      }
      await client.query(`UPDATE collection_batches SET expected_cents = $2, updated_at = now() WHERE id = $1`, [
        batchId,
        expectedTotal,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCollectionBatch(batchId);
  }

  async startCollectionBatch(id: string, _actor: DirectoryActor): Promise<CollectionBatch> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await requireBatchForUpdate(client, id);
      if (row.status !== "OPEN") throw conflict("Only an OPEN batch can be started.");
      await client.query(`UPDATE collection_batches SET status = 'IN_PROGRESS', updated_at = now() WHERE id = $1`, [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCollectionBatch(id);
  }

  async submitCollectionBatch(id: string, _actor: DirectoryActor): Promise<CollectionBatch> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await requireBatchForUpdate(client, id);
      if (row.status !== "IN_PROGRESS") throw conflict("Only an in-progress batch can be submitted.");
      await client.query(
        `UPDATE collection_batches SET status = 'SUBMITTED', submitted_at = now(), updated_at = now() WHERE id = $1`,
        [id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCollectionBatch(id);
  }

  async remitCollectionBatch(
    id: string,
    input: RemitCollectionBatchInput,
    actor: DirectoryActor,
  ): Promise<CollectionBatch> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await requireBatchForUpdate(client, id);
      if (row.status !== "SUBMITTED") throw conflict("Only a submitted batch can be remitted.");
      const collected = row.cash_collected_cents + row.non_cash_collected_cents;
      const difference = collected - input.amountCents;
      await client.query(
        `INSERT INTO collector_remittances (batch_id, amount_cents, reference_number, notes, recorded_by_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, input.amountCents, input.referenceNumber ?? null, input.notes ?? null, actor.userId],
      );
      await client.query(
        `UPDATE collection_batches
         SET status = 'REMITTED', remitted_cents = $2, shortage_cents = $3, overage_cents = $4,
             remitted_at = now(), updated_at = now()
         WHERE id = $1`,
        [id, input.amountCents, Math.max(difference, 0), Math.max(-difference, 0)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCollectionBatch(id);
  }

  async reconcileCollectionBatch(
    id: string,
    input: ReconcileCollectionBatchInput,
    _actor: DirectoryActor,
  ): Promise<CollectionBatch> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await requireBatchForUpdate(client, id);
      if (row.status !== "REMITTED") throw conflict("Only a remitted batch can be reconciled.");
      const note = [row.notes, input.note].filter(Boolean).join(" | ") || null;
      await client.query(
        `UPDATE collection_batches SET status = 'RECONCILED', notes = $2, reconciled_at = now(), updated_at = now()
         WHERE id = $1`,
        [id, note],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCollectionBatch(id);
  }

  async closeCollectionBatch(id: string, actor: DirectoryActor): Promise<CollectionBatch> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await requireBatchForUpdate(client, id);
      if (row.status !== "RECONCILED") throw conflict("Only a reconciled batch can be closed.");
      await client.query(
        `UPDATE collection_batches SET status = 'CLOSED', closed_at = now(), closed_by_user_id = $2, updated_at = now()
         WHERE id = $1`,
        [id, actor.userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCollectionBatch(id);
  }

  async getRouteSheet(id: string): Promise<RouteSheet> {
    const batch = await this.getCollectionBatch(id);
    return { batch, accounts: batch.accounts ?? [] };
  }

  async getCollectorReport(from?: string, to?: string): Promise<CollectorReport> {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (from) {
      values.push(from);
      filters.push(`b.route_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      filters.push(`b.route_date <= $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await this.pool.query<CollectorReportRow>(
      `SELECT c.id AS collector_id, c.name AS collector_name, count(b.id)::text AS batches,
              COALESCE(SUM(b.expected_cents), 0)::text AS expected_cents,
              COALESCE(SUM(b.cash_collected_cents + b.non_cash_collected_cents), 0)::text AS collected_cents,
              COALESCE(SUM(COALESCE(b.remitted_cents, 0)), 0)::text AS remitted_cents,
              COALESCE(SUM(b.shortage_cents), 0)::text AS shortage_cents,
              COALESCE(SUM(b.overage_cents), 0)::text AS overage_cents
       FROM collectors c
       LEFT JOIN collection_batches b ON b.collector_id = c.id ${where}
       GROUP BY c.id, c.name
       ORDER BY c.name`,
      values,
    );
    return {
      from: from ?? null,
      to: to ?? null,
      rows: result.rows.map((row) => ({
        collectorId: row.collector_id,
        collectorName: row.collector_name,
        batches: Number(row.batches),
        expectedCents: Number(row.expected_cents),
        collectedCents: Number(row.collected_cents),
        remittedCents: Number(row.remitted_cents),
        shortageCents: Number(row.shortage_cents),
        overageCents: Number(row.overage_cents),
      })),
    };
  }

  async listInvoiceFacts(filter: DateRange): Promise<InvoiceFact[]> {
    const result = await this.pool.query<InvoiceFactRow>(
      `SELECT i.id, i.invoice_number, i.subscriber_id, i.service_account_id,
              i.issue_date, i.due_date, i.total_cents, i.amount_paid_cents, i.balance_cents, i.status,
              s.account_number AS subscriber_account_number,
              s.last_name || ', ' || s.first_name || COALESCE(' ' || s.middle_name, '') AS subscriber_name,
              p.name AS plan_name, sa.service_type, ca.name AS collection_area_name
       FROM invoices i
       JOIN subscribers s ON s.id = i.subscriber_id
       LEFT JOIN service_accounts sa ON sa.id = i.service_account_id
       LEFT JOIN service_plans p ON p.id = sa.plan_id
       LEFT JOIN collection_areas ca ON ca.id = sa.collection_area_id
       WHERE ($1::date IS NULL OR i.issue_date >= $1::date)
         AND ($2::date IS NULL OR i.issue_date <= $2::date)
       ORDER BY i.issue_date DESC, i.invoice_number`,
      [filter.from ?? null, filter.to ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      subscriberId: row.subscriber_id,
      subscriberAccountNumber: row.subscriber_account_number,
      subscriberName: row.subscriber_name,
      serviceAccountId: row.service_account_id,
      planName: row.plan_name,
      serviceType: row.service_type as InvoiceFact["serviceType"],
      collectionAreaName: row.collection_area_name,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      totalCents: row.total_cents,
      amountPaidCents: row.amount_paid_cents,
      balanceCents: row.balance_cents,
      status: row.status as InvoiceFact["status"],
    }));
  }

  async listPaymentFacts(filter: DateRange): Promise<PaymentFact[]> {
    const result = await this.pool.query<PaymentFactRow>(
      `SELECT p.id, p.receipt_number, p.subscriber_id, p.amount_cents, p.method, p.status,
              p.payment_date, p.collector_id, p.collection_batch_id,
              s.account_number AS subscriber_account_number,
              s.last_name || ', ' || s.first_name || COALESCE(' ' || s.middle_name, '') AS subscriber_name
       FROM payments p
       JOIN subscribers s ON s.id = p.subscriber_id
       WHERE ($1::date IS NULL OR p.payment_date >= $1::date)
         AND ($2::date IS NULL OR p.payment_date < ($2::date + INTERVAL '1 day'))
       ORDER BY p.payment_date DESC`,
      [filter.from ?? null, filter.to ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      subscriberId: row.subscriber_id,
      subscriberAccountNumber: row.subscriber_account_number,
      subscriberName: row.subscriber_name,
      method: row.method as PaymentFact["method"],
      status: row.status as PaymentFact["status"],
      amountCents: row.amount_cents,
      paymentDate: row.payment_date.toISOString(),
      collectorId: row.collector_id,
      collectionBatchId: row.collection_batch_id,
    }));
  }

  async listSubscriberRows(): Promise<SubscriberSummary[]> {
    const result = await this.pool.query<SubscriberRow>(
      `${SUBSCRIBER_SUMMARY_SELECT}
       ${SUBSCRIBER_SUMMARY_GROUP}
       ORDER BY s.account_number`,
    );
    return result.rows.map(toSubscriberSummary);
  }

  async listLedgerFacts(filter: { subscriberId?: string } & DateRange): Promise<LedgerFact[]> {
    const result = await this.pool.query<LedgerFactRow>(
      `SELECT id, subscriber_id, service_account_id, invoice_id, entry_date, entry_type, source_type,
              amount_cents, balance_cents, description, created_at
       FROM ledger_entries
       WHERE ($1::uuid IS NULL OR subscriber_id = $1)
       ORDER BY entry_date ASC, created_at ASC`,
      [filter.subscriberId ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      subscriberId: row.subscriber_id,
      serviceAccountId: row.service_account_id,
      invoiceId: row.invoice_id,
      entryDate: row.entry_date,
      entryType: row.entry_type as LedgerFact["entryType"],
      sourceType: row.source_type,
      amountCents: row.amount_cents,
      balanceCents: row.balance_cents,
      description: row.description,
      createdAt: row.created_at.toISOString(),
    }));
  }

private async loadBatchAccounts(client: Pool | PoolClient, batchId: string): Promise<BatchAccount[]> {
    const result = await client.query<BatchAccountRow>(
      `${BATCH_ACCOUNT_SELECT} WHERE ba.batch_id = $1 ORDER BY subscriber_name`,
      [batchId],
    );
    return result.rows.map(toBatchAccount);
  }

  private async insertPaymentProof(
    client: PoolClient,
    paymentId: string,
    proof: PaymentProofInput,
    actor: DirectoryActor,
  ): Promise<void> {
    const allowed = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
    if (!allowed.has(proof.contentType)) {
      throw invalidRequest("Payment proofs must be a PNG, JPEG, WEBP, or PDF file.");
    }
    const bytes = Buffer.from(proof.contentBase64, "base64");
    if (bytes.byteLength === 0) throw invalidRequest("The payment proof file is empty.");
    if (bytes.byteLength > 5 * 1024 * 1024) throw invalidRequest("Payment proofs cannot exceed 5 MB.");
    const safeName = proof.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "proof";
    const storagePath = `payments/${paymentId}/${randomUUID()}-${safeName}`;
    const absolutePath = path.join(uploadsRoot, storagePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
    await client.query(
      `INSERT INTO payment_proofs (payment_id, file_name, content_type, size_bytes, storage_path, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [paymentId, proof.fileName, proof.contentType, bytes.byteLength, storagePath, actor.userId],
    );
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

  async getAgingReport(asOf?: string): Promise<AgingReport> {
    const reference = asOf ?? new Date().toISOString().slice(0, 10);
    const result = await this.pool.query<OpenInvoiceReportRow>(
      `SELECT i.subscriber_id, i.service_account_id, i.balance_cents,
              GREATEST(($1::date - i.due_date), 0) AS overdue_days,
              s.account_number, s.first_name, s.middle_name, s.last_name
       FROM invoices i
       JOIN subscribers s ON s.id = i.subscriber_id
       WHERE i.status IN ('posted', 'partially_paid', 'overdue') AND i.balance_cents > 0`,
      [reference],
    );
    const rowsBySubscriber = new Map<string, AgingReportRow>();
    for (const row of result.rows) {
      let reportRow = rowsBySubscriber.get(row.subscriber_id);
      if (!reportRow) {
        reportRow = {
          subscriberId: row.subscriber_id,
          subscriberAccountNumber: row.account_number,
          subscriberName: formatSubscriberName(row.first_name, row.middle_name, row.last_name),
          totalBalanceCents: 0,
          currentCents: 0,
          buckets: emptyAgingBuckets(),
        };
        rowsBySubscriber.set(row.subscriber_id, reportRow);
      }
      reportRow.totalBalanceCents += row.balance_cents;
      if (row.overdue_days <= 0) {
        reportRow.currentCents += row.balance_cents;
        continue;
      }
      const bucket = reportRow.buckets[bucketIndexForDays(row.overdue_days)]!;
      bucket.amountCents += row.balance_cents;
      bucket.count += 1;
    }
    const rows = [...rowsBySubscriber.values()].sort(
      (left, right) => right.totalBalanceCents - left.totalBalanceCents,
    );
    return {
      asOf: reference,
      buckets: AGING_BUCKET_DEFINITIONS.map(({ label, minDays, maxDays }) => ({ label, minDays, maxDays })),
      rows,
      totals: {
        totalBalanceCents: rows.reduce((sum, row) => sum + row.totalBalanceCents, 0),
        currentCents: rows.reduce((sum, row) => sum + row.currentCents, 0),
      },
    };
  }

  async getOverdueInvoices(asOf?: string): Promise<OverdueList> {
    const reference = asOf ?? new Date().toISOString().slice(0, 10);
    const result = await this.pool.query<OverdueInvoiceRow>(
      `SELECT i.id, i.invoice_number, i.subscriber_id, i.issue_date, i.due_date,
              i.total_cents, i.amount_paid_cents, i.balance_cents, i.status,
              GREATEST(($1::date - i.due_date), 0) AS overdue_days,
              s.account_number AS subscriber_account_number,
              s.last_name || ', ' || s.first_name || COALESCE(' ' || s.middle_name, '') AS subscriber_name
       FROM invoices i
       JOIN subscribers s ON s.id = i.subscriber_id
       WHERE i.status IN ('posted', 'partially_paid', 'overdue')
         AND i.balance_cents > 0 AND i.due_date < $1::date
       ORDER BY overdue_days DESC, i.due_date ASC, i.issue_date ASC`,
      [reference],
    );
    const invoices = result.rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      subscriberId: row.subscriber_id,
      subscriberAccountNumber: row.subscriber_account_number,
      subscriberName: row.subscriber_name,
      dueDate: row.due_date,
      issueDate: row.issue_date,
      totalCents: row.total_cents,
      amountPaidCents: row.amount_paid_cents,
      balanceCents: row.balance_cents,
      daysOverdue: row.overdue_days,
      status: row.status as Invoice["status"],
    }));
    return {
      asOf: reference,
      invoices,
      totalBalanceCents: invoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0),
      count: invoices.length,
    };
  }

  async getSuspensionCandidates(asOf?: string): Promise<SuspensionList> {
    const reference = asOf ?? new Date().toISOString().slice(0, 10);
    const result = await this.pool.query<OpenInvoiceReportRow>(
      `SELECT i.subscriber_id, i.service_account_id, i.balance_cents,
              GREATEST(($1::date - i.due_date), 0) AS overdue_days,
              s.account_number, s.first_name, s.middle_name, s.last_name,
              sa.account_number AS service_account_number
       FROM invoices i
       JOIN subscribers s ON s.id = i.subscriber_id
       JOIN service_accounts sa ON sa.id = i.service_account_id
       WHERE i.status IN ('posted', 'partially_paid', 'overdue')
         AND i.balance_cents > 0 AND i.due_date < $1::date AND sa.status = 'ACTIVE'`,
      [reference],
    );
    const grouped = new Map<string, SuspensionCandidate>();
    for (const row of result.rows) {
      if (!row.service_account_id) continue;
      let candidate = grouped.get(row.service_account_id);
      if (!candidate) {
        candidate = {
          subscriberId: row.subscriber_id,
          subscriberAccountNumber: row.account_number,
          subscriberName: formatSubscriberName(row.first_name, row.middle_name, row.last_name),
          serviceAccountId: row.service_account_id,
          serviceAccountNumber: row.service_account_number,
          totalOverdueCents: 0,
          oldestOverdueDays: 0,
          invoiceCount: 0,
        };
        grouped.set(row.service_account_id, candidate);
      }
      candidate.totalOverdueCents += row.balance_cents;
      candidate.invoiceCount += 1;
      candidate.oldestOverdueDays = Math.max(candidate.oldestOverdueDays, row.overdue_days);
    }
    const candidates = [...grouped.values()].sort(
      (left, right) =>
        right.oldestOverdueDays - left.oldestOverdueDays || right.totalOverdueCents - left.totalOverdueCents,
    );
    return { asOf: reference, candidates };
  }

  async listSuspensions(serviceAccountId?: string): Promise<ServiceSuspension[]> {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (serviceAccountId) {
      values.push(serviceAccountId);
      filters.push(`service_account_id = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await this.pool.query<ServiceSuspensionRow>(
      `SELECT * FROM service_suspensions ${where} ORDER BY suspended_at DESC, id DESC`,
      values,
    );
    return result.rows.map(toServiceSuspension);
  }

  async suspendServiceAccount(
    serviceAccountId: string,
    input: SuspendServiceAccountInput,
    actor: DirectoryActor,
  ): Promise<ServiceSuspension> {
    const client = await this.pool.connect();
    let suspensionId!: string;
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ status: string; subscriber_id: string }>(
        `SELECT status, subscriber_id FROM service_accounts WHERE id = $1 FOR UPDATE`,
        [serviceAccountId],
      );
      const account = existing.rows[0];
      if (!account) throw notFound("Service account");
      if (account.status === "SUSPENDED") throw conflict("That service account is already suspended.");
      if (account.status !== "ACTIVE") throw invalidRequest("Only active service accounts can be suspended.");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO service_suspensions (service_account_id, subscriber_id, reason, notes, suspended_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [serviceAccountId, account.subscriber_id, input.reason ?? null, input.notes ?? null, actor.userId],
      );
      suspensionId = inserted.rows[0]!.id;
      await client.query(
        `UPDATE service_accounts SET status = 'SUSPENDED', updated_at = now() WHERE id = $1`,
        [serviceAccountId],
      );
      await client.query(
        `INSERT INTO service_events (service_account_id, from_status, to_status, reason, changed_by_user_id)
         VALUES ($1, $2, 'SUSPENDED', $3, $4)`,
        [serviceAccountId, account.status, input.reason ?? "Suspended for non-payment", actor.userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const result = await this.pool.query<ServiceSuspensionRow>(
      `SELECT * FROM service_suspensions WHERE id = $1`,
      [suspensionId],
    );
    return toServiceSuspension(result.rows[0]!);
  }

  async reconnectServiceAccount(
    serviceAccountId: string,
    input: ReconnectServiceAccountInput,
    actor: DirectoryActor,
  ): Promise<ServiceSuspension> {
    const client = await this.pool.connect();
    let suspension!: ServiceSuspensionRow;
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM service_accounts WHERE id = $1 FOR UPDATE`,
        [serviceAccountId],
      );
      const account = existing.rows[0];
      if (!account) throw notFound("Service account");
      const open = await client.query<ServiceSuspensionRow>(
        `SELECT * FROM service_suspensions
         WHERE service_account_id = $1 AND reconnected_at IS NULL
         ORDER BY suspended_at DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [serviceAccountId],
      );
      const openSuspension = open.rows[0];
      if (account.status !== "SUSPENDED" || !openSuspension) {
        throw invalidRequest("That service account is not currently suspended.");
      }
      const updated = await client.query<ServiceSuspensionRow>(
        `UPDATE service_suspensions
         SET reconnected_at = now(), reconnected_by_user_id = $2, reconnection_reason = $3, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [openSuspension.id, actor.userId, input.reason ?? null],
      );
      suspension = updated.rows[0]!;
      await client.query(
        `UPDATE service_accounts SET status = 'ACTIVE', updated_at = now() WHERE id = $1`,
        [serviceAccountId],
      );
      await client.query(
        `INSERT INTO service_events (service_account_id, from_status, to_status, reason, changed_by_user_id)
         VALUES ($1, 'SUSPENDED', 'ACTIVE', $2, $3)`,
        [serviceAccountId, input.reason ?? "Reconnected after payment", actor.userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return toServiceSuspension(suspension);
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

interface AllocateContext {
  paymentId: string;
  subscriberId: string;
  amountCents: number;
  receiptNumber: string;
  entryDate: string;
}

async function allocatePayment(
  client: PoolClient,
  context: AllocateContext,
  actor: DirectoryActor,
): Promise<void> {
  const result = await client.query<AllocatableInvoiceRow>(
    `SELECT id, invoice_number, issue_date, due_date, total_cents, amount_paid_cents, balance_cents, status
     FROM invoices
     WHERE subscriber_id = $1 AND status IN ('posted', 'partially_paid', 'overdue') AND balance_cents > 0
     ORDER BY due_date ASC, issue_date ASC, created_at ASC
     FOR UPDATE`,
    [context.subscriberId],
  );
  let remaining = context.amountCents;
  for (const invoice of result.rows) {
    if (remaining <= 0) break;
    const allocation = Math.min(remaining, invoice.balance_cents);
    if (allocation <= 0) continue;
    await client.query(
      `INSERT INTO payment_allocations (payment_id, invoice_id, amount_cents) VALUES ($1, $2, $3)`,
      [context.paymentId, invoice.id, allocation],
    );
    const amountPaid = invoice.amount_paid_cents + allocation;
    const balance = invoice.balance_cents - allocation;
    const status = balance === 0 ? "paid" : "partially_paid";
    await client.query(
      `UPDATE invoices SET amount_paid_cents = $2, balance_cents = $3, status = $4, updated_at = now() WHERE id = $1`,
      [invoice.id, amountPaid, balance, status],
    );
    remaining -= allocation;
  }
  await postSubscriberLedgerEntry(
    client,
    { subscriberId: context.subscriberId, entryDate: context.entryDate },
    actor,
    "credit",
    "payment",
    context.amountCents,
    `Payment ${context.receiptNumber}`,
  );
}

async function postSubscriberLedgerEntry(
  client: PoolClient,
  context: { subscriberId: string; entryDate: string },
  actor: DirectoryActor,
  entryType: "debit" | "credit",
  sourceType: "payment" | "reversal",
  amountCents: number,
  description: string,
): Promise<void> {
  const balanceResult = await client.query<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS balance
     FROM ledger_entries WHERE subscriber_id = $1`,
    [context.subscriberId],
  );
  const previous = Number(balanceResult.rows[0]?.balance ?? 0);
  const delta = entryType === "debit" ? amountCents : -amountCents;
  await client.query(
    `INSERT INTO ledger_entries
       (subscriber_id, service_account_id, invoice_id, entry_date, entry_type, source_type, amount_cents, balance_cents, description, created_by_user_id)
     VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6, $7, $8)`,
    [
      context.subscriberId,
      context.entryDate,
      entryType,
      sourceType,
      amountCents,
      previous + delta,
      description,
      actor.userId,
    ],
  );
}

async function assertUniqueGcashReference(
  client: PoolClient,
  referenceNumber: string,
  excludePaymentId: string | null,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM payments
     WHERE method = 'gcash' AND reference_number = $1
       AND status NOT IN ('rejected', 'reversed')
       AND ($2::uuid IS NULL OR id <> $2::uuid)
     LIMIT 1`,
    [referenceNumber, excludePaymentId],
  );
  if (result.rowCount) {
    throw conflict("A GCash payment with that reference number has already been recorded.");
  }
}

async function requireBatchForUpdate(client: PoolClient, id: string): Promise<CollectionBatchRow> {
  const lock = await client.query<{ id: string }>(
    `SELECT id FROM collection_batches WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!lock.rows[0]) throw notFound("Collection batch");
  const result = await client.query<CollectionBatchRow>(`${BATCH_SELECT} WHERE b.id = $1`, [id]);
  return result.rows[0]!;
}

async function applyPaymentToBatch(
  client: PoolClient,
  batchId: string,
  subscriberId: string,
  amountCents: number,
  method: string,
): Promise<void> {
  const cash = method === "cash" ? amountCents : 0;
  const nonCash = amountCents - cash;
  await client.query(
    `UPDATE collection_batches
     SET cash_collected_cents = cash_collected_cents + $2,
         non_cash_collected_cents = non_cash_collected_cents + $3,
         updated_at = now()
     WHERE id = $1`,
    [batchId, cash, nonCash],
  );
  await client.query(
    `UPDATE batch_accounts
     SET collected_cents = collected_cents + $3,
         status = CASE
           WHEN expected_cents > 0 AND collected_cents + $3 >= expected_cents THEN 'COLLECTED'
           WHEN collected_cents + $3 > 0 THEN 'PARTIAL'
           ELSE status
         END,
         updated_at = now()
     WHERE batch_id = $1 AND subscriber_id = $2`,
    [batchId, subscriberId, amountCents],
  );
}

async function reversePaymentFromBatch(
  client: PoolClient,
  batchId: string,
  subscriberId: string,
  amountCents: number,
  method: string,
): Promise<void> {
  const cash = method === "cash" ? amountCents : 0;
  const nonCash = amountCents - cash;
  await client.query(
    `UPDATE collection_batches
     SET cash_collected_cents = GREATEST(cash_collected_cents - $2, 0),
         non_cash_collected_cents = GREATEST(non_cash_collected_cents - $3, 0),
         updated_at = now()
     WHERE id = $1`,
    [batchId, cash, nonCash],
  );
  await client.query(
    `UPDATE batch_accounts
     SET collected_cents = GREATEST(collected_cents - $3, 0),
         status = CASE
           WHEN expected_cents > 0 AND GREATEST(collected_cents - $3, 0) >= expected_cents THEN 'COLLECTED'
           WHEN GREATEST(collected_cents - $3, 0) > 0 THEN 'PARTIAL'
           ELSE 'PENDING'
         END,
         updated_at = now()
     WHERE batch_id = $1 AND subscriber_id = $2`,
    [batchId, subscriberId, amountCents],
  );
}

function buildAllocationPreview(
  subscriberId: string,
  amountCents: number,
  invoices: AllocatableInvoiceRow[],
): AllocationPreview {
  let remaining = amountCents;
  const allocations: AllocationPreview["allocations"] = [];
  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const allocation = Math.min(remaining, invoice.balance_cents);
    if (allocation <= 0) continue;
    allocations.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      balanceCents: invoice.balance_cents,
      amountCents: allocation,
    });
    remaining -= allocation;
  }
  return {
    subscriberId,
    amountCents,
    allocatedCents: amountCents - remaining,
    unallocatedCents: remaining,
    allocations,
  };
}

