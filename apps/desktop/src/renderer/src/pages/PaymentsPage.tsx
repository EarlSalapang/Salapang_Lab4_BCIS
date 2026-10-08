import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  AllocationPreview,
  Payment,
  PaymentListResponse,
  PaymentMethod,
  PaymentStatus,
  SubscriberSummary,
} from "@bcis/shared";
import { formatDate, formatPeso, toTitleCase } from "../lib/format";

const paymentMethods: PaymentMethod[] = ["cash", "gcash", "bank_transfer", "cheque", "other"];
const paymentStatuses: PaymentStatus[] = ["pending", "posted", "reversed", "rejected"];
const referenceMethods: PaymentMethod[] = ["gcash", "bank_transfer", "cheque"];

const proofContentTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

interface PaymentsPageProps {
  permissions: string[];
  onMessage: (message: string) => void;
}

interface PaymentFormState {
  subscriberId: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber: string;
  notes: string;
  paymentDate: string;
}

function emptyForm(): PaymentFormState {
  return {
    subscriberId: "",
    amount: "",
    method: "cash",
    referenceNumber: "",
    notes: "",
    paymentDate: new Date().toISOString().slice(0, 10),
  };
}

function toCents(amount: string): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function PaymentsPage({ permissions, onMessage }: PaymentsPageProps) {
  const canCreate = permissions.includes("payment.create");
  const canVerify = permissions.includes("payment.verify_gcash");
  const canReverse = permissions.includes("payment.reverse");

  const [subscribers, setSubscribers] = useState<SubscriberSummary[]>([]);
  const [payments, setPayments] = useState<PaymentListResponse | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "">("");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "">("");
  const [selected, setSelected] = useState<Payment | null>(null);
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyNote, setVerifyNote] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [form, setForm] = useState<PaymentFormState>(emptyForm);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!canCreate && !permissions.includes("subscriber.view")) return;
    let active = true;
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
  }, [canCreate, permissions, onMessage]);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      void window.bcis
        .listPayments({
          query: query || undefined,
          status: statusFilter || undefined,
          method: methodFilter || undefined,
          page: 1,
          pageSize: 50,
        })
        .then((result) => {
          if (!active) return;
          if (!result.ok) onMessage(result.message);
          else setPayments(result.data);
        })
        .catch(() => {
          if (active) onMessage("Unable to load payments.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, statusFilter, methodFilter, version, onMessage]);

  useEffect(() => {
    const amountCents = toCents(form.amount);
    if (!form.subscriberId || amountCents <= 0) {
      setPreview(null);
      return;
    }
    let active = true;
    void window.bcis
      .previewAllocation({ subscriberId: form.subscriberId, amountCents })
      .then((result) => {
        if (!active) return;
        if (result.ok) setPreview(result.data);
        else setPreview(null);
      })
      .catch(() => {
        if (active) setPreview(null);
      });
    return () => {
      active = false;
    };
  }, [form.subscriberId, form.amount]);

  async function openPayment(id: string) {
    try {
      const result = await window.bcis.getPayment(id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.payment);
      setVerifyNote("");
      setReversalReason("");
    } catch {
      onMessage("Unable to load the payment.");
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = toCents(form.amount);
    if (!form.subscriberId || amountCents <= 0) {
      onMessage("Select a subscriber and enter a positive payment amount.");
      return;
    }
    if (referenceMethods.includes(form.method) && !form.referenceNumber.trim()) {
      onMessage("Enter the reference number for this payment method.");
      return;
    }
    setBusy(true);
    try {
      const proofs = [];
      if (proofFile) {
        if (!proofContentTypes.includes(proofFile.type)) {
          onMessage("Proof must be a PNG, JPEG, WEBP, or PDF file.");
          return;
        }
        proofs.push({
          fileName: proofFile.name,
          contentType: proofFile.type,
          sizeBytes: proofFile.size,
          contentBase64: await fileToBase64(proofFile),
        });
      }
      const result = await window.bcis.createPayment({
        subscriberId: form.subscriberId,
        amountCents,
        method: form.method,
        referenceNumber: form.referenceNumber.trim() || undefined,
        notes: form.notes.trim() || undefined,
        paymentDate: `${form.paymentDate}T00:00:00.000Z`,
        proofs: proofs.length ? proofs : undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.payment);
      setForm(emptyForm());
      setProofFile(null);
      setPreview(null);
      setVersion((current) => current + 1);
      onMessage(`Payment ${result.data.payment.receiptNumber} recorded (${result.data.payment.status}).`);
    } catch {
      onMessage("Unable to record the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "verify" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await window.bcis.verifyPayment(selected.id, {
        decision,
        note: verifyNote.trim() || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.payment);
      setVerifyNote("");
      setVersion((current) => current + 1);
      onMessage(`Payment ${result.data.payment.receiptNumber} ${decision === "verify" ? "verified" : "rejected"}.`);
    } catch {
      onMessage("Unable to update the payment verification.");
    } finally {
      setBusy(false);
    }
  }

  async function reversePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (reversalReason.trim().length < 5) {
      onMessage("Enter a reversal reason of at least 5 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.bcis.reversePayment(selected.id, { reason: reversalReason.trim() });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setSelected(result.data.payment);
      setReversalReason("");
      setVersion((current) => current + 1);
      onMessage(`Payment ${result.data.payment.receiptNumber} reversed.`);
    } catch {
      onMessage("Unable to reverse the payment.");
    } finally {
      setBusy(false);
    }
  }

  const amountCents = toCents(form.amount);

  return (
    <section className="admin-layout" aria-labelledby="payments-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Collections</span>
          <h2 id="payments-title">Payments &amp; Receipts</h2>
        </div>
      </div>

      {canCreate ? (
        <form className="admin-form" onSubmit={submitPayment}>
          <h3>Record a payment</h3>
          <label htmlFor="payment-subscriber">
            Subscriber
            <select
              id="payment-subscriber"
              value={form.subscriberId}
              onChange={(event) => setForm({ ...form, subscriberId: event.target.value })}
            >
              <option value="">Select a subscriber</option>
              {subscribers.map((subscriber) => (
                <option key={subscriber.id} value={subscriber.id}>
                  {subscriber.accountNumber} — {subscriber.displayName}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="payment-amount">
            Amount (₱)
            <input
              id="payment-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </label>
          <label htmlFor="payment-method">
            Method
            <select
              id="payment-method"
              value={form.method}
              onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}
            >
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {toTitleCase(method)}
                </option>
              ))}
            </select>
          </label>
          {referenceMethods.includes(form.method) ? (
            <label htmlFor="payment-reference">
              Reference number
              <input
                id="payment-reference"
                value={form.referenceNumber}
                onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })}
              />
            </label>
          ) : null}
          <label htmlFor="payment-date">
            Payment date
            <input
              id="payment-date"
              type="date"
              value={form.paymentDate}
              onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
            />
          </label>
          <label htmlFor="payment-notes">
            Notes
            <input
              id="payment-notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          {referenceMethods.includes(form.method) ? (
            <label htmlFor="payment-proof">
              Proof attachment
              <input
                id="payment-proof"
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}

          {preview && preview.allocations.length > 0 ? (
            <div className="detail-card">
              <h4>Allocation preview (oldest first)</h4>
              <ul>
                {preview.allocations.map((allocation) => (
                  <li key={allocation.invoiceId}>
                    {allocation.invoiceNumber} · due {formatDate(allocation.dueDate)} · {formatPeso(allocation.amountCents)} of{" "}
                    {formatPeso(allocation.balanceCents)}
                  </li>
                ))}
              </ul>
              <p>
                Allocated {formatPeso(preview.allocatedCents)}
                {preview.unallocatedCents > 0 ? ` · advance ${formatPeso(preview.unallocatedCents)}` : ""}
              </p>
            </div>
          ) : null}
          {preview && amountCents > 0 && preview.allocations.length === 0 ? (
            <p className="detail-actions">No posted invoices with an outstanding balance — the full amount will be kept as an advance.</p>
          ) : null}

          <button type="submit" disabled={busy}>
            {busy ? "Recording..." : form.method === "gcash" ? "Record GCash payment (pending)" : "Post payment"}
          </button>
        </form>
      ) : null}

      <div className="section-heading">
        <div>
          <span className="eyebrow">Register</span>
          <h3>Payment history</h3>
        </div>
      </div>

      <div className="filter-row">
        <label htmlFor="payment-search">
          Search
          <input
            id="payment-search"
            value={query}
            placeholder="Receipt, reference, subscriber"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label htmlFor="payment-status-filter">
          Status
          <select
            id="payment-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as PaymentStatus | "")}
          >
            <option value="">All statuses</option>
            {paymentStatuses.map((status) => (
              <option key={status} value={status}>
                {toTitleCase(status)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="payment-method-filter">
          Method
          <select
            id="payment-method-filter"
            value={methodFilter}
            onChange={(event) => setMethodFilter(event.target.value as PaymentMethod | "")}
          >
            <option value="">All methods</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {toTitleCase(method)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Subscriber</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Allocated</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {payments?.payments.map((payment) => (
              <tr
                key={payment.id}
                className={selected?.id === payment.id ? "row-selected" : ""}
                onClick={() => void openPayment(payment.id)}
              >
                <td>{payment.receiptNumber}</td>
                <td>{payment.subscriberName}</td>
                <td>{toTitleCase(payment.method)}</td>
                <td>{formatPeso(payment.amountCents)}</td>
                <td>{formatPeso(payment.allocatedCents)}</td>
                <td>{toTitleCase(payment.status)}</td>
                <td>{formatDate(payment.paymentDate)}</td>
              </tr>
            ))}
            {!loading && (payments?.payments.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7}>No payments recorded yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="detail-card">
          <div className="detail-actions">
            <h3>Receipt {selected.receiptNumber}</h3>
            <span>{toTitleCase(selected.status)}</span>
          </div>
          <p>
            {selected.subscriberName} ({selected.subscriberAccountNumber}) · {toTitleCase(selected.method)} ·{" "}
            {formatPeso(selected.amountCents)} on {formatDate(selected.paymentDate)}
          </p>
          {selected.referenceNumber ? <p>Reference: {selected.referenceNumber}</p> : null}
          {selected.notes ? <p>Notes: {selected.notes}</p> : null}
          <p>
            Allocated {formatPeso(selected.allocatedCents)}
            {selected.unallocatedCents > 0 ? ` · advance ${formatPeso(selected.unallocatedCents)}` : ""}
          </p>

          {selected.allocations && selected.allocations.length > 0 ? (
            <>
              <h4>Applied to invoices</h4>
              <ul>
                {selected.allocations.map((allocation) => (
                  <li key={allocation.id}>
                    {allocation.invoiceNumber} · {formatPeso(allocation.amountCents)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {selected.proofs && selected.proofs.length > 0 ? (
            <>
              <h4>Proofs</h4>
              <ul>
                {selected.proofs.map((proof) => (
                  <li key={proof.id}>
                    {proof.fileName} · {proof.contentType} · {proof.sizeBytes} bytes
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {selected.reversal ? (
            <p>
              Reversed {formatDate(selected.reversal.createdAt)}: {selected.reversal.reason}
            </p>
          ) : null}

          {selected.status === "pending" && canVerify ? (
            <form className="admin-form" onSubmit={(event) => {
              event.preventDefault();
              void decide("verify");
            }}>
              <h4>GCash verification</h4>
              <label htmlFor="verification-note">
                Verification note
                <input
                  id="verification-note"
                  value={verifyNote}
                  onChange={(event) => setVerifyNote(event.target.value)}
                />
              </label>
              <div className="detail-actions">
                <button type="submit" disabled={busy}>
                  Verify &amp; post
                </button>
                <button type="button" disabled={busy} onClick={() => void decide("reject")}>
                  Reject
                </button>
              </div>
            </form>
          ) : null}

          {selected.status === "posted" && canReverse ? (
            <form className="admin-form" onSubmit={reversePayment}>
              <h4>Reverse payment</h4>
              <label htmlFor="reversal-reason">
                Reason (kept for audit)
                <input
                  id="reversal-reason"
                  value={reversalReason}
                  onChange={(event) => setReversalReason(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                Reverse payment
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}