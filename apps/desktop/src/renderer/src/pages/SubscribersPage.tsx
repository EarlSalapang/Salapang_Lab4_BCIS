import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  CollectionArea,
  ServicePlan,
  SubscriberDetail,
  SubscriberListResponse,
  SubscriberStatus,
} from "@bcis/shared";
import { formatDate, formatPeso } from "../lib/format";

const statusOptions: SubscriberStatus[] = ["ACTIVE", "INACTIVE", "TERMINATED"];

interface SubscribersPageProps {
  permissions: string[];
  onMessage: (message: string) => void;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalDay(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function SubscribersPage({ permissions, onMessage }: SubscribersPageProps) {
  const canCreate = permissions.includes("subscriber.create");
  const canUpdate = permissions.includes("subscriber.update");

  const [data, setData] = useState<SubscriberListResponse | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SubscriberStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [areas, setAreas] = useState<CollectionArea[]>([]);
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [selected, setSelected] = useState<SubscriberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    contactNumber: "",
    email: "",
    addressLine: "",
    barangay: "",
    municipality: "",
    collectionAreaId: "",
    billingDay: "",
    dueDay: "",
  });
  const [saForm, setSaForm] = useState({
    planId: "",
    installationAddress: "",
    collectionAreaId: "",
    billingDay: "",
    dueDay: "",
  });

  useEffect(() => {
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      void window.bcis
        .listSubscribers({ query: query || undefined, status: status || undefined, page: 1, pageSize: 25 })
        .then((result) => {
          if (!active) return;
          if (!result.ok) onMessage(result.message);
          else setData(result.data);
        })
        .catch(() => {
          if (active) onMessage("Unable to load subscribers.");
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

  useEffect(() => {
    void window.bcis.listCollectionAreas().then((result) => {
      if (result.ok) setAreas(result.data.areas);
    });
    void window.bcis.listPlans().then((result) => {
      if (result.ok) setPlans(result.data.plans);
    });
  }, []);

  async function openSubscriber(id: string) {
    setDetailLoading(true);
    try {
      const result = await window.bcis.getSubscriber(id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.subscriber);
    } catch {
      onMessage("Unable to load the subscriber.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function createSubscriber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await window.bcis.createSubscriber({
        firstName: form.firstName,
        middleName: optional(form.middleName),
        lastName: form.lastName,
        contactNumber: optional(form.contactNumber),
        email: optional(form.email),
        addressLine: optional(form.addressLine),
        barangay: optional(form.barangay),
        municipality: optional(form.municipality),
        collectionAreaId: optional(form.collectionAreaId),
        billingDay: optionalDay(form.billingDay),
        dueDay: optionalDay(form.dueDay),
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setForm({
        firstName: "",
        middleName: "",
        lastName: "",
        contactNumber: "",
        email: "",
        addressLine: "",
        barangay: "",
        municipality: "",
        collectionAreaId: "",
        billingDay: "",
        dueDay: "",
      });
      setSelected(result.data.subscriber);
      setData((current) =>
        current
          ? { ...current, subscribers: [result.data.subscriber, ...current.subscribers], total: current.total + 1 }
          : current,
      );
      onMessage(`Subscriber ${result.data.subscriber.accountNumber} created.`);
    } catch {
      onMessage("Unable to create the subscriber.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(nextStatus: SubscriberStatus) {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await window.bcis.updateSubscriber(selected.id, { status: nextStatus });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.subscriber);
      setData((current) =>
        current
          ? { ...current, subscribers: current.subscribers.map((item) => (item.id === result.data.subscriber.id ? result.data.subscriber : item)) }
          : current,
      );
      onMessage(`Subscriber status is now ${result.data.subscriber.status}.`);
    } catch {
      onMessage("Unable to update the subscriber.");
    } finally {
      setBusy(false);
    }
  }

  async function createServiceAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const result = await window.bcis.createServiceAccount(selected.id, {
        planId: saForm.planId,
        installationAddress: saForm.installationAddress,
        collectionAreaId: optional(saForm.collectionAreaId),
        billingDay: optionalDay(saForm.billingDay),
        dueDay: optionalDay(saForm.dueDay),
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      await openSubscriber(selected.id);
      setSaForm({ planId: "", installationAddress: "", collectionAreaId: "", billingDay: "", dueDay: "" });
      onMessage(`Service account ${result.data.serviceAccount.accountNumber} created.`);
    } catch {
      onMessage("Unable to create the service account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-layout" aria-labelledby="subscribers-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Directory</span>
          <h2 id="subscribers-title">Subscribers</h2>
        </div>
      </div>

      <div className="filter-row">
        <label htmlFor="subscriber-search">
          Search
          <input
            id="subscriber-search"
            value={query}
            placeholder="Name, account number, contact"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label htmlFor="subscriber-status">
          Status
          <select id="subscriber-status" value={status} onChange={(event) => setStatus(event.target.value as SubscriberStatus | "")}>
            <option value="">All statuses</option>
            {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>

      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr>
              <th>Account #</th><th>Name</th><th>Contact</th><th>Area</th><th>Status</th><th>Services</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6}>Loading subscribers...</td></tr>}
            {!loading && (!data || data.subscribers.length === 0) && (
              <tr><td colSpan={6}>No subscribers found.</td></tr>
            )}
            {data?.subscribers.map((subscriber) => (
              <tr
                key={subscriber.id}
                className={selected?.id === subscriber.id ? "row-selected" : undefined}
                onClick={() => void openSubscriber(subscriber.id)}
              >
                <td>{subscriber.accountNumber}</td>
                <td>{subscriber.displayName}</td>
                <td>{subscriber.contactNumber ?? "—"}</td>
                <td>{subscriber.collectionAreaName ?? "—"}</td>
                <td>{subscriber.status}</td>
                <td>{subscriber.serviceAccountCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canCreate && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Enrollment</span>
              <h2>New subscriber</h2>
            </div>
          </div>
          <form className="admin-form" onSubmit={createSubscriber}>
            <p className="form-note">A unique account number is issued automatically.</p>
            <label htmlFor="sub-first">First name</label>
            <input id="sub-first" required value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            <label htmlFor="sub-middle">Middle name</label>
            <input id="sub-middle" value={form.middleName}
              onChange={(event) => setForm({ ...form, middleName: event.target.value })} />
            <label htmlFor="sub-last">Last name</label>
            <input id="sub-last" required value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            <label htmlFor="sub-contact">Contact number</label>
            <input id="sub-contact" value={form.contactNumber}
              onChange={(event) => setForm({ ...form, contactNumber: event.target.value })} />
            <label htmlFor="sub-email">Email</label>
            <input id="sub-email" type="email" value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <label htmlFor="sub-address">Address line</label>
            <input id="sub-address" value={form.addressLine}
              onChange={(event) => setForm({ ...form, addressLine: event.target.value })} />
            <label htmlFor="sub-barangay">Barangay</label>
            <input id="sub-barangay" value={form.barangay}
              onChange={(event) => setForm({ ...form, barangay: event.target.value })} />
            <label htmlFor="sub-municipality">Municipality</label>
            <input id="sub-municipality" value={form.municipality}
              onChange={(event) => setForm({ ...form, municipality: event.target.value })} />
            <label htmlFor="sub-area">Collection area</label>
            <select id="sub-area" value={form.collectionAreaId}
              onChange={(event) => setForm({ ...form, collectionAreaId: event.target.value })}>
              <option value="">Unassigned</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
            <label htmlFor="sub-billing-day">Billing day (1-28)</label>
            <input id="sub-billing-day" type="number" min={1} max={28} value={form.billingDay}
              onChange={(event) => setForm({ ...form, billingDay: event.target.value })} />
            <label htmlFor="sub-due-day">Due day (1-28)</label>
            <input id="sub-due-day" type="number" min={1} max={28} value={form.dueDay}
              onChange={(event) => setForm({ ...form, dueDay: event.target.value })} />
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Saving..." : "Create subscriber"}
            </button>
          </form>
        </>
      )}

      {selected && (
        <div className="detail-card" aria-labelledby="subscriber-detail-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Subscriber detail</span>
              <h2 id="subscriber-detail-title">{selected.displayName}</h2>
            </div>
            {detailLoading && <span className="loading-text">Loading...</span>}
          </div>
          <p>
            {`${selected.accountNumber} · ${selected.status} · ${selected.contactNumber ?? "No contact"} · `}
            {`${selected.collectionAreaName ?? "No area"}`}
          </p>
          {canUpdate && (
            <div className="detail-actions">
              <select
                aria-label="Change subscriber status"
                value={selected.status}
                onChange={(event) => void updateStatus(event.target.value as SubscriberStatus)}
              >
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          )}

          <div className="section-heading">
            <div><span className="eyebrow">Addresses</span><h2>Service addresses</h2></div>
          </div>
          <div className="user-table-wrap">
            <table className="user-table">
              <thead><tr><th>Label</th><th>Line</th><th>Barangay</th><th>Municipality</th><th>Default</th></tr></thead>
              <tbody>
                {selected.addresses.length === 0 && <tr><td colSpan={5}>No addresses recorded.</td></tr>}
                {selected.addresses.map((address) => (
                  <tr key={address.id}>
                    <td>{address.label}</td>
                    <td>{address.line1}{address.line2 ? `, ${address.line2}` : ""}</td>
                    <td>{address.barangay ?? "—"}</td>
                    <td>{address.municipality ?? "—"}</td>
                    <td>{address.isDefault ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-heading">
            <div><span className="eyebrow">Services</span><h2>Service accounts</h2></div>
          </div>
          <div className="user-table-wrap">
            <table className="user-table">
              <thead><tr><th>Account #</th><th>Plan</th><th>Rate</th><th>Status</th><th>Activated</th></tr></thead>
              <tbody>
                {selected.serviceAccounts.length === 0 && <tr><td colSpan={5}>No service accounts yet.</td></tr>}
                {selected.serviceAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.accountNumber}</td>
                    <td>{account.planName}</td>
                    <td>{formatPeso(account.currentRateCents)}</td>
                    <td>{account.status}</td>
                    <td>{formatDate(account.activationDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canCreate && (
            <form className="admin-form" onSubmit={createServiceAccount}>
              <p className="form-note">Enroll this subscriber into a service plan.</p>
              <label htmlFor="sa-plan">Plan</label>
              <select id="sa-plan" required value={saForm.planId}
                onChange={(event) => setSaForm({ ...saForm, planId: event.target.value })}>
                <option value="">Select a plan</option>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.code})</option>)}
              </select>
              <label htmlFor="sa-address">Installation address</label>
              <input id="sa-address" required value={saForm.installationAddress}
                onChange={(event) => setSaForm({ ...saForm, installationAddress: event.target.value })} />
              <label htmlFor="sa-area">Collection area</label>
              <select id="sa-area" value={saForm.collectionAreaId}
                onChange={(event) => setSaForm({ ...saForm, collectionAreaId: event.target.value })}>
                <option value="">Use subscriber default</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
              <label htmlFor="sa-billing-day">Billing day (1-28)</label>
              <input id="sa-billing-day" type="number" min={1} max={28} value={saForm.billingDay}
                onChange={(event) => setSaForm({ ...saForm, billingDay: event.target.value })} />
              <label htmlFor="sa-due-day">Due day (1-28)</label>
              <input id="sa-due-day" type="number" min={1} max={28} value={saForm.dueDay}
                onChange={(event) => setSaForm({ ...saForm, dueDay: event.target.value })} />
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Saving..." : "Add service account"}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}