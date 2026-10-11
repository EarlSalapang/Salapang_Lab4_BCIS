import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

const file = argValue("--file") ?? process.argv.find((argument) => argument.endsWith(".dump"));
const confirmed = process.argv.includes("--yes") || process.env.BCIS_CONFIRM_RESTORE === "yes";

if (!file || !existsSync(file)) {
  console.error("Provide a backup archive with --file <path>.dump");
  process.exit(1);
}

if (!confirmed) {
  console.error("Refusing to restore: pass --yes or set BCIS_CONFIRM_RESTORE=yes to confirm this destructive operation.");
  process.exit(1);
}

const checksumFile = `${file}.sha256`;
if (existsSync(checksumFile)) {
  const expected = readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (expected && expected !== actual) {
    console.error("Refusing to restore: the archive checksum does not match its .sha256 file.");
    process.exit(1);
  }
  console.info("Archive checksum verified.");
} else {
  console.warn("No .sha256 file found for this archive; skipping checksum verification.");
}

const target = parseDatabaseUrl(config.DATABASE_URL);
const restore = runPgTool(
  "pg_restore",
  ["--clean", "--if-exists", "--no-owner", ...connectionArgs(target), file],
  target,
);
if (!restore.ok) {
  console.error(`pg_restore failed (exit ${restore.status}).\n${restore.stderr}`);
  await pool.end();
  process.exit(1);
}

const report = await runIntegrityChecks((sql) => pool.query<Record<string, unknown>>(sql));

await new PostgresAuditStore(pool).record({
  actorUserId: null,
  actorDisplayName: "System (restore CLI)",
  action: "backup.restore",
  entityType: "database",
  entityId: target.database,
  summary: `Restored database from ${path.basename(file)}. Integrity check ${report.ok ? "passed" : "failed"}.`,
  metadata: { file, integrityPassed: report.ok },
});

if (report.ok) {
  console.info("Restore complete. Post-restore integrity check passed.");
} else {
  console.error("Restore complete but the post-restore integrity check FAILED. Review the data before use.");
  process.exitCode = 1;
}

await pool.end();
