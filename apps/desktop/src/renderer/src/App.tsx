import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  AuthUser,





  DesktopApiHealth,
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

  // Phase 3 state


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
            {apiHealth?.status === "online" ? "Central API connected" : "Central API unavailable"}
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
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {visibleNavigation.map((item) => (
            <button
              className={`nav-item${item.label === page ? " selected" : ""}`}
              key={item.label}
              type="button"
              aria-current={item.label === page ? "page" : undefined}
              onClick={() => {
                setPage(item.label === "Administration" ? "Administration" : "Dashboard");
                setMessage("");
              }}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`status-dot ${apiHealth?.status === "online" ? "online" : ""}`} />
          <div>
            <strong>{apiHealth?.status === "online" ? "API connected" : "API unavailable"}</strong>
            <span>Central server</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">OVERVIEW</span>
            <h1>{page}</h1>
          </div>
          <div className="user-chip">
            <div className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.roles.join(", ") || "Staff"}</span>
            </div>
            <button className="text-button" type="button" onClick={signOut} disabled={busy}>
              Lock / sign out
            </button>
          </div>
        </header>

        {message && (
          <div className={message === "User created successfully." ? "success-alert" : "connection-alert"} role="status">
            {message}
          </div>
        )}
        {apiHealth?.status === "offline" && (
          <div className="connection-alert" role="status">
            <strong>Server connection unavailable</strong>
            <span>{apiHealth.message} Start the API and check the configured server address.</span>
          </div>
        )}

        {page === "Administration" ? (
          <section className="admin-layout">
            <div className="welcome-row">
              <div>
                <h2>User administration</h2>
                <p>Create staff accounts with the least-privilege role they need.</p>
              </div>
              <span className="environment-tag">USER MANAGEMENT</span>
            </div>
            <form className="admin-form" onSubmit={createUser}>
              <label htmlFor="new-display-name">Display name</label>
              <input id="new-display-name" required maxLength={120} value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.target.value)} />
              <label htmlFor="new-username">Username</label>
              <input id="new-username" required minLength={3} maxLength={64} autoComplete="off"
                value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
              <label htmlFor="new-user-password">Temporary password</label>
              <input id="new-user-password" type="password" required minLength={12} maxLength={128}
                autoComplete="new-password" value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)} />
              <label htmlFor="new-user-role">Role</label>
              <select id="new-user-role" required value={newRole}
                onChange={(event) => setNewRole(event.target.value)}>
                {assignableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <button className="primary-button" type="submit" disabled={busy || !assignableRoles.length}>
                {busy ? "Creating..." : "Create staff account"}
              </button>
              <p className="form-note">The owner role is reserved for initial system bootstrap.</p>
            </form>
            <div className="user-table-wrap">
              <table className="user-table">
                <thead>
                  <tr><th>Username</th><th>Display name</th><th>Role</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {adminLoading && <tr><td colSpan={4}>Loading users...</td></tr>}
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
          <>
            <section className="welcome-row">
              <div>
                <h2>Subscription operations</h2>
                <p>Your billing and collection workspace is ready to be configured.</p>
              </div>
              <span className="environment-tag">AUTHENTICATED</span>
            </section>

            <section className="setup-card" aria-labelledby="setup-title">
              <div className="setup-icon" aria-hidden="true">âœ“</div>
              <div>
                <span className="eyebrow">PROJECT FOUNDATION</span>
                <h2 id="setup-title">Your secure staff session is active</h2>
                <p>
                  Sign-in, role-based permissions and server-side session validation are enabled.
                  Billing and subscriber workflows are the next implementation phases.
                </p>
              </div>
            </section>

            <section className="foundation-grid" aria-label="Foundation services">
          <article className="service-card">
            <span className="service-label">SIGNED-IN USER</span>
            <strong>{user.displayName}</strong>
            <p>{user.username} Â· {user.roles.join(", ") || "No role assigned"}</p>
            <span className="service-state state-good">{user.permissions.length} PERMISSIONS GRANTED</span>
          </article>
          <article className="service-card">
            <span className="service-label">APPLICATION API</span>
            <strong>Fastify + TypeScript</strong>
            <p>Authenticated requests are validated by the central API.</p>
            <span className={`service-state ${apiHealth?.status === "online" ? "state-good" : ""}`}>
              {apiHealth?.status === "online" ? "CONNECTED" : "WAITING FOR API"}
            </span>
          </article>
          <article className="service-card">
            <span className="service-label">SYSTEM OF RECORD</span>
            <strong>PostgreSQL</strong>
            <p>Passwords are hashed; session tokens are stored as hashes.</p>
            <span className="service-state">SERVER-SIDE ACCESS ONLY</span>
          </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
