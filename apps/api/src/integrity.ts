import { pool } from "./db/client.js";
import { runIntegrityChecks } from "./db/integrity.js";

const report = await runIntegrityChecks((sql) => pool.query<Record<string, unknown>>(sql));

for (const result of report.results) {
  const label = result.ok ? "PASS" : "FAIL";
  console.info(`[${label}] ${result.key} - ${result.description}`);
  if (!result.ok) {
    console.info(`       ${result.violations} violation(s); sample: ${JSON.stringify(result.sample)}`);
  }
}

if (report.ok) {
  console.info("Integrity check passed: no violations found.");
} else {
  console.error("Integrity check failed: resolve the violations above before restoring or operating on this data.");
  process.exitCode = 1;
}

await pool.end();
