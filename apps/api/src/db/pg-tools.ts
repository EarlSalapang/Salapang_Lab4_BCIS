import { spawnSync } from "node:child_process";

export interface DatabaseTarget {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export function parseDatabaseUrl(connectionString: string): DatabaseTarget {
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL must include a database name.");
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

export interface PgToolResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runPgTool(
  tool: "pg_dump" | "pg_restore" | "psql",
  args: string[],
  target: DatabaseTarget,
): PgToolResult {
  const result = spawnSync(tool, args, {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: target.password },
  });
  if (result.error) {
    throw new Error(`Unable to run ${tool}. Ensure the PostgreSQL client tools are installed and on PATH. (${result.error.message})`);
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function connectionArgs(target: DatabaseTarget): string[] {
  return [
    `--host=${target.host}`,
    `--port=${target.port}`,
    `--username=${target.user}`,
    `--dbname=${target.database}`,
  ];
}
