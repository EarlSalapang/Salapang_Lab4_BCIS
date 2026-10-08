import type {
  AllocationPreview,
  AllocationPreviewInput,
  CollectionArea,
  CreateCollectionAreaInput,
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
  ReversePaymentInput,
  ServiceAccountDetail,
  ServiceAccountListQuery,
  ServiceAccountListResponse,
  ServicePlan,
  SubscriberDetail,
  SubscriberListQuery,
  SubscriberListResponse,
  UpdateInvoiceInput,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
  VerifyPaymentInput,
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
}

export interface BillingGenerationResult {
  created: Invoice[];
  skipped: number;
}
