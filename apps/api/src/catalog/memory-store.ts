import { randomUUID } from "node:crypto";
import type {
  CollectionArea,
  CreateCollectionAreaInput,
  CreatePlanInput,
  CreateServiceAccountInput,
  CreateSubscriberInput,
  ServiceAccountDetail,
  ServiceAccountListQuery,
  ServiceAccountListResponse,
  ServiceAccountSummary,
  ServicePlan,
  SubscriberDetail,
  SubscriberListQuery,
  SubscriberListResponse,
  SubscriberSummary,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
} from "@bcis/shared";

import type { AuthStore } from "../auth/types.js";
import { conflict, invalidRequest, notFound, type DirectoryActor, type DirectoryStore } from "./types.js";

export class MemoryDirectoryStore implements DirectoryStore {
  private readonly plans = new Map<string, ServicePlan>();
  private readonly areas = new Map<string, CollectionArea>();
  private readonly subscribers = new Map<string, SubscriberDetail>();
  private readonly serviceAccounts = new Map<string, ServiceAccountDetail>();
  private readonly counters = new Map<string, number>();

  private nextNumber(name: string, prefix: string): string {
    const value = (this.counters.get(name) ?? 0) + 1;
    this.counters.set(name, value);
    return `${prefix}${String(value).padStart(6, "0")}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  async listPlans(includeInactive: boolean): Promise<ServicePlan[]> {
    return [...this.plans.values()]
      .filter((plan) => includeInactive || plan.isActive)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async createPlan(input: CreatePlanInput): Promise<ServicePlan> {
    if ([...this.plans.values()].some((plan) => plan.code === input.code)) {
      throw conflict("A service plan with that code already exists.");
    }
    const plan: ServicePlan = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      serviceType: input.serviceType,
      monthlyPriceCents: input.monthlyPriceCents,
      installationFeeCents: input.installationFeeCents,
      reconnectionFeeCents: input.reconnectionFeeCents,
      speed: input.speed ?? null,
      channelCount: input.channelCount ?? null,
      description: input.description ?? null,
      isActive: true,
      createdAt: this.now(),
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  async updatePlan(id: string, input: UpdatePlanInput): Promise<ServicePlan> {
    const plan = this.plans.get(id);
    if (!plan) throw notFound("Service plan");
    if (input.code !== undefined && [...this.plans.values()].some(
      (candidate) => candidate.id !== id && candidate.code === input.code,
    )) {
      throw conflict("A service plan with that code already exists.");
    }
    const updated: ServicePlan = {
      ...plan,
      code: input.code ?? plan.code,
      name: input.name ?? plan.name,
      serviceType: input.serviceType ?? plan.serviceType,
      monthlyPriceCents: input.monthlyPriceCents ?? plan.monthlyPriceCents,
      installationFeeCents: input.installationFeeCents ?? plan.installationFeeCents,
      reconnectionFeeCents: input.reconnectionFeeCents ?? plan.reconnectionFeeCents,
      speed: input.speed !== undefined ? input.speed ?? null : plan.speed,
      channelCount: input.channelCount !== undefined ? input.channelCount ?? null : plan.channelCount,
      description: input.description !== undefined ? input.description ?? null : plan.description,
      isActive: input.isActive ?? plan.isActive,
    };
    this.plans.set(id, updated);
    return updated;
  }

  async listCollectionAreas(): Promise<CollectionArea[]> {
    return [...this.areas.values()]
      .filter((area) => area.isActive)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async createCollectionArea(input: CreateCollectionAreaInput): Promise<CollectionArea> {
    if ([...this.areas.values()].some((area) => area.code === input.code)) {
      throw conflict("A collection area with that code already exists.");
    }
    const area: CollectionArea = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      isActive: true,
      createdAt: this.now(),
    };
    this.areas.set(area.id, area);
    return area;
  }

  async listSubscribers(query: SubscriberListQuery): Promise<SubscriberListResponse> {
    const needle = query.query?.toLowerCase();
    const matches = [...this.subscribers.values()].filter((subscriber) => {
      if (query.status && subscriber.status !== query.status) return false;
      if (query.collectionAreaId && subscriber.collectionAreaId !== query.collectionAreaId) return false;
      if (!needle) return true;
      return [
        subscriber.accountNumber,
        subscriber.firstName,
        subscriber.middleName ?? "",
        subscriber.lastName,
        subscriber.contactNumber ?? "",
        subscriber.email ?? "",
        subscriber.addressLine ?? "",
        subscriber.barangay ?? "",
        subscriber.municipality ?? "",
      ].some((value) => value.toLowerCase().includes(needle));
    });
    matches.sort((left, right) =>
      left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName),
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      subscribers: matches.slice(start, start + query.pageSize).map(toSummary),
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getSubscriber(id: string): Promise<SubscriberDetail | null> {
    const subscriber = this.subscribers.get(id);
    return subscriber ? structuredClone(subscriber) : null;
  }

  async createSubscriber(input: CreateSubscriberInput): Promise<SubscriberDetail> {
    if (input.collectionAreaId && !this.areas.has(input.collectionAreaId)) {
      throw invalidRequest("The selected collection area is unavailable.");
    }
    const now = this.now();
    const subscriber: SubscriberDetail = {
      id: randomUUID(),
      accountNumber: this.nextNumber("subscriber_account", "SUB-"),
      displayName: input.middleName
        ? `${input.lastName}, ${input.firstName} ${input.middleName}`
        : `${input.lastName}, ${input.firstName}`,
      firstName: input.firstName,
      middleName: input.middleName ?? null,
      lastName: input.lastName,
      contactNumber: input.contactNumber ?? null,
      email: input.email ?? null,
      addressLine: input.addressLine ?? null,
      barangay: input.barangay ?? null,
      municipality: input.municipality ?? null,
      status: "ACTIVE",
      collectionAreaId: input.collectionAreaId ?? null,
      collectionAreaName: input.collectionAreaId
        ? this.areas.get(input.collectionAreaId)?.name ?? null
        : null,
      billingDay: input.billingDay ?? null,
      dueDay: input.dueDay ?? null,
      serviceAccountCount: 0,
      notes: input.notes ?? null,
      addresses: [],
      serviceAccounts: [],
      createdAt: now,
      updatedAt: now,
    };
    this.subscribers.set(subscriber.id, subscriber);
    return structuredClone(subscriber);
  }

  async updateSubscriber(id: string, input: UpdateSubscriberInput): Promise<SubscriberDetail> {
    const subscriber = this.subscribers.get(id);
    if (!subscriber) throw notFound("Subscriber");
    if (input.collectionAreaId && !this.areas.has(input.collectionAreaId)) {
      throw invalidRequest("The selected collection area is unavailable.");
    }
    const updated: SubscriberDetail = {
      ...subscriber,
      firstName: input.firstName ?? subscriber.firstName,
      middleName: input.middleName !== undefined ? input.middleName ?? null : subscriber.middleName,
      lastName: input.lastName ?? subscriber.lastName,
      contactNumber: input.contactNumber !== undefined ? input.contactNumber ?? null : subscriber.contactNumber,
      email: input.email !== undefined ? input.email ?? null : subscriber.email,
      addressLine: input.addressLine !== undefined ? input.addressLine ?? null : subscriber.addressLine,
      barangay: input.barangay !== undefined ? input.barangay ?? null : subscriber.barangay,
      municipality: input.municipality !== undefined ? input.municipality ?? null : subscriber.municipality,
      collectionAreaId: input.collectionAreaId !== undefined ? input.collectionAreaId ?? null : subscriber.collectionAreaId,
      collectionAreaName: input.collectionAreaId !== undefined
        ? input.collectionAreaId ? this.areas.get(input.collectionAreaId)?.name ?? null : null
        : subscriber.collectionAreaName,
      billingDay: input.billingDay !== undefined ? input.billingDay ?? null : subscriber.billingDay,
      dueDay: input.dueDay !== undefined ? input.dueDay ?? null : subscriber.dueDay,
      status: input.status ?? subscriber.status,
      notes: input.notes !== undefined ? input.notes ?? null : subscriber.notes,
      updatedAt: this.now(),
    };
    updated.displayName = updated.middleName
      ? `${updated.lastName}, ${updated.firstName} ${updated.middleName}`
      : `${updated.lastName}, ${updated.firstName}`;
    this.subscribers.set(id, updated);
    return structuredClone(updated);
  }

  async listServiceAccounts(query: ServiceAccountListQuery): Promise<ServiceAccountListResponse> {
    const needle = query.query?.toLowerCase();
    const matches = [...this.serviceAccounts.values()].filter((account) => {
      if (query.status && account.status !== query.status) return false;
      if (!needle) return true;
      return [
        account.accountNumber,
        account.subscriberAccountNumber,
        account.subscriberName,
        account.installationAddress,
        account.planCode,
        account.planName,
      ].some((value) => value.toLowerCase().includes(needle));
    });
    matches.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const start = (query.page - 1) * query.pageSize;
    return {
      serviceAccounts: matches.slice(start, start + query.pageSize).map(toAccountSummary),
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getServiceAccount(id: string): Promise<ServiceAccountDetail | null> {
    const account = this.serviceAccounts.get(id);
    return account ? structuredClone(account) : null;
  }

  async createServiceAccount(
    subscriberId: string,
    input: CreateServiceAccountInput,
    actor: DirectoryActor,
  ): Promise<ServiceAccountDetail> {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber) throw notFound("Subscriber");
    const plan = this.plans.get(input.planId);
    if (!plan) throw invalidRequest("The selected plan is unavailable.");
    if (!plan.isActive) throw invalidRequest("That plan is inactive. Choose an active plan.");
    const collectionAreaId = input.collectionAreaId ?? subscriber.collectionAreaId;
    if (input.collectionAreaId && !this.areas.has(input.collectionAreaId)) {
      throw invalidRequest("The selected collection area is unavailable.");
    }
    const today = new Date().toISOString().slice(0, 10);
    const now = this.now();
    const account: ServiceAccountDetail = {
      id: randomUUID(),
      accountNumber: this.nextNumber("service_account", "SA-"),
      subscriberId: subscriber.id,
      subscriberName: subscriber.middleName
        ? `${subscriber.lastName}, ${subscriber.firstName} ${subscriber.middleName}`
        : `${subscriber.lastName}, ${subscriber.firstName}`,
      subscriberAccountNumber: subscriber.accountNumber,
      planId: plan.id,
      planCode: plan.code,
      planName: plan.name,
      serviceType: plan.serviceType,
      installationAddress: input.installationAddress,
      collectionAreaId: collectionAreaId ?? null,
      collectionAreaName: collectionAreaId ? this.areas.get(collectionAreaId)?.name ?? null : null,
      activationDate: input.activationDate ?? today,
      billingStartDate: input.billingStartDate ?? today,
      billingDay: input.billingDay ?? subscriber.billingDay ?? 1,
      dueDay: input.dueDay ?? subscriber.dueDay ?? 15,
      currentRateCents: input.currentRateCents ?? plan.monthlyPriceCents,
      status: "ACTIVE",
      notes: input.notes ?? null,
      events: [{
        id: randomUUID(),
        serviceAccountId: "",
        fromStatus: null,
        toStatus: "ACTIVE",
        reason: null,
        notes: "Service account created",
        changedByUserId: actor.userId,
        changedByName: actor.displayName,
        occurredAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    };
    account.events[0]!.serviceAccountId = account.id;
    this.serviceAccounts.set(account.id, account);
    subscriber.serviceAccounts.push(toAccountSummary(account));
    subscriber.serviceAccountCount = subscriber.serviceAccounts.length;
    return structuredClone(account);
  }

  async updateServiceAccount(
    id: string,
    input: UpdateServiceAccountInput,
    actor: DirectoryActor,
  ): Promise<ServiceAccountDetail> {
    const account = this.serviceAccounts.get(id);
    if (!account) throw notFound("Service account");
    let planChanged = false;
    if (input.planId !== undefined) {
      const plan = this.plans.get(input.planId);
      if (!plan) throw invalidRequest("The selected plan is unavailable.");
      if (!plan.isActive) throw invalidRequest("That plan is inactive. Choose an active plan.");
      planChanged = true;
    }
    const statusChanged = input.status !== undefined && input.status !== account.status;
    const updated: ServiceAccountDetail = {
      ...account,
      installationAddress: input.installationAddress ?? account.installationAddress,
      billingDay: input.billingDay ?? account.billingDay,
      dueDay: input.dueDay ?? account.dueDay,
      activationDate: input.activationDate !== undefined ? input.activationDate : account.activationDate,
      notes: input.notes !== undefined ? input.notes ?? null : account.notes,
      status: input.status ?? account.status,
      updatedAt: this.now(),
    };
    if (planChanged) {
      const plan = this.plans.get(input.planId!)!;
      updated.planId = plan.id;
      updated.planCode = plan.code;
      updated.planName = plan.name;
      updated.serviceType = plan.serviceType;
      updated.currentRateCents = input.currentRateCents ?? plan.monthlyPriceCents;
    } else if (input.currentRateCents !== undefined) {
      updated.currentRateCents = input.currentRateCents;
    }
    if (statusChanged) {
      updated.events = [{
        id: randomUUID(),
        serviceAccountId: account.id,
        fromStatus: account.status,
        toStatus: input.status!,
        reason: input.reason ?? null,
        notes: null,
        changedByUserId: actor.userId,
        changedByName: actor.displayName,
        occurredAt: this.now(),
      }, ...account.events];
    }
    this.serviceAccounts.set(id, updated);
    const subscriber = this.subscribers.get(account.subscriberId);
    if (subscriber) {
      subscriber.serviceAccounts = subscriber.serviceAccounts.map((summary) =>
        summary.id === id ? toAccountSummary(updated) : summary,
      );
    }
    return structuredClone(updated);
  }
}

function toSummary(subscriber: SubscriberDetail): SubscriberSummary {
  return {
    id: subscriber.id,
    accountNumber: subscriber.accountNumber,
    displayName: subscriber.displayName,
    firstName: subscriber.firstName,
    middleName: subscriber.middleName,
    lastName: subscriber.lastName,
    contactNumber: subscriber.contactNumber,
    email: subscriber.email,
    addressLine: subscriber.addressLine,
    barangay: subscriber.barangay,
    municipality: subscriber.municipality,
    status: subscriber.status,
    collectionAreaId: subscriber.collectionAreaId,
    collectionAreaName: subscriber.collectionAreaName,
    billingDay: subscriber.billingDay,
    dueDay: subscriber.dueDay,
    serviceAccountCount: subscriber.serviceAccountCount,
    createdAt: subscriber.createdAt,
    updatedAt: subscriber.updatedAt,
  };
}

function toAccountSummary(account: ServiceAccountDetail): ServiceAccountSummary {
  return {
    id: account.id,
    accountNumber: account.accountNumber,
    subscriberId: account.subscriberId,
    subscriberName: account.subscriberName,
    subscriberAccountNumber: account.subscriberAccountNumber,
    planId: account.planId,
    planCode: account.planCode,
    planName: account.planName,
    serviceType: account.serviceType,
    installationAddress: account.installationAddress,
    collectionAreaId: account.collectionAreaId,
    collectionAreaName: account.collectionAreaName,
    activationDate: account.activationDate,
    billingStartDate: account.billingStartDate,
    billingDay: account.billingDay,
    dueDay: account.dueDay,
    currentRateCents: account.currentRateCents,
    status: account.status,
    notes: account.notes,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export function createMemoryAuthStore(
  permissions: string[],
  roles: string[],
  passwordHash: string,
): { identity: { id: string; username: string; displayName: string }; store: AuthStore } {
  const sessions = new Map<string, { revoked: boolean }>();
  const identity = {
    id: randomUUID(),
    username: "test-user",
    displayName: "Test User",
    passwordHash,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    roles,
    permissions,
  };
  return {
    identity,
    store: {
      findUserByUsername: async (username: string) => username === identity.username ? identity : null,
      recordFailedLogin: async () => undefined,
      createSession: async (_userId: string, tokenHash: string) => {
        sessions.set(tokenHash, { revoked: false });
      },
      findSession: async (tokenHash: string) => {
        const session = sessions.get(tokenHash);
        if (!session || session.revoked) return null;
        return {
          id: identity.id,
          username: identity.username,
          displayName: identity.displayName,
          roles: identity.roles,
          permissions: identity.permissions,
        };
      },
      revokeSession: async (tokenHash: string) => {
        const session = sessions.get(tokenHash);
        if (session) session.revoked = true;
      },
      listUsers: async () => [],
      listAssignableRoles: async () => roles,
      createUser: async () => {
        throw new Error("not implemented");
      },
    },
  };
}
