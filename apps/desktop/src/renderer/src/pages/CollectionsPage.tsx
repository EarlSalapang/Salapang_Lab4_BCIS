import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  CollectionArea,
  CollectionBatch,
  CollectionBatchListResponse,
  CollectionBatchStatus,
  Collector,
  CollectorAssignment,
  RouteSheet,
  SubscriberSummary,
} from "@bcis/shared";
import { formatDate, formatPeso, toTitleCase } from "../lib/format";

const batchStatuses: CollectionBatchStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "SUBMITTED",
  "REMITTED",
  "RECONCILED",
  "CLOSED",
  "CANCELLED",
];

interface CollectionsPageProps {
  permissions: string[];
  onMessage: (message: string) => void;
}

type Tab = "collectors" | "assignments" | "batches";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CollectionsPage({ permissions, onMessage }: CollectionsPageProps) {
  const canManage = permissions.includes("collection.manage");
  const canReconcile = permissions.includes("collection.reconcile");

  const [tab, setTab] = useState<Tab>("collectors");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [areas, setAreas] = useState<CollectionArea[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberSummary[]>([]);
  const [collectorForm, setCollectorForm] = useState({ code: "", name: "", contactNumber: "" });

  const [assignments, setAssignments] = useState<CollectorAssignment[]>([]);
  const [assignmentCollectorFilter, setAssignmentCollectorFilter] = useState("");
  const [assignmentForm, setAssignmentForm] = useState<{ collectorId: string; subscriberIds: string[] }>({
    collectorId: "",
    subscriberIds: [],
  });

  const [batches, setBatches] = useState<CollectionBatchListResponse | null>(null);
  const [batchCollectorFilter, setBatchCollectorFilter] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState<CollectionBatchStatus | "">("");
  const [batchForm, setBatchForm] = useState({ collectorId: "", collectionAreaId: "", routeDate: today(), notes: "" });
  const [selectedBatch, setSelectedBatch] = useState<CollectionBatch | null>(null);
  const [routeSheet, setRouteSheet] = useState<RouteSheet | null>(null);
  const [remitForm, setRemitForm] = useState({ amount: "", referenceNumber: "" });
  const [reconcileNote, setReconcileNote] = useState("");

  useEffect(() => {
    let active = true;
    void window.bcis
      .listCollectors(includeInactive)
      .then((result) => {
        if (!active) return;
        if (!result.ok) onMessage(result.message);
        else setCollectors(result.data.collectors);
      })
      .catch(() => {
        if (active) onMessage("Unable to load collectors.");
      });
    return () => {
      active = false;
    };
  }, [includeInactive, version, onMessage]);

  useEffect(() => {
    let active = true;
    void window.bcis
      .listCollectionAreas()
      .then((result) => {
        if (!active) return;
        if (!result.ok) onMessage(result.message);
        else setAreas(result.data.areas);
      })
      .catch(() => {
        if (active) onMessage("Unable to load collection areas.");
      });
    void window.bcis
      .listSubscribers({ page: 1, pageSize: 100 })
      .then((result) => {
        if (!active) return;
        if (!result.ok) onMessage(result.message);
        else setSubscribers(result.data.subscribers);
      })
      .catch(() => {
        if (active) onMessage("Unable to load subscribers.");
      });
    return () => {
      active = false;
    };
  }, [onMessage]);

  useEffect(() => {
    if (tab !== "assignments") return;
    let active = true;
    void window.bcis
      .listCollectorAssignments(assignmentCollectorFilter || undefined)
      .then((result) => {
        if (!active) return;
        if (!result.ok) onMessage(result.message);
        else setAssignments(result.data.assignments);
      })
      .catch(() => {
        if (active) onMessage("Unable to load collector assignments.");
      });
    return () => {
      active = false;
    };
  }, [tab, assignmentCollectorFilter, version, onMessage]);

  useEffect(() => {
    if (tab !== "batches") return;
    let active = true;
    void window.bcis
      .listCollectionBatches({
        collectorId: batchCollectorFilter || undefined,
        status: batchStatusFilter || undefined,
        page: 1,
        pageSize: 50,
      })
      .then((result) => {
        if (!active) return;
        if (!result.ok) onMessage(result.message);
        else setBatches(result.data);
      })
      .catch(() => {
        if (active) onMessage("Unable to load collection batches.");
      });
    return () => {
      active = false;
    };
  }, [tab, batchCollectorFilter, batchStatusFilter, version, onMessage]);

  async function createCollector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await window.bcis.createCollector({
        code: collectorForm.code.trim(),
        name: collectorForm.name.trim(),
        contactNumber: collectorForm.contactNumber.trim() || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setCollectorForm({ code: "", name: "", contactNumber: "" });
      setVersion((current) => current + 1);
      onMessage(`Collector ${result.data.collector.code} created.`);
    } catch {
      onMessage("Unable to create the collector.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCollector(collector: Collector) {
    setBusy(true);
    try {
      const result = await window.bcis.updateCollector(collector.id, { isActive: !collector.isActive });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setVersion((current) => current + 1);
      onMessage(`Collector ${result.data.collector.code} ${result.data.collector.isActive ? "activated" : "deactivated"}.`);
    } catch {
      onMessage("Unable to update the collector.");
    } finally {
      setBusy(false);
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignmentForm.collectorId || assignmentForm.subscriberIds.length === 0) {
      onMessage("Select a collector and at least one subscriber.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.bcis.createCollectorAssignments({
        collectorId: assignmentForm.collectorId,
        subscriberIds: assignmentForm.subscriberIds,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setAssignmentForm({ collectorId: assignmentForm.collectorId, subscriberIds: [] });
      setVersion((current) => current + 1);
      onMessage(`Assigned ${result.data.assignments.length} subscriber(s).`);
    } catch {
      onMessage("Unable to create the assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(assignment: CollectorAssignment) {
    setBusy(true);
    try {
      const result = await window.bcis.removeCollectorAssignment(assignment.id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setVersion((current) => current + 1);
      onMessage(`Removed ${assignment.subscriberAccountNumber} from ${assignment.collectorName}.`);
    } catch {
      onMessage("Unable to remove the assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!batchForm.collectorId) {
      onMessage("Select a collector and route date.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.bcis.createCollectionBatch({
        collectorId: batchForm.collectorId,
        collectionAreaId: batchForm.collectionAreaId || undefined,
        routeDate: batchForm.routeDate,
        notes: batchForm.notes.trim() || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelectedBatch(result.data.batch);
      setBatchForm({ ...batchForm, notes: "" });
      setVersion((current) => current + 1);
      onMessage(`Collection batch ${result.data.batch.batchNumber} created.`);
    } catch {
      onMessage("Unable to create the collection batch.");
    } finally {
      setBusy(false);
    }
  }

  async function openBatch(id: string) {
    try {
      const result = await window.bcis.getCollectionBatch(id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelectedBatch(result.data.batch);
      setRouteSheet(null);
      setRemitForm({ amount: "", referenceNumber: "" });
      setReconcileNote("");
    } catch {
      onMessage("Unable to load the collection batch.");
    }
  }

  async function runLifecycle(action: "start" | "submit") {
    if (!selectedBatch) return;
    setBusy(true);
    try {
      const result =
        action === "start"
          ? await window.bcis.startCollectionBatch(selectedBatch.id)
          : await window.bcis.submitCollectionBatch(selectedBatch.id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelectedBatch(result.data.batch);
      setVersion((current) => current + 1);
      onMessage(`Batch ${result.data.batch.batchNumber} is now ${toTitleCase(result.data.batch.status)}.`);
    } catch {
      onMessage("Unable to update the collection batch.");
    } finally {
      setBusy(false);
    }
  }

  async function remitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBatch) return;
    const amountCents = Math.round(Number(remitForm.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      onMessage("Enter the remitted amount.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.bcis.remitCollectionBatch(selectedBatch.id, {
        amountCents,
        referenceNumber: remitForm.referenceNumber.trim() || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelectedBatch(result.data.batch);
      setRemitForm({ amount: "", referenceNumber: "" });
      setVersion((current) => current + 1);
      onMessage(`Batch ${result.data.batch.batchNumber} remitted.`);
    } catch {
      onMessage("Unable to remit the batch.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcileBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBatch) return;
    setBusy(true);
    try {
      const result = await window.bcis.reconcileCollectionBatch(selectedBatch.id, {
        note: reconcileNote.trim() || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelectedBatch(result.data.batch);
      setReconcileNote("");
      setVersion((current) => current + 1);
      onMessage(`Batch ${result.data.batch.batchNumber} reconciled.`);
    } catch {
      onMessage("Unable to reconcile the batch.");
    } finally {
      setBusy(false);
    }
  }

  async function closeBatch() {
    if (!selectedBatch) return;
    setBusy(true);
    try {
      const result = await window.bcis.closeCollectionBatch(selectedBatch.id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelectedBatch(result.data.batch);
      setVersion((current) => current + 1);
      onMessage(`Batch ${result.data.batch.batchNumber} closed.`);
    } catch {
      onMessage("Unable to close the batch.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRouteSheet() {
    if (!selectedBatch) return;
    try {
      const result = await window.bcis.getRouteSheet(selectedBatch.id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setRouteSheet(result.data);
    } catch {
      onMessage("Unable to load the route sheet.");
    }
  }

  return (
    <section className="admin-layout" aria-labelledby="collections-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Field Collections</span>
          <h2 id="collections-title">Collectors, routes &amp; remittances</h2>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(["collectors", "assignments", "batches"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`tab-button ${tab === value ? "tab-active" : ""}`}
            onClick={() => setTab(value)}
          >
            {value === "collectors" ? "Collectors" : value === "assignments" ? "Assignments" : "Collection batches"}
          </button>
        ))}
      </div>

      {tab === "collectors" ? (
        <>
          {canManage ? (
            <form className="admin-form" onSubmit={createCollector}>
              <h3>Add a collector</h3>
              <label htmlFor="collector-code">
                Code
                <input
                  id="collector-code"
                  required
                  minLength={2}
                  maxLength={40}
                  value={collectorForm.code}
                  onChange={(event) => setCollectorForm({ ...collectorForm, code: event.target.value })}
                />
              </label>
              <label htmlFor="collector-name">
                Name
                <input
                  id="collector-name"
                  required
                  minLength={3}
                  maxLength={120}
                  value={collectorForm.name}
                  onChange={(event) => setCollectorForm({ ...collectorForm, name: event.target.value })}
                />
              </label>
              <label htmlFor="collector-contact">
                Contact number
                <input
                  id="collector-contact"
                  value={collectorForm.contactNumber}
                  onChange={(event) => setCollectorForm({ ...collectorForm, contactNumber: event.target.value })}
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Add collector"}
              </button>
            </form>
          ) : null}

          <div className="filter-row">
            <label htmlFor="collector-inactive">
              <input
                id="collector-inactive"
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Include inactive
            </label>
          </div>

          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {collectors.map((collector) => (
                  <tr key={collector.id}>
                    <td>{collector.code}</td>
                    <td>{collector.name}</td>
                    <td>{collector.contactNumber || "—"}</td>
                    <td>{collector.isActive ? "Active" : "Inactive"}</td>
                    <td>
                      {canManage ? (
                        <button className="text-button" type="button" disabled={busy} onClick={() => void toggleCollector(collector)}>
                          {collector.isActive ? "Deactivate" : "Activate"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {collectors.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No collectors are available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "assignments" ? (
        <>
          {canManage ? (
            <form className="admin-form" onSubmit={createAssignment}>
              <h3>Assign subscribers</h3>
              <label htmlFor="assignment-collector">
                Collector
                <select
                  id="assignment-collector"
                  value={assignmentForm.collectorId}
                  onChange={(event) => setAssignmentForm({ ...assignmentForm, collectorId: event.target.value })}
                >
                  <option value="">Select a collector</option>
                  {collectors.map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.code} — {collector.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="assignment-subscribers">
                Subscribers
                <select
                  id="assignment-subscribers"
                  multiple
                  size={8}
                  value={assignmentForm.subscriberIds}
                  onChange={(event) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      subscriberIds: Array.from(event.target.selectedOptions, (option) => option.value),
                    })
                  }
                >
                  {subscribers.map((subscriber) => (
                    <option key={subscriber.id} value={subscriber.id}>
                      {subscriber.accountNumber} — {subscriber.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Assigning..." : "Create assignments"}
              </button>
            </form>
          ) : null}

          <div className="filter-row">
            <label htmlFor="assignment-filter">
              Collector
              <select
                id="assignment-filter"
                value={assignmentCollectorFilter}
                onChange={(event) => setAssignmentCollectorFilter(event.target.value)}
              >
                <option value="">All collectors</option>
                {collectors.map((collector) => (
                  <option key={collector.id} value={collector.id}>
                    {collector.code} — {collector.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Collector</th>
                  <th>Subscriber</th>
                  <th>Account</th>
                  <th>Area</th>
                  <th>Assigned</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>{assignment.collectorName}</td>
                    <td>{assignment.subscriberName}</td>
                    <td>{assignment.subscriberAccountNumber}</td>
                    <td>{assignment.collectionAreaName || "—"}</td>
                    <td>{formatDate(assignment.assignedAt)}</td>
                    <td>
                      {canManage ? (
                        <button className="text-button" type="button" disabled={busy} onClick={() => void removeAssignment(assignment)}>
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No assignments recorded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "batches" ? (
        <>
          {canManage ? (
            <form className="admin-form" onSubmit={createBatch}>
              <h3>Open a collection batch</h3>
              <label htmlFor="batch-collector">
                Collector
                <select
                  id="batch-collector"
                  value={batchForm.collectorId}
                  onChange={(event) => setBatchForm({ ...batchForm, collectorId: event.target.value })}
                >
                  <option value="">Select a collector</option>
                  {collectors.filter((collector) => collector.isActive).map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.code} — {collector.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="batch-area">
                Collection area (optional)
                <select
                  id="batch-area"
                  value={batchForm.collectionAreaId}
                  onChange={(event) => setBatchForm({ ...batchForm, collectionAreaId: event.target.value })}
                >
                  <option value="">All assigned areas</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.code} — {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="batch-route-date">
                Route date
                <input
                  id="batch-route-date"
                  type="date"
                  required
                  value={batchForm.routeDate}
                  onChange={(event) => setBatchForm({ ...batchForm, routeDate: event.target.value })}
                />
              </label>
              <label htmlFor="batch-notes">
                Notes
                <input
                  id="batch-notes"
                  value={batchForm.notes}
                  onChange={(event) => setBatchForm({ ...batchForm, notes: event.target.value })}
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Opening..." : "Open batch"}
              </button>
            </form>
          ) : null}

          <div className="filter-row">
            <label htmlFor="batch-filter-collector">
              Collector
              <select
                id="batch-filter-collector"
                value={batchCollectorFilter}
                onChange={(event) => setBatchCollectorFilter(event.target.value)}
              >
                <option value="">All collectors</option>
                {collectors.map((collector) => (
                  <option key={collector.id} value={collector.id}>
                    {collector.code} — {collector.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="batch-filter-status">
              Status
              <select
                id="batch-filter-status"
                value={batchStatusFilter}
                onChange={(event) => setBatchStatusFilter(event.target.value as CollectionBatchStatus | "")}
              >
                <option value="">All statuses</option>
                {batchStatuses.map((status) => (
                  <option key={status} value={status}>
                    {toTitleCase(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Collector</th>
                  <th>Route date</th>
                  <th>Status</th>
                  <th>Expected</th>
                  <th>Collected</th>
                  <th>Remitted</th>
                </tr>
              </thead>
              <tbody>
                {batches?.batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className={selectedBatch?.id === batch.id ? "row-selected" : ""}
                    onClick={() => void openBatch(batch.id)}
                  >
                    <td>{batch.batchNumber}</td>
                    <td>{batch.collectorName}</td>
                    <td>{formatDate(batch.routeDate)}</td>
                    <td>{toTitleCase(batch.status)}</td>
                    <td>{formatPeso(batch.expectedCents)}</td>
                    <td>{formatPeso(batch.collectedCents)}</td>
                    <td>{formatPeso(batch.remittedCents ?? 0)}</td>
                  </tr>
                ))}
                {(!batches || batches.batches.length === 0) ? (
                  <tr>
                    <td colSpan={7}>No collection batches recorded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {selectedBatch ? (
            <div className="detail-card">
              <div className="detail-actions">
                <h3>Batch {selectedBatch.batchNumber}</h3>
                <span>{toTitleCase(selectedBatch.status)}</span>
              </div>
              <p>
                {selectedBatch.collectorName} · route {formatDate(selectedBatch.routeDate)}
                {selectedBatch.collectionAreaName ? ` · ${selectedBatch.collectionAreaName}` : ""}
              </p>
              <p>
                {`Expected ${formatPeso(selectedBatch.expectedCents)} · Collected ${formatPeso(selectedBatch.collectedCents)} `}
                {`(cash ${formatPeso(selectedBatch.cashCollectedCents)}) · Remitted ${formatPeso(selectedBatch.remittedCents ?? 0)} · `}
                {`Shortage ${formatPeso(selectedBatch.shortageCents)} · Overage ${formatPeso(selectedBatch.overageCents)}`}
              </p>

              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Subscriber</th>
                      <th>Account</th>
                      <th>Current bill</th>
                      <th>Arrears</th>
                      <th>Expected</th>
                      <th>Collected</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBatch.accounts?.map((account) => (
                      <tr key={account.id}>
                        <td>{account.subscriberName}</td>
                        <td>{account.subscriberAccountNumber}</td>
                        <td>{formatPeso(account.currentBillCents)}</td>
                        <td>{formatPeso(account.arrearsCents)}</td>
                        <td>{formatPeso(account.expectedCents)}</td>
                        <td>{formatPeso(account.collectedCents)}</td>
                        <td>{toTitleCase(account.status)}</td>
                      </tr>
                    ))}
                    {(selectedBatch.accounts?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={7}>No assigned accounts are in this route.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="detail-actions">
                {selectedBatch.status === "OPEN" && canManage ? (
                  <button type="button" disabled={busy} onClick={() => void runLifecycle("start")}>
                    Start route
                  </button>
                ) : null}
                {selectedBatch.status === "IN_PROGRESS" && canManage ? (
                  <button type="button" disabled={busy} onClick={() => void runLifecycle("submit")}>
                    Submit for remittance
                  </button>
                ) : null}
                {selectedBatch.status === "RECONCILED" && canReconcile ? (
                  <button type="button" disabled={busy} onClick={() => void closeBatch()}>
                    Close batch
                  </button>
                ) : null}
                <button className="text-button" type="button" onClick={() => void loadRouteSheet()}>
                  Route sheet
                </button>
              </div>

              {selectedBatch.status === "SUBMITTED" && canReconcile ? (
                <form className="admin-form" onSubmit={remitBatch}>
                  <h4>Record remittance</h4>
                  <label htmlFor="remit-amount">
                    Amount collected (₱)
                    <input
                      id="remit-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={remitForm.amount}
                      onChange={(event) => setRemitForm({ ...remitForm, amount: event.target.value })}
                    />
                  </label>
                  <label htmlFor="remit-reference">
                    Reference number
                    <input
                      id="remit-reference"
                      value={remitForm.referenceNumber}
                      onChange={(event) => setRemitForm({ ...remitForm, referenceNumber: event.target.value })}
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    Record remittance
                  </button>
                </form>
              ) : null}

              {selectedBatch.status === "REMITTED" && canReconcile ? (
                <form className="admin-form" onSubmit={reconcileBatch}>
                  <h4>Reconcile batch</h4>
                  <label htmlFor="reconcile-note">
                    Reconciliation note
                    <input
                      id="reconcile-note"
                      value={reconcileNote}
                      onChange={(event) => setReconcileNote(event.target.value)}
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    Mark reconciled
                  </button>
                </form>
              ) : null}

              {routeSheet ? (
                <div>
                  <h4>Route sheet</h4>
                  <ul>
                    {routeSheet.accounts.map((account) => (
                      <li key={account.id}>
                        {account.subscriberAccountNumber} · {account.subscriberName} · expected{" "}
                        {formatPeso(account.expectedCents)} · collected {formatPeso(account.collectedCents)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
