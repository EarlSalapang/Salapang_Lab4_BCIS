import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { CollectionArea, ServicePlan, ServiceType } from "@bcis/shared";
import { formatPeso } from "../lib/format";

const serviceTypes: ServiceType[] = ["INTERNET", "CABLE", "COMBO"];

interface PlansPageProps {
  onMessage: (message: string) => void;
}

function pesosToCents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export default function PlansPage({ onMessage }: PlansPageProps) {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [areas, setAreas] = useState<CollectionArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planForm, setPlanForm] = useState({
    code: "",
    name: "",
    serviceType: "INTERNET" as ServiceType,
    monthlyPrice: "",
    installationFee: "",
    reconnectionFee: "",
  });
  const [areaForm, setAreaForm] = useState({ code: "", name: "", description: "" });

  useEffect(() => {
    let active = true;
    setLoading(true);
    void window.bcis
      .listPlans(includeInactive)
      .then((result) => {
        if (!active) return;
        if (!result.ok) onMessage(result.message);
        else setPlans(result.data.plans);
      })
      .catch(() => {
        if (active) onMessage("Unable to load service plans.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [includeInactive, onMessage]);

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
    return () => {
      active = false;
    };
  }, [onMessage]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const monthlyPriceCents = pesosToCents(planForm.monthlyPrice);
    const installationFeeCents = pesosToCents(planForm.installationFee || "0");
    const reconnectionFeeCents = pesosToCents(planForm.reconnectionFee || "0");
    if (monthlyPriceCents === null || installationFeeCents === null || reconnectionFeeCents === null) {
      onMessage("Enter valid amounts for the plan fees.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.bcis.createPlan({
        code: planForm.code,
        name: planForm.name,
        serviceType: planForm.serviceType,
        monthlyPriceCents,
        installationFeeCents,
        reconnectionFeeCents,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setPlans((current) => [...current, result.data.plan]);
      setPlanForm({ code: "", name: "", serviceType: "INTERNET", monthlyPrice: "", installationFee: "", reconnectionFee: "" });
      onMessage(`Plan ${result.data.plan.code} created.`);
    } catch {
      onMessage("Unable to create the plan.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePlan(plan: ServicePlan) {
    setBusy(true);
    try {
      const result = await window.bcis.updatePlan(plan.id, { isActive: !plan.isActive });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setPlans((current) => current.map((item) => (item.id === plan.id ? result.data.plan : item)));
    } catch {
      onMessage("Unable to update the plan.");
    } finally {
      setBusy(false);
    }
  }

  async function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await window.bcis.createCollectionArea({
        code: areaForm.code,
        name: areaForm.name,
        description: areaForm.description || undefined,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setAreas((current) => [...current, result.data.area]);
      setAreaForm({ code: "", name: "", description: "" });
      onMessage(`Collection area ${result.data.area.code} created.`);
    } catch {
      onMessage("Unable to create the collection area.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-layout" aria-labelledby="plans-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Catalog</span>
          <h2 id="plans-title">Service plans and collection areas</h2>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Show inactive plans
        </label>
      </div>

      <form className="admin-form" onSubmit={createPlan}>
        <p className="form-note">Define the products subscribers can be enrolled into.</p>
        <label htmlFor="plan-code">Code</label>
        <input id="plan-code" required value={planForm.code}
          onChange={(event) => setPlanForm({ ...planForm, code: event.target.value })} />
        <label htmlFor="plan-name">Name</label>
        <input id="plan-name" required value={planForm.name}
          onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} />
        <label htmlFor="plan-type">Service type</label>
        <select id="plan-type" value={planForm.serviceType}
          onChange={(event) => setPlanForm({ ...planForm, serviceType: event.target.value as ServiceType })}>
          {serviceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <label htmlFor="plan-monthly">Monthly price (PHP)</label>
        <input id="plan-monthly" required inputMode="decimal" placeholder="0.00" value={planForm.monthlyPrice}
          onChange={(event) => setPlanForm({ ...planForm, monthlyPrice: event.target.value })} />
        <label htmlFor="plan-install">Installation fee (PHP)</label>
        <input id="plan-install" inputMode="decimal" placeholder="0.00" value={planForm.installationFee}
          onChange={(event) => setPlanForm({ ...planForm, installationFee: event.target.value })} />
        <label htmlFor="plan-reconnect">Reconnection fee (PHP)</label>
        <input id="plan-reconnect" inputMode="decimal" placeholder="0.00" value={planForm.reconnectionFee}
          onChange={(event) => setPlanForm({ ...planForm, reconnectionFee: event.target.value })} />
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Create plan"}
        </button>
      </form>

      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Type</th><th>Monthly</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6}>Loading plans...</td></tr>}
            {!loading && plans.length === 0 && <tr><td colSpan={6}>No service plans yet.</td></tr>}
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.code}</td>
                <td>{plan.name}</td>
                <td>{plan.serviceType}</td>
                <td>{formatPeso(plan.monthlyPriceCents)}</td>
                <td>{plan.isActive ? "Active" : "Inactive"}</td>
                <td>
                  <button className="text-button" type="button" disabled={busy} onClick={() => void togglePlan(plan)}>
                    {plan.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">Coverage</span>
          <h2>Collection areas</h2>
        </div>
      </div>
      <form className="admin-form" onSubmit={createArea}>
        <p className="form-note">Group subscribers by the area your field collectors service.</p>
        <label htmlFor="area-code">Code</label>
        <input id="area-code" required value={areaForm.code}
          onChange={(event) => setAreaForm({ ...areaForm, code: event.target.value })} />
        <label htmlFor="area-name">Name</label>
        <input id="area-name" required value={areaForm.name}
          onChange={(event) => setAreaForm({ ...areaForm, name: event.target.value })} />
        <label htmlFor="area-description">Description</label>
        <input id="area-description" value={areaForm.description}
          onChange={(event) => setAreaForm({ ...areaForm, description: event.target.value })} />
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Create area"}
        </button>
      </form>
      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Description</th><th>Status</th></tr>
          </thead>
          <tbody>
            {areas.length === 0 && <tr><td colSpan={4}>No collection areas yet.</td></tr>}
            {areas.map((area) => (
              <tr key={area.id}>
                <td>{area.code}</td>
                <td>{area.name}</td>
                <td>{area.description ?? "—"}</td>
                <td>{area.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}