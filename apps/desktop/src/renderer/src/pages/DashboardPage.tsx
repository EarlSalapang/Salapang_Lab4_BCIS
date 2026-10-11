import { useEffect, useState } from "react";
import type { Dashboard } from "@bcis/shared";
import { formatDate, formatPeso, toTitleCase } from "../lib/format";

interface DashboardPageProps {
  permissions: string[];
  onMessage: (message: string) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage({ permissions, onMessage }: DashboardPageProps) {
  const canView = permissions.includes("report.view");

  const [asOf, setAsOf] = useState(today());
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void window.bcis
      .getDashboard({ asOf })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          onMessage(result.message);
          setDashboard(null);
          return;
        }
        setDashboard(result.data);
      })
      .catch(() => {
        if (active) onMessage("Unable to load the dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [asOf, canView, onMessage]);

  if (!canView) {
    return (
      <section className="content-section" aria-labelledby="dashboard-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Dashboard</span>
            <h2 id="dashboard-title">Welcome back</h2>
          </div>
        </div>
        <p className="form-note">
          Your role does not include access to management dashboards. Ask an administrator for the report.view permission.
        </p>
      </section>
    );
  }

  return (
    <section className="content-section" aria-labelledby="dashboard-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Management Dashboard</span>
          <h2 id="dashboard-title">Billing, collections &amp; receivables</h2>
        </div>
        <div className="detail-actions">
          <label htmlFor="dashboard-asof" className="inline-field">
            As of
            <input
              id="dashboard-asof"
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
            />
          </label>
          <button className="text-button" type="button" disabled={!dashboard} onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {loading && !dashboard ? <p className="loading-text">Loading dashboard...</p> : null}

      {dashboard ? (
        <div className="print-area dashboard-document">
          <div className="kpi-grid">
            {dashboard.kpis.map((kpi) => (
              <div key={kpi.label} className="kpi-card">
                <span className="kpi-label">{kpi.label}</span>
                <strong className="kpi-value">
                  {kpi.format === "money"
                    ? formatPeso(kpi.value)
                    : kpi.format === "percent"
                      ? `${kpi.value}%`
                      : kpi.value.toLocaleString("en-PH")}
                </strong>
                {kpi.hint ? <span className="kpi-hint">{kpi.hint}</span> : null}
              </div>
            ))}
          </div>

          <div className="dashboard-columns">
            <div className="report-section">
              <h3>Billing versus collection (6 months)</h3>
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="align-right">Billed</th>
                      <th className="align-right">Collected</th>
                      <th className="align-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.billingVsCollection.map((point) => (
                      <tr key={point.period}>
                        <td>{point.period}</td>
                        <td className="align-right">{formatPeso(point.billedCents)}</td>
                        <td className="align-right">{formatPeso(point.collectedCents)}</td>
                        <td className="align-right">{formatPeso(point.billedCents - point.collectedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="report-section">
              <h3>Collections by method (this month)</h3>
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th className="align-right">Payments</th>
                      <th className="align-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.paymentMethods.map((point) => (
                      <tr key={point.method}>
                        <td>{toTitleCase(point.method)}</td>
                        <td className="align-right">{point.count}</td>
                        <td className="align-right">{formatPeso(point.amountCents)}</td>
                      </tr>
                    ))}
                    {dashboard.paymentMethods.length === 0 ? (
                      <tr>
                        <td colSpan={3}>No collections recorded this month.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="report-section">
            <h3>Accounts receivable aging</h3>
            <div className="user-table-wrap">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="align-right">Invoices</th>
                    <th className="align-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.arAging.map((bucket) => (
                    <tr key={bucket.label}>
                      <td>{bucket.label}</td>
                      <td className="align-right">{bucket.count}</td>
                      <td className="align-right">{formatPeso(bucket.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-columns">
            <div className="report-section">
              <h3>Collector performance</h3>
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Collector</th>
                      <th className="align-right">Batches</th>
                      <th className="align-right">Collected</th>
                      <th className="align-right">Remitted</th>
                      <th className="align-right">Shortage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.collectorPerformance.map((row) => (
                      <tr key={row.collectorName}>
                        <td>{row.collectorName}</td>
                        <td className="align-right">{row.batches}</td>
                        <td className="align-right">{formatPeso(row.collectedCents)}</td>
                        <td className="align-right">{formatPeso(row.remittedCents)}</td>
                        <td className="align-right">{formatPeso(row.shortageCents)}</td>
                      </tr>
                    ))}
                    {dashboard.collectorPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={5}>No collector activity recorded.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="report-section">
              <h3>Overdue follow-up</h3>
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Subscriber</th>
                      <th className="align-right">Overdue</th>
                      <th className="align-right">Oldest (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.overdueAlerts.map((alert) => (
                      <tr key={alert.subscriberId}>
                        <td>{`${alert.subscriberName} (${alert.subscriberAccountNumber})`}</td>
                        <td className="align-right">{formatPeso(alert.totalOverdueCents)}</td>
                        <td className="align-right">{alert.oldestOverdueDays}</td>
                      </tr>
                    ))}
                    {dashboard.overdueAlerts.length === 0 ? (
                      <tr>
                        <td colSpan={3}>No overdue accounts require follow-up.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="report-section">
            <h3>Recent payments</h3>
            <div className="user-table-wrap">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Subscriber</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th className="align-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.receiptNumber}</td>
                      <td>{payment.subscriberName}</td>
                      <td>{toTitleCase(payment.method)}</td>
                      <td>{formatDate(payment.paymentDate)}</td>
                      <td className="align-right">{formatPeso(payment.amountCents)}</td>
                    </tr>
                  ))}
                  {dashboard.recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No payments recorded yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
