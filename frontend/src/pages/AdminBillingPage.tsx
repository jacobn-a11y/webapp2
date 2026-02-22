import { useEffect, useState } from "react";
import {
  getSeatUsage,
  getUsageSummary,
  getEntitlements,
  updateSeatLimit,
  type SeatUsage,
  type UsageSummaryData,
  type EntitlementEntry,
} from "../lib/api";

export function AdminBillingPage() {
  const [seatUsage, setSeatUsage] = useState<SeatUsage | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryData | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Seat limit form
  const [newSeatLimit, setNewSeatLimit] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [seatRes, usageRes, entRes] = await Promise.all([
        getSeatUsage(),
        getUsageSummary(),
        getEntitlements(),
      ]);
      setSeatUsage(seatRes.usage);
      setUsageSummary(usageRes.summary);
      setEntitlements(entRes.entitlements);
      setNewSeatLimit(seatRes.usage.seatLimit != null ? String(seatRes.usage.seatLimit) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpdateSeatLimit = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const limit = newSeatLimit.trim() === "" ? null : Number(newSeatLimit);
      const res = await updateSeatLimit(limit);
      setSeatUsage(res.usage);
      setNotice("Seat limit updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update seat limit");
    } finally {
      setSaving(false);
    }
  };

  const seatPercentage =
    seatUsage && seatUsage.seatLimit
      ? Math.min(100, Math.round((seatUsage.seatsUsed / seatUsage.seatLimit) * 100))
      : 0;

  if (loading) {
    return (
      <div className="admin-billing__page">
        <header className="admin-billing__header">
          <h1 className="admin-billing__title">Billing &amp; Seat Management</h1>
          <p className="admin-billing__subtitle">
            Manage seat allocations, usage summaries, and feature entitlements.
          </p>
        </header>
        <div className="admin-billing__loading">Loading billing data...</div>
      </div>
    );
  }

  if (error && !seatUsage && !usageSummary) {
    return (
      <div className="admin-billing__page">
        <header className="admin-billing__header">
          <h1 className="admin-billing__title">Billing &amp; Seat Management</h1>
        </header>
        <div className="admin-billing__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-billing__page">
      <header className="admin-billing__header">
        <h1 className="admin-billing__title">Billing &amp; Seat Management</h1>
        <p className="admin-billing__subtitle">
          Manage seat allocations, usage summaries, and feature entitlements.
        </p>
      </header>

      {error && <div className="admin-billing__error">{error}</div>}
      {notice && <div className="admin-billing__notice">{notice}</div>}

      {/* ── Seat Usage ───────────────────────────────────────────── */}
      <section className="admin-billing__card">
        <h2>Seat Usage</h2>
        {seatUsage ? (
          <div className="admin-billing__seat-info">
            <div className="admin-billing__summary-grid">
              <div className="admin-billing__stat">
                <span className="admin-billing__stat-label">Seats Used</span>
                <span className="admin-billing__stat-value">{seatUsage.seatsUsed}</span>
              </div>
              <div className="admin-billing__stat">
                <span className="admin-billing__stat-label">Seat Limit</span>
                <span className="admin-billing__stat-value">
                  {seatUsage.seatLimit != null ? seatUsage.seatLimit : "Unlimited"}
                </span>
              </div>
              <div className="admin-billing__stat">
                <span className="admin-billing__stat-label">Seats Available</span>
                <span className="admin-billing__stat-value">
                  {seatUsage.seatsAvailable != null ? seatUsage.seatsAvailable : "Unlimited"}
                </span>
              </div>
            </div>
            {seatUsage.seatLimit != null && (
              <div className="admin-billing__progress-bar-wrap">
                <div className="admin-billing__progress-bar">
                  <div
                    className={
                      "admin-billing__progress-fill" +
                      (seatUsage.overLimit ? " admin-billing__progress-fill--over" : "")
                    }
                    style={{ width: `${seatPercentage}%` }}
                  />
                </div>
                <span className="admin-billing__progress-label">
                  {seatPercentage}% utilized
                  {seatUsage.overLimit && " (over limit)"}
                </span>
              </div>
            )}

            {/* Admin: Update seat limit */}
            <div className="admin-billing__seat-limit-form">
              <h3 className="admin-billing__sub-heading">Update Seat Limit</h3>
              <div className="admin-billing__inline-form">
                <input
                  type="number"
                  className="admin-billing__input"
                  placeholder="Seat limit (blank for unlimited)"
                  value={newSeatLimit}
                  onChange={(e) => setNewSeatLimit(e.target.value)}
                  min={0}
                />
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleUpdateSeatLimit}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Update Limit"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p>No seat usage data available.</p>
        )}
      </section>

      {/* ── Usage Summary ────────────────────────────────────────── */}
      <section className="admin-billing__card">
        <h2>Usage Summary</h2>
        {usageSummary ? (
          <div className="admin-billing__summary-grid">
            <div className="admin-billing__stat">
              <span className="admin-billing__stat-label">Stories Generated</span>
              <span className="admin-billing__stat-value">{usageSummary.storiesGenerated}</span>
            </div>
            <div className="admin-billing__stat">
              <span className="admin-billing__stat-label">Pages Published</span>
              <span className="admin-billing__stat-value">{usageSummary.pagesPublished}</span>
            </div>
            <div className="admin-billing__stat">
              <span className="admin-billing__stat-label">Calls Processed</span>
              <span className="admin-billing__stat-value">{usageSummary.callsProcessed}</span>
            </div>
            <div className="admin-billing__stat">
              <span className="admin-billing__stat-label">AI Tokens Used</span>
              <span className="admin-billing__stat-value">
                {usageSummary.aiTokensUsed.toLocaleString()}
              </span>
            </div>
            <div className="admin-billing__stat">
              <span className="admin-billing__stat-label">API Calls Made</span>
              <span className="admin-billing__stat-value">
                {usageSummary.apiCallsMade.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <p>No usage summary data available.</p>
        )}
      </section>

      {/* ── Feature Entitlements ──────────────────────────────────── */}
      <section className="admin-billing__card">
        <h2>Feature Entitlements</h2>
        {entitlements.length === 0 ? (
          <p>No feature entitlements configured.</p>
        ) : (
          <div className="admin-billing__table-wrap">
            <table className="admin-billing__table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Entitled</th>
                  <th>Limit</th>
                  <th>Used</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map((ent) => (
                  <tr key={ent.feature}>
                    <td>{ent.feature}</td>
                    <td>
                      <span
                        className={
                          "admin-billing__badge admin-billing__badge--" +
                          (ent.entitled ? "yes" : "no")
                        }
                      >
                        {ent.entitled ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>{ent.limit != null ? ent.limit : "Unlimited"}</td>
                    <td>{ent.used}</td>
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
