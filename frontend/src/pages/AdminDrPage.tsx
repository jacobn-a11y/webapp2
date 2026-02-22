import { useEffect, useState } from "react";
import {
  getDrStatus,
  validateDr,
  getExportManifest,
} from "../lib/api";

export function AdminDrPage() {
  const [status, setStatus] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [manifest, setManifest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDrStatus();
      setStatus(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DR status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleValidate = async () => {
    setValidating(true);
    setError(null);
    setNotice(null);
    setValidationResult(null);
    try {
      const res = await validateDr();
      setValidationResult(res);
      setNotice("DR validation completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run DR validation");
    } finally {
      setValidating(false);
    }
  };

  const handleExportManifest = async () => {
    setExporting(true);
    setError(null);
    setNotice(null);
    setManifest(null);
    try {
      const res = await getExportManifest();
      setManifest(res);
      setNotice("Export manifest retrieved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retrieve export manifest");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-dr__page">
        <header className="admin-dr__header">
          <h1 className="admin-dr__title">DR Readiness</h1>
          <p className="admin-dr__subtitle">
            Disaster recovery status, validation checks, and data export.
          </p>
        </header>
        <div className="admin-dr__loading">Loading DR status...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="admin-dr__page">
        <header className="admin-dr__header">
          <h1 className="admin-dr__title">DR Readiness</h1>
        </header>
        <div className="admin-dr__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dr__page">
      <header className="admin-dr__header">
        <h1 className="admin-dr__title">DR Readiness</h1>
        <p className="admin-dr__subtitle">
          Disaster recovery status, validation checks, and data export.
        </p>
      </header>

      {error && <div className="admin-dr__error">{error}</div>}
      {notice && <div className="admin-dr__notice">{notice}</div>}

      {/* ── DR Status ────────────────────────────────────────────── */}
      <section className="admin-dr__card">
        <h2>DR Status</h2>
        {status ? (
          <>
            <div className="admin-dr__summary-grid">
              <div className="admin-dr__stat">
                <span className="admin-dr__stat-label">Overall Status</span>
                <span
                  className={
                    "admin-dr__status-badge admin-dr__status-badge--" +
                    String(status.status ?? status.overallStatus ?? "unknown").toLowerCase()
                  }
                >
                  {status.status ?? status.overallStatus ?? "Unknown"}
                </span>
              </div>
              {status.rtoTarget != null && (
                <div className="admin-dr__stat">
                  <span className="admin-dr__stat-label">RTO Target</span>
                  <span className="admin-dr__stat-value">{status.rtoTarget}</span>
                </div>
              )}
              {status.rpoTarget != null && (
                <div className="admin-dr__stat">
                  <span className="admin-dr__stat-label">RPO Target</span>
                  <span className="admin-dr__stat-value">{status.rpoTarget}</span>
                </div>
              )}
              {status.lastBackupAt != null && (
                <div className="admin-dr__stat">
                  <span className="admin-dr__stat-label">Last Backup</span>
                  <span className="admin-dr__stat-value">
                    {new Date(status.lastBackupAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Data volume counts */}
            {status.dataVolumes && (
              <>
                <h3 className="admin-dr__sub-heading">Data Volumes</h3>
                <div className="admin-dr__table-wrap">
                  <table className="admin-dr__table">
                    <thead>
                      <tr>
                        <th>Resource</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(status.dataVolumes as Record<string, number>).map(
                        ([resource, count]) => (
                          <tr key={resource}>
                            <td>{resource}</td>
                            <td>{count as number}</td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : (
          <p>No DR status data available.</p>
        )}
      </section>

      {/* ── Validation ───────────────────────────────────────────── */}
      <section className="admin-dr__card">
        <h2>DR Validation</h2>
        <div className="admin-dr__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleValidate}
            disabled={validating}
          >
            {validating ? "Validating..." : "Run Validation"}
          </button>
        </div>
        {validationResult && (
          <div className="admin-dr__validation-result">
            {validationResult.checks && Array.isArray(validationResult.checks) ? (
              <div className="admin-dr__table-wrap">
                <table className="admin-dr__table">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult.checks.map(
                      (check: { name: string; status: string; detail?: string }, idx: number) => (
                        <tr key={idx}>
                          <td>{check.name}</td>
                          <td>
                            <span
                              className={
                                "admin-dr__status-badge admin-dr__status-badge--" +
                                check.status.toLowerCase()
                              }
                            >
                              {check.status}
                            </span>
                          </td>
                          <td>{check.detail ?? "—"}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="admin-dr__json-output">
                {JSON.stringify(validationResult, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>

      {/* ── Export Manifest ───────────────────────────────────────── */}
      <section className="admin-dr__card">
        <h2>Export Manifest</h2>
        <div className="admin-dr__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleExportManifest}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export Manifest"}
          </button>
        </div>
        {manifest && (
          <div className="admin-dr__manifest-result">
            {manifest.tables && Array.isArray(manifest.tables) ? (
              <div className="admin-dr__table-wrap">
                <table className="admin-dr__table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Row Count</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.tables.map(
                      (
                        table: { name: string; rowCount: number; sizeBytes?: number },
                        idx: number
                      ) => (
                        <tr key={idx}>
                          <td>{table.name}</td>
                          <td>{table.rowCount}</td>
                          <td>
                            {table.sizeBytes != null
                              ? `${(table.sizeBytes / 1024).toFixed(1)} KB`
                              : "—"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="admin-dr__json-output">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
