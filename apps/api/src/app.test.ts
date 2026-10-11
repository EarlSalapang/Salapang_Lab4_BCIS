import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { buildServer } from "./app.js";
import { MemoryAuditStore } from "./audit/memory-store.js";
import { hashPassword } from "./auth/passwords.js";
import type { AuthIdentity, AuthStore, ManagedUser } from "./auth/types.js";

const testPassword = "BCIS-test-password-123";

async function createAuthStore(
  permissions = ["user.manage", "subscriber.view"],
  roles = ["Owner / Super Admin"],
): Promise<AuthStore> {
  const identity: AuthIdentity = {
    id: randomUUID(),
    username: "owner",
    displayName: "Test Owner",
    passwordHash: await hashPassword(testPassword),
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    roles,
    permissions,
  };
  const sessions = new Map<string, { userId: string; expiresAt: Date; revoked: boolean }>();
  return {
    findUserByUsername: vi.fn(async (username) => username === identity.username ? identity : null),
    recordFailedLogin: vi.fn(async () => undefined),
    createSession: vi.fn(async (userId, tokenHash, expiresAt) => {
      sessions.set(tokenHash, { userId, expiresAt, revoked: false });
    }),
    findSession: vi.fn(async (tokenHash) => {
      const session = sessions.get(tokenHash);
      if (!session || session.revoked || session.expiresAt <= new Date()) return null;
      return {
        id: identity.id,
        username: identity.username,
        displayName: identity.displayName,
        roles: identity.roles,
        permissions: identity.permissions,
      };
    }),
    revokeSession: vi.fn(async (tokenHash) => {
      const session = sessions.get(tokenHash);
      if (session) session.revoked = true;
    }),
    listUsers: vi.fn(async (): Promise<ManagedUser[]> => [{
      id: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      isActive: true,
      roles: identity.roles,
    }]),
    listAssignableRoles: vi.fn(async () => ["Administrator", "Cashier", "Read-only Viewer"]),
    createUser: vi.fn(async (input) => ({
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      isActive: true,
      roles: [input.role],
    })),
  };
}

describe("API health endpoints", () => {
  it("returns a liveness response without requiring database access", async () => {
    const server = buildServer({ query: vi.fn() }, await createAuthStore(), { disableLogging: true });
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "bcis-api" });
    await server.close();
  });

  it("reports readiness when the database responds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const server = buildServer({ query }, await createAuthStore(), { disableLogging: true });
    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", database: "connected" });
    expect(query).toHaveBeenCalledWith("SELECT 1");
    await server.close();
  });

  it("returns an unavailable status when the database check fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("connection refused"));
    const server = buildServer({ query }, await createAuthStore(), { disableLogging: true });
    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready", database: "unavailable" });
    await server.close();
  });
});

describe("authentication and authorization", () => {
  it("authenticates users and returns session tokens without exposing password hashes", async () => {
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true });
    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "OWNER", password: testPassword },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.json().user).toMatchObject({ username: "owner", displayName: "Test Owner" });
    expect(response.json().user.passwordHash).toBeUndefined();
    expect(store.createSession).toHaveBeenCalledOnce();
    await server.close();
  });

  it("rejects invalid credentials and records failed attempts", async () => {
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true });
    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "owner", password: "wrong-password" },
    });

    expect(response.statusCode).toBe(401);
    expect(store.recordFailedLogin).toHaveBeenCalledOnce();
    expect(store.createSession).not.toHaveBeenCalled();
    await server.close();
  });

  it("blocks unauthorized access and allows authorized access to user administration", async () => {
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true });
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "owner", password: testPassword },
    });
    const token = login.json().token as string;
    const response = await server.inject({
      method: "GET",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().users).toHaveLength(1);

    const anonymousResponse = await server.inject({ method: "GET", url: "/admin/users" });
    expect(anonymousResponse.statusCode).toBe(401);
    await server.close();
  });

  it("enforces user.manage on the server and prevents owner-role assignment", async () => {
    const cashierStore = await createAuthStore(["subscriber.view"], ["Cashier"]);
    const server = buildServer({ query: vi.fn() }, cashierStore, { disableLogging: true });
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "owner", password: testPassword },
    });
    const token = login.json().token as string;
    const forbidden = await server.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        username: "new-user",
        displayName: "New User",
        password: "Long-test-password-123",
        role: "Cashier",
      },
    });
    const ownerRole = await server.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        username: "new-owner",
        displayName: "New Owner",
        password: "Long-test-password-123",
        role: "Owner / Super Admin",
      },
    });

    expect(forbidden.statusCode).toBe(403);
    expect(ownerRole.statusCode).toBe(403);
    expect(cashierStore.createUser).not.toHaveBeenCalled();
    await server.close();
  });

  it("creates a user for an authorized administrator without returning password data", async () => {
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true });
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "owner", password: testPassword },
    });
    const token = login.json().token as string;
    const response = await server.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        username: "cashier-1",
        displayName: "Demo Cashier",
        password: "Long-test-password-123",
        role: "Cashier",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().user).toMatchObject({ username: "cashier-1", roles: ["Cashier"] });
    expect(response.json().user.passwordHash).toBeUndefined();
    expect(store.createUser).toHaveBeenCalledWith(expect.objectContaining({
      username: "cashier-1",
      role: "Cashier",
      passwordHash: expect.stringMatching(/^scrypt\$/),
    }));

    const ownerRole = await server.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        username: "new-owner",
        displayName: "New Owner",
        password: "Long-test-password-123",
        role: "Owner / Super Admin",
      },
    });
    expect(ownerRole.statusCode).toBe(400);
    await server.close();
  });

  it("revokes a session at logout", async () => {
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true });
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { username: "owner", password: testPassword },
    });
    const token = login.json().token as string;
    const logout = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    const currentUser = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(logout.statusCode).toBe(204);
    expect(currentUser.statusCode).toBe(401);
    await server.close();
  });
});

describe("security hardening", () => {
  it("sets protective security headers on responses", async () => {
    const server = buildServer({ query: vi.fn() }, await createAuthStore(), { disableLogging: true });
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    await server.close();
  });

  it("adds HSTS only when TLS is enabled", async () => {
    const server = buildServer({ query: vi.fn() }, await createAuthStore(), { disableLogging: true });
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.headers["strict-transport-security"]).toBeUndefined();
    await server.close();
  });

  it("rate limits repeated sign-in attempts from one client", async () => {
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, {
      disableLogging: true,
      loginRateLimit: { windowMs: 60_000, maxAttempts: 2 },
    });

    const first = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: "wrong" } });
    const second = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: "wrong" } });
    const third = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: "wrong" } });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toBeDefined();
    await server.close();
  });

  it("resets the rate limit window after a successful sign in", async () => {
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, {
      disableLogging: true,
      loginRateLimit: { windowMs: 60_000, maxAttempts: 1 },
    });

    const success = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: testPassword } });
    expect(success.statusCode).toBe(200);
    const next = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: testPassword } });
    expect(next.statusCode).toBe(200);
    await server.close();
  });
});

describe("audit trail", () => {
  it("records successful and failed sign-in attempts", async () => {
    const audit = new MemoryAuditStore();
    const server = buildServer({ query: vi.fn() }, await createAuthStore(), { disableLogging: true, audit });

    await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: testPassword } });
    await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: "wrong" } });

    expect(audit.events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["auth.login", "auth.login_failed"]),
    );
    const success = audit.events.find((event) => event.action === "auth.login");
    expect(success?.actorDisplayName).toBe("Test Owner");
    expect(success?.ipAddress).toBeDefined();
    await server.close();
  });

  it("records user creation with the acting administrator", async () => {
    const audit = new MemoryAuditStore();
    const store = await createAuthStore();
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true, audit });
    const login = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: testPassword } });
    const token = login.json().token as string;

    await server.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { username: "cashier-2", displayName: "Second Cashier", password: "Long-test-password-123", role: "Cashier" },
    });

    const event = audit.events.find((entry) => entry.action === "user.create");
    expect(event).toMatchObject({ entityType: "user", actorDisplayName: "Test Owner" });
    expect(event?.metadata).toMatchObject({ role: "Cashier" });
    await server.close();
  });

  it("exposes the audit trail to authorized viewers and enforces the audit.view permission", async () => {
    const audit = new MemoryAuditStore();
    const store = await createAuthStore(["user.manage", "subscriber.view", "audit.view"]);
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true, audit });
    const login = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: testPassword } });
    const token = login.json().token as string;

    const response = await server.inject({ method: "GET", url: "/admin/audit", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().events.length).toBeGreaterThanOrEqual(1);

    const forbidden = await buildServer({ query: vi.fn() }, await createAuthStore(["subscriber.view"]), { disableLogging: true, audit });
    const forbiddenLogin = await forbidden.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: testPassword } });
    const forbiddenResponse = await forbidden.inject({
      method: "GET",
      url: "/admin/audit",
      headers: { authorization: `Bearer ${forbiddenLogin.json().token}` },
    });
    expect(forbiddenResponse.statusCode).toBe(403);
    await server.close();
    await forbidden.close();
  });

  it("reports audit unavailability when no store is configured", async () => {
    const store = await createAuthStore(["user.manage", "audit.view"]);
    const server = buildServer({ query: vi.fn() }, store, { disableLogging: true });
    const login = await server.inject({ method: "POST", url: "/auth/login", payload: { username: "owner", password: testPassword } });
    const response = await server.inject({
      method: "GET",
      url: "/admin/audit",
      headers: { authorization: `Bearer ${login.json().token}` },
    });
    expect(response.statusCode).toBe(503);
    await server.close();
  });
});
