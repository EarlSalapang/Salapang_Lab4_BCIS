import { describe, expect, it } from "vitest";
import { MemoryDirectoryStore } from "../catalog/memory-store.js";
import { DEMO_SEED_PASSWORD, seedDemoData, type DemoSeedUserInput } from "./demo.js";

describe("demo seed", () => {
  it("builds the minimum demonstration dataset described by the specification", async () => {
    const directory = new MemoryDirectoryStore();
    const createdUsers: DemoSeedUserInput[] = [];
    let nextId = 0;

    const summary = await seedDemoData({
      directory,
      createUser: async (input) => {
        createdUsers.push(input);
        nextId += 1;
        return { id: `user-${nextId}` };
      },
    });

    expect(summary.users).toBe(5);
    expect(summary.areas).toBe(3);
    expect(summary.plans).toBe(7);
    expect(summary.collectors).toBe(2);
    expect(summary.subscribers).toBe(50);
    expect(summary.serviceAccounts).toBeGreaterThanOrEqual(60);
    expect(summary.invoices).toBeGreaterThanOrEqual(150);
    expect(summary.payments).toBeGreaterThanOrEqual(40);
    expect(summary.verifiedGcash).toBeGreaterThanOrEqual(1);
    expect(summary.reversals).toBe(1);
    expect(summary.suspensions).toBeGreaterThanOrEqual(2);
    expect(summary.reconnections).toBeGreaterThanOrEqual(1);
    expect(summary.collectionBatches).toBeGreaterThanOrEqual(2);
    expect(summary.remittances).toBeGreaterThanOrEqual(2);

    expect(createdUsers.map((user) => user.role).sort()).toEqual(
      ["Accounting / Auditor", "Administrator", "Cashier", "Collection Supervisor", "Read-only Viewer"].sort(),
    );
    expect(createdUsers.every((user) => user.password === DEMO_SEED_PASSWORD)).toBe(true);

    const plans = await directory.listPlans(false);
    expect(plans.filter((plan) => plan.serviceType === "INTERNET")).toHaveLength(3);
    expect(plans.filter((plan) => plan.serviceType === "CABLE")).toHaveLength(2);
    expect(plans.filter((plan) => plan.serviceType === "COMBO")).toHaveLength(2);

    const overdue = await directory.getOverdueInvoices("2026-10-10");
    expect(overdue.count).toBeGreaterThanOrEqual(10);
    expect(overdue.invoices.length).toBeGreaterThanOrEqual(10);

    const bucket = (days: number) => (days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+");
    const populatedBuckets = new Set(overdue.invoices.map((invoice) => bucket(invoice.daysOverdue)));
    expect(populatedBuckets.size).toBeGreaterThanOrEqual(3);

    const suspensions = await directory.listSuspensions();
    expect(suspensions.length).toBeGreaterThanOrEqual(2);

    const collectorReport = await directory.getCollectorReport("2026-07-01", "2026-12-31");
    expect(collectorReport.rows.length).toBeGreaterThanOrEqual(2);
    expect(collectorReport.rows.some((row) => row.batches > 0 && row.collectedCents > 0)).toBe(true);
  });
});
