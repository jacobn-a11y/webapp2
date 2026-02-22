import { useEffect, useState } from "react";
import {
  getIntegrationHealth,
  getIntegrationRuns,
  getDlqEntries,
  replayDlqEntry,
  discardDlqEntry,
  type IntegrationHealthSummary,
  type IntegrationRunEntry,
  type DlqEntry,
} from "../lib/api";

export function AdminIntegrationHealthPage() {
  const [providers, setProviders] = useState<IntegrationHealthSummary[]>([]);
  const [runs, setRuns] = useState<IntegrationRunEntry[]>([]);
  const [dlqEntries, setDlqEntries] = useState<DlqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, runsRes, dlqRes] = await Promise.all([
        getIntegrationHealth(),
        getIntegrationRuns({ limit: 50 }),
        getDlqEntries(),
      ]);
      setProviders(healthRes.providers);
      setRuns(runsRes.runs);
      setDlqEntries(dlqRes.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integration health data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleReplay = async (entryId: string) => {
    setError(null);
    setNotice(null);
    try {
      await replayDlqEntry(entryId);
      setDlqEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: "REPLAYED" } : e))
      );
      setNotice("DLQ entry queued for replay.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to replay DLQ entry");
    }
  };

  const handleDiscard = async (entryId: string) => {
    if (!window.confirm("Discard this DLQ entry? This cannot be undone.")) return;
    setError(null);
    setNotice(null);
    try {
      await discardDlqEntry(entryId);
      setDlqEntries((prev) => prev.filter((e) => e.id !== entryId));
      setNotice("DLQ entry discarded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard DLQ entry");
    }
  };

  if (loading) {
    return (
      <div className="admin-integration__page">
        <header className="admin-integration__header">
          <h1 className="admin-integration__title">Integration Health</h1>
          <p className="admin-integration__subtitle">
            Monitor integration status, run history, and dead-letter queue.
          </p>
        </header>
        <div className="admin-integration__loading">Loading integration health...</div>
      </div>
    );
  }

  if (error && providers.length === 0) {
    return (
      <div className="admin-integration__page">
        <header className="admin-integration__header">
          <h1 className="admin-integration__title">Integration Health</h1>
        </header>
        <div className="admin-integration__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-integration__page">
      <header className="admin-integration__header">
        <h1 className="admin-integration__title">Integration Health</h1>
        <p className="admin-integration__subtitle">
          Monitor integration status, run history, and dead-letter queue.
        </p>
      </header>

      {error && <div className="admin-integration__error">{error}</div>}
      {notice && <div className="admin-integration__notice">{notice}</div>}

      {/* ── Health Summary Cards ─────────────────────────────────── */}
      <section className="admin-integration__card">
        <h2>Provider Health</h2>
        <div className="admin-integration__summary-grid">
          {providers.length === 0 ? (
            <p>No integration providers configured.</p>
          ) : (
            providers.map((provider) => (
              <div key={provider.provider} className="admin-integration__summary-card">
                <div className="admin-integration__summary-header">
                  <span className="admin-integration__provider-name">
                    {provider.provider}
                  </span>
                  <span
                    className={
                      "admin-integration__status-badge admin-integration__status-badge--" +
                      provider.status.toLowerCase()
                    }
                  >
                    {provider.status}
                  </span>
                </div>
                <div className="admin-integration__summary-stats">
                  <div className="admin-integration__stat">
                    <span className="admin-integration__stat-label">Success Rate</span>
                    <span className="admin-integration__stat-value">
                      {(provider.successRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="admin-integration__stat">
                    <span className="admin-integration__stat-label">Total Runs</span>
                    <span className="admin-integration__stat-value">{provider.totalRuns}</span>
                  </div>
                  <div className="admin-integration__stat">
                    <span className="admin-integration__stat-label">DLQ Count</span>
                    <span className="admin-integration__stat-value">{provider.dlqCount}</span>
                  </div>
                  <div className="admin-integration__stat">
                    <span className="admin-integration__stat-label">Last Run</span>
                    <span className="admin-integration__stat-value">
                      {provider.lastRunAt
                        ? new Date(provider.lastRunAt).toLocaleString()
                        : "Never"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Run History ──────────────────────────────────────────── */}
      <section className="admin-integration__card">
        <h2>Run History</h2>
        {runs.length === 0 ? (
          <p>No integration runs recorded.</p>
        ) : (
          <div className="admin-integration__table-wrap">
            <table className="admin-integration__table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Items Processed</th>
                  <th>Items Failed</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.provider}</td>
                    <td>
                      <span
                        className={
                          "admin-integration__status-badge admin-integration__status-badge--" +
                          run.status.toLowerCase()
                        }
                      >
                        {run.status}
                      </span>
                    </td>
                    <td>{run.itemsProcessed}</td>
                    <td>{run.itemsFailed}</td>
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                    <td>
                      {run.completedAt
                        ? new Date(run.completedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="admin-integration__error-cell">
                      {run.errorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Dead Letter Queue ────────────────────────────────────── */}
      <section className="admin-integration__card">
        <h2>Dead Letter Queue</h2>
        {dlqEntries.length === 0 ? (
          <p>No DLQ entries.</p>
        ) : (
          <div className="admin-integration__table-wrap">
            <table className="admin-integration__table">
              <thead>
                <tr>
                  <th>External ID</th>
                  <th>Error</th>
                  <th>Retries</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dlqEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.externalId ?? "—"}</td>
                    <td className="admin-integration__error-cell">
                      {entry.errorMessage}
                    </td>
                    <td>{entry.retryCount}</td>
                    <td>
                      <span
                        className={
                          "admin-integration__status-badge admin-integration__status-badge--" +
                          entry.status.toLowerCase()
                        }
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="admin-integration__actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => handleReplay(entry.id)}
                        disabled={entry.status === "REPLAYED"}
                      >
                        Replay
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleDiscard(entry.id)}
                      >
                        Discard
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
