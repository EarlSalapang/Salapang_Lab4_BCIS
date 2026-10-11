import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { invoiceListSchema, ledgerEntryListSchema, paymentListSchema } from "@bcis/shared";

import { buildServer } from "./app.js";
import { hashPassword } from "./auth/passwords.js";
import type { AuthIdentity, AuthStore } from "./auth/types.js";
import { MemoryDirectoryStore } from "./catalog/memory-store.js";

const testPassword = "BCIS-test-password-123";

const adminPermissions = [
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
  "user.manage",
];

interface Account {
  username: string;
  displayName: string;
  permissions: string[];
}

function createAuthStore(accounts: Account[], passwordHash: string): AuthStore {
  const identities: AuthIdentity[] = accounts.map((account) => ({
    id: randomUUID(),
    username: account.username,
    displayName: account.displayName,
    passwordHash,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    roles: ["Administrator"],
    permissions: account.permissions,
  }));
  const sessions = new Map<string, { userId: string; revoked: boolean }>();
  const byUsername = new Map(identities.map((identity) => [identity.username, identity]));
  return {
    findUserByUsername: async (username) => byUsername.get(username) ?? null,
    recordFailedLogin: async () => undefined,
    createSession: async (userId, tokenHash) => {
      sessions.set(tokenHash, { userId, revoked: false });
    },
    findSession: async (tokenHash) => {
      const session = sessions.get(tokenHash);
      if (!session || session.revoked) return null;
      const identity = identities.find((candidate) => candidate.id === session.userId)!;
      return {
        id: identity.id,
        username: identity.username,
        displayName: identity.displayName,
        roles: identity.roles,
        permissions: identity.permissions,
      };
    },
    revokeSession: async (tokenHash) => {
      const session = sessions.get(tokenHash);
      if (session) session.revoked = true;
    },
    listUsers: async () => [],
    listAssignableRoles: async () => ["Cashier"],
    createUser: async (input) => ({
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      isActive: true,
      roles: [input.role],
    }),
  };
}

interface Harness {
  server: Awaited<ReturnType<typeof buildServer>>;
  directory: MemoryDirectoryStore;
  tokens: Record<string, string>;
}

async function start(accounts: Account[] = [{ username: "admin", displayName: "Admin", permissions: adminPermissions }]): Promise<Harness> {
  const passwordHash = await hashPassword(testPassword);
  const auth = createAuthStore(accounts, passwordHash);
  const directory = new MemoryDirectoryStore();
  const server = buildServer({ query: async () => ({ rows: [] }) }, auth, {
    disableLogging: true,
    directory,
  });
  const tokens: Record<string, string> = {};
  for (const account of accounts) {
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: account.username, password: testPassword },
    });
    expect(login.statusCode).toBe(200);
    tokens[account.username] = login.json().token as string;
  }
  return { server, directory, tokens };
}

const authHeaders = (token: string) => ({ authorization: `Bearer ${token}` });

const january = { billingPeriodStart: "2026-01-01", billingPeriodEnd: "2026-01-31", issueDate: "2026-01-01", dueDate: "2026-01-15" };
const august = { billingPeriodStart: "2026-08-01", billingPeriodEnd: "2026-08-31", issueDate: "2026-08-01", dueDate: "2026-08-15" };
const september = { billingPeriodStart: "2026-09-01", billingPeriodEnd: "2026-09-30", issueDate: "2026-09-01", dueDate: "2026-09-15" };

async function createPlan(harness: Harness, token: string, monthlyPriceCents: number, code = "ACCT-PLAN") {
  const response = await harness.server.inject({
    method: "POST",
    url: "/plans",
    headers: authHeaders(token),
    payload: { code, name: `Plan ${code}`, serviceType: "INTERNET", monthlyPriceCents },
  });
  expect(response.statusCode).toBe(201);
  return response.json().plan as { id: string };
}

async function createSubscriber(harness: Harness, token: string) {
  const response = await harness.server.inject({
    method: "POST",
    url: "/subscribers",
    headers: authHeaders(token),
    payload: {
      firstName: "Juan",
      lastName: "Dela Cruz",
      contactNumber: "09171234567",
      addressLine: "Purok 1",
      barangay: "San Isidro",
      municipality: "Valencia",
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().subscriber as { id: string };
}

async function createAccount(harness: Harness, token: string, subscriberId: string, planId: string) {
  const response = await harness.server.inject({
    method: "POST",
    url: `/subscribers/${subscriberId}/service-accounts`,
    headers: authHeaders(token),
    payload: { planId, installationAddress: "Purok 1, San Isidro" },
  });
  expect(response.statusCode).toBe(201);
  return response.json().serviceAccount as { id: string };
}

async function generate(harness: Harness, token: string, period: typeof january) {
  const response = await harness.server.inject({
    method: "POST",
    url: "/billing/generate",
    headers: authHeaders(token),
    payload: period,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { created: { id: string }[]; skipped: number };
}

async function listInvoices(harness: Harness, token: string, subscriberId: string) {
  const response = await harness.server.inject({
    method: "GET",
    url: `/invoices?subscriberId=${subscriberId}`,
    headers: authHeaders(token),
  });
  expect(response.statusCode).toBe(200);
  return invoiceListSchema.parse(response.json()).invoices;
}

async function listLedger(harness: Harness, token: string, subscriberId: string) {
  const response = await harness.server.inject({
    method: "GET",
    url: `/ledger?subscriberId=${subscriberId}`,
    headers: authHeaders(token),
  });
  expect(response.statusCode).toBe(200);
  return ledgerEntryListSchema.parse(response.json()).entries;
}

describe("mandatory acceptance tests", () => {
  it("AT-01 exact payment: ₱999 payment on a ₱999 invoice leaves ₱0, marks PAID, and creates a receipt", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const plan = await createPlan(harness, token, 99_900);
    const subscriber = await createSubscriber(harness, token);
    await createAccount(harness, token, subscriber.id, plan.id);
    await generate(harness, token, january);

    const response = await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: subscriber.id, amountCents: 99_900, method: "cash" },
    });
    expect(response.statusCode).toBe(201);
    const payment = response.json().payment;
    expect(payment).toMatchObject({ status: "posted", allocatedCents: 99_900, unallocatedCents: 0 });
    expect(payment.receiptNumber).toMatch(/^RCPT-\d{6}$/);

    expect((await listInvoices(harness, token, subscriber.id))[0]).toMatchObject({ status: "paid", balanceCents: 0, amountPaidCents: 99_900 });
    expect((await listLedger(harness, token, subscriber.id)).find((entry) => entry.sourceType === "payment")).toMatchObject({ entryType: "credit", balanceCents: 0 });
    await harness.server.close();
  });

  it("AT-02 partial payment: ₱500 on a ₱999 invoice leaves ₱499 and marks PARTIALLY_PAID", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const plan = await createPlan(harness, token, 99_900);
    const subscriber = await createSubscriber(harness, token);
    await createAccount(harness, token, subscriber.id, plan.id);
    await generate(harness, token, january);

    const response = await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: subscriber.id, amountCents: 50_000, method: "cash" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().payment).toMatchObject({ allocatedCents: 50_000, unallocatedCents: 0 });

    expect((await listInvoices(harness, token, subscriber.id))[0]).toMatchObject({ status: "partially_paid", amountPaidCents: 50_000, balanceCents: 49_900 });
    expect((await listLedger(harness, token, subscriber.id)).find((entry) => entry.sourceType === "payment")).toMatchObject({ entryType: "credit", balanceCents: 49_900 });
    await harness.server.close();
  });

  it("AT-03 advance payment: ₱1,000 invoice with ₱3,000 payment keeps the ₱2,000 surplus as credit", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const plan = await createPlan(harness, token, 100_000);
    const subscriber = await createSubscriber(harness, token);
    await createAccount(harness, token, subscriber.id, plan.id);
    await generate(harness, token, january);

    const response = await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: subscriber.id, amountCents: 300_000, method: "cash" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().payment).toMatchObject({ status: "posted", allocatedCents: 100_000, unallocatedCents: 200_000 });

    expect((await listInvoices(harness, token, subscriber.id))[0]).toMatchObject({ status: "paid", balanceCents: 0 });
    await harness.server.close();
  });

  it("AT-04 oldest-first arrears: ₱1,200 clears August and leaves ₱798 on September", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const plan = await createPlan(harness, token, 99_900);
    const subscriber = await createSubscriber(harness, token);
    await createAccount(harness, token, subscriber.id, plan.id);
    await generate(harness, token, august);
    await generate(harness, token, september);

    const response = await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: subscriber.id, amountCents: 120_000, method: "cash" },
    });
    expect(response.statusCode).toBe(201);
    const allocations = response.json().payment.allocations as { amountCents: number }[];
    expect(allocations[0]).toMatchObject({ amountCents: 99_900 });
    expect(allocations[1]).toMatchObject({ amountCents: 20_100 });

    const [oldest, newest] = [...(await listInvoices(harness, token, subscriber.id))].sort((left, right) => left.billingPeriodStart.localeCompare(right.billingPeriodStart));
    expect(oldest).toMatchObject({ status: "paid", balanceCents: 0 });
    expect(newest).toMatchObject({ status: "partially_paid", balanceCents: 79_800 });
    await harness.server.close();
  });

  it("AT-05 duplicate GCash reference: reusing a verified reference is blocked", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const subscriber = await createSubscriber(harness, token);

    const first = await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: subscriber.id, amountCents: 5_000, method: "gcash", referenceNumber: "GC-VERIFIED-1" },
    });
    expect(first.statusCode).toBe(201);
    const verified = await harness.server.inject({
      method: "POST",
      url: `/payments/${first.json().payment.id}/verify`,
      headers: authHeaders(token),
      payload: { decision: "verify" },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().payment.status).toBe("posted");

    const duplicate = await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: subscriber.id, amountCents: 5_000, method: "gcash", referenceNumber: "GC-VERIFIED-1" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect((await listLedger(harness, token, subscriber.id)).filter((entry) => entry.sourceType === "payment")).toHaveLength(1);
    await harness.server.close();
  });

  it("AT-06 payment reversal: original stays visible, a linked reversal restores balances and records the actor/reason", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const plan = await createPlan(harness, token, 75_000);
    const subscriber = await createSubscriber(harness, token);
    await createAccount(harness, token, subscriber.id, plan.id);
    await generate(harness, token, january);

    const paid = await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: subscriber.id, amountCents: 75_000, method: "cash" },
    });
    const payment = paid.json().payment;

    const reversed = await harness.server.inject({
      method: "POST",
      url: `/payments/${payment.id}/reverse`,
      headers: authHeaders(token),
      payload: { reason: "Incorrectly posted" },
    });
    expect(reversed.statusCode).toBe(200);
    expect(reversed.json().payment).toMatchObject({ status: "reversed", allocatedCents: 0 });
    expect(reversed.json().payment.reversal).toMatchObject({ reason: "Incorrectly posted" });
    expect(reversed.json().payment.reversal.reversedByUserId).toBeTruthy();

    expect((await listInvoices(harness, token, subscriber.id))[0]).toMatchObject({ status: "posted", amountPaidCents: 0, balanceCents: 75_000 });
    expect((await listLedger(harness, token, subscriber.id)).find((entry) => entry.sourceType === "reversal")).toMatchObject({ entryType: "debit", balanceCents: 75_000 });

    const listed = await harness.server.inject({
      method: "GET",
      url: `/payments?subscriberId=${subscriber.id}`,
      headers: authHeaders(token),
    });
    const payments = paymentListSchema.parse(listed.json()).payments;
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ id: payment.id, status: "reversed" });
    await harness.server.close();
  });

  it("AT-07 collector balanced remittance: ₱20,000 collected and remitted reconciles with a ₱0 difference", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const batch = await setupCollectorBatch(harness, token, 20_000);

    await harness.server.inject({ method: "POST", url: `/collection-batches/${batch.id}/start`, headers: authHeaders(token) });
    await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: batch.subscriberId, amountCents: 20_000, method: "cash", collectionBatchId: batch.id },
    });
    await harness.server.inject({ method: "POST", url: `/collection-batches/${batch.id}/submit`, headers: authHeaders(token) });

    const remitted = await harness.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/remit`,
      headers: authHeaders(token),
      payload: { amountCents: 20_000, referenceNumber: "R-1" },
    });
    expect(remitted.json().batch).toMatchObject({ status: "REMITTED", collectedCents: 20_000, remittedCents: 20_000, differenceCents: 0, shortageCents: 0 });

    const reconciled = await harness.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/reconcile`,
      headers: authHeaders(token),
      payload: { note: "Balanced" },
    });
    expect(reconciled.json().batch.status).toBe("RECONCILED");

    const closed = await harness.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/close`,
      headers: authHeaders(token),
      payload: { confirm: true },
    });
    expect(closed.json().batch.status).toBe("CLOSED");
    await harness.server.close();
  });

  it("AT-08 collector shortage: ₱500 shortage is surfaced and the batch cannot close as balanced", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const batch = await setupCollectorBatch(harness, token, 20_000);

    await harness.server.inject({ method: "POST", url: `/collection-batches/${batch.id}/start`, headers: authHeaders(token) });
    await harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(token),
      payload: { subscriberId: batch.subscriberId, amountCents: 20_000, method: "cash", collectionBatchId: batch.id },
    });
    await harness.server.inject({ method: "POST", url: `/collection-batches/${batch.id}/submit`, headers: authHeaders(token) });

    const remitted = await harness.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/remit`,
      headers: authHeaders(token),
      payload: { amountCents: 19_500 },
    });
    expect(remitted.json().batch).toMatchObject({ status: "REMITTED", collectedCents: 20_000, remittedCents: 19_500, shortageCents: 500, differenceCents: 500 });

    const sneakyClose = await harness.server.inject({
      method: "POST",
      url: `/collection-batches/${batch.id}/close`,
      headers: authHeaders(token),
      payload: { confirm: true },
    });
    expect(sneakyClose.statusCode).toBe(409);
    await harness.server.close();
  });

  it("AT-09 concurrent users: three cashiers paying at once cause no over-allocation or duplicate receipt numbers", async () => {
    const accounts: Account[] = [1, 2, 3].map((index) => ({ username: `cashier-${index}`, displayName: `Cashier ${index}`, permissions: adminPermissions }));
    const harness = await start(accounts);
    const token = harness.tokens["cashier-1"]!;
    const plan = await createPlan(harness, token, 100_000);
    const subscriber = await createSubscriber(harness, token);
    await createAccount(harness, token, subscriber.id, plan.id);
    await generate(harness, token, january);

    const responses = await Promise.all(["cashier-1", "cashier-2", "cashier-3"].map((username) => harness.server.inject({
      method: "POST",
      url: "/payments",
      headers: authHeaders(harness.tokens[username]!),
      payload: { subscriberId: subscriber.id, amountCents: 60_000, method: "cash" },
    })));
    for (const response of responses) expect(response.statusCode).toBe(201);

    const receipts = new Set(responses.map((response) => response.json().payment.receiptNumber as string));
    expect(receipts.size).toBe(3);

    const listed = await harness.server.inject({ method: "GET", url: `/payments?subscriberId=${subscriber.id}`, headers: authHeaders(token) });
    const payments = paymentListSchema.parse(listed.json()).payments;
    const totalAllocated = payments.reduce((sum, payment) => sum + payment.allocatedCents, 0);
    expect(totalAllocated).toBe(100_000);
    expect((await listInvoices(harness, token, subscriber.id))[0]).toMatchObject({ amountPaidCents: 100_000, balanceCents: 0, status: "paid" });
    await harness.server.close();
  });

  it("AT-10 authorization: a cashier is rejected from an admin-only operation even when calling the API directly", async () => {
    const harness = await start([
      { username: "admin", displayName: "Admin", permissions: adminPermissions },
      { username: "cashier", displayName: "Cashier", permissions: ["subscriber.view", "payment.create"] },
    ]);
    const response = await harness.server.inject({
      method: "POST",
      url: "/admin/users",
      headers: authHeaders(harness.tokens.cashier!),
      payload: { username: "new.admin", displayName: "New Admin", password: "Another-strong-password-123", role: "Cashier" },
    });
    expect(response.statusCode).toBe(403);

    const authorized = await harness.server.inject({
      method: "POST",
      url: "/admin/users",
      headers: authHeaders(harness.tokens.admin!),
      payload: { username: "new.user", displayName: "New User", password: "Another-strong-password-123", role: "Cashier" },
    });
    expect(authorized.statusCode).toBe(201);
    await harness.server.close();
  });

  it("AT-11 duplicate billing: generating the same period twice does not create a second finalized invoice", async () => {
    const harness = await start();
    const token = harness.tokens.admin!;
    const plan = await createPlan(harness, token, 99_900);
    const subscriber = await createSubscriber(harness, token);
    await createAccount(harness, token, subscriber.id, plan.id);

    const first = await generate(harness, token, january);
    expect(first.created).toHaveLength(1);
    const second = await generate(harness, token, january);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toBe(1);

    expect(await listInvoices(harness, token, subscriber.id)).toHaveLength(1);
    await harness.server.close();
  });

  it.todo("AT-12 backup/restore: restore an approved backup and pass the integrity check (manual procedure in DEPLOYMENT.md; automated components in db/integrity.test.ts and db/pg-tools.test.ts)");
});

interface CollectorBatch {
  id: string;
  subscriberId: string;
}

async function setupCollectorBatch(harness: Harness, token: string, amountCents: number): Promise<CollectorBatch> {
  const plan = await createPlan(harness, token, amountCents, "COL-PLAN");
  const subscriber = await createSubscriber(harness, token);
  await createAccount(harness, token, subscriber.id, plan.id);
  await generate(harness, token, january);

  const collector = (await harness.server.inject({
    method: "POST",
    url: "/collectors",
    headers: authHeaders(token),
    payload: { code: "COL-1", name: "Alex Collector", contactNumber: "09171234567" },
  })).json().collector as { id: string };

  await harness.server.inject({
    method: "POST",
    url: "/collector-assignments",
    headers: authHeaders(token),
    payload: { collectorId: collector.id, subscriberIds: [subscriber.id] },
  });

  const batch = (await harness.server.inject({
    method: "POST",
    url: "/collection-batches",
    headers: authHeaders(token),
    payload: { collectorId: collector.id, routeDate: "2026-01-10" },
  })).json().batch as { id: string };

  return { id: batch.id, subscriberId: subscriber.id };
}
