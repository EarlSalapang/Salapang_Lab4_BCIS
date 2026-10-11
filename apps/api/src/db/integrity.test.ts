import { describe, expect, it, vi } from "vitest";

import { runIntegrityChecks, type IntegrityCheck } from "./integrity.js";

const checks: IntegrityCheck[] = [
  { key: "a", description: "check a", sql: "SELECT a" },
  { key: "b", description: "check b", sql: "SELECT b" },
];

describe("runIntegrityChecks", () => {
  it("reports success when every check returns no rows", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const report = await runIntegrityChecks(query, checks);

    expect(report.ok).toBe(true);
    expect(report.results).toHaveLength(2);
    expect(report.results.every((result) => result.ok)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("fails and captures a sample when a check returns violations", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const report = await runIntegrityChecks(query, checks);

    expect(report.ok).toBe(false);
    const failing = report.results.find((result) => result.key === "a");
    expect(failing).toMatchObject({ ok: false, violations: 1 });
    expect(failing?.sample).toEqual([{ id: "1" }]);
  });

  it("limits captured samples to five rows", async () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({ id: String(index) }));
    const query = vi.fn().mockResolvedValue({ rows });
    const report = await runIntegrityChecks(query, [checks[0]!]);

    expect(report.results[0]?.violations).toBe(9);
    expect(report.results[0]?.sample).toHaveLength(5);
  });
});
