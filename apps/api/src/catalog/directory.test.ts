import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  serviceAccountDetailSchema,
  serviceAccountListSchema,
  subscriberDetailSchema,
  subscriberListSchema,
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
