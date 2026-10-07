import { readFileSync } from "node:fs";

import { buildServer } from "./app.js";
import { PostgresAuthStore } from "./auth/postgres-store.js";
import { PostgresDirectoryStore } from "./catalog/postgres-store.js";
import { config } from "./config.js";
import { pool } from "./db/client.js";

const https = config.API_TLS_CERT_FILE && config.API_TLS_KEY_FILE
  ? {
      cert: readFileSync(config.API_TLS_CERT_FILE),
      key: readFileSync(config.API_TLS_KEY_FILE),
    }
  : undefined;
const server = buildServer(pool, new PostgresAuthStore(pool), {
  https,
  directory: new PostgresDirectoryStore(pool),
});

server.addHook("onClose", async () => {
  await pool.end();
});

try {
  await server.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  server.log.error({ err: error }, "API server failed to start");
  await server.close();
  process.exitCode = 1;
}
