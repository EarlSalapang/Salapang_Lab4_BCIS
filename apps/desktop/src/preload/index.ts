import { contextBridge, ipcRenderer } from "electron";
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
});
