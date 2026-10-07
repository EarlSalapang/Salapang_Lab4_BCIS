import { createHash, randomBytes } from "node:crypto";

import type { AuthUser } from "@bcis/shared";

import { hashPassword, verifyPassword } from "./passwords.js";
import { MAX_FAILED_LOGINS, SESSION_LIFETIME_MS } from "./policy.js";
import type { AuthIdentity, AuthStore } from "./types.js";

const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toPublicUser(identity: AuthIdentity): AuthUser {
  return {
    id: identity.id,
    username: identity.username,
    displayName: identity.displayName,
    roles: identity.roles,
    permissions: identity.permissions,
  };
}

export class AuthService {
  constructor(private readonly store: AuthStore) {}

  async login(username: string, password: string) {
    const normalizedUsername = username.trim().toLowerCase();
    const identity = await this.store.findUserByUsername(normalizedUsername);
    const passwordIsValid = await verifyPassword(password, identity?.passwordHash ?? DUMMY_PASSWORD_HASH);
    const isLocked = identity?.lockedUntil !== null && identity?.lockedUntil !== undefined
      && identity.lockedUntil.getTime() > Date.now();

    if (!identity || !identity.isActive || isLocked || !passwordIsValid) {
      if (identity && !isLocked) await this.store.recordFailedLogin(identity.id);
      throw new AuthError("Invalid username or password, or account temporarily locked.", 401);
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await this.store.createSession(identity.id, sessionTokenHash(token), expiresAt);

    return { token, user: toPublicUser(identity), expiresAt: expiresAt.toISOString() };
  }

  async authenticate(token: string): Promise<AuthUser | null> {
    return this.store.findSession(sessionTokenHash(token));
  }

  async logout(token: string): Promise<void> {
    await this.store.revokeSession(sessionTokenHash(token));
  }
}

export { hashPassword, MAX_FAILED_LOGINS };
