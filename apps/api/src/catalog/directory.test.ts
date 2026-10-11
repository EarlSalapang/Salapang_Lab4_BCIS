import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  agingReportSchema,
  allocationPreviewSchema,
  dashboardSchema,
  invoiceListSchema,
  ledgerEntryListSchema,
  overdueListSchema,
  paymentListSchema,
  reportCatalogSchema,
  reportSchema,
  serviceAccountDetailSchema,
  serviceAccountListSchema,
  serviceSuspensionListSchema,
  serviceSuspensionResponseSchema,
  subscriberDetailSchema,
  subscriberListSchema,
  suspensionListSchema,
} from "@bcis/shared";

import { buildServer } from "../app.js";
import { hashPassword } from "../auth/passwords.js";
import { MemoryDirectoryStore, createMemoryAuthStore } from "./memory-store.js";

const testPassword = "BCIS-test-password-123";
const passwordHash = await hashPassword(testPassword);

const allDirectoryPermissions = [
  "subscriber.view",
  "subscriber.create",
  "subscriber.update",
  "plan.manage",
  "collection.manage",
  "collection.reconcile",
  "billing.generate",
  "payment.create",
  "payment.verify_gcash",
  "payment.reverse",
  "report.view",
  "report.export",
];

interface TestServer {
  server: Awaited<ReturnType<typeof buildServer>>;
  token: string;
  userId: string;
  directory: MemoryDirectoryStore;
}

async function createServer(
  permissions: string[] = allDirectoryPermissions,
  directory: MemoryDirectoryStore | null = new MemoryDirectoryStore(),
): Promise<TestServer> {
  const auth = createMemoryAuthStore(permissions, ["Administrator"], passwordHash);
  const server = buildServer(
    { query: vi.fn() },
    auth.store,
    {
      disableLogging: true,
      ...(directory ? { directory } : {}),
    },
  );
  const login = await server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { username: auth.identity.username, password: testPassword },
  });
  expect(login.statusCode).toBe(200);
  return {
    server,
    token: login.json().token as string,
    userId: auth.identity.id,
    directory: directory ?? new MemoryDirectoryStore(),
  };
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function createPlan(
  context: TestServer,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; code: string; monthlyPriceCents: number }> {
  const response = await context.server.inject({
    method: "POST",
    url: "/plans",
    headers: authHeaders(context.token),
    payload: {
      code: "INET-5M",
      name: "Internet 5 Mbps",
      serviceType: "INTERNET",
      monthlyPriceCents: 99_900,
      ...overrides,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().plan;
}

async function createSubscriber(
  context: TestServer,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; accountNumber: string }> {
  const response = await context.server.inject({
    method: "POST",
    url: "/subscribers",
    headers: authHeaders(context.token),
    payload: {
      firstName: "Jane",
      lastName: "Doe",
      contactNumber: "09171234567",
      addressLine: "Purok 1",
      barangay: "San Isidro",
      municipality: "Quezon",
      ...overrides,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().subscriber;
}

describe("service plans", () => {
  it("requires authentication", async () => {
    const { server } = await createServer();
    const response = await server.inject({ method: "GET", url: "/plans" });
    expect(response.statusCode).toBe(401);
    await server.close();
  });

  it("rejects plan changes without plan.manage on the server", async () => {
    const context = await createServer(["subscriber.view"]);
    const response = await context.server.inject({
      method: "POST",
      url: "/plans",
      headers: authHeaders(context.token),
      payload: { code: "CABLE-STD", name: "Cable Standard", serviceType: "CABLE", monthlyPriceCents: 50_000 },
    });
    expect(response.statusCode).toBe(403);
    await expect(context.directory.listPlans(true)).resolves.toHaveLength(0);
    await context.server.close();
  });

  it("creates plans, normalizes codes, and lists active plans by default", async () => {
    const context = await createServer();
    const created = await createPlan(context, { code: "cable-hd" });
    expect(created.code).toBe("CABLE-HD");

    const activeList = await context.server.inject({
      method: "GET",
      url: "/plans",
      headers: authHeaders(context.token),
    });
    expect(activeList.statusCode).toBe(200);
    expect(activeList.json().plans).toHaveLength(1);

    const deactivated = await context.server.inject({
      method: "PATCH",
      url: `/plans/${created.id}`,
      headers: authHeaders(context.token),
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);

    const afterDeactivation = await context.server.inject({
      method: "GET",
      url: "/plans",
      headers: authHeaders(context.token),
    });
    expect(afterDeactivation.json().plans).toHaveLength(0);

    const withInactive = await context.server.inject({
      method: "GET",
      url: "/plans?includeInactive=true",
      headers: authHeaders(context.token),
    });
    expect(withInactive.json().plans).toHaveLength(1);
    await context.server.close();
  });

  it("rejects invalid plan payloads and duplicate plan codes", async () => {
    const context = await createServer();
    const invalid = await context.server.inject({
      method: "POST",
      url: "/plans",
      headers: authHeaders(context.token),
      payload: { name: "X" },
    });
    expect(invalid.statusCode).toBe(400);

    await createPlan(context);
    const duplicate = await context.server.inject({
      method: "POST",
      url: "/plans",
      headers: authHeaders(context.token),
      payload: { code: "INET-5M", name: "Other", serviceType: "INTERNET", monthlyPriceCents: 1 },
    });
    expect(duplicate.statusCode).toBe(409);
    await context.server.close();
  });

  it("answers with 404 for unknown plans and 400 for malformed identifiers", async () => {
    const context = await createServer();
    const unknown = await context.server.inject({
      method: "PATCH",
      url: `/plans/${randomUUID()}`,
      headers: authHeaders(context.token),
      payload: { name: "Renamed" },
    });
    expect(unknown.statusCode).toBe(404);

    const malformed = await context.server.inject({
      method: "PATCH",
      url: "/plans/not-a-uuid",
      headers: authHeaders(context.token),
      payload: { name: "Renamed" },
    });
    expect(malformed.statusCode).toBe(400);
    await context.server.close();
  });
});

describe("collection areas", () => {
  it("creates areas with collection.manage and blocks users without it", async () => {
    const context = await createServer();
    const allowed = await context.server.inject({
      method: "POST",
      url: "/collection-areas",
      headers: authHeaders(context.token),
      payload: { code: "ZONE-A", name: "Zone A - Poblacion" },
    });
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().area).toMatchObject({ code: "ZONE-A", isActive: true });

    const readOnly = await createServer(["subscriber.view"]);
    const forbidden = await readOnly.server.inject({
      method: "POST",
      url: "/collection-areas",
      headers: authHeaders(readOnly.token),
      payload: { code: "ZONE-B", name: "Zone B" },
    });
    expect(forbidden.statusCode).toBe(403);
    await context.server.close();
    await readOnly.server.close();
  });
});

describe("subscribers", () => {
  it("creates a subscriber with a generated account number and valid contract", async () => {
    const context = await createServer();
    const response = await context.server.inject({
      method: "POST",
      url: "/subscribers",
      headers: authHeaders(context.token),
      payload: { firstName: "Juan", lastName: "Cruz", middleName: "S", email: "juan@example.test" },
    });

    expect(response.statusCode).toBe(201);
    const subscriber = subscriberDetailSchema.parse(response.json().subscriber);
    expect(subscriber.accountNumber).toMatch(/^SUB-\d{6}$/);
    expect(subscriber.displayName).toBe("Cruz, Juan S");
    expect(subscriber.status).toBe("ACTIVE");
    expect(subscriber.serviceAccounts).toEqual([]);
    await context.server.close();
  });

  it("rejects subscriber payloads that fail validation", async () => {
    const context = await createServer();
    const missingLastName = await context.server.inject({
      method: "POST",
      url: "/subscribers",
      headers: authHeaders(context.token),
      payload: { firstName: "NoLast" },
    });
    expect(missingLastName.statusCode).toBe(400);

    const badContact = await context.server.inject({
      method: "POST",
      url: "/subscribers",
      headers: authHeaders(context.token),
      payload: { firstName: "Jane", lastName: "Doe", contactNumber: "abc" },
    });
    expect(badContact.statusCode).toBe(400);
    await context.server.close();
  });

  it("searches and paginates subscribers on the server", async () => {
    const context = await createServer();
    await createSubscriber(context, { firstName: "Ana", lastName: "Dela Cruz" });
    await createSubscriber(context, { firstName: "Ben", lastName: "Santos" });
    await createSubscriber(context, { firstName: "Carla", lastName: "Dela Rosa" });

    const search = await context.server.inject({
      method: "GET",
      url: "/subscribers?query=dela",
      headers: authHeaders(context.token),
    });
    expect(search.statusCode).toBe(200);
    const list = subscriberListSchema.parse(search.json());
    expect(list.total).toBe(2);
    expect(list.subscribers.map((subscriber) => subscriber.lastName)).toEqual(["Dela Cruz", "Dela Rosa"]);

    const firstPage = await context.server.inject({
      method: "GET",
      url: "/subscribers?page=1&pageSize=2",
      headers: authHeaders(context.token),
    });
    const paginated = subscriberListSchema.parse(firstPage.json());
    expect(paginated.subscribers).toHaveLength(2);
    expect(paginated.total).toBe(3);

    const invalidPage = await context.server.inject({
      method: "GET",
      url: "/subscribers?page=0",
      headers: authHeaders(context.token),
    });
    expect(invalidPage.statusCode).toBe(400);
    await context.server.close();
  });

  it("updates subscribers for authorized users and blocks others", async () => {
    const context = await createServer();
    const subscriber = await createSubscriber(context);

    const restricted = await createServer(["subscriber.view"]);
    const forbidden = await restricted.server.inject({
      method: "PATCH",
      url: `/subscribers/${subscriber.id}`,
      headers: authHeaders(restricted.token),
      payload: { status: "ARCHIVED" },
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await context.server.inject({
      method: "PATCH",
      url: `/subscribers/${subscriber.id}`,
      headers: authHeaders(context.token),
      payload: { status: "ARCHIVED", notes: "Moved out of the area." },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().subscriber.status).toBe("ARCHIVED");
    await context.server.close();
    await restricted.server.close();
  });

  it("returns 404 for unknown subscribers and 400 for malformed identifiers", async () => {
    const context = await createServer();
    const unknown = await context.server.inject({
      method: "GET",
      url: `/subscribers/${randomUUID()}`,
      headers: authHeaders(context.token),
    });
    expect(unknown.statusCode).toBe(404);

    const malformed = await context.server.inject({
      method: "GET",
      url: "/subscribers/123",
      headers: authHeaders(context.token),
    });
    expect(malformed.statusCode).toBe(400);
    await context.server.close();
  });
});

describe("service accounts", () => {
  it("creates a service account from an active plan and records its history", async () => {
    const context = await createServer();
    const plan = await createPlan(context, { monthlyPriceCents: 99_900 });
    const subscriber = await createSubscriber(context);

    const created = await context.server.inject({
      method: "POST",
      url: `/subscribers/${subscriber.id}/service-accounts`,
      headers: authHeaders(context.token),
      payload: { planId: plan.id, installationAddress: "Purok 1, San Isidro" },
    });
    expect(created.statusCode).toBe(201);
    const account = serviceAccountDetailSchema.parse(created.json().serviceAccount);
    expect(account.accountNumber).toMatch(/^SA-\d{6}$/);
    expect(account.status).toBe("ACTIVE");
    expect(account.currentRateCents).toBe(99_900);
    expect(account.subscriberAccountNumber).toBe(subscriber.accountNumber);
    expect(account.events).toHaveLength(1);
    expect(account.events[0]).toMatchObject({ fromStatus: null, toStatus: "ACTIVE", notes: "Service account created" });

    const detail = await context.server.inject({
      method: "GET",
      url: `/service-accounts/${account.id}`,
      headers: authHeaders(context.token),
    });
    expect(detail.statusCode).toBe(200);
    const parsed = serviceAccountDetailSchema.parse(detail.json().serviceAccount);
    expect(parsed.events[0]?.changedByUserId).toBe(context.userId);
    expect(parsed.events[0]?.changedByName).toBe("Test User");
    await context.server.close();
  });

  it("rejects unknown, missing, and inactive plans", async () => {
    const context = await createServer();
    const subscriber = await createSubscriber(context);

    const unknownPlan = await context.server.inject({
      method: "POST",
      url: `/subscribers/${subscriber.id}/service-accounts`,
      headers: authHeaders(context.token),
      payload: { planId: randomUUID(), installationAddress: "Address" },
    });
    expect(unknownPlan.statusCode).toBe(400);

    const plan = await createPlan(context);
    await context.server.inject({
      method: "PATCH",
      url: `/plans/${plan.id}`,
      headers: authHeaders(context.token),
      payload: { isActive: false },
    });
    const inactivePlan = await context.server.inject({
      method: "POST",
      url: `/subscribers/${subscriber.id}/service-accounts`,
      headers: authHeaders(context.token),
      payload: { planId: plan.id, installationAddress: "Address" },
    });
    expect(inactivePlan.statusCode).toBe(400);

    const missingSubscriber = await context.server.inject({
      method: "POST",
      url: `/subscribers/${randomUUID()}/service-accounts`,
      headers: authHeaders(context.token),
      payload: { planId: plan.id, installationAddress: "Address" },
    });
    expect(missingSubscriber.statusCode).toBe(404);
    await context.server.close();
  });

  it("requires subscriber.create before adding service accounts", async () => {
    const context = await createServer(["subscriber.view", "subscriber.update", "plan.manage"]);
    const plan = await createPlan(context);
    const subscriber = await createSubscriber(context).catch(() => null);
    expect(subscriber).toBeNull();

    const restrictedDirectory = await createServer(["subscriber.view"]);
    const response = await restrictedDirectory.server.inject({
      method: "POST",
      url: `/subscribers/${randomUUID()}/service-accounts`,
      headers: authHeaders(restrictedDirectory.token),
      payload: { planId: plan.id, installationAddress: "Address" },
    });
    expect(response.statusCode).toBe(403);
    await context.server.close();
    await restrictedDirectory.server.close();
  });

  it("records status changes with reason, actor, and previous status", async () => {
    const context = await createServer();
    const plan = await createPlan(context);
    const subscriber = await createSubscriber(context);
    const created = await context.server.inject({
      method: "POST",
      url: `/subscribers/${subscriber.id}/service-accounts`,
      headers: authHeaders(context.token),
      payload: { planId: plan.id, installationAddress: "Address" },
    });
    const accountId = created.json().serviceAccount.id as string;

    const suspended = await context.server.inject({
      method: "PATCH",
      url: `/service-accounts/${accountId}`,
      headers: authHeaders(context.token),
      payload: { status: "SUSPENDED", reason: "Unpaid for 60 days" },
    });
    expect(suspended.statusCode).toBe(200);

    const detail = await context.server.inject({
      method: "GET",
      url: `/service-accounts/${accountId}`,
      headers: authHeaders(context.token),
    });
    const account = serviceAccountDetailSchema.parse(detail.json().serviceAccount);
    expect(account.status).toBe("SUSPENDED");
    expect(account.events[0]).toMatchObject({
      fromStatus: "ACTIVE",
      toStatus: "SUSPENDED",
      reason: "Unpaid for 60 days",
      changedByUserId: context.userId,
    });
    await context.server.close();
  });

  it("lists service accounts with filters that match the shared contract", async () => {
    const context = await createServer();
    const plan = await createPlan(context);
    const subscriber = await createSubscriber(context);
    await context.server.inject({
      method: "POST",
      url: `/subscribers/${subscriber.id}/service-accounts`,
      headers: authHeaders(context.token),
      payload: { planId: plan.id, installationAddress: "Address" },
    });

    const response = await context.server.inject({
      method: "GET",
      url: "/service-accounts?query=Doe",
      headers: authHeaders(context.token),
    });
    expect(response.statusCode).toBe(200);
    const list = serviceAccountListSchema.parse(response.json());
    expect(list.total).toBe(1);
    expect(list.serviceAccounts[0]?.subscriberName).toBe("Doe, Jane");
    await context.server.close();
  });
});

describe("directory availability and administrative authorization", () => {
  it("returns 503 when directory services are not configured", async () => {
    const context = await createServer(allDirectoryPermissions, null);
    const response = await context.server.inject({
      method: "GET",
      url: "/subscribers",
      headers: authHeaders(context.token),
    });
    expect(response.statusCode).toBe(503);
    await context.server.close();
  });

  it("keeps administrative user routes closed to directory-only roles", async () => {
    const context = await createServer(allDirectoryPermissions);
    const response = await context.server.inject({
      method: "GET",
      url: "/admin/users",
      headers: authHeaders(context.token),
    });
    expect(response.statusCode).toBe(403);
    await context.server.close();
  });
});

async function createServiceAccount(
  context: TestServer,
  subscriberId: string,
  planId: string,
): Promise<{ id: string }> {
  const response = await context.server.inject({
    method: "POST",
    url: `/subscribers/${subscriberId}/service-accounts`,
    headers: authHeaders(context.token),
    payload: { planId, installationAddress: "Purok 2, San Isidro" },
  });
  expect(response.statusCode).toBe(201);
  return response.json().serviceAccount;
}

const billingPeriod = {
  billingPeriodStart: "2026-01-01",
  billingPeriodEnd: "2026-01-31",
  issueDate: "2026-01-01",
  dueDate: "2026-01-15",
};

describe("billing and ledger", () => {
  it("generates monthly invoices once and posts a ledger debit", async () => {
    const context = await createServer();
    const plan = await createPlan(context, { monthlyPriceCents: 99_900 });
    const subscriber = await createSubscriber(context);
    await createServiceAccount(context, subscriber.id, plan.id);

    const firstRun = await context.server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: authHeaders(context.token),
      payload: billingPeriod,
    });
    expect(firstRun.statusCode).toBe(200);
    const firstBody = firstRun.json();
    expect(firstBody.created).toHaveLength(1);
    expect(firstBody.skipped).toBe(0);
    expect(firstBody.created[0].invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(firstBody.created[0]).toMatchObject({ status: "posted", totalCents: 99_900, balanceCents: 99_900 });

    const secondRun = await context.server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: authHeaders(context.token),
      payload: billingPeriod,
    });
    expect(secondRun.json().created).toHaveLength(0);
    expect(secondRun.json().skipped).toBe(1);

    const invoices = await context.server.inject({
      method: "GET",
      url: `/invoices?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(invoices.statusCode).toBe(200);
    expect(invoiceListSchema.parse(invoices.json()).total).toBe(1);

    const ledger = await context.server.inject({
      method: "GET",
      url: `/ledger?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(ledger.statusCode).toBe(200);
    const entries = ledgerEntryListSchema.parse(ledger.json());
    expect(entries.entries).toHaveLength(1);
    expect(entries.entries[0]).toMatchObject({
      entryType: "debit",
      sourceType: "invoice",
      amountCents: 99_900,
      balanceCents: 99_900,
      createdByUserId: context.userId,
    });
    await context.server.close();
  });

  it("creates a draft invoice and posts the ledger debit on posting", async () => {
    const context = await createServer();
    const subscriber = await createSubscriber(context);

    const created = await context.server.inject({
      method: "POST",
      url: "/invoices",
      headers: authHeaders(context.token),
      payload: {
        subscriberId: subscriber.id,
        ...billingPeriod,
        lineItems: [{ description: "Monthly service fee", quantity: 1, unitPriceCents: 50_000, amountCents: 50_000 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const invoice = created.json().invoice;
    expect(invoice.status).toBe("draft");
    expect(invoice.postedAt).toBeNull();

    const duplicate = await context.server.inject({
      method: "POST",
      url: "/invoices",
      headers: authHeaders(context.token),
      payload: {
        subscriberId: subscriber.id,
        ...billingPeriod,
        lineItems: [{ description: "Duplicate", quantity: 1, unitPriceCents: 50_000, amountCents: 50_000 }],
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const beforePosting = await context.server.inject({
      method: "GET",
      url: `/ledger?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(ledgerEntryListSchema.parse(beforePosting.json()).total).toBe(0);

    const posted = await context.server.inject({
      method: "PATCH",
      url: `/invoices/${invoice.id}`,
      headers: authHeaders(context.token),
      payload: { status: "posted" },
    });
    expect(posted.statusCode).toBe(200);
    expect(posted.json().invoice.status).toBe("posted");
    expect(posted.json().invoice.postedAt).not.toBeNull();

    const afterPosting = await context.server.inject({
      method: "GET",
      url: `/ledger?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    const entries = ledgerEntryListSchema.parse(afterPosting.json());
    expect(entries.total).toBe(1);
    expect(entries.entries[0]).toMatchObject({ entryType: "debit", amountCents: 50_000, balanceCents: 50_000 });
    await context.server.close();
  });

  it("requires billing.generate to create or generate invoices", async () => {
    const context = await createServer();
    const plan = await createPlan(context, { monthlyPriceCents: 10_000 });
    const subscriber = await createSubscriber(context);
    await createServiceAccount(context, subscriber.id, plan.id);

    const readOnly = await createServer(["subscriber.view"]);
    const forbiddenCreate = await readOnly.server.inject({
      method: "POST",
      url: "/invoices",
      headers: authHeaders(readOnly.token),
      payload: {
        subscriberId: subscriber.id,
        ...billingPeriod,
        lineItems: [{ description: "Fee", quantity: 1, unitPriceCents: 1_000, amountCents: 1_000 }],
      },
    });
    expect(forbiddenCreate.statusCode).toBe(403);

    const forbiddenGenerate = await readOnly.server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: authHeaders(readOnly.token),
      payload: billingPeriod,
    });
    expect(forbiddenGenerate.statusCode).toBe(403);

    const readable = await readOnly.server.inject({
      method: "GET",
      url: `/invoices?subscriberId=${subscriber.id}`,
      headers: authHeaders(readOnly.token),
    });
    expect(readable.statusCode).toBe(200);
    await context.server.close();
    await readOnly.server.close();
  });

  it("returns 404 for unknown invoices and 400 for malformed identifiers", async () => {
    const context = await createServer();
    const unknown = await context.server.inject({
      method: "GET",
      url: `/invoices/${randomUUID()}`,
      headers: authHeaders(context.token),
    });
    expect(unknown.statusCode).toBe(404);

    const malformed = await context.server.inject({
      method: "GET",
      url: "/invoices/123",
      headers: authHeaders(context.token),
    });
    expect(malformed.statusCode).toBe(400);
    await context.server.close();
  });
});

describe("payments, allocation and receipts", () => {
  it("previews and applies oldest-first allocation with a ledger credit and receipt number", async () => {
    const context = await createServer();
    const plan = await createPlan(context, { monthlyPriceCents: 99_900 });
    const subscriber = await createSubscriber(context);
    await createServiceAccount(context, subscriber.id, plan.id);

    await context.server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: authHeaders(context.token),
      payload: billingPeriod,
    });
    await context.server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: authHeaders(context.token),
      payload: {
        billingPeriodStart: "2026-02-01",
        billingPeriodEnd: "2026-02-28",
        issueDate: "2026-02-01",
        dueDate: "2026-02-15",
      },
    });

    const preview = await context.server.inject({
      method: "POST",
      url: "/payments/preview",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 150_000 },
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = allocationPreviewSchema.parse(preview.json());
    expect(previewBody.allocations).toHaveLength(2);
    expect(previewBody.allocations[0]).toMatchObject({ amountCents: 99_900 });
    expect(previewBody.allocations[1]).toMatchObject({ amountCents: 50_100 });
    expect(previewBody.allocatedCents).toBe(150_000);
    expect(previewBody.unallocatedCents).toBe(0);

    const paid = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 150_000, method: "cash" },
    });
    expect(paid.statusCode).toBe(201);
    const payment = paid.json().payment;
    expect(payment.receiptNumber).toMatch(/^RCPT-\d{6}$/);
    expect(payment).toMatchObject({ status: "posted", allocatedCents: 150_000, unallocatedCents: 0 });
    expect(payment.allocations).toHaveLength(2);

    const payments = await context.server.inject({
      method: "GET",
      url: `/payments?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(payments.statusCode).toBe(200);
    expect(paymentListSchema.parse(payments.json()).total).toBe(1);

    const invoices = await context.server.inject({
      method: "GET",
      url: `/invoices?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    const list = invoiceListSchema.parse(invoices.json());
    const byPeriod = [...list.invoices].sort((left, right) => left.billingPeriodStart.localeCompare(right.billingPeriodStart));
    expect(byPeriod[0]).toMatchObject({ status: "paid", balanceCents: 0 });
    expect(byPeriod[1]).toMatchObject({ status: "partially_paid", balanceCents: 49_800 });

    const ledger = await context.server.inject({
      method: "GET",
      url: `/ledger?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    const entries = ledgerEntryListSchema.parse(ledger.json());
    const credit = entries.entries.find((entry) => entry.sourceType === "payment");
    expect(credit).toMatchObject({
      entryType: "credit",
      amountCents: 150_000,
      balanceCents: 49_800,
      createdByUserId: context.userId,
    });
    await context.server.close();
  });

  it("handles partial payments and advance (unallocated) credits", async () => {
    const context = await createServer();
    const plan = await createPlan(context, { monthlyPriceCents: 50_000 });
    const subscriber = await createSubscriber(context);
    await createServiceAccount(context, subscriber.id, plan.id);
    await context.server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: authHeaders(context.token),
      payload: billingPeriod,
    });

    const partial = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 20_000, method: "cash" },
    });
    expect(partial.json().payment).toMatchObject({ allocatedCents: 20_000, unallocatedCents: 0 });

    const invoiceAfterPartial = await context.server.inject({
      method: "GET",
      url: `/invoices?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(invoiceListSchema.parse(invoiceAfterPartial.json()).invoices[0]).toMatchObject({
      status: "partially_paid",
      amountPaidCents: 20_000,
      balanceCents: 30_000,
    });

    const advance = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 45_000, method: "gcash", referenceNumber: "GC-ADV-1" },
    });
    expect(advance.json().payment).toMatchObject({ status: "pending", allocatedCents: 0, unallocatedCents: 45_000 });

    const verified = await context.server.inject({
      method: "POST",
      url: `/payments/${advance.json().payment.id}/verify`,
      headers: authHeaders(context.token),
      payload: { decision: "verify" },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().payment).toMatchObject({ status: "posted", allocatedCents: 30_000, unallocatedCents: 15_000 });

    const invoiceAfterAdvance = await context.server.inject({
      method: "GET",
      url: `/invoices?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(invoiceListSchema.parse(invoiceAfterAdvance.json()).invoices[0]).toMatchObject({
      status: "paid",
      balanceCents: 0,
    });
    await context.server.close();
  });

  it("requires GCash verification, rejects duplicate references, and records rejections", async () => {
    const context = await createServer();
    const subscriber = await createSubscriber(context);

    const first = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 5_000, method: "gcash", referenceNumber: "GC-DUP" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().payment.status).toBe("pending");

    const duplicate = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 5_000, method: "gcash", referenceNumber: "GC-DUP" },
    });
    expect(duplicate.statusCode).toBe(409);

    const ledger = await context.server.inject({
      method: "GET",
      url: `/ledger?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(ledgerEntryListSchema.parse(ledger.json()).total).toBe(0);

    const rejected = await context.server.inject({
      method: "POST",
      url: `/payments/${first.json().payment.id}/verify`,
      headers: authHeaders(context.token),
      payload: { decision: "reject", note: "Unverifiable reference" },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().payment).toMatchObject({ status: "rejected", verificationNote: "Unverifiable reference" });
    await context.server.close();
  });

  it("reverses a posted payment, restores invoice balances, and keeps the audit trail", async () => {
    const context = await createServer();
    const plan = await createPlan(context, { monthlyPriceCents: 75_000 });
    const subscriber = await createSubscriber(context);
    await createServiceAccount(context, subscriber.id, plan.id);
    await context.server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: authHeaders(context.token),
      payload: billingPeriod,
    });

    const paid = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 75_000, method: "cash" },
    });
    const payment = paid.json().payment;

    const reversed = await context.server.inject({
      method: "POST",
      url: `/payments/${payment.id}/reverse`,
      headers: authHeaders(context.token),
      payload: { reason: "Cheque cleared twice" },
    });
    expect(reversed.statusCode).toBe(200);
    expect(reversed.json().payment).toMatchObject({ status: "reversed", allocatedCents: 0 });
    expect(reversed.json().payment.reversal).toMatchObject({ reason: "Cheque cleared twice", reversedByUserId: context.userId });

    const invoice = await context.server.inject({
      method: "GET",
      url: `/invoices?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(invoiceListSchema.parse(invoice.json()).invoices[0]).toMatchObject({
      status: "posted",
      amountPaidCents: 0,
      balanceCents: 75_000,
    });

    const ledger = await context.server.inject({
      method: "GET",
      url: `/ledger?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    const entries = ledgerEntryListSchema.parse(ledger.json());
    expect(entries.total).toBe(3);
    expect(entries.entries.find((entry) => entry.sourceType === "reversal")).toMatchObject({
      entryType: "debit",
      amountCents: 75_000,
      balanceCents: 75_000,
    });

    const secondReverse = await context.server.inject({
      method: "POST",
      url: `/payments/${payment.id}/reverse`,
      headers: authHeaders(context.token),
      payload: { reason: "Try again" },
    });
    expect(secondReverse.statusCode).toBe(409);
    await context.server.close();
  });

  it("enforces payment permissions and validates identifiers", async () => {
    const context = await createServer();
    const subscriber = await createSubscriber(context);

    const readOnly = await createServer(["subscriber.view"], context.directory);
    const forbiddenCreate = await readOnly.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(readOnly.token),
      payload: { subscriberId: subscriber.id, amountCents: 1_000, method: "cash" },
    });
    expect(forbiddenCreate.statusCode).toBe(403);

    const cashier = await createServer(["subscriber.view", "payment.create"], context.directory);
    const created = await cashier.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(cashier.token),
      payload: { subscriberId: subscriber.id, amountCents: 1_000, method: "cash" },
    });
    expect(created.statusCode).toBe(201);
    const forbiddenReverse = await cashier.server.inject({
      method: "POST",
      url: `/payments/${created.json().payment.id}/reverse`,
      headers: authHeaders(cashier.token),
      payload: { reason: "Not allowed" },
    });
    expect(forbiddenReverse.statusCode).toBe(403);

    const unknown = await context.server.inject({
      method: "GET",
      url: `/payments/${randomUUID()}`,
      headers: authHeaders(context.token),
    });
    expect(unknown.statusCode).toBe(404);

    const malformed = await context.server.inject({
      method: "GET",
      url: "/payments/123",
      headers: authHeaders(context.token),
    });
    expect(malformed.statusCode).toBe(400);
    await context.server.close();
    await readOnly.server.close();
    await cashier.server.close();
  });
});

async function setupCollectorBatch(context: TestServer, amountCents: number, routeDate = "2026-01-10") {
  const plan = await createPlan(context, { monthlyPriceCents: amountCents });
  const subscriber = await createSubscriber(context);
  await createServiceAccount(context, subscriber.id, plan.id);
  const generated = await context.server.inject({
    method: "POST",
    url: "/billing/generate",
    headers: authHeaders(context.token),
    payload: billingPeriod,
  });
  expect(generated.statusCode).toBe(200);
  expect(generated.json().created).toHaveLength(1);

  const collectorResponse = await context.server.inject({
    method: "POST",
    url: "/collectors",
    headers: authHeaders(context.token),
    payload: { code: "COL-1", name: "Alex Collector", contactNumber: "09171234567" },
  });
  expect(collectorResponse.statusCode).toBe(201);
  const collector = collectorResponse.json().collector;

  const assignment = await context.server.inject({
    method: "POST",
    url: "/collector-assignments",
    headers: authHeaders(context.token),
    payload: { collectorId: collector.id, subscriberIds: [subscriber.id] },
  });
  expect(assignment.statusCode).toBe(201);
  expect(assignment.json().assignments).toHaveLength(1);

  const batchResponse = await context.server.inject({
    method: "POST",
    url: "/collection-batches",
    headers: authHeaders(context.token),
    payload: { collectorId: collector.id, routeDate },
  });
  expect(batchResponse.statusCode).toBe(201);
  return { subscriber, collector, batch: batchResponse.json().batch as { id: string; batchNumber: string } };
}

describe("collector and remittance management", () => {
  it("runs a collection batch through its lifecycle when the collector is balanced (AT-07)", async () => {
    const context = await createServer();
    const { subscriber, batch } = await setupCollectorBatch(context, 50_000);

    expect(batch.batchNumber).toBe("BATCH-000001");

    const fetched = await context.server.inject({
      method: "GET",
      url: `/collection-batches/${batch.id}`,
      headers: authHeaders(context.token),
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().batch).toMatchObject({ status: "OPEN", expectedCents: 50_000, collectedCents: 0 });
    expect(fetched.json().batch.accounts).toHaveLength(1);
    expect(fetched.json().batch.accounts[0]).toMatchObject({
      subscriberId: subscriber.id,
      currentBillCents: 50_000,
      arrearsCents: 0,
      expectedCents: 50_000,
      status: "PENDING",
    });

    const started = await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/start`,
      headers: authHeaders(context.token),
    });
    expect(started.json().batch.status).toBe("IN_PROGRESS");

    const payment = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 50_000, method: "cash", collectionBatchId: batch.id },
    });
    expect(payment.statusCode).toBe(201);
    expect(payment.json().payment).toMatchObject({
      collectionBatchId: batch.id,
      collectorId: fetched.json().batch.collectorId,
    });

    const afterCollection = await context.server.inject({
      method: "GET",
      url: `/collection-batches/${batch.id}`,
      headers: authHeaders(context.token),
    });
    expect(afterCollection.json().batch).toMatchObject({
      status: "IN_PROGRESS",
      cashCollectedCents: 50_000,
      collectedCents: 50_000,
    });
    expect(afterCollection.json().batch.accounts[0].status).toBe("COLLECTED");

    const submitted = await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/submit`,
      headers: authHeaders(context.token),
    });
    expect(submitted.json().batch.status).toBe("SUBMITTED");

    const remitted = await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/remit`,
      headers: authHeaders(context.token),
      payload: { amountCents: 50_000, referenceNumber: "R-1" },
    });
    expect(remitted.json().batch).toMatchObject({
      status: "REMITTED",
      remittedCents: 50_000,
      differenceCents: 0,
      shortageCents: 0,
      overageCents: 0,
    });

    const reconciled = await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/reconcile`,
      headers: authHeaders(context.token),
      payload: { note: "Balanced" },
    });
    expect(reconciled.json().batch.status).toBe("RECONCILED");

    const closed = await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/close`,
      headers: authHeaders(context.token),
      payload: { confirm: true },
    });
    expect(closed.json().batch.status).toBe("CLOSED");

    const routeSheet = await context.server.inject({
      method: "GET",
      url: `/collection-batches/${batch.id}/route-sheet`,
      headers: authHeaders(context.token),
    });
    expect(routeSheet.statusCode).toBe(200);
    expect(routeSheet.json().accounts).toHaveLength(1);

    const report = await context.server.inject({
      method: "GET",
      url: "/collector-report",
      headers: authHeaders(context.token),
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().rows[0]).toMatchObject({
      batches: 1,
      expectedCents: 50_000,
      collectedCents: 50_000,
      remittedCents: 50_000,
      shortageCents: 0,
    });

    await context.server.close();
  });

  it("records an explicit shortage when the collector remits less than collected (AT-08)", async () => {
    const context = await createServer();
    const { subscriber, batch } = await setupCollectorBatch(context, 20_000);

    await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/start`,
      headers: authHeaders(context.token),
    });
    const payment = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 20_000, method: "cash", collectionBatchId: batch.id },
    });
    expect(payment.statusCode).toBe(201);
    await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/submit`,
      headers: authHeaders(context.token),
    });

    const remitted = await context.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/remit`,
      headers: authHeaders(context.token),
      payload: { amountCents: 15_000 },
    });
    expect(remitted.json().batch).toMatchObject({
      status: "REMITTED",
      collectedCents: 20_000,
      remittedCents: 15_000,
      shortageCents: 5_000,
      overageCents: 0,
    });
    await context.server.close();
  });

  it("requires collection.reconcile to remit and close a batch", async () => {
    const context = await createServer();
    const { batch } = await setupCollectorBatch(context, 10_000);

    const supervisor = await createServer(["subscriber.view", "collection.manage"], context.directory);
    const forbiddenRemit = await supervisor.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/remit`,
      headers: authHeaders(supervisor.token),
      payload: { amountCents: 10_000 },
    });
    expect(forbiddenRemit.statusCode).toBe(403);

    const forbiddenClose = await supervisor.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/close`,
      headers: authHeaders(supervisor.token),
      payload: { confirm: true },
    });
    expect(forbiddenClose.statusCode).toBe(403);

    await context.server.close();
    await supervisor.server.close();
  });
});

async function setupReceivable(context: TestServer, amountCents = 100_000) {
  const plan = await createPlan(context, { monthlyPriceCents: amountCents });
  const subscriber = await createSubscriber(context);
  const account = await createServiceAccount(context, subscriber.id, plan.id);
  const generated = await context.server.inject({
    method: "POST",
    url: "/billing/generate",
    headers: authHeaders(context.token),
    payload: billingPeriod,
  });
  expect(generated.statusCode).toBe(200);
  expect(generated.json().created).toHaveLength(1);
  return { plan, subscriber, account };
}

describe("receivables and service control", () => {
  it("builds the aging report, overdue list, and suspension candidates", async () => {
    const context = await createServer();
    const { subscriber, account } = await setupReceivable(context, 100_000);

    const current = await context.server.inject({
      method: "GET",
      url: "/aging-report?from=2026-01-10",
      headers: authHeaders(context.token),
    });
    expect(current.statusCode).toBe(200);
    const currentReport = agingReportSchema.parse(current.json());
    expect(currentReport).toMatchObject({ asOf: "2026-01-10", totals: { totalBalanceCents: 100_000, currentCents: 100_000 } });
    expect(currentReport.rows).toHaveLength(1);
    expect(currentReport.buckets.map((bucket) => bucket.label)).toEqual([
      "1-30 days",
      "31-60 days",
      "61-90 days",
      "Over 90 days",
    ]);

    const overdue = await context.server.inject({
      method: "GET",
      url: "/overdue?from=2026-02-20",
      headers: authHeaders(context.token),
    });
    expect(overdue.statusCode).toBe(200);
    const overdueList = overdueListSchema.parse(overdue.json());
    expect(overdueList).toMatchObject({ asOf: "2026-02-20", count: 1, totalBalanceCents: 100_000 });
    expect(overdueList.invoices[0]).toMatchObject({
      subscriberId: subscriber.id,
      daysOverdue: 36,
      balanceCents: 100_000,
      status: "posted",
    });

    const report = await context.server.inject({
      method: "GET",
      url: "/aging-report?from=2026-02-20",
      headers: authHeaders(context.token),
    });
    const aging = agingReportSchema.parse(report.json());
    const row = aging.rows[0]!;
    expect(row.totalBalanceCents).toBe(100_000);
    expect(row.currentCents).toBe(0);
    const bucket = row.buckets.find((entry) => entry.label === "31-60 days")!;
    expect(bucket).toMatchObject({ amountCents: 100_000, count: 1 });
    expect(aging.totals).toMatchObject({ totalBalanceCents: 100_000, currentCents: 0 });

    const candidates = await context.server.inject({
      method: "GET",
      url: "/suspension-candidates?from=2026-02-20",
      headers: authHeaders(context.token),
    });
    expect(candidates.statusCode).toBe(200);
    const candidateList = suspensionListSchema.parse(candidates.json());
    expect(candidateList.candidates).toHaveLength(1);
    expect(candidateList.candidates[0]).toMatchObject({
      subscriberId: subscriber.id,
      serviceAccountId: account.id,
      oldestOverdueDays: 36,
      invoiceCount: 1,
      totalOverdueCents: 100_000,
    });

    await context.server.close();
  });

  it("suspends, records history, blocks repeat suspension, and reconnects", async () => {
    const context = await createServer();
    const { account } = await setupReceivable(context, 70_000);

    const suspended = await context.server.inject({
      method: "POST",
      url: `/service-accounts/${account.id}/suspend`,
      headers: authHeaders(context.token),
      payload: { reason: "Overdue balance" },
    });
    expect(suspended.statusCode).toBe(200);
    const suspension = serviceSuspensionResponseSchema.parse(suspended.json()).suspension;
    expect(suspension).toMatchObject({ serviceAccountId: account.id, reason: "Overdue balance", reconnectedAt: null });

    const accountAfterSuspend = await context.server.inject({
      method: "GET",
      url: `/service-accounts/${account.id}`,
      headers: authHeaders(context.token),
    });
    const detail = serviceAccountDetailSchema.parse(accountAfterSuspend.json().serviceAccount);
    expect(detail.status).toBe("SUSPENDED");
    expect(detail.events[0]).toMatchObject({ fromStatus: "ACTIVE", toStatus: "SUSPENDED", reason: "Overdue balance" });

    const candidatesAfterSuspend = await context.server.inject({
      method: "GET",
      url: "/suspension-candidates?from=2026-02-20",
      headers: authHeaders(context.token),
    });
    expect(suspensionListSchema.parse(candidatesAfterSuspend.json()).candidates).toHaveLength(0);

    const repeat = await context.server.inject({
      method: "POST",
      url: `/service-accounts/${account.id}/suspend`,
      headers: authHeaders(context.token),
      payload: { reason: "Again" },
    });
    expect(repeat.statusCode).toBe(409);

    const history = await context.server.inject({
      method: "GET",
      url: `/service-accounts/${account.id}/suspensions`,
      headers: authHeaders(context.token),
    });
    const historyList = serviceSuspensionListSchema.parse(history.json());
    expect(historyList.suspensions).toHaveLength(1);

    const allSuspensions = await context.server.inject({
      method: "GET",
      url: "/suspensions",
      headers: authHeaders(context.token),
    });
    expect(serviceSuspensionListSchema.parse(allSuspensions.json()).suspensions).toHaveLength(1);

    const reconnected = await context.server.inject({
      method: "POST",
      url: `/service-accounts/${account.id}/reconnect`,
      headers: authHeaders(context.token),
      payload: { reason: "Payment received" },
    });
    expect(reconnected.statusCode).toBe(200);
    const reconnection = serviceSuspensionResponseSchema.parse(reconnected.json()).suspension;
    expect(reconnection).toMatchObject({ id: suspension.id, reconnectionReason: "Payment received" });
    expect(reconnection.reconnectedAt).not.toBeNull();

    const accountAfterReconnect = await context.server.inject({
      method: "GET",
      url: `/service-accounts/${account.id}`,
      headers: authHeaders(context.token),
    });
    expect(serviceAccountDetailSchema.parse(accountAfterReconnect.json().serviceAccount).status).toBe("ACTIVE");

    const reconnectAgain = await context.server.inject({
      method: "POST",
      url: `/service-accounts/${account.id}/reconnect`,
      headers: authHeaders(context.token),
      payload: {},
    });
    expect(reconnectAgain.statusCode).toBe(400);

    await context.server.close();
  });

  it("enforces permissions and validates service control identifiers", async () => {
    const context = await createServer();
    const { account } = await setupReceivable(context, 30_000);

    const viewer = await createServer(["subscriber.view"], context.directory);
    const forbidden = await viewer.server.inject({
      method: "POST",
      url: `/service-accounts/${account.id}/suspend`,
      headers: authHeaders(viewer.token),
      payload: { reason: "No permission" },
    });
    expect(forbidden.statusCode).toBe(403);

    const unknown = await context.server.inject({
      method: "POST",
      url: `/service-accounts/${randomUUID()}/suspend`,
      headers: authHeaders(context.token),
      payload: { reason: "Unknown account" },
    });
    expect(unknown.statusCode).toBe(404);

    const malformed = await context.server.inject({
      method: "POST",
      url: "/service-accounts/not-a-uuid/suspend",
      headers: authHeaders(context.token),
      payload: {},
    });
    expect(malformed.statusCode).toBe(400);

    const invalidPayload = await context.server.inject({
      method: "POST",
      url: `/service-accounts/${account.id}/suspend`,
      headers: authHeaders(context.token),
      payload: { reason: "x" },
    });
    expect(invalidPayload.statusCode).toBe(400);

    await context.server.close();
    await viewer.server.close();
  });
});

describe("reports and dashboard", () => {
  it("lists the report catalog and enforces the report.view permission", async () => {
    const context = await createServer();
    const catalog = await context.server.inject({
      method: "GET",
      url: "/reports",
      headers: authHeaders(context.token),
    });
    expect(catalog.statusCode).toBe(200);
    const parsed = reportCatalogSchema.parse(catalog.json());
    expect(parsed.reports).toHaveLength(8);
    expect(parsed.reports.map((item) => item.key)).toContain("collection-summary");

    const viewer = await createServer(["subscriber.view"], context.directory);
    const forbidden = await viewer.server.inject({
      method: "GET",
      url: "/reports",
      headers: authHeaders(viewer.token),
    });
    expect(forbidden.statusCode).toBe(403);

    await context.server.close();
    await viewer.server.close();
  });

  it("builds the collection, billing versus collection and revenue reports", async () => {
    const context = await createServer();
    const { subscriber } = await setupReceivable(context, 100_000);
    const paid = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 100_000, method: "cash" },
    });
    expect(paid.statusCode).toBe(201);

    const summary = await context.server.inject({
      method: "GET",
      url: "/reports/collection-summary",
      headers: authHeaders(context.token),
    });
    expect(summary.statusCode).toBe(200);
    const summaryReport = reportSchema.parse(summary.json());
    expect(summaryReport.key).toBe("collection-summary");
    expect(summaryReport.sections[0]!.rows[0]).toMatchObject({ method: "Cash", amountCents: 100_000 });

    const billing = await context.server.inject({
      method: "GET",
      url: "/reports/billing-vs-collection",
      headers: authHeaders(context.token),
    });
    const billingReport = reportSchema.parse(billing.json());
    expect(billingReport.kpis?.find((kpi) => kpi.label === "Total billed")?.value).toBe(100_000);
    expect(billingReport.kpis?.find((kpi) => kpi.label === "Total collected")?.value).toBe(100_000);

    const revenue = await context.server.inject({
      method: "GET",
      url: "/reports/revenue?from=2026-01-01&to=2026-01-31",
      headers: authHeaders(context.token),
    });
    expect(reportSchema.parse(revenue.json()).sections).toHaveLength(3);

    await context.server.close();
  });

  it("builds the aging, overdue, subscriber master and statement reports", async () => {
    const context = await createServer();
    const { subscriber } = await setupReceivable(context, 100_000);

    const aging = await context.server.inject({
      method: "GET",
      url: "/reports/ar-aging?asOf=2026-02-20",
      headers: authHeaders(context.token),
    });
    expect(aging.statusCode).toBe(200);
    const agingReport = reportSchema.parse(aging.json());
    expect(agingReport.key).toBe("ar-aging");
    expect(agingReport.kpis?.find((kpi) => kpi.label === "Total outstanding")?.value).toBe(100_000);

    const overdue = await context.server.inject({
      method: "GET",
      url: "/reports/overdue?asOf=2026-02-20",
      headers: authHeaders(context.token),
    });
    const overdueReport = reportSchema.parse(overdue.json());
    expect(overdueReport.sections[0]!.rows[0]).toMatchObject({ daysOverdue: 36, balanceCents: 100_000 });

    const master = await context.server.inject({
      method: "GET",
      url: "/reports/subscriber-master",
      headers: authHeaders(context.token),
    });
    const masterReport = reportSchema.parse(master.json());
    expect(masterReport.sections[0]!.rows[0]).toMatchObject({ accountNumber: subscriber.accountNumber });

    const statement = await context.server.inject({
      method: "GET",
      url: `/reports/statement-of-account?subscriberId=${subscriber.id}`,
      headers: authHeaders(context.token),
    });
    expect(statement.statusCode).toBe(200);
    const statementReport = reportSchema.parse(statement.json());
    expect(statementReport.key).toBe("statement-of-account");
    expect(statementReport.sections[0]!.rows.some((row) => row.entryType === "Debit")).toBe(true);

    await context.server.close();
  });

  it("builds the dashboard and enforces report.export on exports", async () => {
    const context = await createServer();
    const { subscriber } = await setupReceivable(context, 100_000);
    const paid = await context.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(context.token),
      payload: { subscriberId: subscriber.id, amountCents: 40_000, method: "cash" },
    });
    expect(paid.statusCode).toBe(201);

    const dashboard = await context.server.inject({
      method: "GET",
      url: "/reports/dashboard?asOf=2026-02-20",
      headers: authHeaders(context.token),
    });
    expect(dashboard.statusCode).toBe(200);
    const body = dashboardSchema.parse(dashboard.json());
    expect(body.asOf).toBe("2026-02-20");
    expect(body.kpis.length).toBeGreaterThanOrEqual(6);
    expect(body.billingVsCollection).toHaveLength(6);
    expect(body.overdueAlerts[0]).toMatchObject({ subscriberId: subscriber.id });

    const exported = await context.server.inject({
      method: "GET",
      url: "/reports/ar-aging/export?asOf=2026-02-20",
      headers: authHeaders(context.token),
    });
    expect(exported.statusCode).toBe(200);
    expect(reportSchema.parse(exported.json()).key).toBe("ar-aging");

    const viewer = await createServer(["subscriber.view", "report.view"], context.directory);
    const forbidden = await viewer.server.inject({
      method: "GET",
      url: "/reports/ar-aging/export?asOf=2026-02-20",
      headers: authHeaders(viewer.token),
    });
    expect(forbidden.statusCode).toBe(403);

    await context.server.close();
    await viewer.server.close();
  });

  it("returns 404 for unknown reports and missing statement subscribers", async () => {
    const context = await createServer();
    const unknown = await context.server.inject({
      method: "GET",
      url: "/reports/not-a-report",
      headers: authHeaders(context.token),
    });
    expect(unknown.statusCode).toBe(404);

    const missing = await context.server.inject({
      method: "GET",
      url: "/reports/statement-of-account",
      headers: authHeaders(context.token),
    });
    expect(missing.statusCode).toBe(404);

    await context.server.close();
  });
});
