import type { AgingBucket } from "@bcis/shared";

export const OPEN_INVOICE_STATUSES = ["posted", "partially_paid", "overdue"] as const;

export interface AgingBucketDefinition {
  label: string;
  minDays: number | null;
  maxDays: number | null;
}

export const AGING_BUCKET_DEFINITIONS: AgingBucketDefinition[] = [
  { label: "1-30 days", minDays: 1, maxDays: 30 },
  { label: "31-60 days", minDays: 31, maxDays: 60 },
  { label: "61-90 days", minDays: 61, maxDays: 90 },
  { label: "Over 90 days", minDays: 91, maxDays: null },
];

export function daysOverdue(dueDate: string, asOf: string): number {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  const reference = Date.parse(`${asOf}T00:00:00.000Z`);
  return Math.max(Math.floor((reference - due) / 86_400_000), 0);
}

export function bucketIndexForDays(overdueDays: number): number {
  const index = AGING_BUCKET_DEFINITIONS.findIndex(
    (bucket) => overdueDays >= (bucket.minDays ?? 0) && (bucket.maxDays === null || overdueDays <= bucket.maxDays),
  );
  return index < 0 ? AGING_BUCKET_DEFINITIONS.length - 1 : index;
}

export function emptyAgingBuckets(): AgingBucket[] {
  return AGING_BUCKET_DEFINITIONS.map((bucket) => ({ ...bucket, amountCents: 0, count: 0 }));
}
