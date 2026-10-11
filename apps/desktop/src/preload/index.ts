import { contextBridge, ipcRenderer } from "electron";
import type {
  AgingReport,
  AllocationPreview,
  AllocationPreviewInput,
  AuthUser,
  BillingGenerationResult,
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
  Dashboard,
  DesktopAdminResult,
  DesktopApiHealth,
  DesktopAuthResult,
  DesktopResult,
  GenerateBillingInput,
  InvoiceListResponse,
  InvoiceStatus,
  LedgerEntryListResponse,
  ManagedUser,
  OverdueList,
  PaymentListResponse,
  PaymentMethod,
  PaymentStatus,
  ReconcileCollectionBatchInput,
  ReconnectServiceAccountInput,
  RemitCollectionBatchInput,
  Report,
  ReportCatalog,
  ReportExportFormat,
  ReversePaymentInput,
  RouteSheet,
  ServiceAccountDetail,
  ServiceAccountListResponse,
  ServiceAccountStatus,
  ServicePlan,
  ServiceSuspension,
  SubscriberDetail,
  SubscriberListResponse,
  SubscriberStatus,
  SuspensionList,
  SuspendServiceAccountInput,
  UpdateCollectorInput,
  UpdateInvoiceInput,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
  VerifyPaymentInput,
} from "@bcis/shared";

contextBridge.exposeInMainWorld("bcis", {
  getApiHealth: (): Promise<DesktopApiHealth> => ipcRenderer.invoke("bcis:get-api-health"),
  getSession: (): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string } | null> =>
    ipcRenderer.invoke("bcis:get-session"),
  login: (username: string, password: string): Promise<DesktopAuthResult> =>
    ipcRenderer.invoke("bcis:login", { username, password }),
  logout: (): Promise<{ ok: true } | { ok: false; message: string }> =>
    ipcRenderer.invoke("bcis:logout"),
  listAdminUsers: (): Promise<DesktopAdminResult<ManagedUser[]>> =>
    ipcRenderer.invoke("bcis:admin-list-users"),
  listAdminRoles: (): Promise<DesktopAdminResult<string[]>> =>
    ipcRenderer.invoke("bcis:admin-list-roles"),
  createAdminUser: (input: {
    username: string;
    displayName: string;
    password: string;
    role: string;
  }): Promise<DesktopAdminResult<ManagedUser>> => ipcRenderer.invoke("bcis:admin-create-user", input),
  listPlans: (includeInactive = false): Promise<DesktopResult<{ plans: ServicePlan[] }>> =>
    ipcRenderer.invoke("bcis:list-plans", includeInactive),
  createPlan: (input: CreatePlanInput): Promise<DesktopResult<{ plan: ServicePlan }>> =>
    ipcRenderer.invoke("bcis:create-plan", input),
  updatePlan: (id: string, input: UpdatePlanInput): Promise<DesktopResult<{ plan: ServicePlan }>> =>
    ipcRenderer.invoke("bcis:update-plan", { id, input }),
  listCollectionAreas: (): Promise<DesktopResult<{ areas: CollectionArea[] }>> =>
    ipcRenderer.invoke("bcis:list-collection-areas"),
  createCollectionArea: (input: CreateCollectionAreaInput): Promise<DesktopResult<{ area: CollectionArea }>> =>
    ipcRenderer.invoke("bcis:create-collection-area", input),
  listSubscribers: (params?: {
    query?: string;
    status?: SubscriberStatus;
    collectionAreaId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DesktopResult<SubscriberListResponse>> => ipcRenderer.invoke("bcis:list-subscribers", params),
  getSubscriber: (id: string): Promise<DesktopResult<{ subscriber: SubscriberDetail }>> =>
    ipcRenderer.invoke("bcis:get-subscriber", id),
  createSubscriber: (input: CreateSubscriberInput): Promise<DesktopResult<{ subscriber: SubscriberDetail }>> =>
    ipcRenderer.invoke("bcis:create-subscriber", input),
  updateSubscriber: (
    id: string,
    input: UpdateSubscriberInput,
  ): Promise<DesktopResult<{ subscriber: SubscriberDetail }>> =>
    ipcRenderer.invoke("bcis:update-subscriber", { id, input }),
  listServiceAccounts: (params?: {
    query?: string;
    status?: ServiceAccountStatus;
    page?: number;
    pageSize?: number;
  }): Promise<DesktopResult<ServiceAccountListResponse>> => ipcRenderer.invoke("bcis:list-service-accounts", params),
  getServiceAccount: (id: string): Promise<DesktopResult<{ serviceAccount: ServiceAccountDetail }>> =>
    ipcRenderer.invoke("bcis:get-service-account", id),
  createServiceAccount: (
    subscriberId: string,
    input: CreateServiceAccountInput,
  ): Promise<DesktopResult<{ serviceAccount: ServiceAccountDetail }>> =>
    ipcRenderer.invoke("bcis:create-service-account", { id: subscriberId, input }),
  updateServiceAccount: (
    id: string,
    input: UpdateServiceAccountInput,
  ): Promise<DesktopResult<{ serviceAccount: ServiceAccountDetail }>> =>
    ipcRenderer.invoke("bcis:update-service-account", { id, input }),
  listInvoices: (params?: {
    query?: string;
    status?: InvoiceStatus;
    subscriberId?: string;
    serviceAccountId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DesktopResult<InvoiceListResponse>> => ipcRenderer.invoke("bcis:list-invoices", params),
  getInvoice: (id: string): Promise<DesktopResult<{ invoice: InvoiceListResponse["invoices"][number] }>> =>
    ipcRenderer.invoke("bcis:get-invoice", id),
  createInvoice: (input: CreateInvoiceInput): Promise<DesktopResult<{ invoice: InvoiceListResponse["invoices"][number] }>> =>
    ipcRenderer.invoke("bcis:create-invoice", input),
  updateInvoice: (
    id: string,
    input: UpdateInvoiceInput,
  ): Promise<DesktopResult<{ invoice: InvoiceListResponse["invoices"][number] }>> =>
    ipcRenderer.invoke("bcis:update-invoice", { id, input }),
  generateBilling: (input: GenerateBillingInput): Promise<DesktopResult<BillingGenerationResult>> =>
    ipcRenderer.invoke("bcis:generate-billing", input),
  listLedgerEntries: (params?: {
    subscriberId?: string;
    invoiceId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DesktopResult<LedgerEntryListResponse>> => ipcRenderer.invoke("bcis:list-ledger", params),
  listPayments: (params?: {
    query?: string;
    status?: PaymentStatus;
    method?: PaymentMethod;
    subscriberId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DesktopResult<PaymentListResponse>> => ipcRenderer.invoke("bcis:list-payments", params),
  getPayment: (id: string): Promise<DesktopResult<{ payment: PaymentListResponse["payments"][number] }>> =>
    ipcRenderer.invoke("bcis:get-payment", id),
  previewAllocation: (input: AllocationPreviewInput): Promise<DesktopResult<AllocationPreview>> =>
    ipcRenderer.invoke("bcis:preview-allocation", input),
  createPayment: (input: CreatePaymentInput): Promise<DesktopResult<{ payment: PaymentListResponse["payments"][number] }>> =>
    ipcRenderer.invoke("bcis:create-payment", input),
  verifyPayment: (
    id: string,
    input: VerifyPaymentInput,
  ): Promise<DesktopResult<{ payment: PaymentListResponse["payments"][number] }>> =>
    ipcRenderer.invoke("bcis:verify-payment", { id, input }),
  reversePayment: (
    id: string,
    input: ReversePaymentInput,
  ): Promise<DesktopResult<{ payment: PaymentListResponse["payments"][number] }>> =>
    ipcRenderer.invoke("bcis:reverse-payment", { id, input }),
  listCollectors: (includeInactive?: boolean): Promise<DesktopResult<{ collectors: Collector[] }>> =>
    ipcRenderer.invoke("bcis:list-collectors", includeInactive),
  createCollector: (input: CreateCollectorInput): Promise<DesktopResult<{ collector: Collector }>> =>
    ipcRenderer.invoke("bcis:create-collector", input),
  updateCollector: (id: string, input: UpdateCollectorInput): Promise<DesktopResult<{ collector: Collector }>> =>
    ipcRenderer.invoke("bcis:update-collector", { id, input }),
  listCollectorAssignments: (collectorId?: string): Promise<DesktopResult<{ assignments: CollectorAssignment[] }>> =>
    ipcRenderer.invoke("bcis:list-collector-assignments", collectorId),
  createCollectorAssignments: (
    input: CreateCollectorAssignmentInput,
  ): Promise<DesktopResult<{ assignments: CollectorAssignment[] }>> =>
    ipcRenderer.invoke("bcis:create-collector-assignments", input),
  removeCollectorAssignment: (id: string): Promise<DesktopResult<{ removed: boolean }>> =>
    ipcRenderer.invoke("bcis:remove-collector-assignment", id),
  listCollectionBatches: (
    params?: CollectionBatchListQuery,
  ): Promise<DesktopResult<CollectionBatchListResponse>> =>
    ipcRenderer.invoke("bcis:list-collection-batches", params),
  getCollectionBatch: (id: string): Promise<DesktopResult<{ batch: CollectionBatch }>> =>
    ipcRenderer.invoke("bcis:get-collection-batch", id),
  createCollectionBatch: (input: CreateCollectionBatchInput): Promise<DesktopResult<{ batch: CollectionBatch }>> =>
    ipcRenderer.invoke("bcis:create-collection-batch", input),
  startCollectionBatch: (id: string): Promise<DesktopResult<{ batch: CollectionBatch }>> =>
    ipcRenderer.invoke("bcis:start-collection-batch", id),
  submitCollectionBatch: (id: string): Promise<DesktopResult<{ batch: CollectionBatch }>> =>
    ipcRenderer.invoke("bcis:submit-collection-batch", id),
  remitCollectionBatch: (
    id: string,
    input: RemitCollectionBatchInput,
  ): Promise<DesktopResult<{ batch: CollectionBatch }>> =>
    ipcRenderer.invoke("bcis:remit-collection-batch", { id, input }),
  reconcileCollectionBatch: (
    id: string,
    input: ReconcileCollectionBatchInput,
  ): Promise<DesktopResult<{ batch: CollectionBatch }>> =>
    ipcRenderer.invoke("bcis:reconcile-collection-batch", { id, input }),
  closeCollectionBatch: (id: string): Promise<DesktopResult<{ batch: CollectionBatch }>> =>
    ipcRenderer.invoke("bcis:close-collection-batch", { id, input: { confirm: true } }),
  getRouteSheet: (id: string): Promise<DesktopResult<RouteSheet>> =>
    ipcRenderer.invoke("bcis:get-route-sheet", id),
  getCollectorReport: (params?: { from?: string; to?: string }): Promise<DesktopResult<CollectorReport>> =>
    ipcRenderer.invoke("bcis:get-collector-report", params),
  getAgingReport: (params?: { from?: string }): Promise<DesktopResult<AgingReport>> =>
    ipcRenderer.invoke("bcis:get-aging-report", params),
  getOverdueInvoices: (params?: { from?: string }): Promise<DesktopResult<OverdueList>> =>
    ipcRenderer.invoke("bcis:get-overdue-invoices", params),
  listSuspensionCandidates: (params?: { from?: string }): Promise<DesktopResult<SuspensionList>> =>
    ipcRenderer.invoke("bcis:list-suspension-candidates", params),
  listSuspensions: (serviceAccountId?: string): Promise<DesktopResult<{ suspensions: ServiceSuspension[] }>> =>
    ipcRenderer.invoke("bcis:list-suspensions", serviceAccountId),
  suspendServiceAccount: (
    id: string,
    input: SuspendServiceAccountInput,
  ): Promise<DesktopResult<{ suspension: ServiceSuspension }>> =>
    ipcRenderer.invoke("bcis:suspend-service-account", { id, input }),
  reconnectServiceAccount: (
    id: string,
    input: ReconnectServiceAccountInput,
  ): Promise<DesktopResult<{ suspension: ServiceSuspension }>> =>
    ipcRenderer.invoke("bcis:reconnect-service-account", { id, input }),
  listReports: (): Promise<DesktopResult<ReportCatalog>> => ipcRenderer.invoke("bcis:list-reports"),
  getDashboard: (params?: { asOf?: string }): Promise<DesktopResult<Dashboard>> =>
    ipcRenderer.invoke("bcis:get-dashboard", params),
  getReport: (key: string, params?: Record<string, string>): Promise<DesktopResult<Report>> =>
    ipcRenderer.invoke("bcis:get-report", { key, params }),
  exportReport: (
    key: string,
    format: ReportExportFormat,
    params?: Record<string, string>,
  ): Promise<DesktopResult<{ canceled: boolean; filePath: string | null }>> =>
    ipcRenderer.invoke("bcis:export-report", { key, format, params }),
});
