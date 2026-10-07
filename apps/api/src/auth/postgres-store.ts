import type { Pool } from "pg";

import { LOGIN_LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from "./policy.js";
import type { AuthIdentity, AuthStore, ManagedUser } from "./types.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  is_active: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  roles: string[];
  permissions: string[];
}

const USER_SELECT = `
  SELECT
    u.id,
    u.username,
    u.display_name,
    u.password_hash,
    u.is_active,
    u.failed_login_count,
    u.locked_until,
    COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles,
    COALESCE(array_agg(DISTINCT rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL), ARRAY[]::text[]) AS permissions
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
`;

function toIdentity(row: UserRow): AuthIdentity {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    isActive: row.is_active,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    roles: row.roles,
    permissions: row.permissions,
  };
}

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async findUserByUsername(username: string): Promise<AuthIdentity | null> {
    const result = await this.pool.query<UserRow>(
      `${USER_SELECT}
       WHERE u.username = $1
       GROUP BY u.id`,
      [username],
    );
    return result.rows[0] ? toIdentity(result.rows[0]) : null;
  }

  async recordFailedLogin(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_count = CASE
             WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
             ELSE failed_login_count + 1
           END,
           locked_until = CASE
             WHEN CASE
               WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
               ELSE failed_login_count + 1
             END >= $2 THEN now() + ($3 * interval '1 minute')
             ELSE locked_until
           END,
           updated_at = now()
       WHERE id = $1 AND is_active = true`,
      [userId, MAX_FAILED_LOGINS, LOGIN_LOCKOUT_MINUTES],
    );
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query(
        `UPDATE users
         SET failed_login_count = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
         WHERE id = $1 AND is_active = true
           AND (locked_until IS NULL OR locked_until <= now())
         RETURNING id`,
        [userId],
      );
      if (user.rowCount !== 1) {
        throw new Error("The user account became unavailable during login.");
      }
      await client.query("DELETE FROM user_sessions WHERE expires_at <= now()");
      await client.query(
        `INSERT INTO user_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findSession(tokenHash: string) {
    const result = await this.pool.query<UserRow>(
      `${USER_SELECT}
       INNER JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.is_active = true
         AND (u.locked_until IS NULL OR u.locked_until <= now())
       GROUP BY u.id`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    const identity = toIdentity(row);
    return {
      id: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      roles: identity.roles,
      permissions: identity.permissions,
    };
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
  }

  async listUsers(): Promise<ManagedUser[]> {
    const result = await this.pool.query<{
      id: string;
      username: string;
      display_name: string;
      is_active: boolean;
      roles: string[];
    }>(
      `SELECT u.id, u.username, u.display_name, u.is_active,
         COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.username
       LIMIT 100`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      isActive: row.is_active,
      roles: row.roles,
    }));
  }

  async listAssignableRoles(): Promise<string[]> {
    const result = await this.pool.query<{ name: string }>(
      `SELECT name FROM roles
       WHERE name <> 'Owner / Super Admin'
       ORDER BY name`,
    );
    return result.rows.map((row) => row.name);
  }

  async createUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    role: string;
  }): Promise<ManagedUser> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (username, display_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [input.username, input.displayName, input.passwordHash],
      );
      const assignment = await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles
         WHERE name = $2 AND name <> 'Owner / Super Admin'
         RETURNING user_id`,
        [user.rows[0]!.id, input.role],
      );
      if (assignment.rowCount !== 1) {
        throw new Error("The selected role is unavailable for assignment.");
      }
      await client.query("COMMIT");
      return {
        id: user.rows[0]!.id,
        username: input.username,
        displayName: input.displayName,
        isActive: true,
        roles: [input.role],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new Error("A user with that username already exists.");
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
