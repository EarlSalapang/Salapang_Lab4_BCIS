import type {
  CollectorReport,
  Dashboard,
  DashboardMethodPoint,
  DashboardRecentPayment,
  DashboardSeriesPoint,
  PaymentMethod,
  Report,
  ReportColumn,
  ReportKpi,
  ReportRow,
  ReportSection,
  SubscriberSummary,
} from "@bcis/shared";
import type { DateRange, InvoiceFact, LedgerFact, PaymentFact, ReportDataSource } from "./types.js";

type ValueFormat = ReportColumn["format"];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  other: "Other",
};

function column(
  key: string,
  label: string,
  format: ValueFormat = "text",
  align: ReportColumn["align"] = "left",
): ReportColumn {
  return { key, label, format, align };
}

function money(key: string, label: string): ReportColumn {
  return column(key, label, "money", "right");
}

function number(key: string, label: string): ReportColumn {
  return column(key, label, "number", "right");
}

function date(key: string, label: string): ReportColumn {
  return column(key, label, "date", "left");
}

function kpi(label: string, value: number, format: ValueFormat = "number", hint?: string): ReportKpi {
  return { label, value, format, ...(hint ? { hint } : {}) };
}

function generatedAt(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function envelope(
  key: string,
  title: string,
  options: {
    subtitle?: string | null;
    parameters?: Record<string, string>;
    kpis?: ReportKpi[];
    sections: ReportSection[];
  },
): Report {
  return {
    key,
    title,
    subtitle: options.subtitle ?? null,
    generatedAt: generatedAt(),
    parameters: options.parameters,
    kpis: options.kpis,
    sections: options.sections,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function startOfWeek(dateStr: string): string {
  const date = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function periodKey(value: string, granularity: string): string {
  const datePart = value.slice(0, 10);
  switch (granularity) {
    case "day":
      return datePart;
    case "week":
      return startOfWeek(datePart);
    case "year":
      return datePart.slice(0, 4);
    default:
      return datePart.slice(0, 7);
  }
}

function isBillable(invoice: InvoiceFact): boolean {
  return invoice.status !== "void" && invoice.status !== "draft";
}

function isWithin(value: string, range: DateRange): boolean {
  const datePart = value.slice(0, 10);
  if (range.from && datePart < range.from) return false;
  if (range.to && datePart > range.to) return false;
  return true;
}

function normaliseRange(params: Record<string, string | undefined>): DateRange {
  return { from: params.from, to: params.to };
}

function rangeParameters(range: DateRange, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    ...extra,
  };
}

function buildCollectionSummary(
  payments: PaymentFact[],
  params: Record<string, string | undefined>,
  range: DateRange,
): Report {
  const granularity = params.granularity ?? "month";
  const posted = payments.filter((payment) => payment.status === "posted");
  const cashCents = sum(posted.filter((payment) => payment.method === "cash").map((p) => p.amountCents));
  const totalCents = sum(posted.map((p) => p.amountCents));

  const methodGroups = new Map<PaymentMethod, { count: number; amountCents: number }>();
  for (const payment of posted) {
    const group = methodGroups.get(payment.method) ?? { count: 0, amountCents: 0 };
    group.count += 1;
    group.amountCents += payment.amountCents;
    methodGroups.set(payment.method, group);
  }
  const methodRows: ReportRow[] = [...methodGroups.entries()]
    .map(([method, group]) => ({
      method: METHOD_LABELS[method],
      count: group.count,
      amountCents: group.amountCents,
    }))
    .sort((left, right) => Number(right.amountCents) - Number(left.amountCents));

  const periodGroups = new Map<string, { count: number; amountCents: number }>();
  for (const payment of posted) {
    const period = periodKey(payment.paymentDate, granularity);
    const group = periodGroups.get(period) ?? { count: 0, amountCents: 0 };
    group.count += 1;
    group.amountCents += payment.amountCents;
    periodGroups.set(period, group);
  }
  const periodRows: ReportRow[] = [...periodGroups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([period, group]) => ({
      period,
      count: group.count,
      amountCents: group.amountCents,
    }));

  return envelope("collection-summary", "Collection Report", {
    subtitle: `Grouped by ${granularity}`,
    parameters: rangeParameters(range, { granularity }),
    kpis: [
      kpi("Total collected", totalCents, "money"),
      kpi("Cash collected", cashCents, "money"),
      kpi("Non-cash collected", totalCents - cashCents, "money"),
      kpi("Posted payments", posted.length, "number"),
    ],
    sections: [
      {
        title: "Collections by payment method",
        columns: [column("method", "Method"), number("count", "Payments"), money("amountCents", "Amount")],
        rows: methodRows,
        totals: { amountCents: totalCents },
      },
      {
        title: "Collections by period",
        columns: [column("period", "Period"), number("count", "Payments"), money("amountCents", "Amount")],
        rows: periodRows,
        totals: { amountCents: totalCents },
      },
    ],
  });
}

function buildBillingVsCollection(invoices: InvoiceFact[], payments: PaymentFact[], range: DateRange): Report {
  const billable = invoices.filter(isBillable);
  const posted = payments.filter((payment) => payment.status === "posted");
  const billedByMonth = new Map<string, number>();
  for (const invoice of billable) {
    const month = periodKey(invoice.issueDate, "month");
    billedByMonth.set(month, (billedByMonth.get(month) ?? 0) + invoice.totalCents);
  }
  const collectedByMonth = new Map<string, number>();
  for (const payment of posted) {
    const month = periodKey(payment.paymentDate, "month");
    collectedByMonth.set(month, (collectedByMonth.get(month) ?? 0) + payment.amountCents);
  }
  const months = [...new Set([...billedByMonth.keys(), ...collectedByMonth.keys()])].sort();
  const rows: ReportRow[] = months.map((month) => {
    const billed = billedByMonth.get(month) ?? 0;
    const collected = collectedByMonth.get(month) ?? 0;
    return { period: month, billedCents: billed, collectedCents: collected, varianceCents: billed - collected };
  });
  const totalBilled = sum([...billedByMonth.values()]);
  const totalCollected = sum([...collectedByMonth.values()]);
  return envelope("billing-vs-collection", "Billing versus Collection", {
    parameters: rangeParameters(range),
    kpis: [
      kpi("Total billed", totalBilled, "money"),
      kpi("Total collected", totalCollected, "money"),
      kpi("Collection rate", totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 1000) / 10 : 0, "percent"),
    ],
    sections: [
      {
        title: "Monthly billed versus collected",
        columns: [
          column("period", "Month"),
          money("billedCents", "Billed"),
          money("collectedCents", "Collected"),
          money("varianceCents", "Variance"),
        ],
        rows,
        totals: { billedCents: totalBilled, collectedCents: totalCollected, varianceCents: totalBilled - totalCollected },
      },
    ],
  });
}

function buildRevenue(invoices: InvoiceFact[], range: DateRange): Report {
  const billable = invoices.filter(isBillable);
  const group = (selector: (invoice: InvoiceFact) => string) => {
    const map = new Map<string, { invoices: number; amountCents: number }>();
    for (const invoice of billable) {
      const key = selector(invoice) || "Unassigned";
      const entry = map.get(key) ?? { invoices: 0, amountCents: 0 };
      entry.invoices += 1;
      entry.amountCents += invoice.totalCents;
      map.set(key, entry);
    }
    return [...map.entries()]
      .map(([name, entry]) => ({ name, invoices: entry.invoices, amountCents: entry.amountCents }))
      .sort((left, right) => right.amountCents - left.amountCents);
  };
  const byPlan = group((invoice) => invoice.planName ?? "");
  const byService = group((invoice) => (invoice.serviceType ? invoice.serviceType : ""));
  const byArea = group((invoice) => invoice.collectionAreaName ?? "");
  const totalCents = sum(billable.map((invoice) => invoice.totalCents));
  const columns = [column("name", "Name"), number("invoices", "Invoices"), money("amountCents", "Billed")];
  const toRows = (items: typeof byPlan): ReportRow[] =>
    items.map((item) => ({ name: item.name, invoices: item.invoices, amountCents: item.amountCents }));
  return envelope("revenue", "Revenue by Plan, Service and Area", {
    parameters: rangeParameters(range),
    kpis: [
      kpi("Total billed revenue", totalCents, "money"),
      kpi("Invoices", billable.length, "number"),
      kpi("Average invoice", billable.length > 0 ? Math.round(totalCents / billable.length) : 0, "money"),
    ],
    sections: [
      { title: "By service plan", columns, rows: toRows(byPlan), totals: { amountCents: totalCents } },
      { title: "By service type", columns, rows: toRows(byService), totals: { amountCents: totalCents } },
      { title: "By collection area", columns, rows: toRows(byArea), totals: { amountCents: totalCents } },
    ],
  });
}

function agingReport(
  source: Awaited<ReturnType<ReportDataSource["getAgingReport"]>>,
  asOf: string,
): Report {
  const bucketColumns = source.buckets.map((bucket) =>
    money(`bucket_${bucket.label}`, bucket.label),
  );
  const subscriberRows: ReportRow[] = source.rows.map((row) => {
    const record: ReportRow = {
      accountNumber: row.subscriberAccountNumber,
      subscriberName: row.subscriberName,
      currentCents: row.currentCents,
      totalCents: row.totalBalanceCents,
    };
    row.buckets.forEach((bucket, index) => {
      record[`bucket_${source.buckets[index]?.label ?? index}`] = bucket.amountCents;
    });
    return record;
  });
  const bucketRows: ReportRow[] = source.buckets.map((bucket) => {
    const total = source.rows.reduce((acc, row) => {
      const match = row.buckets.find((item) => item.label === bucket.label);
      return acc + (match?.amountCents ?? 0);
    }, 0);
    const count = source.rows.reduce((acc, row) => {
      const match = row.buckets.find((item) => item.label === bucket.label);
      return acc + (match?.count ?? 0);
    }, 0);
    return { label: bucket.label, count, amountCents: total };
  });
  return envelope("ar-aging", "Accounts Receivable Aging", {
    subtitle: `As of ${asOf}`,
    parameters: { asOf },
    kpis: [
      kpi("Total outstanding", source.totals.totalBalanceCents, "money"),
      kpi("Current (not yet due)", source.totals.currentCents, "money"),
      kpi("Overdue", source.totals.totalBalanceCents - source.totals.currentCents, "money"),
      kpi("Subscribers with balance", source.rows.length, "number"),
    ],
    sections: [
      {
        title: "Aging summary",
        columns: [column("label", "Bucket"), number("count", "Invoices"), money("amountCents", "Amount")],
        rows: bucketRows,
        totals: { amountCents: source.totals.totalBalanceCents },
      },
      {
        title: "Balances by subscriber",
        columns: [
          column("accountNumber", "Account"),
          column("subscriberName", "Subscriber"),
          money("currentCents", "Current"),
          ...bucketColumns,
          money("totalCents", "Total"),
        ],
        rows: subscriberRows,
        totals: { totalCents: source.totals.totalBalanceCents },
      },
    ],
  });
}

function overdueReport(
  source: Awaited<ReturnType<ReportDataSource["getOverdueInvoices"]>>,
): Report {
  const rows: ReportRow[] = source.invoices.map((invoice) => ({
    accountNumber: invoice.subscriberAccountNumber,
    subscriberName: invoice.subscriberName,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    daysOverdue: invoice.daysOverdue,
    totalCents: invoice.totalCents,
    paidCents: invoice.amountPaidCents,
    balanceCents: invoice.balanceCents,
  }));
  return envelope("overdue", "Overdue Accounts", {
    subtitle: `As of ${source.asOf}`,
    parameters: { asOf: source.asOf },
    kpis: [
      kpi("Overdue invoices", source.count, "number"),
      kpi("Total arrears", source.totalBalanceCents, "money"),
      kpi(
        "Average days overdue",
        source.count > 0 ? Math.round(sum(source.invoices.map((invoice) => invoice.daysOverdue)) / source.count) : 0,
        "number",
      ),
    ],
    sections: [
      {
        title: "Overdue invoices",
        columns: [
          column("accountNumber", "Account"),
          column("subscriberName", "Subscriber"),
          column("invoiceNumber", "Invoice #"),
          date("issueDate", "Issued"),
          date("dueDate", "Due"),
          number("daysOverdue", "Days overdue"),
          money("totalCents", "Total"),
          money("paidCents", "Paid"),
          money("balanceCents", "Balance"),
        ],
        rows,
        totals: { balanceCents: source.totalBalanceCents },
      },
    ],
  });
}

function collectorPerformanceReport(report: CollectorReport): Report {
  const rows: ReportRow[] = report.rows.map((row) => ({
    collectorName: row.collectorName,
    batches: row.batches,
    expectedCents: row.expectedCents,
    collectedCents: row.collectedCents,
    remittedCents: row.remittedCents,
    shortageCents: row.shortageCents,
    overageCents: row.overageCents,
  }));
  const totals = {
    expectedCents: sum(report.rows.map((row) => row.expectedCents)),
    collectedCents: sum(report.rows.map((row) => row.collectedCents)),
    remittedCents: sum(report.rows.map((row) => row.remittedCents)),
    shortageCents: sum(report.rows.map((row) => row.shortageCents)),
    overageCents: sum(report.rows.map((row) => row.overageCents)),
  };
  return envelope("collector-performance", "Collector Performance", {
    parameters: {
      ...(report.from ? { from: report.from } : {}),
      ...(report.to ? { to: report.to } : {}),
    },
    kpis: [
      kpi("Expected", totals.expectedCents, "money"),
      kpi("Collected", totals.collectedCents, "money"),
      kpi("Remitted", totals.remittedCents, "money"),
      kpi("Shortage", totals.shortageCents, "money"),
      kpi("Overage", totals.overageCents, "money"),
    ],
    sections: [
      {
        title: "Collector performance and remittance",
        columns: [
          column("collectorName", "Collector"),
          number("batches", "Batches"),
          money("expectedCents", "Expected"),
          money("collectedCents", "Collected"),
          money("remittedCents", "Remitted"),
          money("shortageCents", "Shortage"),
          money("overageCents", "Overage"),
        ],
        rows,
        totals,
      },
    ],
  });
}

function subscriberMasterReport(subscribers: SubscriberSummary[]): Report {
  const rows: ReportRow[] = subscribers
    .slice()
    .sort((left, right) => left.accountNumber.localeCompare(right.accountNumber))
    .map((subscriber) => ({
      accountNumber: subscriber.accountNumber,
      displayName: subscriber.displayName,
      status: subscriber.status,
      collectionAreaName: subscriber.collectionAreaName ?? "Unassigned",
      contactNumber: subscriber.contactNumber ?? "",
      email: subscriber.email ?? "",
      municipality: subscriber.municipality ?? "",
      serviceAccounts: subscriber.serviceAccountCount,
      createdAt: subscriber.createdAt.slice(0, 10),
    }));
  const active = subscribers.filter((subscriber) => subscriber.status === "ACTIVE").length;
  return envelope("subscriber-master", "Subscriber Master List", {
    parameters: {},
    kpis: [
      kpi("Total subscribers", subscribers.length, "number"),
      kpi("Active", active, "number"),
      kpi("Inactive", subscribers.length - active, "number"),
    ],
    sections: [
      {
        title: "Subscribers",
        columns: [
          column("accountNumber", "Account"),
          column("displayName", "Name"),
          column("status", "Status"),
          column("collectionAreaName", "Area"),
          column("contactNumber", "Contact"),
          column("email", "Email"),
          column("municipality", "Municipality"),
          number("serviceAccounts", "Accounts"),
          date("createdAt", "Registered"),
        ],
        rows,
        totals: {},
      },
    ],
  });
}

function statementOfAccount(
  subscriber: NonNullable<Awaited<ReturnType<ReportDataSource["getSubscriber"]>>>,
  entries: LedgerFact[],
  range: DateRange,
  serviceAccounts: string,
): Report {
  const ordered = entries
    .slice()
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate) || left.createdAt.localeCompare(right.createdAt));
  const openingCents =
    range.from !== undefined
      ? ordered.filter((entry) => entry.entryDate < (range.from as string)).reduce((acc, entry) => acc + (entry.entryType === "debit" ? entry.amountCents : -entry.amountCents), 0)
      : 0;
  const displayed = ordered.filter((entry) => isWithin(entry.entryDate, range));
  let running = openingCents;
  const rows: ReportRow[] = displayed.map((entry) => {
    running += entry.entryType === "debit" ? entry.amountCents : -entry.amountCents;
    return {
      entryDate: entry.entryDate,
      entryType: entry.entryType === "debit" ? "Debit" : "Credit",
      description: entry.description,
      debitCents: entry.entryType === "debit" ? entry.amountCents : null,
      creditCents: entry.entryType === "credit" ? entry.amountCents : null,
      balanceCents: running,
    };
  });
  const totalDebits = sum(displayed.filter((entry) => entry.entryType === "debit").map((entry) => entry.amountCents));
  const totalCredits = sum(displayed.filter((entry) => entry.entryType === "credit").map((entry) => entry.amountCents));
  const address = [subscriber.addressLine, subscriber.barangay, subscriber.municipality].filter(Boolean).join(", ");
  return envelope("statement-of-account", "Statement of Account", {
    subtitle: `${subscriber.accountNumber} · ${subscriber.displayName}${address ? ` · ${address}` : ""}`,
    parameters: {
      subscriberId: subscriber.id,
      account: subscriber.accountNumber,
      subscriberName: subscriber.displayName,
      services: serviceAccounts,
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
    },
    kpis: [
      kpi("Opening balance", openingCents, "money"),
      kpi("Charges", totalDebits, "money"),
      kpi("Payments", totalCredits, "money"),
      kpi("Closing balance", running, "money"),
    ],
    sections: [
      {
        title: "Ledger statement",
        columns: [
          date("entryDate", "Date"),
          column("entryType", "Type"),
          column("description", "Particulars"),
          money("debitCents", "Debit"),
          money("creditCents", "Credit"),
          money("balanceCents", "Balance"),
        ],
        rows,
        totals: { debitCents: totalDebits, creditCents: totalCredits, balanceCents: running },
      },
    ],
  });
}

export async function buildReport(
  source: ReportDataSource,
  key: string,
  params: Record<string, string | undefined>,
): Promise<Report | null> {
  const range = normaliseRange(params);
  switch (key) {
    case "collection-summary": {
      const payments = await source.listPaymentFacts(range);
      return buildCollectionSummary(payments, params, range);
    }
    case "billing-vs-collection": {
      const [invoices, payments] = await Promise.all([
        source.listInvoiceFacts(range),
        source.listPaymentFacts(range),
      ]);
      return buildBillingVsCollection(invoices, payments, range);
    }
    case "revenue": {
      const invoices = await source.listInvoiceFacts(range);
      return buildRevenue(invoices, range);
    }
    case "ar-aging": {
      const asOf = params.asOf || today();
      return agingReport(await source.getAgingReport(asOf), asOf);
    }
    case "overdue": {
      const asOf = params.asOf || today();
      return overdueReport(await source.getOverdueInvoices(asOf));
    }
    case "collector-performance": {
      return collectorPerformanceReport(await source.getCollectorReport(range.from, range.to));
    }
    case "subscriber-master": {
      return subscriberMasterReport(await source.listSubscriberRows());
    }
    case "statement-of-account": {
      const subscriberId = params.subscriberId?.trim();
      if (!subscriberId) return null;
      const subscriber = await source.getSubscriber(subscriberId);
      if (!subscriber) return null;
      const entries = await source.listLedgerFacts({ subscriberId });
      const services = subscriber.serviceAccounts.map((account) => account.accountNumber).join(", ");
      return statementOfAccount(subscriber, entries, range, services);
    }
    default:
      return null;
  }
}

export async function buildDashboard(source: ReportDataSource, asOfParam?: string): Promise<Dashboard> {
  const asOf = asOfParam || today();
  const [invoices, payments, aging, collectorReport, candidates] = await Promise.all([
    source.listInvoiceFacts({}),
    source.listPaymentFacts({}),
    source.getAgingReport(asOf),
    source.getCollectorReport(),
    source.getSuspensionCandidates(asOf),
  ]);

  const open = invoices.filter((invoice) => isBillable(invoice) && invoice.balanceCents > 0);
  const currentReceivable = sum(open.filter((invoice) => invoice.dueDate >= asOf).map((invoice) => invoice.balanceCents));
  const overdueReceivable = sum(open.filter((invoice) => invoice.dueDate < asOf).map((invoice) => invoice.balanceCents));
  const overdueSubscribers = new Set(
    open.filter((invoice) => invoice.dueDate < asOf).map((invoice) => invoice.subscriberId),
  ).size;
  const postedPayments = payments.filter((payment) => payment.status === "posted");
  const collectedToday = sum(
    postedPayments.filter((payment) => payment.paymentDate.slice(0, 10) === asOf).map((p) => p.amountCents),
  );
  const collectedThisMonth = sum(
    postedPayments.filter((payment) => payment.paymentDate.slice(0, 7) === asOf.slice(0, 7)).map((p) => p.amountCents),
  );

  const kpis: ReportKpi[] = [
    kpi("Current receivable", currentReceivable, "money"),
    kpi("Overdue receivable", overdueReceivable, "money"),
    kpi("Subscribers overdue", overdueSubscribers, "number"),
    kpi("For follow-up / suspension", candidates.candidates.length, "number"),
    kpi("Collected today", collectedToday, "money"),
    kpi("Collected this month", collectedThisMonth, "money"),
  ];

  const billedByMonth = new Map<string, number>();
  for (const invoice of invoices.filter(isBillable)) {
    const month = invoice.issueDate.slice(0, 7);
    billedByMonth.set(month, (billedByMonth.get(month) ?? 0) + invoice.totalCents);
  }
  const collectedByMonth = new Map<string, number>();
  for (const payment of postedPayments) {
    const month = payment.paymentDate.slice(0, 7);
    collectedByMonth.set(month, (collectedByMonth.get(month) ?? 0) + payment.amountCents);
  }
  const months: string[] = [];
  const baseDate = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  for (let index = 5; index >= 0; index -= 1) {
    const point = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - index, 1));
    months.push(point.toISOString().slice(0, 7));
  }
  const billingVsCollection: DashboardSeriesPoint[] = months.map((month) => ({
    period: month,
    billedCents: billedByMonth.get(month) ?? 0,
    collectedCents: collectedByMonth.get(month) ?? 0,
  }));

  const methodMap = new Map<PaymentMethod, { amountCents: number; count: number }>();
  for (const payment of postedPayments.filter((entry) => entry.paymentDate.slice(0, 7) === asOf.slice(0, 7))) {
    const group = methodMap.get(payment.method) ?? { amountCents: 0, count: 0 };
    group.amountCents += payment.amountCents;
    group.count += 1;
    methodMap.set(payment.method, group);
  }
  const paymentMethods: DashboardMethodPoint[] = [...methodMap.entries()]
    .map(([method, group]) => ({ method, amountCents: group.amountCents, count: group.count }))
    .sort((left, right) => right.amountCents - left.amountCents);

  const overdueAlerts = candidates.candidates.slice(0, 6).map((candidate) => ({
    subscriberId: candidate.subscriberId,
    subscriberAccountNumber: candidate.subscriberAccountNumber,
    subscriberName: candidate.subscriberName,
    totalOverdueCents: candidate.totalOverdueCents,
    oldestOverdueDays: candidate.oldestOverdueDays,
  }));

  const recentPayments: DashboardRecentPayment[] = postedPayments
    .slice()
    .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate))
    .slice(0, 6)
    .map((payment) => ({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      subscriberName: payment.subscriberName,
      method: payment.method,
      amountCents: payment.amountCents,
      paymentDate: payment.paymentDate,
    }));

  return {
    asOf,
    kpis,
    billingVsCollection,
    paymentMethods,
    arAging: aging.buckets.map((bucket) => {
      const amountCents = aging.rows.reduce((acc, row) => {
        const match = row.buckets.find((item) => item.label === bucket.label);
        return acc + (match?.amountCents ?? 0);
      }, 0);
      const count = aging.rows.reduce((acc, row) => {
        const match = row.buckets.find((item) => item.label === bucket.label);
        return acc + (match?.count ?? 0);
      }, 0);
      return { label: bucket.label, minDays: bucket.minDays ?? null, maxDays: bucket.maxDays ?? null, amountCents, count };
    }),
    collectorPerformance: collectorReport.rows,
    overdueAlerts,
    recentPayments,
  };
}
