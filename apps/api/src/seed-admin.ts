import { hashPassword } from "./auth/passwords.js";
import { pool } from "./db/client.js";

const usernameInput = process.env.BCIS_INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
const passwordInput = process.env.BCIS_INITIAL_ADMIN_PASSWORD;

const roleDefinitions = [
  ["Owner / Super Admin", "Full system access and configuration."],
  ["Administrator", "Subscriber, billing, payment, and operational administration."],
  ["Cashier", "Subscriber lookup and payment processing."],
  ["Collection Supervisor", "Collection batches and collector reconciliation."],
  ["Accounting / Auditor", "Reports, reversals, and audit review."],
  ["Technician", "Service operations and service status updates."],
  ["Read-only Viewer", "Read-only subscriber and report access."],
] as const;

const permissionDefinitions = [
  ["subscriber.view", "View subscriber records."],
  ["subscriber.create", "Create subscribers and service accounts."],
  ["subscriber.update", "Update subscriber and service account records."],
  ["plan.manage", "Manage service plans and pricing."],
  ["collection.manage", "Manage collection areas, routes, and collectors."],
  ["billing.generate", "Generate billing invoices."],
  ["payment.create", "Post subscriber payments."],
  ["payment.reverse", "Reverse posted payments."],
  ["payment.verify_gcash", "Verify submitted GCash payment proofs."],
  ["collection.reconcile", "Reconcile collector remittances."],
  ["report.view", "View business reports."],
  ["report.export", "Export business reports."],
  ["user.manage", "Manage users, roles, and permissions."],
  ["backup.restore", "Restore a verified system backup."],
  ["audit.view", "View audit records."],
  ["service.view", "View service account and service history."],
  ["service.update", "Record approved service status changes."],
] as const;

const roleGrants: Record<string, readonly string[]> = {
  "Administrator": permissionDefinitions
    .map(([key]) => key)
    .filter((key) => key !== "backup.restore" && key !== "audit.view"),
  "Cashier": ["subscriber.view", "payment.create"],
  "Collection Supervisor": ["subscriber.view", "collection.manage", "collection.reconcile", "report.view", "report.export"],
  "Accounting / Auditor": ["subscriber.view", "payment.reverse", "report.view", "report.export", "audit.view"],
  "Technician": ["subscriber.view", "service.view", "service.update"],
  "Read-only Viewer": ["subscriber.view", "report.view"],
};

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM users");
  const bootstrapRequired = count.rows[0]?.count === "0";

  if (bootstrapRequired) {
    if (!usernameInput || usernameInput.length < 3 || usernameInput.length > 64 || !/^[a-z0-9._-]+$/.test(usernameInput)) {
      throw new Error("Set BCIS_INITIAL_ADMIN_USERNAME to 3-64 lowercase letters, numbers, dots, underscores, or hyphens.");
    }
    if (!passwordInput || passwordInput.length < 12 || passwordInput.length > 128) {
      throw new Error("Set BCIS_INITIAL_ADMIN_PASSWORD to a password between 12 and 128 characters.");
    }
  }

  for (const [key, description] of permissionDefinitions) {
    await client.query(
      "INSERT INTO permissions (key, description) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [key, description],
    );
  }
  for (const [name, description] of roleDefinitions) {
    await client.query(
      "INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
      [name, description],
    );
  }

  for (const [roleName, grants] of Object.entries(roleGrants)) {
    for (const permissionKey of grants) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_key)
         SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
         WHERE r.name = $1 AND p.key = $2
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [roleName, permissionKey],
      );
    }
  }
  await client.query(
    `INSERT INTO role_permissions (role_id, permission_key)
     SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
     WHERE r.name = $1
     ON CONFLICT (role_id, permission_key) DO NOTHING`,
    ["Owner / Super Admin"],
  );

  if (bootstrapRequired) {
    const passwordHash = await hashPassword(passwordInput!);
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (username, display_name, password_hash)
       VALUES ($1, 'BCIS Owner', $2)
       RETURNING id`,
      [usernameInput, passwordHash],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = $2`,
      [user.rows[0]!.id, "Owner / Super Admin"],
    );
    await client.query("COMMIT");
    console.info(`Initial administrator "${usernameInput}" created. Remove the bootstrap credentials from the environment.`);
  } else {
    await client.query("COMMIT");
    console.info("Users already exist: roles and permissions were synchronized; administrator bootstrap was skipped.");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
