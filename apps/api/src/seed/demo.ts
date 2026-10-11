import type { DirectoryActor, DirectoryStore } from "../catalog/types.js";
import type { CreatePlanInput, Invoice } from "@bcis/shared";

const DEMO_PASSWORD = "Bcis-demo-password-123";

const DEMO_USERS = [
  { username: "demo.admin", displayName: "Demo Administrator", role: "Administrator" },
  { username: "demo.cashier", displayName: "Demo Cashier", role: "Cashier" },
  { username: "demo.supervisor", displayName: "Demo Collection Supervisor", role: "Collection Supervisor" },
  { username: "demo.auditor", displayName: "Demo Auditor", role: "Accounting / Auditor" },
  { username: "demo.viewer", displayName: "Demo Read-only Viewer", role: "Read-only Viewer" },
] as const;

const DEMO_AREAS = [
  { code: "AREA-1", name: "San Jose", description: "Urban core routes" },
  { code: "AREA-2", name: "Poblacion", description: "Downtown commercial district" },
  { code: "AREA-3", name: "Valencia", description: "Outer barangays" },
] as const;

const DEMO_PLANS: CreatePlanInput[] = [
  { code: "INET-LITE", name: "Internet Lite", serviceType: "INTERNET", monthlyPriceCents: 99_900, installationFeeCents: 50_000, reconnectionFeeCents: 20_000, speed: "5 Mbps", description: "Entry internet plan." },
  { code: "INET-PRO", name: "Internet Pro", serviceType: "INTERNET", monthlyPriceCents: 149_900, installationFeeCents: 50_000, reconnectionFeeCents: 20_000, speed: "25 Mbps", description: "Balanced home internet." },
  { code: "INET-PLUS", name: "Internet Plus", serviceType: "INTERNET", monthlyPriceCents: 199_900, installationFeeCents: 75_000, reconnectionFeeCents: 20_000, speed: "50 Mbps", description: "High-bandwidth internet." },
  { code: "CABLE-BASIC", name: "Cable Basic", serviceType: "CABLE", monthlyPriceCents: 39_900, installationFeeCents: 30_000, reconnectionFeeCents: 20_000, channelCount: 60, description: "Standard cable lineup." },
  { code: "CABLE-PREMIUM", name: "Cable Premium", serviceType: "CABLE", monthlyPriceCents: 69_900, installationFeeCents: 30_000, reconnectionFeeCents: 20_000, channelCount: 150, description: "Premium cable lineup." },
  { code: "COMBO-START", name: "Combo Starter", serviceType: "COMBO", monthlyPriceCents: 119_900, installationFeeCents: 60_000, reconnectionFeeCents: 20_000, speed: "5 Mbps", channelCount: 60, description: "Internet plus basic cable." },
  { code: "COMBO-PLUS", name: "Combo Plus", serviceType: "COMBO", monthlyPriceCents: 179_900, installationFeeCents: 60_000, reconnectionFeeCents: 20_000, speed: "25 Mbps", channelCount: 150, description: "Internet plus premium cable." },
];

const DEMO_COLLECTORS = [
  { code: "COL-1", name: "Alex Mercado", contactNumber: "0917-100-0001" },
  { code: "COL-2", name: "Bella Santos", contactNumber: "0917-100-0002" },
] as const;

const DEMO_PERIODS = [
  { billingPeriodStart: "2026-07-01", billingPeriodEnd: "2026-07-31", issueDate: "2026-07-01", dueDate: "2026-07-15" },
  { billingPeriodStart: "2026-08-01", billingPeriodEnd: "2026-08-31", issueDate: "2026-08-01", dueDate: "2026-08-15" },
  { billingPeriodStart: "2026-09-01", billingPeriodEnd: "2026-09-30", issueDate: "2026-09-01", dueDate: "2026-09-15" },
] as const;

const FIRST_NAMES = ["Juan", "Maria", "Jose", "Ana", "Pedro", "Rosa", "Miguel", "Liza", "Antonio", "Grace", "Ramon", "Elena", "Carlos", "Teresa", "Paolo", "Angelica", "Mark", "Jasmine", "Rodel", "Cristina"];
const LAST_NAMES = ["Dela Cruz", "Santos", "Reyes", "Ramos", "Garcia", "Mendoza", "Torres", "Flores", "Villanueva", "Aquino", "Bautista", "Castro", "Domingo", "Lorenzo", "Navarro", "Ocampo", "Pascual", "Quinto", "Roxas", "Salazar"];
const BARANGAYS = ["Poblacion", "San Isidro", "San Jose", "Bagontaas", "Lumbo", "Mailag"];

export interface DemoSeedUserInput {
  username: string;
  displayName: string;
  password: string;
  role: string;
}

export interface DemoSeedDependencies {
  directory: DirectoryStore;
  createUser: (input: DemoSeedUserInput) => Promise<{ id: string }>;
}

export interface DemoSeedSummary {
  users: number;
  areas: number;
  plans: number;
  collectors: number;
  subscribers: number;
  serviceAccounts: number;
  invoices: number;
  payments: number;
  verifiedGcash: number;
  reversals: number;
  suspensions: number;
  reconnections: number;
  collectionBatches: number;
  remittances: number;
}

export const DEMO_SEED_PASSWORD = DEMO_PASSWORD;

function buildSubscriberName(index: number): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[index % FIRST_NAMES.length]!,
    lastName: LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]!,
  };
}

function contactNumber(index: number): string {
  return `0917-${String(200 + (index % 700)).padStart(3, "0")}-${String(1000 + index).padStart(4, "0")}`;
}

export async function seedDemoData({
  directory,
  createUser,
}: DemoSeedDependencies): Promise<DemoSeedSummary> {
  let administratorId: string | null = null;
  for (const user of DEMO_USERS) {
    const created = await createUser({
      username: user.username,
      displayName: user.displayName,
      password: DEMO_PASSWORD,
      role: user.role,
    });
    if (user.role === "Administrator") administratorId = created.id;
  }

  const actor: DirectoryActor = { userId: administratorId, displayName: "Demo Administrator" };

  const areas = [];
  for (const area of DEMO_AREAS) {
    areas.push(await directory.createCollectionArea(area));
  }

  const plans = [];
  for (const plan of DEMO_PLANS) {
    plans.push(await directory.createPlan(plan));
  }

  const collectors = [];
  for (const collector of DEMO_COLLECTORS) {
    collectors.push(await directory.createCollector(collector));
  }

  const subscribers: { id: string; collectionAreaId: string }[] = [];
  for (let index = 0; index < 50; index += 1) {
    const area = areas[index % areas.length]!;
    const name = buildSubscriberName(index);
    const subscriber = await directory.createSubscriber({
      firstName: name.firstName,
      lastName: name.lastName,
      contactNumber: contactNumber(index),
      addressLine: `${100 + index} ${BARANGAYS[index % BARANGAYS.length]} Road`,
      barangay: BARANGAYS[index % BARANGAYS.length]!,
      municipality: "Valencia",
      collectionAreaId: area.id,
      billingDay: 1,
      dueDay: 15,
    });
    subscribers.push({ id: subscriber.id, collectionAreaId: area.id });
  }

  const accounts: { id: string; subscriberId: string }[] = [];
  for (let index = 0; index < subscribers.length; index += 1) {
    const subscriber = subscribers[index]!;
    const extra = index < 15 ? 1 : 0;
    for (let slot = 0; slot <= extra; slot += 1) {
      const plan = plans[(index + slot) % plans.length]!;
      const account = await directory.createServiceAccount(
        subscriber.id,
        {
          planId: plan.id,
          installationAddress: `${100 + index} ${BARANGAYS[index % BARANGAYS.length]} Road`,
          collectionAreaId: subscriber.collectionAreaId,
          activationDate: "2026-07-01",
          billingStartDate: "2026-07-01",
          billingDay: 1,
          dueDay: 15,
          currentRateCents: plan.monthlyPriceCents,
        },
        actor,
      );
      accounts.push({ id: account.id, subscriberId: subscriber.id });
    }
  }

  const generatedByPeriod: Invoice[][] = [];
  for (const period of DEMO_PERIODS) {
    const result = await directory.generateInvoices(period, actor);
    generatedByPeriod.push(result.created);
  }

  const periodTotal = (subscriberId: string, periodIndex: number): number =>
    (generatedByPeriod[periodIndex] ?? [])
      .filter((invoice) => invoice.subscriberId === subscriberId)
      .reduce((sum, invoice) => sum + invoice.totalCents, 0);

  let payments = 0;
  let verifiedGcash = 0;
  let reversals = 0;

  const pay = async (subscriberId: string, amountCents: number, method: "cash" | "gcash", reference?: string) => {
    if (amountCents <= 0) return null;
    const payment = await directory.createPayment(
      { subscriberId, amountCents, method, ...(reference ? { referenceNumber: reference } : {}) },
      actor,
    );
    payments += 1;
    return payment;
  };

  for (let index = 0; index < subscribers.length; index += 1) {
    const subscriberId = subscribers[index]!.id;
    const july = periodTotal(subscriberId, 0);
    const august = periodTotal(subscriberId, 1);
    const september = periodTotal(subscriberId, 2);

    if (index < 20) {
      await pay(subscriberId, july, "cash");
    } else if (index < 30) {
      await pay(subscriberId, Math.floor(july / 2), "cash");
    } else if (index < 35) {
      await pay(subscriberId, july + august, "cash");
    } else if (index < 38) {
      await pay(subscriberId, july + august + september, "cash");
    } else if (index < 45) {
      const reference = `GC-DEMO-${String(index).padStart(4, "0")}`;
      const payment = await pay(subscriberId, july, "gcash", reference);
      if (payment) {
        await directory.verifyPayment(payment.id, { decision: "verify" }, actor);
        verifiedGcash += 1;
      }
    } else if (index === 45) {
      const payment = await pay(subscriberId, july, "cash");
      if (payment) {
        await directory.reversePayment(payment.id, { reason: "Duplicate receipt entry corrected" }, actor);
        reversals += 1;
      }
    }
  }

  const subscribersByArea = new Map<string, string[]>();
  for (const subscriber of subscribers) {
    const bucket = subscribersByArea.get(subscriber.collectionAreaId) ?? [];
    bucket.push(subscriber.id);
    subscribersByArea.set(subscriber.collectionAreaId, bucket);
  }

  const collectorOne = collectors[0]!;
  const collectorTwo = collectors[1]!;
  const areaOne = areas[0]!;
  const areaTwo = areas[1]!;
  const areaThree = areas[2]!;

  await directory.createCollectorAssignments({
    collectorId: collectorOne.id,
    subscriberIds: subscribersByArea.get(areaOne.id) ?? [],
    collectionAreaId: areaOne.id,
  });
  await directory.createCollectorAssignments({
    collectorId: collectorOne.id,
    subscriberIds: subscribersByArea.get(areaTwo.id) ?? [],
    collectionAreaId: areaTwo.id,
  });
  await directory.createCollectorAssignments({
    collectorId: collectorTwo.id,
    subscriberIds: subscribersByArea.get(areaThree.id) ?? [],
    collectionAreaId: areaThree.id,
  });

  let collectionBatches = 0;
  let remittances = 0;

  const runBatch = async (input: {
    collectorId: string;
    collectionAreaId: string;
    routeDate: string;
    collectCount: number;
    shortageCents: number;
    referenceNumber: string;
  }) => {
    const batch = await directory.createCollectionBatch(
      { collectorId: input.collectorId, collectionAreaId: input.collectionAreaId, routeDate: input.routeDate },
      actor,
    );
    collectionBatches += 1;
    await directory.startCollectionBatch(batch.id, actor);

    let collected = 0;
    const batchAccounts = batch.accounts ?? [];
    for (const account of batchAccounts.slice(0, input.collectCount)) {
      const amount = Math.min(50_000, account.expectedCents);
      if (amount <= 0) continue;
      await directory.createPayment(
        { subscriberId: account.subscriberId, amountCents: amount, method: "cash", collectionBatchId: batch.id },
        actor,
      );
      payments += 1;
      collected += amount;
    }

    await directory.submitCollectionBatch(batch.id, actor);
    const remitted = Math.max(collected - input.shortageCents, 0);
    await directory.remitCollectionBatch(
      batch.id,
      { amountCents: remitted, referenceNumber: input.referenceNumber },
      actor,
    );
    remittances += 1;
    await directory.reconcileCollectionBatch(batch.id, { note: "Route collection reconciled." }, actor);
  };

  await runBatch({
    collectorId: collectorOne.id,
    collectionAreaId: areaOne.id,
    routeDate: "2026-08-10",
    collectCount: 6,
    shortageCents: 0,
    referenceNumber: "REM-DEMO-0001",
  });
  await runBatch({
    collectorId: collectorTwo.id,
    collectionAreaId: areaThree.id,
    routeDate: "2026-08-12",
    collectCount: 5,
    shortageCents: 20_000,
    referenceNumber: "REM-DEMO-0002",
  });
  await runBatch({
    collectorId: collectorOne.id,
    collectionAreaId: areaTwo.id,
    routeDate: "2026-09-10",
    collectCount: 6,
    shortageCents: 0,
    referenceNumber: "REM-DEMO-0003",
  });

  let suspensions = 0;
  let reconnections = 0;
  const suspensionTargets = [46, 47, 48];
  for (const index of suspensionTargets) {
    const account = accounts.find((candidate) => candidate.subscriberId === subscribers[index]?.id);
    if (!account) continue;
    await directory.suspendServiceAccount(account.id, { reason: "Non-payment beyond grace period" }, actor);
    suspensions += 1;
  }
  const reconnectAccount = accounts.find((candidate) => candidate.subscriberId === subscribers[48]?.id);
  if (reconnectAccount) {
    await directory.reconnectServiceAccount(reconnectAccount.id, { reason: "Payment received in full" }, actor);
    reconnections += 1;
  }

  return {
    users: DEMO_USERS.length,
    areas: areas.length,
    plans: plans.length,
    collectors: DEMO_COLLECTORS.length,
    subscribers: subscribers.length,
    serviceAccounts: accounts.length,
    invoices: generatedByPeriod.reduce((sum, period) => sum + period.length, 0),
    payments,
    verifiedGcash,
    reversals,
    suspensions,
    reconnections,
    collectionBatches,
    remittances,
  };
}
