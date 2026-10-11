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
  Invoice,
  InvoiceListResponse,
  InvoiceStatus,
  LedgerEntryListResponse,
  ManagedUser,
  OverdueList,
  Payment,
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

declare global {
  interface Window {
    bcis: {
      getApiHealth: () => Promise<DesktopApiHealth>;
      getSession: () => Promise<{ ok: true; user: AuthUser } | { ok: false; message: string } | null>;
      login: (username: string, password: string) => Promise<DesktopAuthResult>;
      logout: () => Promise<{ ok: true } | { ok: false; message: string }>;
      listAdminUsers: () => Promise<DesktopAdminResult<ManagedUser[]>>;
      listAdminRoles: () => Promise<DesktopAdminResult<string[]>>;
      createAdminUser: (input: {
        username: string;
        displayName: string;
        password: string;
        role: string;
      }) => Promise<DesktopAdminResult<ManagedUser>>;
      listPlans: (includeInactive?: boolean) => Promise<DesktopResult<{ plans: ServicePlan[] }>>;
      createPlan: (input: CreatePlanInput) => Promise<DesktopResult<{ plan: ServicePlan }>>;
      updatePlan: (id: string, input: UpdatePlanInput) => Promise<DesktopResult<{ plan: ServicePlan }>>;
      listCollectionAreas: () => Promise<DesktopResult<{ areas: CollectionArea[] }>>;
      createCollectionArea: (input: CreateCollectionAreaInput) => Promise<DesktopResult<{ area: CollectionArea }>>;
      listSubscribers: (params?: {
        query?: string;
        status?: SubscriberStatus;
        collectionAreaId?: string;
        page?: number;
        pageSize?: number;
      }) => Promise<DesktopResult<SubscriberListResponse>>;
      getSubscriber: (id: string) => Promise<DesktopResult<{ subscriber: SubscriberDetail }>>;
      createSubscriber: (input: CreateSubscriberInput) => Promise<DesktopResult<{ subscriber: SubscriberDetail }>>;
      updateSubscriber: (
        id: string,
        input: UpdateSubscriberInput,
      ) => Promise<DesktopResult<{ subscriber: SubscriberDetail }>>;
      listServiceAccounts: (params?: {
        query?: string;
        status?: ServiceAccountStatus;
        page?: number;
        pageSize?: number;
      }) => Promise<DesktopResult<ServiceAccountListResponse>>;
      getServiceAccount: (id: string) => Promise<DesktopResult<{ serviceAccount: ServiceAccountDetail }>>;
      createServiceAccount: (
        subscriberId: string,
        input: CreateServiceAccountInput,
      ) => Promise<DesktopResult<{ serviceAccount: ServiceAccountDetail }>>;
      updateServiceAccount: (
        id: string,
        input: UpdateServiceAccountInput,
      ) => Promise<DesktopResult<{ serviceAccount: ServiceAccountDetail }>>;
      listInvoices: (params?: {
        query?: string;
        status?: InvoiceStatus;
        subscriberId?: string;
        serviceAccountId?: string;
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
      }) => Promise<DesktopResult<InvoiceListResponse>>;
      getInvoice: (id: string) => Promise<DesktopResult<{ invoice: Invoice }>>;
      createInvoice: (input: CreateInvoiceInput) => Promise<DesktopResult<{ invoice: Invoice }>>;
      updateInvoice: (id: string, input: UpdateInvoiceInput) => Promise<DesktopResult<{ invoice: Invoice }>>;
      generateBilling: (input: GenerateBillingInput) => Promise<DesktopResult<BillingGenerationResult>>;
      listLedgerEntries: (params?: {
        subscriberId?: string;
        invoiceId?: string;
        page?: number;
        pageSize?: number;
      }) => Promise<DesktopResult<LedgerEntryListResponse>>;
      listPayments: (params?: {
        query?: string;
        status?: PaymentStatus;
        method?: PaymentMethod;
        subscriberId?: string;
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
      }) => Promise<DesktopResult<PaymentListResponse>>;
      getPayment: (id: string) => Promise<DesktopResult<{ payment: Payment }>>;
      previewAllocation: (input: AllocationPreviewInput) => Promise<DesktopResult<AllocationPreview>>;
      createPayment: (input: CreatePaymentInput) => Promise<DesktopResult<{ payment: Payment }>>;
      verifyPayment: (id: string, input: VerifyPaymentInput) => Promise<DesktopResult<{ payment: Payment }>>;
      reversePayment: (id: string, input: ReversePaymentInput) => Promise<DesktopResult<{ payment: Payment }>>;
      listCollectors: (includeInactive?: boolean) => Promise<DesktopResult<{ collectors: Collector[] }>>;
      createCollector: (input: CreateCollectorInput) => Promise<DesktopResult<{ collector: Collector }>>;
      updateCollector: (id: string, input: UpdateCollectorInput) => Promise<DesktopResult<{ collector: Collector }>>;
      listCollectorAssignments: (collectorId?: string) => Promise<DesktopResult<{ assignments: CollectorAssignment[] }>>;
      createCollectorAssignments: (
        input: CreateCollectorAssignmentInput,
      ) => Promise<DesktopResult<{ assignments: CollectorAssignment[] }>>;
      removeCollectorAssignment: (id: string) => Promise<DesktopResult<{ removed: boolean }>>;
      listCollectionBatches: (params?: CollectionBatchListQuery) => Promise<DesktopResult<CollectionBatchListResponse>>;
      getCollectionBatch: (id: string) => Promise<DesktopResult<{ batch: CollectionBatch }>>;
      createCollectionBatch: (input: CreateCollectionBatchInput) => Promise<DesktopResult<{ batch: CollectionBatch }>>;
      startCollectionBatch: (id: string) => Promise<DesktopResult<{ batch: CollectionBatch }>>;
      submitCollectionBatch: (id: string) => Promise<DesktopResult<{ batch: CollectionBatch }>>;
      remitCollectionBatch: (
        id: string,
        input: RemitCollectionBatchInput,
      ) => Promise<DesktopResult<{ batch: CollectionBatch }>>;
      reconcileCollectionBatch: (
        id: string,
        input: ReconcileCollectionBatchInput,
      ) => Promise<DesktopResult<{ batch: CollectionBatch }>>;
      closeCollectionBatch: (id: string) => Promise<DesktopResult<{ batch: CollectionBatch }>>;
      getRouteSheet: (id: string) => Promise<DesktopResult<RouteSheet>>;
      getCollectorReport: (params?: { from?: string; to?: string }) => Promise<DesktopResult<CollectorReport>>;
      getAgingReport: (params?: { from?: string }) => Promise<DesktopResult<AgingReport>>;
      getOverdueInvoices: (params?: { from?: string }) => Promise<DesktopResult<OverdueList>>;
      listSuspensionCandidates: (params?: { from?: string }) => Promise<DesktopResult<SuspensionList>>;
      listSuspensions: (serviceAccountId?: string) => Promise<DesktopResult<{ suspensions: ServiceSuspension[] }>>;
      suspendServiceAccount: (
        id: string,
        input: SuspendServiceAccountInput,
      ) => Promise<DesktopResult<{ suspension: ServiceSuspension }>>;
      reconnectServiceAccount: (
        id: string,
        input: ReconnectServiceAccountInput,
      ) => Promise<DesktopResult<{ suspension: ServiceSuspension }>>;
      listReports: () => Promise<DesktopResult<ReportCatalog>>;
      getDashboard: (params?: { asOf?: string }) => Promise<DesktopResult<Dashboard>>;
      getReport: (key: string, params?: Record<string, string>) => Promise<DesktopResult<Report>>;
      exportReport: (
        key: string,
        format: ReportExportFormat,
        params?: Record<string, string>,
      ) => Promise<DesktopResult<{ canceled: boolean; filePath: string | null }>>;
    };
  }
}
