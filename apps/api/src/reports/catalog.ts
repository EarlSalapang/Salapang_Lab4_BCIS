import type { ReportCatalog, ReportCatalogItem } from "@bcis/shared";

const fromTo = [
  { name: "from", label: "From date", type: "date" as const, required: false },
  { name: "to", label: "To date", type: "date" as const, required: false },
];

export const REPORT_CATALOG_ITEMS: ReportCatalogItem[] = [
  {
    key: "collection-summary",
    title: "Collection Report",
    description: "Collections by period and payment method for the selected range and grouping.",
    category: "Collections",
    parameters: [
      ...fromTo,
      {
        name: "granularity",
        label: "Group by",
        type: "select",
        required: false,
        defaultValue: "month",
        options: [
          { value: "day", label: "Daily" },
          { value: "week", label: "Weekly" },
          { value: "month", label: "Monthly" },
          { value: "year", label: "Annual" },
        ],
      },
    ],
  },
  {
    key: "billing-vs-collection",
    title: "Billing versus Collection",
    description: "Monthly billed amounts compared against posted collections and the collection rate.",
    category: "Revenue",
    parameters: fromTo,
  },
  {
    key: "revenue",
    title: "Revenue by Plan, Service and Area",
    description: "Billed revenue grouped by service plan, service type and collection area.",
    category: "Revenue",
    parameters: fromTo,
  },
  {
    key: "ar-aging",
    title: "Accounts Receivable Aging",
    description: "Outstanding balances by aging bucket and subscriber.",
    category: "Receivables",
    parameters: [
      { name: "asOf", label: "As of date", type: "date", required: false },
    ],
  },
  {
    key: "overdue",
    title: "Overdue Accounts",
    description: "Unpaid and partially paid invoices past their due date.",
    category: "Receivables",
    parameters: [
      { name: "asOf", label: "As of date", type: "date", required: false },
    ],
  },
  {
    key: "collector-performance",
    title: "Collector Performance",
    description: "Collector batches, expected versus collected, remittance, shortage and overage.",
    category: "Collectors",
    parameters: fromTo,
  },
  {
    key: "subscriber-master",
    title: "Subscriber Master List",
    description: "Registered subscribers with status, area, contact details and account counts.",
    category: "Subscribers",
    parameters: [],
  },
  {
    key: "statement-of-account",
    title: "Statement of Account",
    description: "Ledger statement for a single subscriber over the selected date range.",
    category: "Subscribers",
    parameters: [
      { name: "subscriberId", label: "Subscriber ID", type: "text", required: true },
      ...fromTo,
    ],
  },
];

export const REPORT_CATALOG: ReportCatalog = { reports: REPORT_CATALOG_ITEMS };

export function isReportKey(key: string): boolean {
  return REPORT_CATALOG_ITEMS.some((item) => item.key === key);
}

export function reportTitle(key: string): string {
  return REPORT_CATALOG_ITEMS.find((item) => item.key === key)?.title ?? key;
}
