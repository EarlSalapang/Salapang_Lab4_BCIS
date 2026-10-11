import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PostgresAuditStore } from "./audit/postgres-store.js";
import { config } from "./config.js";
import { pool } from "./db/client.js";
import { runIntegrityChecks } from "./db/integrity.js";
import { connectionArgs, parseDatabaseUrl, runPgTool } from "./db/pg-tools.js";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const skipIntegrity = process.argv.includes("--skip-integrity");
const target = parseDatabaseUrl(config.DATABASE_URL);
const backupDir = argValue("--dir") ?? process.env.BACKUP_DIR ?? path.resolve(process.cwd(), "backups");
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(backupDir, `bcis-${stamp}.dump`);

if (!skipIntegrity) {
  const report = await runIntegrityChecks((sql) => pool.query<Record<string, unknown>>(sql));
  if (!report.ok) {
    console.error("Refusing to back up: the integrity check failed. Re-run with --skip-integrity to override.");
    await pool.end();
    process.exit(1);
  }
  console.info("Integrity check passed before backup.");
}

const dump = runPgTool("pg_dump", ["--format=custom", ...connectionArgs(target), `--file=${file}`], target);
if (!dump.ok) {
  console.error(`pg_dump failed (exit ${dump.status}).\n${dump.stderr}`);
  await pool.end();
  process.exit(1);
}

const verify = runPgTool("pg_restore", ["--list", file], target);
if (!verify.ok) {
  console.error(`Backup verification failed: the archive could not be listed.\n${verify.stderr}`);
  await pool.end();
  process.exit(1);
}

const bytes = statSync(file).size;
const checksum = createHash("sha256").update(readFileSync(file)).digest("hex");
writeFileSync(`${file}.sha256`, `${checksum}  ${path.basename(file)}\n`);

await new PostgresAuditStore(pool).record({
  actorUserId: null,
  actorDisplayName: "System (backup CLI)",
  action: "backup.create",
  entityType: "database",
  entityId: target.database,
  summary: `Created database backup ${path.basename(file)} (${bytes} bytes).`,
  metadata: { file, bytes, checksum, integrityChecked: !skipIntegrity },
});

console.info(`Backup written to ${file} (${bytes} bytes).`);
console.info(`SHA-256: ${checksum}`);
await pool.end();
