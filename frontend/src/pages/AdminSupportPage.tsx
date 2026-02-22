import { useEffect, useState } from "react";
import {
  getSupportOrgOverview,
  getSupportUsers,
  getSupportFeatureFlags,
  getSupportRecentActivity,
  getSupportIntegrationStatus,
} from "../lib/api";

export function AdminSupportPage() {
  const [orgOverview, setOrgOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [featureFlags, setFeatureFlags] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, usersRes, flagsRes, activityRes, integrationsRes] = await Promise.all([
        getSupportOrgOverview(),
        getSupportUsers(),
        getSupportFeatureFlags(),
        getSupportRecentActivity(50),
        getSupportIntegrationStatus(),
      ]);
      setOrgOverview(overviewRes.overview ?? overviewRes);
      setUsers(usersRes.users ?? []);
      setFeatureFlags(flagsRes.flags ?? flagsRes.featureFlags ?? []);
      setRecentActivity(activityRes.activity ?? activityRes.entries ?? []);
      setIntegrationStatus(integrationsRes.integrations ?? integrationsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load support console data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="admin-support__page">
        <header className="admin-support__header">
          <h1 className="admin-support__title">Support Console</h1>
          <p className="admin-support__subtitle">
            Internal support tools: org overview, users, feature flags, activity, and integrations.
          </p>
        </header>
        <div className="admin-support__loading">Loading support console...</div>
      </div>
    );
  }

  if (error && !orgOverview && users.length === 0) {
    return (
      <div className="admin-support__page">
        <header className="admin-support__header">
          <h1 className="admin-support__title">Support Console</h1>
        </header>
        <div className="admin-support__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-support__page">
      <header className="admin-support__header">
        <h1 className="admin-support__title">Support Console</h1>
        <p className="admin-support__subtitle">
          Internal support tools: org overview, users, feature flags, activity, and integrations.
        </p>
      </header>

      {error && <div className="admin-support__error">{error}</div>}

      {/* ── Org Overview ──────────────────────────────────────────── */}
      <section className="admin-support__card">
        <h2>Organization Overview</h2>
        {orgOverview ? (
          <div className="admin-support__summary-grid">
            {orgOverview.orgName != null && (
              <div className="admin-support__stat">
                <span className="admin-support__stat-label">Organization</span>
                <span className="admin-support__stat-value">{orgOverview.orgName}</span>
              </div>
            )}
            {orgOverview.plan != null && (
              <div className="admin-support__stat">
                <span className="admin-support__stat-label">Plan</span>
                <span className="admin-support__stat-value">{orgOverview.plan}</span>
              </div>
            )}
            {orgOverview.billingStatus != null && (
              <div className="admin-support__stat">
                <span className="admin-support__stat-label">Billing Status</span>
                <span className="admin-support__stat-value">{orgOverview.billingStatus}</span>
              </div>
            )}
            {orgOverview.userCount != null && (
              <div className="admin-support__stat">
                <span className="admin-support__stat-label">Users</span>
                <span className="admin-support__stat-value">{orgOverview.userCount}</span>
              </div>
            )}
            {orgOverview.accountCount != null && (
              <div className="admin-support__stat">
                <span className="admin-support__stat-label">Accounts</span>
                <span className="admin-support__stat-value">{orgOverview.accountCount}</span>
              </div>
            )}
            {orgOverview.storyCount != null && (
              <div className="admin-support__stat">
                <span className="admin-support__stat-label">Stories</span>
                <span className="admin-support__stat-value">{orgOverview.storyCount}</span>
              </div>
            )}
            {orgOverview.pageCount != null && (
              <div className="admin-support__stat">
                <span className="admin-support__stat-label">Pages</span>
                <span className="admin-support__stat-value">{orgOverview.pageCount}</span>
              </div>
            )}
          </div>
        ) : (
          <p>No organization overview data available.</p>
        )}
      </section>

      {/* ── Users ─────────────────────────────────────────────────── */}
      <section className="admin-support__card">
        <h2>Users</h2>
        {users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <div className="admin-support__table-wrap">
            <table className="admin-support__table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Permissions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any, idx: number) => (
                  <tr key={user.id ?? user.userId ?? idx}>
                    <td>{user.email ?? user.userEmail ?? "—"}</td>
                    <td>{user.name ?? user.userName ?? "—"}</td>
                    <td>{user.role ?? "—"}</td>
                    <td>
                      {Array.isArray(user.permissions)
                        ? user.permissions.join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Feature Flags ─────────────────────────────────────────── */}
      <section className="admin-support__card">
        <h2>Feature Flags</h2>
        {featureFlags.length === 0 ? (
          <p>No feature flags configured.</p>
        ) : (
          <div className="admin-support__table-wrap">
            <table className="admin-support__table">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Enabled</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {featureFlags.map((flag: any, idx: number) => (
                  <tr key={flag.key ?? flag.name ?? idx}>
                    <td>{flag.key ?? flag.name ?? "—"}</td>
                    <td>
                      <span
                        className={
                          "admin-support__badge admin-support__badge--" +
                          (flag.enabled ? "yes" : "no")
                        }
                      >
                        {flag.enabled ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>{flag.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Recent Activity ───────────────────────────────────────── */}
      <section className="admin-support__card">
        <h2>Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p>No recent activity.</p>
        ) : (
          <div className="admin-support__table-wrap">
            <table className="admin-support__table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((entry: any, idx: number) => (
                  <tr key={entry.id ?? idx}>
                    <td>
                      {entry.created_at ?? entry.createdAt
                        ? new Date(entry.created_at ?? entry.createdAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>{entry.actor_user_id ?? entry.actorUserId ?? "—"}</td>
                    <td>{entry.category ?? "—"}</td>
                    <td>{entry.action ?? "—"}</td>
                    <td>
                      {entry.target_type ?? entry.targetType
                        ? `${entry.target_type ?? entry.targetType}${
                            entry.target_id ?? entry.targetId
                              ? `:${entry.target_id ?? entry.targetId}`
                              : ""
                          }`
                        : "—"}
                    </td>
                    <td>{entry.severity ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Integration Status ────────────────────────────────────── */}
      <section className="admin-support__card">
        <h2>Integration Status</h2>
        {integrationStatus ? (
          Array.isArray(integrationStatus) ? (
            <div className="admin-support__table-wrap">
              <table className="admin-support__table">
                <thead>
                  <tr>
                    <th>Integration</th>
                    <th>Status</th>
                    <th>Last Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {integrationStatus.map((integration: any, idx: number) => (
                    <tr key={integration.name ?? integration.provider ?? idx}>
                      <td>{integration.name ?? integration.provider ?? "—"}</td>
                      <td>
                        <span
                          className={
                            "admin-support__status-badge admin-support__status-badge--" +
                            String(integration.status ?? "unknown").toLowerCase()
                          }
                        >
                          {integration.status ?? "Unknown"}
                        </span>
                      </td>
                      <td>
                        {integration.lastCheckedAt ?? integration.lastRunAt
                          ? new Date(
                              integration.lastCheckedAt ?? integration.lastRunAt
                            ).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="admin-support__json-output">
              {JSON.stringify(integrationStatus, null, 2)}
            </pre>
          )
        ) : (
          <p>No integration status data available.</p>
        )}
      </section>
    </div>
  );
}
