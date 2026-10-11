export interface IntegrityCheck {
  key: string;
  description: string;
  sql: string;
}

export interface IntegrityCheckResult {
  key: string;
  description: string;
  ok: boolean;
  violations: number;
  sample: unknown[];
}

export interface IntegrityReport {
  ok: boolean;
  checkedAt: string;
  results: IntegrityCheckResult[];
}

export type IntegrityQuery = (sql: string) => Promise<{ rows: unknown[] }>;

export const INTEGRITY_CHECKS: IntegrityCheck[] = [
  {
    key: "invoice_balance_formula",
    description: "Every invoice balance equals its total minus the amount paid.",
    sql: `SELECT id, invoice_number, total_cents, amount_paid_cents, balance_cents
          FROM invoices
          WHERE balance_cents <> total_cents - amount_paid_cents`,
  },
  {
    key: "invoice_amount_paid_matches_allocations",
    description: "Each invoice amount_paid_cents equals the sum of its payment allocations.",
    sql: `SELECT i.id, i.invoice_number, i.amount_paid_cents, COALESCE(SUM(a.amount_cents), 0)::int AS allocated
          FROM invoices i
          LEFT JOIN payment_allocations a ON a.invoice_id = i.id
          GROUP BY i.id, i.invoice_number, i.amount_paid_cents
          HAVING i.amount_paid_cents <> COALESCE(SUM(a.amount_cents), 0)`,
  },
  {
    key: "payment_allocation_within_payment",
    description: "Allocations against a payment never exceed the payment amount.",
    sql: `SELECT p.id, p.receipt_number, p.amount_cents, COALESCE(SUM(a.amount_cents), 0)::int AS allocated
          FROM payments p
          LEFT JOIN payment_allocations a ON a.payment_id = p.id
          GROUP BY p.id, p.receipt_number, p.amount_cents
          HAVING COALESCE(SUM(a.amount_cents), 0) > p.amount_cents`,
  },
  {
    key: "ledger_latest_balance_matches_totals",
    description: "The newest ledger balance for each subscriber matches the sum of that subscriber's entries.",
    sql: `WITH totals AS (
            SELECT subscriber_id,
                   SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE -amount_cents END) AS computed
            FROM ledger_entries
            GROUP BY subscriber_id
          ),
          latest AS (
            SELECT DISTINCT ON (subscriber_id) subscriber_id, balance_cents
            FROM ledger_entries
            ORDER BY subscriber_id, created_at DESC, id DESC
          )
          SELECT latest.subscriber_id, latest.balance_cents, totals.computed
          FROM latest
          JOIN totals ON totals.subscriber_id = latest.subscriber_id
          WHERE latest.balance_cents <> totals.computed`,
  },
  {
    key: "non_negative_monetary_values",
    description: "Monetary columns never hold negative or zero-where-invalid values.",
    sql: `SELECT 'invoice' AS source, id::text AS id, balance_cents AS value
            FROM invoices WHERE balance_cents < 0 OR total_cents < 0 OR amount_paid_cents < 0
          UNION ALL
          SELECT 'payment', id::text, amount_cents FROM payments WHERE amount_cents <= 0
          UNION ALL
          SELECT 'allocation', id::text, amount_cents FROM payment_allocations WHERE amount_cents <= 0
          UNION ALL
          SELECT 'ledger', id::text, amount_cents FROM ledger_entries WHERE amount_cents <= 0
          UNION ALL
          SELECT 'service_plan', id::text, monthly_price_cents FROM service_plans WHERE monthly_price_cents < 0`,
  },
];

export async function runIntegrityChecks(
  query: IntegrityQuery,
  checks: IntegrityCheck[] = INTEGRITY_CHECKS,
): Promise<IntegrityReport> {
  const results: IntegrityCheckResult[] = [];
  for (const check of checks) {
    const { rows } = await query(check.sql);
    results.push({
      key: check.key,
      description: check.description,
      ok: rows.length === 0,
      violations: rows.length,
      sample: rows.slice(0, 5),
    });
  }
  return {
    ok: results.every((result) => result.ok),
    checkedAt: new Date().toISOString(),
    results,
  };
}
