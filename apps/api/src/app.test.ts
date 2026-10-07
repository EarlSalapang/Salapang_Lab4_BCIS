import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { buildServer } from "./app.js";
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
