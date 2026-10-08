import { randomUUID } from "node:crypto";
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
  InvoiceLineItem,
  InvoiceListQuery,
  InvoiceListResponse,
  LedgerEntry,
  LedgerEntryListQuery,
  LedgerEntryListResponse,
  Payment,
  PaymentListQuery,
  PaymentListResponse,
  ReversePaymentInput,
  ServiceAccountDetail,
  ServiceAccountListQuery,
  ServiceAccountListResponse,
  ServiceAccountSummary,
  ServicePlan,
  SubscriberDetail,
  SubscriberListQuery,
  SubscriberListResponse,
  SubscriberSummary,
  UpdateInvoiceInput,
  UpdatePlanInput,
  UpdateServiceAccountInput,
  UpdateSubscriberInput,
  VerifyPaymentInput,
} from "@bcis/shared";

import type { AuthStore } from "../auth/types.js";
import { conflict, invalidRequest, notFound, type BillingGenerationResult, type DirectoryActor, type DirectoryStore } from "./types.js";

export class MemoryDirectoryStore implements DirectoryStore {
  private readonly plans = new Map<string, ServicePlan>();
  private readonly areas = new Map<string, CollectionArea>();
  private readonly subscribers = new Map<string, SubscriberDetail>();
  private readonly serviceAccounts = new Map<string, ServiceAccountDetail>();
  private readonly counters = new Map<string, number>();
  private readonly invoices = new Map<string, Invoice>();
  private readonly ledgerEntries: LedgerEntry[] = [];
  private readonly payments = new Map<string, Payment>();

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

  async listInvoices(query: InvoiceListQuery): Promise<InvoiceListResponse> {
    const matches = [...this.invoices.values()]
      .filter((invoice) => {
        if (query.status && invoice.status !== query.status) return false;
        if (query.subscriberId && invoice.subscriberId !== query.subscriberId) return false;
        if (query.serviceAccountId && invoice.serviceAccountId !== query.serviceAccountId) return false;
        if (query.from && invoice.billingPeriodStart < query.from) return false;
        if (query.to && invoice.billingPeriodEnd > query.to) return false;
        if (query.query && !invoice.invoiceNumber.toLowerCase().includes(query.query.toLowerCase())) return false;
        return true;
      })
      .sort((left, right) => right.issueDate.localeCompare(left.issueDate) || right.createdAt.localeCompare(left.createdAt));
    const start = (query.page - 1) * query.pageSize;
    return {
      invoices: matches.slice(start, start + query.pageSize).map(({ lineItems: _lineItems, ...rest }) => rest),
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    return invoice ? structuredClone(invoice) : null;
  }

  async createInvoice(input: CreateInvoiceInput, _actor: DirectoryActor): Promise<Invoice> {
    const subscriber = this.subscribers.get(input.subscriberId);
    if (!subscriber) throw notFound("Subscriber");
    if (input.serviceAccountId) {
      const account = this.serviceAccounts.get(input.serviceAccountId);
      if (!account) throw invalidRequest("The selected service account is unavailable.");
      if (account.subscriberId !== subscriber.id) {
        throw invalidRequest("The service account does not belong to the selected subscriber.");
      }
    }
    this.assertNotDuplicate(input.subscriberId, input.serviceAccountId ?? null, input.billingPeriodStart, input.billingPeriodEnd);
    const invoice = this.buildInvoice({
      subscriberId: input.subscriberId,
      serviceAccountId: input.serviceAccountId ?? null,
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      lineItems: input.lineItems.map(normalizeLineItem),
      notes: input.notes ?? null,
      status: "draft",
    });
    this.invoices.set(invoice.id, invoice);
    return structuredClone(invoice);
  }

  async updateInvoice(id: string, input: UpdateInvoiceInput, actor: DirectoryActor): Promise<Invoice> {
    const invoice = this.invoices.get(id);
    if (!invoice) throw notFound("Invoice");
    if (invoice.status === "void" && input.status && input.status !== "void") {
      throw conflict("A void invoice cannot change status.");
    }
    const updated: Invoice = {
      ...invoice,
      status: input.status ?? invoice.status,
      notes: input.notes !== undefined ? input.notes ?? null : invoice.notes,
      updatedAt: this.now(),
    };
    if (input.status === "posted" && invoice.status !== "posted") {
      if (updated.balanceCents <= 0) throw invalidRequest("Only invoices with an outstanding balance can be posted.");
      updated.postedAt = this.now();
      this.postLedger(updated, actor, "debit", "invoice", updated.totalCents, "Invoice posted");
    } else if (input.status === "void" && invoice.status === "posted") {
      this.postLedger(updated, actor, "credit", "reversal", updated.totalCents - updated.amountPaidCents, "Invoice voided");
    }
    this.invoices.set(id, updated);
    return structuredClone(updated);
  }

  async generateInvoices(input: GenerateBillingInput, actor: DirectoryActor): Promise<BillingGenerationResult> {
    const targets = [...this.serviceAccounts.values()].filter((account) => {
      if (account.status === "TERMINATED" || account.status === "DISCONNECTED") return false;
      if (input.serviceAccountIds && !input.serviceAccountIds.includes(account.id)) return false;
      return true;
    });
    const created: Invoice[] = [];
    let skipped = 0;
    for (const account of targets) {
      if (this.hasBillableInvoice(account.subscriberId, account.id, input.billingPeriodStart, input.billingPeriodEnd)) {
        skipped += 1;
        continue;
      }
      const lineItem: InvoiceLineItem = {
        description: `Monthly service fee (${account.planName})`,
        quantity: 1,
        unitPriceCents: account.currentRateCents,
        amountCents: account.currentRateCents,
      };
      const invoice = this.buildInvoice({
        subscriberId: account.subscriberId,
        serviceAccountId: account.id,
        billingPeriodStart: input.billingPeriodStart,
        billingPeriodEnd: input.billingPeriodEnd,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        lineItems: [lineItem],
        notes: null,
        status: "posted",
      });
      invoice.postedAt = this.now();
      this.invoices.set(invoice.id, invoice);
      this.postLedger(invoice, actor, "debit", "invoice", invoice.totalCents, "Monthly billing posted");
      created.push(structuredClone(invoice));
    }
    return { created, skipped };
  }

  async listLedgerEntries(query: LedgerEntryListQuery): Promise<LedgerEntryListResponse> {
    const matches = this.ledgerEntries
      .filter((entry) => {
        if (query.subscriberId && entry.subscriberId !== query.subscriberId) return false;
        if (query.invoiceId && entry.invoiceId !== query.invoiceId) return false;
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const start = (query.page - 1) * query.pageSize;
    return {
      entries: matches.slice(start, start + query.pageSize).map((entry) => structuredClone(entry)),
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async previewAllocation(input: AllocationPreviewInput): Promise<AllocationPreview> {
    return this.buildAllocationPreview(input.subscriberId, input.amountCents);
  }

  async listPayments(query: PaymentListQuery): Promise<PaymentListResponse> {
    const needle = query.query?.toLowerCase();
    const matches = [...this.payments.values()]
      .filter((payment) => {
        if (query.subscriberId && payment.subscriberId !== query.subscriberId) return false;
        if (query.status && payment.status !== query.status) return false;
        if (query.method && payment.method !== query.method) return false;
        if (query.from && payment.paymentDate < query.from) return false;
        if (query.to && payment.paymentDate > `${query.to}T23:59:59.999Z`) return false;
        if (!needle) return true;
        return [
          payment.receiptNumber,
          payment.subscriberAccountNumber,
          payment.subscriberName,
          payment.referenceNumber ?? "",
        ].some((value) => value.toLowerCase().includes(needle));
      })
      .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate) || right.createdAt.localeCompare(left.createdAt));
    const start = (query.page - 1) * query.pageSize;
    return {
      payments: matches.slice(start, start + query.pageSize).map(({ allocations: _a, proofs: _p, reversal: _r, ...rest }) => structuredClone(rest)),
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getPayment(id: string): Promise<Payment | null> {
    const payment = this.payments.get(id);
    return payment ? structuredClone(payment) : null;
  }

  async createPayment(input: CreatePaymentInput, actor: DirectoryActor): Promise<Payment> {
    const subscriber = this.subscribers.get(input.subscriberId);
    if (!subscriber) throw notFound("Subscriber");
    if (input.method === "gcash" && input.referenceNumber) {
      this.assertUniqueGcashReference(input.referenceNumber, null);
    }
    const now = this.now();
    const id = randomUUID();
    const status = input.method === "gcash" ? "pending" : "posted";
    const payment: Payment = {
      id,
      receiptNumber: this.nextNumber("receipt", "RCPT-"),
      subscriberId: input.subscriberId,
      subscriberAccountNumber: subscriber.accountNumber,
      subscriberName: subscriber.displayName,
      amountCents: input.amountCents,
      allocatedCents: 0,
      unallocatedCents: input.amountCents,
      method: input.method,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      status,
      verificationNote: null,
      paymentDate: input.paymentDate ?? now,
      verifiedAt: null,
      verifiedByUserId: null,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
      allocations: [],
      proofs: (input.proofs ?? []).map((proof) => ({
        id: randomUUID(),
        fileName: proof.fileName,
        contentType: proof.contentType,
        sizeBytes: proof.sizeBytes,
        storagePath: `payments/${id}/${proof.fileName}`,
        uploadedByUserId: actor.userId,
        createdAt: now,
      })),
      reversal: null,
    };
    this.payments.set(payment.id, payment);
    if (payment.status === "posted") {
      this.allocatePaymentRecord(payment, actor);
    }
    return structuredClone(payment);
  }

  async verifyPayment(id: string, input: VerifyPaymentInput, actor: DirectoryActor): Promise<Payment> {
    const payment = this.payments.get(id);
    if (!payment) throw notFound("Payment");
    if (payment.method !== "gcash") throw invalidRequest("Only GCash payments require verification.");
    if (payment.status !== "pending") throw conflict("Only pending GCash payments can be verified or rejected.");
    if (input.decision === "reject") {
      payment.status = "rejected";
    } else {
      if (payment.referenceNumber) this.assertUniqueGcashReference(payment.referenceNumber, id);
      payment.status = "posted";
      this.allocatePaymentRecord(payment, actor);
      payment.updatedAt = this.now();
    }
    payment.verificationNote = input.note ?? null;
    payment.verifiedAt = this.now();
    payment.verifiedByUserId = actor.userId;
    payment.updatedAt = this.now();
    return structuredClone(payment);
  }

  async reversePayment(id: string, input: ReversePaymentInput, actor: DirectoryActor): Promise<Payment> {
    const payment = this.payments.get(id);
    if (!payment) throw notFound("Payment");
    if (payment.status !== "posted") throw conflict("Only posted payments can be reversed.");
    for (const allocation of payment.allocations ?? []) {
      const invoice = this.invoices.get(allocation.invoiceId);
      if (!invoice || invoice.status === "void") continue;
      invoice.amountPaidCents = Math.max(invoice.amountPaidCents - allocation.amountCents, 0);
      invoice.balanceCents += allocation.amountCents;
      invoice.status = invoice.amountPaidCents === 0 ? "posted" : invoice.balanceCents === 0 ? "paid" : "partially_paid";
      invoice.updatedAt = this.now();
    }
    payment.allocations = [];
    payment.allocatedCents = 0;
    payment.unallocatedCents = payment.amountCents;
    payment.status = "reversed";
    payment.updatedAt = this.now();
    payment.reversal = {
      id: randomUUID(),
      reason: input.reason,
      reversedByUserId: actor.userId,
      createdAt: this.now(),
    };
    this.postSubscriberLedger(
      payment.subscriberId,
      actor,
      "debit",
      "reversal",
      payment.amountCents,
      `Payment reversed ${payment.receiptNumber}: ${input.reason}`,
      this.now().slice(0, 10),
    );
    return structuredClone(payment);
  }

  private allocatePaymentRecord(payment: Payment, actor: DirectoryActor): void {
    const targets = [...this.invoices.values()]
      .filter((invoice) =>
        invoice.subscriberId === payment.subscriberId
        && ["posted", "partially_paid", "overdue"].includes(invoice.status)
        && invoice.balanceCents > 0,
      )
      .sort((left, right) =>
        left.dueDate.localeCompare(right.dueDate)
        || left.issueDate.localeCompare(right.issueDate)
        || left.createdAt.localeCompare(right.createdAt),
      );
    let remaining = payment.amountCents;
    payment.allocations = [];
    for (const invoice of targets) {
      if (remaining <= 0) break;
      const allocation = Math.min(remaining, invoice.balanceCents);
      if (allocation <= 0) continue;
      invoice.amountPaidCents += allocation;
      invoice.balanceCents -= allocation;
      invoice.status = invoice.balanceCents === 0 ? "paid" : "partially_paid";
      invoice.updatedAt = this.now();
      payment.allocations.push({
        id: randomUUID(),
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountCents: allocation,
        createdAt: this.now(),
      });
      remaining -= allocation;
    }
    payment.allocatedCents = payment.amountCents - remaining;
    payment.unallocatedCents = remaining;
    this.postSubscriberLedger(
      payment.subscriberId,
      actor,
      "credit",
      "payment",
      payment.amountCents,
      `Payment ${payment.receiptNumber}`,
      payment.paymentDate.slice(0, 10),
    );
  }

  private buildAllocationPreview(subscriberId: string, amountCents: number): AllocationPreview {
    const targets = [...this.invoices.values()]
      .filter((invoice) =>
        invoice.subscriberId === subscriberId
        && ["posted", "partially_paid", "overdue"].includes(invoice.status)
        && invoice.balanceCents > 0,
      )
      .sort((left, right) =>
        left.dueDate.localeCompare(right.dueDate)
        || left.issueDate.localeCompare(right.issueDate)
        || left.createdAt.localeCompare(right.createdAt),
      );
    let remaining = amountCents;
    const allocations: AllocationPreview["allocations"] = [];
    for (const invoice of targets) {
      if (remaining <= 0) break;
      const allocation = Math.min(remaining, invoice.balanceCents);
      if (allocation <= 0) continue;
      allocations.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        issueDate: invoice.issueDate,
        balanceCents: invoice.balanceCents,
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

  private assertUniqueGcashReference(referenceNumber: string, excludeId: string | null): void {
    const duplicate = [...this.payments.values()].some((payment) =>
      payment.method === "gcash"
      && payment.referenceNumber === referenceNumber
      && !["rejected", "reversed"].includes(payment.status)
      && payment.id !== excludeId,
    );
    if (duplicate) throw conflict("A GCash payment with that reference number already exists.");
  }

  private postSubscriberLedger(
    subscriberId: string,
    actor: DirectoryActor,
    entryType: LedgerEntry["entryType"],
    sourceType: LedgerEntry["sourceType"],
    amountCents: number,
    description: string,
    entryDate: string,
  ): void {
    const previous = this.ledgerEntries
      .filter((entry) => entry.subscriberId === subscriberId)
      .reduce((balance, entry) => balance + (entry.entryType === "debit" ? entry.amountCents : -entry.amountCents), 0);
    const delta = entryType === "debit" ? amountCents : -amountCents;
    this.ledgerEntries.push({
      id: randomUUID(),
      subscriberId,
      serviceAccountId: null,
      invoiceId: null,
      entryDate,
      entryType,
      sourceType,
      amountCents,
      balanceCents: previous + delta,
      description,
      createdByUserId: actor.userId,
      createdAt: this.now(),
    });
  }

  private buildInvoice(fields: {
    subscriberId: string;
    serviceAccountId: string | null;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    issueDate: string;
    dueDate: string;
    lineItems: InvoiceLineItem[];
    notes: string | null;
    status: Invoice["status"];
  }): Invoice {
    const subtotalCents = fields.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
    if (subtotalCents <= 0) throw invalidRequest("An invoice must have a positive amount.");
    const now = this.now();
    return {
      id: randomUUID(),
      invoiceNumber: this.nextNumber("invoice", "INV-"),
      subscriberId: fields.subscriberId,
      serviceAccountId: fields.serviceAccountId ?? undefined,
      billingPeriodStart: fields.billingPeriodStart,
      billingPeriodEnd: fields.billingPeriodEnd,
      issueDate: fields.issueDate,
      dueDate: fields.dueDate,
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
      amountPaidCents: 0,
      balanceCents: subtotalCents,
      status: fields.status,
      notes: fields.notes,
      createdAt: now,
      updatedAt: now,
      postedAt: null,
      lineItems: fields.lineItems,
    };
  }

  private hasBillableInvoice(
    subscriberId: string,
    serviceAccountId: string | null,
    billingPeriodStart: string,
    billingPeriodEnd: string,
  ): boolean {
    return [...this.invoices.values()].some((invoice) => {
      if (invoice.status === "void") return false;
      if (invoice.subscriberId !== subscriberId) return false;
      if ((invoice.serviceAccountId ?? null) !== serviceAccountId) return false;
      return invoice.billingPeriodStart === billingPeriodStart && invoice.billingPeriodEnd === billingPeriodEnd;
    });
  }

  private assertNotDuplicate(
    subscriberId: string,
    serviceAccountId: string | null,
    billingPeriodStart: string,
    billingPeriodEnd: string,
  ): void {
    if (this.hasBillableInvoice(subscriberId, serviceAccountId, billingPeriodStart, billingPeriodEnd)) {
      throw conflict("An invoice already exists for that account and billing period.");
    }
  }

  private postLedger(
    invoice: Invoice,
    actor: DirectoryActor,
    entryType: LedgerEntry["entryType"],
    sourceType: LedgerEntry["sourceType"],
    amountCents: number,
    description: string,
  ): void {
    const previous = this.ledgerEntries
      .filter((entry) => entry.subscriberId === invoice.subscriberId)
      .reduce((balance, entry) => balance + (entry.entryType === "debit" ? entry.amountCents : -entry.amountCents), 0);
    const delta = entryType === "debit" ? amountCents : -amountCents;
    this.ledgerEntries.push({
      id: randomUUID(),
      subscriberId: invoice.subscriberId,
      serviceAccountId: invoice.serviceAccountId ?? null,
      invoiceId: invoice.id,
      entryDate: invoice.issueDate,
      entryType,
      sourceType,
      amountCents,
      balanceCents: previous + delta,
      description,
      createdByUserId: actor.userId,
      createdAt: this.now(),
    });
  }
}

function normalizeLineItem(item: InvoiceLineItem): InvoiceLineItem {
  const quantity = item.quantity ?? 1;
  const amountCents = item.amountCents || quantity * item.unitPriceCents;
  return { ...item, quantity, amountCents };
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
