export type { AgingReport, OverdueList, SuspensionList, ServiceSuspension, SuspendServiceAccountInput, ReconnectServiceAccountInput, BillingGenerationResult } from "@bcis/shared";
export type { DateRange, InvoiceFact, PaymentFact, LedgerFact, ReportDataSource } from "../reports/types.js";
import type { DateRange, InvoiceFact, PaymentFact, LedgerFact } from "../reports/types.js";
import type {
  AllocationPreview,
  AllocationPreviewInput,
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
  InvoiceListQuery,
  InvoiceListResponse,
  LedgerEntryListQuery,
  LedgerEntryListResponse,
  Payment,
  PaymentListQuery,
  PaymentListResponse,
  ReconcileCollectionBatchInput,
  RemitCollectionBatchInput,
  ReversePaymentInput,
  RouteSheet,
  ServiceAccountDetail,
  ServiceAccountListQuery,
  ServiceAccountListResponse,
  ServicePlan,
  SubscriberDetail,
  SubscriberListQuery,
  SubscriberListResponse,
  UpdateCollectorInput,
  UpdateInvoiceInput,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
  VerifyPaymentInput,
  AgingReport,
  OverdueList,
  SuspensionList,
  ServiceSuspension,
  SuspendServiceAccountInput,
  ReconnectServiceAccountInput,
  BillingGenerationResult,
} from "@bcis/shared";

export class CatalogError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message);
    this.name = "CatalogError";
  }
}

export const notFound = (resource: string) => new CatalogError(`${resource} was not found.`, 404, "not_found");
export const invalidRequest = (message: string) => new CatalogError(message, 400, "invalid_request");
export const conflict = (message: string) => new CatalogError(message, 409, "conflict");

export interface DirectoryActor {
  userId: string | null;
  displayName: string;
}

export interface DirectoryStore {
  listPlans(includeInactive: boolean): Promise<ServicePlan[]>;
  createPlan(input: CreatePlanInput): Promise<ServicePlan>;
  updatePlan(id: string, input: UpdatePlanInput): Promise<ServicePlan>;

  listCollectionAreas(): Promise<CollectionArea[]>;
  createCollectionArea(input: CreateCollectionAreaInput): Promise<CollectionArea>;

  listSubscribers(query: SubscriberListQuery): Promise<SubscriberListResponse>;
  getSubscriber(id: string): Promise<SubscriberDetail | null>;
  createSubscriber(input: CreateSubscriberInput): Promise<SubscriberDetail>;
  updateSubscriber(id: string, input: UpdateSubscriberInput): Promise<SubscriberDetail>;

  listServiceAccounts(query: ServiceAccountListQuery): Promise<ServiceAccountListResponse>;
  getServiceAccount(id: string): Promise<ServiceAccountDetail | null>;
  createServiceAccount(subscriberId: string, input: CreateServiceAccountInput, actor: DirectoryActor): Promise<ServiceAccountDetail>;
  updateServiceAccount(id: string, input: UpdateServiceAccountInput, actor: DirectoryActor): Promise<ServiceAccountDetail>;

listInvoices(query: InvoiceListQuery): Promise<InvoiceListResponse>;
  getInvoice(id: string): Promise<Invoice | null>;
  createInvoice(input: CreateInvoiceInput, actor: DirectoryActor): Promise<Invoice>;
  updateInvoice(id: string, input: UpdateInvoiceInput, actor: DirectoryActor): Promise<Invoice>;
  generateInvoices(input: GenerateBillingInput, actor: DirectoryActor): Promise<BillingGenerationResult>;
  listLedgerEntries(query: LedgerEntryListQuery): Promise<LedgerEntryListResponse>;

previewAllocation(input: AllocationPreviewInput): Promise<AllocationPreview>;
  listPayments(query: PaymentListQuery): Promise<PaymentListResponse>;
  getPayment(id: string): Promise<Payment | null>;
  createPayment(input: CreatePaymentInput, actor: DirectoryActor): Promise<Payment>;
  verifyPayment(id: string, input: VerifyPaymentInput, actor: DirectoryActor): Promise<Payment>;
  reversePayment(id: string, input: ReversePaymentInput, actor: DirectoryActor): Promise<Payment>;

  listCollectors(includeInactive: boolean): Promise<Collector[]>;
  createCollector(input: CreateCollectorInput): Promise<Collector>;
  updateCollector(id: string, input: UpdateCollectorInput): Promise<Collector>;

  listCollectorAssignments(collectorId?: string): Promise<CollectorAssignment[]>;
  createCollectorAssignments(input: CreateCollectorAssignmentInput): Promise<CollectorAssignment[]>;
  removeCollectorAssignment(id: string): Promise<void>;

  listCollectionBatches(query: CollectionBatchListQuery): Promise<CollectionBatchListResponse>;
  getCollectionBatch(id: string): Promise<CollectionBatch>;
  createCollectionBatch(input: CreateCollectionBatchInput, actor: DirectoryActor): Promise<CollectionBatch>;
  startCollectionBatch(id: string, actor: DirectoryActor): Promise<CollectionBatch>;
  submitCollectionBatch(id: string, actor: DirectoryActor): Promise<CollectionBatch>;
  remitCollectionBatch(id: string, input: RemitCollectionBatchInput, actor: DirectoryActor): Promise<CollectionBatch>;
  reconcileCollectionBatch(
    id: string,
    input: ReconcileCollectionBatchInput,
    actor: DirectoryActor,
  ): Promise<CollectionBatch>;
  closeCollectionBatch(id: string, actor: DirectoryActor): Promise<CollectionBatch>;
  getRouteSheet(id: string): Promise<RouteSheet>;
  getCollectorReport(from?: string, to?: string): Promise<CollectorReport>;
  getAgingReport(asOf?: string): Promise<AgingReport>;
  getOverdueInvoices(asOf?: string, pageSize?: number): Promise<OverdueList>;
  getSuspensionCandidates(asOf?: string): Promise<SuspensionList>;
  listSuspensions(serviceAccountId?: string): Promise<ServiceSuspension[]>;
  suspendServiceAccount(id: string, input: SuspendServiceAccountInput, actor: DirectoryActor): Promise<ServiceSuspension>;
  reconnectServiceAccount(id: string, input: ReconnectServiceAccountInput, actor: DirectoryActor): Promise<ServiceSuspension>;

  listInvoiceFacts(filter: DateRange): Promise<InvoiceFact[]>;
  listPaymentFacts(filter: DateRange): Promise<PaymentFact[]>;
  listSubscriberRows(): Promise<import("@bcis/shared").SubscriberSummary[]>;
  listLedgerFacts(filter: { subscriberId?: string } & DateRange): Promise<LedgerFact[]>;
}
