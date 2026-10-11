import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  AgingReport,
  OverdueList,
  ServiceSuspension,
  SuspensionCandidate,
  SuspensionList,
} from "@bcis/shared";
import { formatDate, formatPeso } from "../lib/format";

interface ReceivablesPageProps {
  permissions: string[];
  onMessage: (message: string) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReceivablesPage({ permissions, onMessage }: ReceivablesPageProps) {
  const canControl = permissions.includes("subscriber.update");

  const [asOf, setAsOf] = useState(today());
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  const [aging, setAging] = useState<AgingReport | null>(null);
  const [overdue, setOverdue] = useState<OverdueList | null>(null);
  const [candidates, setCandidates] = useState<SuspensionList | null>(null);
  const [suspensions, setSuspensions] = useState<ServiceSuspension[]>([]);

  const [overdueQuery, setOverdueQuery] = useState("");
  const [minDays, setMinDays] = useState("");
  const [pendingSuspend, setPendingSuspend] = useState<SuspensionCandidate | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.bcis.getAgingReport({ from: asOf }),
      window.bcis.getOverdueInvoices({ from: asOf }),
      window.bcis.listSuspensionCandidates({ from: asOf }),
      window.bcis.listSuspensions(),
    ])
      .then(([agingResult, overdueResult, candidateResult, suspensionResult]) => {
        if (!active) return;
        if (!agingResult.ok) onMessage(agingResult.message);
        else setAging(agingResult.data);
        if (!overdueResult.ok) onMessage(overdueResult.message);
        else setOverdue(overdueResult.data);
        if (!candidateResult.ok) onMessage(candidateResult.message);
        else setCandidates(candidateResult.data);
        if (!suspensionResult.ok) onMessage(suspensionResult.message);
        else setSuspensions(suspensionResult.data.suspensions);
      })
      .catch(() => {
        if (active) onMessage("Unable to load receivables.");
      });
    return () => {
      active = false;
    };
  }, [asOf, version, onMessage]);

  async function suspend(candidate: SuspensionCandidate, reason: string) {
    setBusy(true);
    try {
      const result = await window.bcis.suspendServiceAccount(candidate.serviceAccountId, {
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setPendingSuspend(null);
      setSuspendReason("");
      setVersion((current) => current + 1);
      onMessage(`Service account ${candidate.serviceAccountNumber} suspended.`);
    } catch {
      onMessage("Unable to suspend the service account.");
    } finally {
      setBusy(false);
    }
  }

  async function reconnect(suspension: ServiceSuspension) {
    setBusy(true);
    try {
      const result = await window.bcis.reconnectServiceAccount(suspension.serviceAccountId, {
        reason: "Reconnected from receivables",
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setVersion((current) => current + 1);
      onMessage("Service account reconnected.");
    } catch {
      onMessage("Unable to reconnect the service account.");
    } finally {
      setBusy(false);
    }
  }

  const filteredOverdue = (overdue?.invoices ?? []).filter((invoice) => {
    const needle = overdueQuery.trim().toLowerCase();
    if (needle && !`${invoice.invoiceNumber} ${invoice.subscriberName} ${invoice.subscriberAccountNumber}`.toLowerCase().includes(needle)) {
      return false;
    }
    const days = Number(minDays);
    if (minDays && Number.isFinite(days) && invoice.daysOverdue < days) return false;
    return true;
  });

  const openSuspensions = suspensions.filter((suspension) => suspension.reconnectedAt === null);

  return (
    <section className="admin-layout" aria-labelledby="receivables-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Receivables &amp; Service Control</span>
          <h2 id="receivables-title">Aging, overdue accounts &amp; suspensions</h2>
        </div>
      </div>

      <div className="filter-row">
        <label htmlFor="receivables-asof">
          As of date
          <input
            id="receivables-asof"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </label>
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">Accounts receivable</span>
          <h3>Aging report</h3>
        </div>
        {aging ? (
          <span className="form-note">
            Total balance {formatPeso(aging.totals.totalBalanceCents)} · current {formatPeso(aging.totals.currentCents)}
          </span>
        ) : null}
      </div>
      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Subscriber</th>
              <th>Current</th>
              {(aging?.buckets ?? []).map((bucket) => (
                <th key={bucket.label}>{bucket.label}</th>
              ))}
              <th>Total balance</th>
            </tr>
          </thead>
          <tbody>
            {aging?.rows.map((row) => (
              <tr key={row.subscriberId}>
                <td>{row.subscriberAccountNumber}</td>
                <td>{row.subscriberName}</td>
                <td>{formatPeso(row.currentCents)}</td>
                {row.buckets.map((bucket) => (
                  <td key={bucket.label}>{formatPeso(bucket.amountCents)}</td>
                ))}
                <td>{formatPeso(row.totalBalanceCents)}</td>
              </tr>
            ))}
            {(!aging || aging.rows.length === 0) ? (
              <tr>
                <td colSpan={3 + (aging?.buckets.length ?? 0) + 1}>No outstanding balances as of this date.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">Follow-up</span>
          <h3>Overdue invoices</h3>
        </div>
        {overdue ? (
          <span className="form-note">
            {overdue.count} invoice(s) · {formatPeso(overdue.totalBalanceCents)}
          </span>
        ) : null}
      </div>
      <div className="filter-row">
        <label htmlFor="overdue-search">
          Search
          <input
            id="overdue-search"
            value={overdueQuery}
            placeholder="Invoice, subscriber"
            onChange={(event) => setOverdueQuery(event.target.value)}
          />
        </label>
        <label htmlFor="overdue-min-days">
          Minimum days overdue
          <input
            id="overdue-min-days"
            type="number"
            min="0"
            value={minDays}
            onChange={(event) => setMinDays(event.target.value)}
          />
        </label>
      </div>
      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Subscriber</th>
              <th>Issued</th>
              <th>Due</th>
              <th>Days overdue</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {filteredOverdue.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.invoiceNumber}</td>
                <td>{`${invoice.subscriberName} (${invoice.subscriberAccountNumber})`}</td>
                <td>{formatDate(invoice.issueDate)}</td>
                <td>{formatDate(invoice.dueDate)}</td>
                <td>{invoice.daysOverdue}</td>
                <td>{formatPeso(invoice.balanceCents)}</td>
              </tr>
            ))}
            {filteredOverdue.length === 0 ? (
              <tr>
                <td colSpan={6}>No overdue invoices match the current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">Service control</span>
          <h3>Suspension candidates</h3>
        </div>
      </div>
      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr>
              <th>Service account</th>
              <th>Subscriber</th>
              <th>Overdue invoices</th>
              <th>Total overdue</th>
              <th>Oldest (days)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidates?.candidates.map((candidate) => (
              <tr key={candidate.serviceAccountId}>
                <td>{candidate.serviceAccountNumber}</td>
                <td>{`${candidate.subscriberName} (${candidate.subscriberAccountNumber})`}</td>
                <td>{candidate.invoiceCount}</td>
                <td>{formatPeso(candidate.totalOverdueCents)}</td>
                <td>{candidate.oldestOverdueDays}</td>
                <td>
                  {canControl ? (
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPendingSuspend(candidate);
                        setSuspendReason("");
                      }}
                    >
                      Suspend
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {(!candidates || candidates.candidates.length === 0) ? (
              <tr>
                <td colSpan={6}>No service accounts currently qualify for suspension.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pendingSuspend ? (
        <form
          className="admin-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void suspend(pendingSuspend, suspendReason);
          }}
        >
          <h4>{`Suspend ${pendingSuspend.serviceAccountNumber}`}</h4>
          <label htmlFor="suspend-reason">
            Reason (kept for audit)
            <input
              id="suspend-reason"
              value={suspendReason}
              placeholder="e.g. unpaid balance after final notice"
              onChange={(event) => setSuspendReason(event.target.value)}
            />
          </label>
          <div className="detail-actions">
            <button type="submit" disabled={busy}>
              Confirm suspension
            </button>
            <button type="button" disabled={busy} onClick={() => setPendingSuspend(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="section-heading">
        <div>
          <span className="eyebrow">History</span>
          <h3>Suspension records</h3>
        </div>
      </div>
      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr>
              <th>Suspended</th>
              <th>Reason</th>
              <th>Reconnected</th>
              <th>Reconnection reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {suspensions.map((suspension) => (
              <tr key={suspension.id}>
                <td>{formatDate(suspension.suspendedAt)}</td>
                <td>{suspension.reason || "—"}</td>
                <td>{suspension.reconnectedAt ? formatDate(suspension.reconnectedAt) : "Open"}</td>
                <td>{suspension.reconnectionReason || "—"}</td>
                <td>
                  {canControl && suspension.reconnectedAt === null ? (
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy || !openSuspensions.some((open) => open.id === suspension.id)}
                      onClick={() => void reconnect(suspension)}
                    >
                      Reconnect
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {suspensions.length === 0 ? (
              <tr>
                <td colSpan={5}>No service suspensions recorded yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
