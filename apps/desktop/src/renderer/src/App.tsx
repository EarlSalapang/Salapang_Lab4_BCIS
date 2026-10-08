import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  AuthUser,
  DesktopApiHealth,
  Invoice,
  InvoiceListResponse,
  InvoiceStatus,
  LedgerEntryListResponse,
  ManagedUser,
} from "@bcis/shared";

const navigation = [
  { label: "Dashboard", icon: "◫" },
  { label: "Subscribers", icon: "⌂" },
  { label: "Service Accounts", icon: "⌁" },
  { label: "Billing", icon: "▤" },
  { label: "Payments", icon: "₱" },
  { label: "Collections", icon: "⇄" },
  { label: "Receivables", icon: "◷" },
  { label: "Reports", icon: "▥", permission: "report.view" },
  { label: "Administration", icon: "⚙", permission: "user.manage" },
];

const implementedPages = new Set(["Dashboard", "Administration", "Billing"]);
const invoiceStatuses: InvoiceStatus[] = ["draft", "posted", "partially_paid", "paid", "overdue", "void"];

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : "—";
}

function toTitleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function monthStart(): string {
  return `${new Date().toISOString().slice(0, 8)}01`;
}

function monthEnd(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export default function App() {
  const [apiHealth, setApiHealth] = useState<DesktopApiHealth | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("Dashboard");
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("");

  // Phase 4 billing state
  const [invoices, setInvoices] = useState<InvoiceListResponse | null>(null);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<InvoiceStatus | "">("");
  const [invoiceSubscriberFilter, setInvoiceSubscriberFilter] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
const [ledger, setLedger] = useState<LedgerEntryListResponse | null>(null);
  const [ledgerSubscriberFilter, setLedgerSubscriberFilter] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);
  const [billingVersion, setBillingVersion] = useState(0);
  const [billingForm, setBillingForm] = useState({
    billingPeriodStart: monthStart(),
    billingPeriodEnd: monthEnd(),
    issueDate: isoDate(0),
    dueDate: isoDate(15),
  });

  useEffect(() => {
    let active = true;
    void Promise.all([window.bcis.getApiHealth(), window.bcis.getSession()]).then(
      ([health, session]) => {
        if (!active) return;
        setApiHealth(health);
        if (session?.ok) setUser(session.user);
        else if (session) setMessage(session.message);
        setCheckingSession(false);
      },
    ).catch(() => {
      if (active) {
        setMessage("Unable to connect to the central server.");
        setCheckingSession(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (page !== "Administration") return;
    let active = true;
    setAdminLoading(true);
    void Promise.all([window.bcis.listAdminUsers(), window.bcis.listAdminRoles()])
      .then(([usersResult, rolesResult]) => {
        if (!active) return;
        if (!usersResult.ok) {
          setMessage(usersResult.message);
        } else {
          setAdminUsers(usersResult.data);
        }
        if (!rolesResult.ok) {
          setMessage(rolesResult.message);
        } else {
          setAssignableRoles(rolesResult.data);
          setNewRole((current) => current || rolesResult.data[0] || "");
        }
      })
      .catch(() => {
        if (active) setMessage("Unable to load user administration.");
      })
      .finally(() => {
        if (active) setAdminLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  useEffect(() => {
    if (page !== "Billing") return;
    let active = true;
    setBillingLoading(true);
    void window.bcis
      .listInvoices({
        status: invoiceStatusFilter || undefined,
        subscriberId: invoiceSubscriberFilter || undefined,
        page: 1,
        pageSize: 25,
      })
      .then((result) => {
        if (!active) return;
        if (!result.ok) setMessage(result.message);
        else setInvoices(result.data);
      })
      .catch(() => {
        if (active) setMessage("Unable to load invoices.");
      })
      .finally(() => {
        if (active) setBillingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, invoiceStatusFilter, invoiceSubscriberFilter, billingVersion]);

useEffect(() => {
    if (page !== "Billing") return;
    let active = true;
    setLedgerLoading(true);
    void window.bcis
      .listLedgerEntries({ subscriberId: ledgerSubscriberFilter || undefined, page: 1, pageSize: 50 })
      .then((result) => {
        if (!active) return;
        if (!result.ok) setMessage(result.message);
        else setLedger(result.data);
      })
      .catch(() => {
        if (active) setMessage("Unable to load ledger entries.");
      })
      .finally(() => {
        if (active) setLedgerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, ledgerSubscriberFilter, billingVersion]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await window.bcis.login(username, password);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setUser(result.user);
      setPassword("");
    } catch {
      setMessage("Unable to sign in because the desktop client could not reach the API.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      const result = await window.bcis.logout();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setUser(null);
    } catch {
      setMessage("Unable to sign out because the desktop client could not reach the API.");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await window.bcis.createAdminUser({
        username: newUsername,
        displayName: newDisplayName,
        password: newPassword,
        role: newRole,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setAdminUsers((users) => [...users, result.data].sort((left, right) =>
        left.username.localeCompare(right.username),
      ));
      setNewUsername("");
      setNewDisplayName("");
      setNewPassword("");
      setMessage("User created successfully.");
    } catch {
      setMessage("Unable to create the user because the desktop client could not reach the API.");
    } finally {
      setBusy(false);
    }
  }

  async function generateBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await window.bcis.generateBilling(billingForm);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      const { created, skipped } = result.data;
      setMessage(
        created.length > 0
          ? `Generated ${created.length} invoice(s); ${skipped} account(s) already billed.`
          : `No new invoices generated; ${skipped} account(s) were already billed for this period.`,
);
      setInvoices((current) =>
        current
          ? { ...current, invoices: [...created, ...current.invoices], total: current.total + created.length }
          : current,
      );
      setBillingVersion((value) => value + 1);
    } catch {
      setMessage("Unable to generate billing because the desktop client could not reach the API.");
    } finally {
      setBusy(false);
    }
  }

  async function openInvoice(id: string) {
    setInvoiceDetailLoading(true);
    setMessage("");
    try {
      const result = await window.bcis.getInvoice(id);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setSelectedInvoice(result.data.invoice);
    } catch {
      setMessage("Unable to load the invoice because the desktop client could not reach the API.");
    } finally {
      setInvoiceDetailLoading(false);
    }
  }

  async function changeInvoiceStatus(status: InvoiceStatus) {
    if (!selectedInvoice) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await window.bcis.updateInvoice(selectedInvoice.id, { status });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      const updated = result.data.invoice;
      setSelectedInvoice(updated);
setInvoices((current) =>
        current
          ? { ...current, invoices: current.invoices.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
      setBillingVersion((value) => value + 1);
      setMessage(`Invoice ${updated.invoiceNumber} is now ${toTitleCase(updated.status)}.`);
    } catch {
      setMessage("Unable to update the invoice because the desktop client could not reach the API.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return <main className="auth-shell"><p className="loading-text">Connecting to BCIS...</p></main>;
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="login-card" aria-labelledby="login-title">
          <div className="brand login-brand">
            <div className="brand-mark">B</div>
            <div>
              <strong>BCIS</strong>
              <span>Billing &amp; Collections</span>
            </div>
          </div>
          <span className="eyebrow">SECURE STAFF ACCESS</span>
          <h1 id="login-title">Sign in to your workspace</h1>
          <p className="login-description">Use your assigned BCIS staff account to continue.</p>
          <form className="login-form" onSubmit={signIn}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={64}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {message && <p className="form-error" role="alert">{message}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
<div className={`login-server ${apiHealth?.status === "online" ? "server-online" : ""}`}>
            <span className={`status-dot ${apiHealth?.status === "online" ? "online" : ""}`} />
            {apiHealth?.status === "online" ? "Central server reachable" : "Central server offline"}
          </div>
        </section>
      </main>
    );
  }

  const visibleNavigation = navigation.filter(
    (item) => !item.permission || user.permissions.includes(item.permission),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <strong>BCIS</strong>
            <span>Billing &amp; Collections</span>
          </div>
        </div>
        <nav className="nav-list">
          <span className="nav-caption">Workspace</span>
          {visibleNavigation.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-item ${page === item.label ? "selected" : ""}`}
              onClick={() => {
                setMessage("");
                setPage(implementedPages.has(item.label) ? item.label : "Dashboard");
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
<div className="sidebar-footer">
          <span className={`status-dot ${apiHealth?.status === "online" ? "online" : ""}`} />
          <div>
            <strong>{apiHealth?.status === "online" ? "Central server online" : "Central server offline"}</strong>
            <span>Server-side data only</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">Workspace</span>
            <h1>{page}</h1>
          </div>
<div className="user-chip">
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.roles.join(", ") || "No role assigned"}</span>
            </div>
            <div className="avatar">{user.displayName.charAt(0).toUpperCase()}</div>
            <button className="text-button" type="button" onClick={signOut} disabled={busy}>
              Sign out
            </button>
          </div>
        </header>

        {message && <p className="success-alert" role="status">{message}</p>}

        {page === "Billing" ? (
          <section className="content-section" aria-labelledby="billing-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Billing &amp; Ledger Engine</span>
                <h2 id="billing-title">Generate invoices and review the ledger</h2>
              </div>
            </div>

            <form className="admin-form" onSubmit={generateBilling}>
              <p className="form-note">
                Billing generation creates one posted invoice per active service account for the selected period and
                records a ledger debit. Accounts already billed for the period are skipped.
              </p>
              <label htmlFor="period-start">Billing period start</label>
              <input
                id="period-start"
                type="date"
                required
                value={billingForm.billingPeriodStart}
                onChange={(event) => setBillingForm({ ...billingForm, billingPeriodStart: event.target.value })}
              />
              <label htmlFor="period-end">Billing period end</label>
              <input
                id="period-end"
                type="date"
                required
                value={billingForm.billingPeriodEnd}
                onChange={(event) => setBillingForm({ ...billingForm, billingPeriodEnd: event.target.value })}
              />
              <label htmlFor="issue-date">Issue date</label>
              <input
                id="issue-date"
                type="date"
                required
                value={billingForm.issueDate}
                onChange={(event) => setBillingForm({ ...billingForm, issueDate: event.target.value })}
              />
              <label htmlFor="due-date">Due date</label>
              <input
                id="due-date"
                type="date"
                required
                value={billingForm.dueDate}
                onChange={(event) => setBillingForm({ ...billingForm, dueDate: event.target.value })}
              />
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Generating..." : "Generate billing"}
              </button>
            </form>

            <div className="section-heading">
              <div>
                <span className="eyebrow">Invoices</span>
                <h2>Invoice register</h2>
              </div>
            </div>
            <div className="filter-row">
              <label htmlFor="invoice-status">
                Status
                <select
                  id="invoice-status"
                  value={invoiceStatusFilter}
                  onChange={(event) => setInvoiceStatusFilter(event.target.value as InvoiceStatus | "")}
                >
                  <option value="">All statuses</option>
                  {invoiceStatuses.map((status) => (
                    <option key={status} value={status}>{toTitleCase(status)}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="invoice-subscriber">
                Subscriber ID
                <input
                  id="invoice-subscriber"
                  value={invoiceSubscriberFilter}
                  placeholder="Filter by subscriber ID"
                  onChange={(event) => setInvoiceSubscriberFilter(event.target.value)}
                />
              </label>
            </div>

            <div className="user-table-wrap">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Status</th>
                    <th>Period</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Total</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {billingLoading && <tr><td colSpan={7}>Loading invoices...</td></tr>}
                  {!billingLoading && (!invoices || invoices.invoices.length === 0) && (
                    <tr><td colSpan={7}>No invoices have been generated yet.</td></tr>
                  )}
                  {invoices?.invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className={selectedInvoice?.id === invoice.id ? "row-selected" : undefined}
                      onClick={() => void openInvoice(invoice.id)}
                    >
                      <td>{invoice.invoiceNumber}</td>
                      <td>{toTitleCase(invoice.status)}</td>
                      <td>{`${formatDate(invoice.billingPeriodStart)} – ${formatDate(invoice.billingPeriodEnd)}`}</td>
                      <td>{formatDate(invoice.issueDate)}</td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td>{formatPeso(invoice.totalCents)}</td>
                      <td>{formatPeso(invoice.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

{selectedInvoice && (
              <div className="detail-card" aria-labelledby="invoice-detail-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Invoice detail</span>
                    <h2 id="invoice-detail-title">{selectedInvoice.invoiceNumber}</h2>
                  </div>
                  <div className="detail-actions">
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy || invoiceDetailLoading || selectedInvoice.status !== "draft"}
                      onClick={() => void changeInvoiceStatus("posted")}
                    >
                      Post invoice
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy || invoiceDetailLoading || !["draft", "posted"].includes(selectedInvoice.status)}
                      onClick={() => void changeInvoiceStatus("void")}
                    >
                      Void invoice
                    </button>
                  </div>
                </div>
                <p>
                  {`Status: ${toTitleCase(selectedInvoice.status)} · Issued ${formatDate(selectedInvoice.issueDate)} · `}
                  {`Due ${formatDate(selectedInvoice.dueDate)} · Posted ${formatDate(selectedInvoice.postedAt)}`}
                </p>
                <div className="user-table-wrap">
                  <table className="user-table">
                    <thead>
                      <tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {invoiceDetailLoading && <tr><td colSpan={4}>Loading line items...</td></tr>}
                      {!invoiceDetailLoading && (!selectedInvoice.lineItems || selectedInvoice.lineItems.length === 0) && (
                        <tr><td colSpan={4}>No line items are recorded for this invoice.</td></tr>
                      )}
                      {selectedInvoice.lineItems?.map((line, index) => (
                        <tr key={`${line.description}-${index}`}>
                          <td>{line.description}</td>
                          <td>{line.quantity}</td>
                          <td>{formatPeso(line.unitPriceCents)}</td>
                          <td>{formatPeso(line.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="form-note">
                  {`Subtotal ${formatPeso(selectedInvoice.subtotalCents)} · Tax ${formatPeso(selectedInvoice.taxCents)} · `}
                  {`Total ${formatPeso(selectedInvoice.totalCents)} · Paid ${formatPeso(selectedInvoice.amountPaidCents)} · `}
                  {`Balance ${formatPeso(selectedInvoice.balanceCents)}`}
                </p>
              </div>
            )}

            <div className="section-heading">
              <div>
                <span className="eyebrow">Ledger</span>
                <h2>Subscriber ledger entries</h2>
              </div>
            </div>
            <div className="filter-row">
              <label htmlFor="ledger-subscriber">
                Subscriber ID
                <input
                  id="ledger-subscriber"
                  value={ledgerSubscriberFilter}
                  placeholder="Filter by subscriber ID"
                  onChange={(event) => setLedgerSubscriberFilter(event.target.value)}
                />
              </label>
            </div>
            <div className="user-table-wrap">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
{ledgerLoading && <tr><td colSpan={6}>Loading ledger entries...</td></tr>}
                  {!ledgerLoading && ledger && ledger.entries.length === 0 && (
                    <tr><td colSpan={6}>No ledger entries have been posted yet.</td></tr>
                  )}
                  {ledger?.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.entryDate)}</td>
                      <td>{toTitleCase(entry.entryType)}</td>
                      <td>{toTitleCase(entry.sourceType)}</td>
                      <td>{entry.description}</td>
                      <td>{formatPeso(entry.amountCents)}</td>
                      <td>{formatPeso(entry.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : page === "Administration" ? (
          <section className="admin-layout" aria-labelledby="admin-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Administration</span>
                <h2 id="admin-title">Staff accounts and roles</h2>
              </div>
            </div>
            <form className="admin-form" onSubmit={createUser}>
              <p className="form-note">Create staff accounts with the least privilege required for their duties.</p>
              <label htmlFor="new-display-name">Display name</label>
              <input
                id="new-display-name"
                required
                maxLength={120}
                value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.target.value)}
              />
              <label htmlFor="new-username">Username</label>
              <input
                id="new-username"
                autoComplete="off"
                required
                minLength={3}
                maxLength={64}
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
              />
              <label htmlFor="new-password">Temporary password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <label htmlFor="new-role">Role</label>
              <select id="new-role" required value={newRole} onChange={(event) => setNewRole(event.target.value)}>
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <button className="primary-button" type="submit" disabled={busy || assignableRoles.length === 0}>
                {busy ? "Creating..." : "Create staff account"}
              </button>
            </form>
            <div className="user-table-wrap">
              <table className="user-table">
                <thead>
                  <tr><th>Username</th><th>Display name</th><th>Roles</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {adminLoading && <tr><td colSpan={4}>Loading staff accounts...</td></tr>}
                  {!adminLoading && adminUsers.length === 0 && (
                    <tr><td colSpan={4}>No staff accounts are available.</td></tr>
                  )}
                  {adminUsers.map((managedUser) => (
                    <tr key={managedUser.id}>
                      <td>{managedUser.username}</td>
                      <td>{managedUser.displayName}</td>
                      <td>{managedUser.roles.join(", ") || "No role"}</td>
                      <td>{managedUser.isActive ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="content-section" aria-labelledby="dashboard-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Dashboard</span>
                <h2 id="dashboard-title">Welcome back, {user.displayName}</h2>
              </div>
            </div>
            <div className="foundation-grid">
              <article className="service-card">
                <span className="service-label">Signed in as</span>
                <strong>{user.username}</strong>
                <p>{user.roles.join(", ") || "No role assigned"}</p>
                <span className="service-state">{`${user.permissions.length} permission(s)`}</span>
              </article>
              <article className="service-card">
                <span className="service-label">API health</span>
                <strong>{apiHealth?.status === "online" ? "Online" : "Offline"}</strong>
                <p>Central Fastify API server.</p>
                <span className="service-state">{apiHealth?.status === "online" ? "Connected" : "Unreachable"}</span>
              </article>
              <article className="service-card">
                <span className="service-label">Billing</span>
                <strong>Invoice &amp; ledger engine</strong>
                <p>Generate monthly invoices and review ledger entries.</p>
                <button className="text-button" type="button" onClick={() => setPage("Billing")}>
                  Open billing
                </button>
              </article>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
