import type {
  AuthUser,
  CollectionArea,
  CreateCollectionAreaInput,
  CreatePlanInput,
  CreateServiceAccountInput,
  CreateSubscriberInput,
  DesktopAdminResult,
  DesktopApiHealth,
  DesktopAuthResult,
  DesktopResult,
  ManagedUser,
  ServiceAccountDetail,
  ServiceAccountListResponse,
  ServiceAccountStatus,
  ServicePlan,
  SubscriberDetail,
  SubscriberListResponse,
  SubscriberStatus,
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
    };
  }
}
