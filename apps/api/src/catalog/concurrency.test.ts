import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildServer } from "../app.js";
import { hashPassword } from "../auth/passwords.js";
import type { AuthIdentity, AuthStore } from "../auth/types.js";
import { MemoryDirectoryStore } from "./memory-store.js";

const testPassword = "BCIS-test-password-123";

function createMultiUserAuthStore(identities: AuthIdentity[]): AuthStore {
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
    listAssignableRoles: async () => [],
    createUser: async () => {
      throw new Error("not implemented");
    },
  };
}

describe("three-client concurrency", () => {
  it("keeps invoice allocation consistent when three cashiers pay at once", async () => {
    const passwordHash = await hashPassword(testPassword);
    const permissions = ["subscriber.view", "subscriber.create", "plan.manage", "billing.generate", "payment.create"];
    const identities: AuthIdentity[] = [1, 2, 3].map((index) => ({
      id: randomUUID(),
      username: `cashier-${index}`,
      displayName: `Cashier ${index}`,
      passwordHash,
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
      roles: ["Administrator"],
      permissions,
    }));

    const directory = new MemoryDirectoryStore();
    const server = buildServer({ query: async () => ({ rows: [] }) }, createMultiUserAuthStore(identities), {
      disableLogging: true,
      directory,
    });

    const tokens = await Promise.all(identities.map(async (identity) => {
      const login = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { username: identity.username, password: testPassword },
      });
      expect(login.statusCode).toBe(200);
      return login.json().token as string;
    }));
    const headers = (token: string) => ({ authorization: `Bearer ${token}` });

    const plan = (await server.inject({
      method: "POST",
      url: "/plans",
      headers: headers(tokens[0]!),
      payload: { code: "INET-100", name: "Internet 100", serviceType: "INTERNET", monthlyPriceCents: 100_000 },
    })).json().plan;

    const subscriber = (await server.inject({
      method: "POST",
      url: "/subscribers",
      headers: headers(tokens[0]!),
      payload: { firstName: "Juan", lastName: "Dela Cruz", contactNumber: "09171234567", addressLine: "Purok 1", barangay: "San Isidro", municipality: "Quezon" },
    })).json().subscriber;

    await server.inject({
      method: "POST",
      url: `/subscribers/${subscriber.id}/service-accounts`,
      headers: headers(tokens[0]!),
      payload: { planId: plan.id, installationAddress: "Purok 1, San Isidro", billingDay: 1, dueDay: 15 },
    });

    const generated = await server.inject({
      method: "POST",
      url: "/billing/generate",
      headers: headers(tokens[0]!),
      payload: { billingPeriodStart: "2026-01-01", billingPeriodEnd: "2026-01-31", issueDate: "2026-01-01", dueDate: "2026-01-15" },
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().created).toHaveLength(1);

    const payments = await Promise.all(tokens.map((token) => server.inject({
      method: "POST",
      url: "/payments",
      headers: headers(token),
      payload: { subscriberId: subscriber.id, amountCents: 60_000, method: "cash" },
    })));

    for (const response of payments) {
      expect(response.statusCode).toBe(201);
    }

    const listed = (await server.inject({
      method: "GET",
      url: `/payments?subscriberId=${subscriber.id}`,
      headers: headers(tokens[0]!),
    })).json();

    expect(listed.total).toBe(3);
    let totalAllocated = 0;
    for (const payment of listed.payments) {
      expect(payment.allocatedCents).toBeLessThanOrEqual(payment.amountCents);
      expect(payment.unallocatedCents).toBe(payment.amountCents - payment.allocatedCents);
      totalAllocated += payment.allocatedCents;
    }
    expect(totalAllocated).toBe(100_000);

    const invoice = (await server.inject({
      method: "GET",
      url: `/invoices?subscriberId=${subscriber.id}`,
      headers: headers(tokens[0]!),
    })).json().invoices[0];

    expect(invoice).toMatchObject({ amountPaidCents: 100_000, balanceCents: 0, status: "paid" });

    await server.close();
  });
});
