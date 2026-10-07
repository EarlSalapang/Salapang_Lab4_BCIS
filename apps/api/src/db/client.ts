import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { config } from "../config.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  application_name: "bcis-api",
});

export const database = drizzle(pool, { schema });
