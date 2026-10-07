import type { AuthUser } from "@bcis/shared";

export interface AuthIdentity extends AuthUser {
  passwordHash: string;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface ManagedUser {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  roles: string[];
}

export interface AuthStore {
  findUserByUsername(username: string): Promise<AuthIdentity | null>;
  recordFailedLogin(userId: string): Promise<void>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string): Promise<AuthUser | null>;
  revokeSession(tokenHash: string): Promise<void>;
  listUsers(): Promise<ManagedUser[]>;
  listAssignableRoles(): Promise<string[]>;
  createUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    role: string;
  }): Promise<ManagedUser>;
}
