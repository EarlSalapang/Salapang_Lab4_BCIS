import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  Report,
  ReportCatalog,
  ReportCatalogItem,
  ReportColumn,
  ReportExportFormat,
} from "@bcis/shared";
import { formatPeso } from "../lib/format";

interface ReportsPageProps {
  permissions: string[];
  onMessage: (message: string) => void;
}

function defaultParams(item: ReportCatalogItem): Record<string, string> {
  const values: Record<string, string> = {};
  for (const parameter of item.parameters) {
    if (parameter.defaultValue) values[parameter.name] = parameter.defaultValue;
  }
  return values;
}

function formatReportValue(value: string | number | null, format: ReportColumn["format"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    switch (format) {
      case "money":
        return formatPeso(value);
      case "percent":
        return `${value}%`;
      case "number":
        return value.toLocaleString("en-PH");
      default:
        return String(value);
    }
  }
  return value;
}

export default function ReportsPage({ permissions, onMessage }: ReportsPageProps) {
  const canExport = permissions.includes("report.export");

  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const runReport = useCallback(
    async (key: string, values: Record<string, string>) => {
      setBusy(true);
      try {
        const result = await window.bcis.getReport(key, values);
        if (!result.ok) {
          onMessage(result.message);
          setReport(null);
          return;
        }
        setReport(result.data);
      } catch {
        onMessage("Unable to run the report.");
      } finally {
        setBusy(false);
      }
    },
    [onMessage],
  );

  useEffect(() => {
    let active = true;
    void window.bcis
      .listReports()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          onMessage(result.message);
          return;
        }
        setCatalog(result.data);
        const first = result.data.reports[0];
        if (first) {
          setSelectedKey(first.key);
          setParams(defaultParams(first));
          void runReport(first.key, defaultParams(first));
        }
      })
      .catch(() => {
        if (active) onMessage("Unable to load the report catalog.");
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onMessage, runReport]);

  const selectedItem = useMemo(
    () => catalog?.reports.find((item) => item.key === selectedKey) ?? null,
    [catalog, selectedKey],
  );

  function selectReport(item: ReportCatalogItem) {
    setSelectedKey(item.key);
    setParams(defaultParams(item));
    void runReport(item.key, defaultParams(item));
  }

  function submitRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedKey) void runReport(selectedKey, params);
  }

  async function exportReport(format: ReportExportFormat) {
    if (!selectedKey) return;
    setBusy(true);
    try {
      const result = await window.bcis.exportReport(selectedKey, format, params);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      if (result.data.canceled) return;
      onMessage(`Exported ${selectedItem?.title ?? "report"} to ${result.data.filePath}.`);
    } catch {
      onMessage("Unable to export the report.");
    } finally {
      setBusy(false);
    }
  }

  const categories = catalog
    ? [...new Set(catalog.reports.map((item) => item.category))]
    : [];

  return (
    <section className="admin-layout" aria-labelledby="reports-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Reports &amp; Printing</span>
          <h2 id="reports-title">Generate, print and export reports</h2>
        </div>
      </div>

      <div className="reports-layout">
        <aside className="reports-catalog">
          {catalogLoading && <p className="loading-text">Loading reports...</p>}
          {categories.map((category) => (
            <div key={category} className="reports-group">
              <span className="nav-caption">{category}</span>
              {catalog?.reports
                .filter((item) => item.category === category)
                .map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`nav-item ${selectedKey === item.key ? "selected" : ""}`}
                    onClick={() => selectReport(item)}
                  >
                    {item.title}
                  </button>
                ))}
            </div>
          ))}
        </aside>

        <div className="reports-content">
          {selectedItem ? (
            <form className="admin-form reports-params" onSubmit={submitRun}>
              <p className="form-note">{selectedItem.description}</p>
              <div className="filter-row">
                {selectedItem.parameters.map((parameter) => (
                  <label key={parameter.name} htmlFor={`report-param-${parameter.name}`}>
                    {parameter.label}
                    {parameter.type === "select" ? (
                      <select
                        id={`report-param-${parameter.name}`}
                        value={params[parameter.name] ?? ""}
                        onChange={(event) => setParams({ ...params, [parameter.name]: event.target.value })}
                      >
                        <option value="">Default</option>
                        {parameter.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`report-param-${parameter.name}`}
                        type={parameter.type === "date" ? "date" : "text"}
                        required={parameter.required}
                        value={params[parameter.name] ?? ""}
                        onChange={(event) => setParams({ ...params, [parameter.name]: event.target.value })}
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="detail-actions">
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? "Running..." : "Run report"}
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={!report}
                  onClick={() => window.print()}
                >
                  Print
                </button>
                {canExport ? (
                  <>
                    <button
                      className="text-button"
                      type="button"
                      disabled={!report || busy}
                      onClick={() => void exportReport("xlsx")}
                    >
                      Export Excel
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={!report || busy}
                      onClick={() => void exportReport("pdf")}
                    >
                      Export PDF
                    </button>
                  </>
                ) : null}
              </div>
            </form>
          ) : null}

          {report ? (
            <article className="print-area report-document" aria-label={report.title}>
              <header className="report-header">
                <h2>{report.title}</h2>
                {report.subtitle ? <p>{report.subtitle}</p> : null}
                <p className="form-note">Generated {report.generatedAt}</p>
                {report.parameters && Object.keys(report.parameters).length > 0 ? (
                  <p className="form-note">
                    {Object.entries(report.parameters)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join("    ")}
                  </p>
                ) : null}
              </header>

              {report.kpis && report.kpis.length > 0 ? (
                <div className="kpi-grid">
                  {report.kpis.map((kpi) => (
                    <div key={kpi.label} className="kpi-card">
                      <span className="kpi-label">{kpi.label}</span>
                      <strong className="kpi-value">{formatReportValue(kpi.value, kpi.format)}</strong>
                      {kpi.hint ? <span className="kpi-hint">{kpi.hint}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {report.sections.map((section, sectionIndex) => (
                <div key={`${section.title ?? "section"}-${sectionIndex}`} className="report-section">
                  {section.title ? <h3>{section.title}</h3> : null}
                  <div className="user-table-wrap">
                    <table className="user-table">
                      <thead>
                        <tr>
                          {section.columns.map((column) => (
                            <th key={column.key} className={`align-${column.align}`}>
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {section.columns.map((column) => (
                              <td key={column.key} className={`align-${column.align}`}>
                                {formatReportValue(row[column.key] ?? null, column.format)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {section.rows.length === 0 ? (
                          <tr>
                            <td colSpan={section.columns.length}>No rows for the selected parameters.</td>
                          </tr>
                        ) : null}
                        {section.totals ? (
                          <tr className="row-total">
                            {section.columns.map((column) => (
                              <td key={column.key} className={`align-${column.align}`}>
                                {column.key in section.totals!
                                  ? formatReportValue(section.totals![column.key] ?? null, column.format)
                                  : ""}
                              </td>
                            ))}
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </article>
          ) : (
            !busy && <p className="loading-text">Select a report and run it to see results.</p>
          )}
        </div>
      </div>
    </section>
  );
}
