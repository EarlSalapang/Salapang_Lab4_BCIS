import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  ServiceAccountDetail,
  ServiceAccountListResponse,
  ServiceAccountStatus,
} from "@bcis/shared";
import { formatDate, formatPeso } from "../lib/format";

const allStatuses: ServiceAccountStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "DISCONNECTED", "TERMINATED"];

interface ServiceAccountsPageProps {
  permissions: string[];
  onMessage: (message: string) => void;
}

export default function ServiceAccountsPage({ onMessage }: ServiceAccountsPageProps) {
  const [data, setData] = useState<ServiceAccountListResponse | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ServiceAccountStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ServiceAccountDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<ServiceAccountStatus>("ACTIVE");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      void window.bcis
        .listServiceAccounts({ query: query || undefined, status: status || undefined, page: 1, pageSize: 25 })
        .then((result) => {
          if (!active) return;
          if (!result.ok) onMessage(result.message);
          else setData(result.data);
        })
        .catch(() => {
          if (active) onMessage("Unable to load service accounts.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, status, onMessage]);

  async function openAccount(id: string) {
    try {
      const result = await window.bcis.getServiceAccount(id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.serviceAccount);
      setNextStatus(result.data.serviceAccount.status);
      setReason("");
    } catch {
      onMessage("Unable to load the service account.");
    }
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const result = await window.bcis.updateServiceAccount(selected.id, {
        status: nextStatus,
        reason: reason || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.serviceAccount);
      setData((current) =>
        current
          ? {
              ...current,
              serviceAccounts: current.serviceAccounts.map((item) =>
                item.id === result.data.serviceAccount.id ? result.data.serviceAccount : item,
              ),
            }
          : current,
      );
      setReason("");
      onMessage(`Service account ${result.data.serviceAccount.accountNumber} is now ${result.data.serviceAccount.status}.`);
    } catch {
      onMessage("Unable to update the service account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-layout" aria-labelledby="service-accounts-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Network</span>
          <h2 id="service-accounts-title">Service accounts</h2>
        </div>
      </div>

      <div className="filter-row">
        <label htmlFor="sa-search">
          Search
          <input id="sa-search" value={query} placeholder="Account number, subscriber, plan"
            onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label htmlFor="sa-status-filter">
          Status
          <select id="sa-status-filter" value={status}
            onChange={(event) => setStatus(event.target.value as ServiceAccountStatus | "")}>
            <option value="">All statuses</option>
            {allStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>

      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr><th>Account #</th><th>Subscriber</th><th>Plan</th><th>Rate</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5}>Loading service accounts...</td></tr>}
            {!loading && (!data || data.serviceAccounts.length === 0) && (
              <tr><td colSpan={5}>No service accounts found.</td></tr>
            )}
            {data?.serviceAccounts.map((account) => (
              <tr
                key={account.id}
                className={selected?.id === account.id ? "row-selected" : undefined}
                onClick={() => void openAccount(account.id)}
              >
                <td>{account.accountNumber}</td>
                <td>{account.subscriberName}</td>
                <td>{account.planName}</td>
                <td>{formatPeso(account.currentRateCents)}</td>
                <td>{account.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="detail-card" aria-labelledby="service-account-detail-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Service account detail</span>
              <h2 id="service-account-detail-title">{selected.accountNumber}</h2>
            </div>
          </div>
          <p>
            {`${selected.subscriberName} (${selected.subscriberAccountNumber}) · ${selected.planName} · `}
            {`${formatPeso(selected.currentRateCents)}/mo · ${selected.status}`}
          </p>
          <p>{`Installed at ${selected.installationAddress}`}</p>
          <p>{`Activated ${formatDate(selected.activationDate)} · Billing day ${selected.billingDay} · Due day ${selected.dueDay}`}</p>

          <form className="admin-form" onSubmit={changeStatus}>
            <p className="form-note">Record status changes for audit history.</p>
            <label htmlFor="sa-next-status">New status</label>
            <select id="sa-next-status" value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as ServiceAccountStatus)}>
              {allStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <label htmlFor="sa-reason">Reason</label>
            <input id="sa-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Saving..." : "Update status"}
            </button>
          </form>

          <div className="section-heading">
            <div><span className="eyebrow">History</span><h2>Status events</h2></div>
          </div>
          <div className="user-table-wrap">
            <table className="user-table">
              <thead><tr><th>When</th><th>From</th><th>To</th><th>Reason</th><th>By</th></tr></thead>
              <tbody>
                {selected.events.length === 0 && <tr><td colSpan={5}>No events recorded.</td></tr>}
                {selected.events.map((serviceEvent) => (
                  <tr key={serviceEvent.id}>
                    <td>{formatDate(serviceEvent.occurredAt)}</td>
                    <td>{serviceEvent.fromStatus ?? "—"}</td>
                    <td>{serviceEvent.toStatus}</td>
                    <td>{serviceEvent.reason ?? "—"}</td>
                    <td>{serviceEvent.changedByName ?? "System"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}