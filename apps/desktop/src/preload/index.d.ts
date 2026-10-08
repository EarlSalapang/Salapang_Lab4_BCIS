import type {
  AuthUser,
  BillingGenerationResult,
  CollectionArea,
  CreateCollectionAreaInput,
  CreateInvoiceInput,
  CreatePlanInput,
  CreateServiceAccountInput,
  CreateSubscriberInput,
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
  ServiceAccountDetail,
  ServiceAccountListResponse,
  ServiceAccountStatus,
  ServicePlan,
  SubscriberDetail,
  SubscriberListResponse,
  SubscriberStatus,
  UpdateInvoiceInput,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
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
    };
  }
}
