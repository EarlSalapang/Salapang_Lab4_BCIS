import { migrate } from "drizzle-orm/node-postgres/migrator";

import { pool, database } from "./db/client.js";

try {
  await migrate(database, { migrationsFolder: "./drizzle" });
} finally {
  await pool.end();
}
