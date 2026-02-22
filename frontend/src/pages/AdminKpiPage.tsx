import { useEffect, useState } from "react";
import {
  getKpiPipeline,
  getKpiContent,
  getKpiTeam,
  getExecutiveReport,
  type PipelineMetrics,
  type ContentMetrics,
  type TeamMetrics,
  type ExecutiveReport,
} from "../lib/api";

function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function AdminKpiPage() {
  const [pipeline, setPipeline] = useState<PipelineMetrics | null>(null);
  const [content, setContent] = useState<ContentMetrics | null>(null);
  const [team, setTeam] = useState<TeamMetrics | null>(null);
  const [execReport, setExecReport] = useState<ExecutiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const defaults = defaultDateRange();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pipelineRes, contentRes, teamRes] = await Promise.all([
        getKpiPipeline(startDate, endDate),
        getKpiContent(startDate, endDate),
        getKpiTeam(startDate, endDate),
      ]);
      setPipeline(pipelineRes.metrics);
      setContent(contentRes.metrics);
      setTeam(teamRes.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load KPI data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDateApply = () => {
    setExecReport(null);
    load();
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setError(null);
    setNotice(null);
    try {
      const res = await getExecutiveReport(startDate, endDate);
      setExecReport(res.report);
      setNotice("Executive report generated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate executive report");
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-kpi__page">
        <header className="admin-kpi__header">
          <h1 className="admin-kpi__title">KPI Reporting</h1>
          <p className="admin-kpi__subtitle">
            Pipeline metrics, content analytics, and team performance.
          </p>
        </header>
        <div className="admin-kpi__loading">Loading KPI data...</div>
      </div>
    );
  }

  if (error && !pipeline && !content && !team) {
    return (
      <div className="admin-kpi__page">
        <header className="admin-kpi__header">
          <h1 className="admin-kpi__title">KPI Reporting</h1>
        </header>
        <div className="admin-kpi__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-kpi__page">
      <header className="admin-kpi__header">
        <h1 className="admin-kpi__title">KPI Reporting</h1>
        <p className="admin-kpi__subtitle">
          Pipeline metrics, content analytics, and team performance.
        </p>
      </header>

      {error && <div className="admin-kpi__error">{error}</div>}
      {notice && <div className="admin-kpi__notice">{notice}</div>}

      {/* ── Date Range Selector ──────────────────────────────────── */}
      <section className="admin-kpi__card">
        <h2>Date Range</h2>
        <div className="admin-kpi__date-range">
          <label className="admin-kpi__field">
            Start
            <input
              type="date"
              className="admin-kpi__input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="admin-kpi__field">
            End
            <input
              type="date"
              className="admin-kpi__input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleDateApply}
          >
            Apply
          </button>
        </div>
      </section>

      {/* ── Pipeline Metrics ─────────────────────────────────────── */}
      <section className="admin-kpi__card">
        <h2>Pipeline Metrics</h2>
        {pipeline ? (
          <div className="admin-kpi__summary-grid">
            <div className="admin-kpi__stat">
              <span className="admin-kpi__stat-label">Total Accounts</span>
              <span className="admin-kpi__stat-value">{pipeline.totalAccounts}</span>
            </div>
            <div className="admin-kpi__stat">
              <span className="admin-kpi__stat-label">Accounts with Stories</span>
              <span className="admin-kpi__stat-value">{pipeline.accountsWithStories}</span>
            </div>
            <div className="admin-kpi__stat">
              <span className="admin-kpi__stat-label">Stories Generated</span>
              <span className="admin-kpi__stat-value">{pipeline.storiesGenerated}</span>
            </div>
            <div className="admin-kpi__stat">
              <span className="admin-kpi__stat-label">Pages Published</span>
              <span className="admin-kpi__stat-value">{pipeline.pagesPublished}</span>
            </div>
            <div className="admin-kpi__stat">
              <span className="admin-kpi__stat-label">Avg Stories / Account</span>
              <span className="admin-kpi__stat-value">
                {pipeline.averageStoriesPerAccount.toFixed(1)}
              </span>
            </div>
          </div>
        ) : (
          <p>No pipeline data available.</p>
        )}
      </section>

      {/* ── Content Metrics ──────────────────────────────────────── */}
      <section className="admin-kpi__card">
        <h2>Content Metrics</h2>
        {content ? (
          <>
            <div className="admin-kpi__summary-grid">
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Total Stories</span>
                <span className="admin-kpi__stat-value">{content.totalStories}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Avg Story Length</span>
                <span className="admin-kpi__stat-value">{content.averageStoryLength}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Total Landing Pages</span>
                <span className="admin-kpi__stat-value">{content.totalLandingPages}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Published Pages</span>
                <span className="admin-kpi__stat-value">{content.publishedPages}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Draft Pages</span>
                <span className="admin-kpi__stat-value">{content.draftPages}</span>
              </div>
            </div>

            <h3 className="admin-kpi__sub-heading">Stories by Type</h3>
            {Object.keys(content.storiesByType).length > 0 ? (
              <div className="admin-kpi__table-wrap">
                <table className="admin-kpi__table">
                  <thead>
                    <tr>
                      <th>Story Type</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(content.storiesByType).map(([type, count]) => (
                      <tr key={type}>
                        <td>{type}</td>
                        <td>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No story type breakdown available.</p>
            )}

            <h3 className="admin-kpi__sub-heading">Stories by Funnel Stage</h3>
            {Object.keys(content.storiesByFunnel).length > 0 ? (
              <div className="admin-kpi__table-wrap">
                <table className="admin-kpi__table">
                  <thead>
                    <tr>
                      <th>Funnel Stage</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(content.storiesByFunnel).map(([stage, count]) => (
                      <tr key={stage}>
                        <td>{stage}</td>
                        <td>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No funnel stage breakdown available.</p>
            )}
          </>
        ) : (
          <p>No content data available.</p>
        )}
      </section>

      {/* ── Team Metrics ─────────────────────────────────────────── */}
      <section className="admin-kpi__card">
        <h2>Team Activity</h2>
        {team ? (
          <>
            <div className="admin-kpi__summary-grid">
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Total Users</span>
                <span className="admin-kpi__stat-value">{team.totalUsers}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Active Users</span>
                <span className="admin-kpi__stat-value">{team.activeUsers}</span>
              </div>
            </div>

            <h3 className="admin-kpi__sub-heading">Top Contributors</h3>
            {team.topContributors.length > 0 ? (
              <div className="admin-kpi__table-wrap">
                <table className="admin-kpi__table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Stories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.topContributors.map((contributor) => (
                      <tr key={contributor.userId}>
                        <td>{contributor.name ?? contributor.userId}</td>
                        <td>{contributor.storyCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No contributor data available.</p>
            )}
          </>
        ) : (
          <p>No team data available.</p>
        )}
      </section>

      {/* ── Executive Report ─────────────────────────────────────── */}
      <section className="admin-kpi__card">
        <h2>Executive Report</h2>
        <div className="admin-kpi__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleGenerateReport}
            disabled={generatingReport}
          >
            {generatingReport ? "Generating..." : "Generate Executive Report"}
          </button>
        </div>
        {execReport && (
          <div className="admin-kpi__exec-report">
            <p className="admin-kpi__report-meta">
              Generated: {new Date(execReport.generatedAt).toLocaleString()} |
              Range: {execReport.timeRange.startDate} to {execReport.timeRange.endDate}
            </p>
            <div className="admin-kpi__summary-grid">
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Pipeline: Accounts</span>
                <span className="admin-kpi__stat-value">{execReport.pipeline.totalAccounts}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Pipeline: Stories</span>
                <span className="admin-kpi__stat-value">{execReport.pipeline.storiesGenerated}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Content: Total Stories</span>
                <span className="admin-kpi__stat-value">{execReport.content.totalStories}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Content: Published Pages</span>
                <span className="admin-kpi__stat-value">{execReport.content.publishedPages}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Team: Active Users</span>
                <span className="admin-kpi__stat-value">{execReport.team.activeUsers}</span>
              </div>
              <div className="admin-kpi__stat">
                <span className="admin-kpi__stat-label">Team: Total Users</span>
                <span className="admin-kpi__stat-value">{execReport.team.totalUsers}</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
