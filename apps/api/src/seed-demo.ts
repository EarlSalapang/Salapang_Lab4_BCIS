import { hashPassword } from "./auth/passwords.js";
import { PostgresAuthStore } from "./auth/postgres-store.js";
import { PostgresDirectoryStore } from "./catalog/postgres-store.js";
import { pool } from "./db/client.js";
import { seedDemoData, type DemoSeedUserInput } from "./seed/demo.js";

const client = await pool.connect();
try {
  const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM subscribers");
  const existing = Number(count.rows[0]?.count ?? "0");
  if (existing > 0) {
    throw new Error(
      `The catalog already contains ${existing} subscriber(s). Run the demo seed against an empty database ` +
        "(apply migrations and run seed-admin first, then seed-demo before entering real data).",
    );
  }
} finally {
  client.release();
}

const authStore = new PostgresAuthStore(pool);
const directory = new PostgresDirectoryStore(pool);

const createUser = async (input: DemoSeedUserInput): Promise<{ id: string }> => {
  try {
    const user = await authStore.createUser({
      username: input.username,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      role: input.role,
    });
    return { id: user.id };
  } catch (error) {
    if (error instanceof Error && /role/i.test(error.message)) {
      throw new Error(`Could not assign the "${input.role}" role. Run "npm run seed:admin --workspace @bcis/api" before seeding demo data.`);
    }
    throw error;
  }
};

try {
  const summary = await seedDemoData({ directory, createUser });
  const lines = [
    "Demo dataset created.",
    `  users:            ${summary.users} (password: Bcis-demo-password-123)`,
    `  collection areas: ${summary.areas}`,
    `  plans:            ${summary.plans}`,
    `  collectors:       ${summary.collectors}`,
    `  subscribers:      ${summary.subscribers}`,
    `  service accounts: ${summary.serviceAccounts}`,
    `  invoices:         ${summary.invoices}`,
    `  payments:         ${summary.payments} (verified GCash: ${summary.verifiedGcash})`,
    `  reversals:        ${summary.reversals}`,
    `  suspensions:      ${summary.suspensions} (reconnections: ${summary.reconnections})`,
    `  batches:          ${summary.collectionBatches} (remittances: ${summary.remittances})`,
  ];
  console.info(lines.join("\n"));
} finally {
  await pool.end();
}
