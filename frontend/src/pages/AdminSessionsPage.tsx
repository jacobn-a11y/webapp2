import { useEffect, useState } from "react";
import {
  getSessionPolicy,
  updateSessionPolicy,
  getActiveSessions,
  revokeSession,
  getIpAllowlist,
  addIpAllowlistEntry,
  removeIpAllowlistEntry,
  type SessionPolicy,
  type UserSessionEntry,
  type IpAllowlistEntry,
} from "../lib/api";

export function AdminSessionsPage() {
  const [policy, setPolicy] = useState<SessionPolicy | null>(null);
  const [sessions, setSessions] = useState<UserSessionEntry[]>([]);
  const [allowlist, setAllowlist] = useState<IpAllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // IP allowlist form
  const [newCidr, setNewCidr] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [policyRes, sessionsRes, allowlistRes] = await Promise.all([
        getSessionPolicy(),
        getActiveSessions(),
        getIpAllowlist(),
      ]);
      setPolicy(policyRes.policy);
      setSessions(sessionsRes.sessions);
      setAllowlist(allowlistRes.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handlePolicySave = async () => {
    if (!policy) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await updateSessionPolicy(policy);
      setPolicy(res.policy);
      setNotice("Session policy updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update policy");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (sessionId: string) => {
    if (!window.confirm("Revoke this session?")) return;
    try {
      await revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setNotice("Session revoked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    }
  };

  const handleAddIp = async () => {
    if (!newCidr.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await addIpAllowlistEntry({ cidr: newCidr.trim(), label: newLabel.trim() || undefined });
      setAllowlist((prev) => [...prev, res.entry]);
      setNewCidr("");
      setNewLabel("");
      setNotice("IP allowlist entry added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add IP entry");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveIp = async (entryId: string) => {
    if (!window.confirm("Remove this IP allowlist entry?")) return;
    try {
      await removeIpAllowlistEntry(entryId);
      setAllowlist((prev) => prev.filter((e) => e.id !== entryId));
      setNotice("IP allowlist entry removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove IP entry");
    }
  };

  if (loading) {
    return (
      <div className="admin-sessions__page">
        <header className="admin-sessions__header">
          <h1 className="admin-sessions__title">Session Management</h1>
          <p className="admin-sessions__subtitle">
            Manage session policies, active sessions, and IP allowlists.
          </p>
        </header>
        <div className="admin-sessions__loading">Loading session data...</div>
      </div>
    );
  }

  if (error && !policy && sessions.length === 0) {
    return (
      <div className="admin-sessions__page">
        <header className="admin-sessions__header">
          <h1 className="admin-sessions__title">Session Management</h1>
        </header>
        <div className="admin-sessions__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-sessions__page">
      <header className="admin-sessions__header">
        <h1 className="admin-sessions__title">Session Management</h1>
        <p className="admin-sessions__subtitle">
          Manage session policies, active sessions, and IP allowlists.
        </p>
      </header>

      {error && <div className="admin-sessions__error">{error}</div>}
      {notice && <div className="admin-sessions__notice">{notice}</div>}

      {/* ── Session Policy ──────────────────────────────────────────── */}
      <section className="admin-sessions__card">
        <h2>Session Policy</h2>
        {policy ? (
          <div className="admin-sessions__policy-form">
            <label className="admin-sessions__field">
              <input
                type="checkbox"
                checked={policy.mfaRequired}
                onChange={(e) =>
                  setPolicy((p) => p ? { ...p, mfaRequired: e.target.checked } : p)
                }
              />
              MFA Required
            </label>
            <label className="admin-sessions__field">
              Idle Timeout (ms)
              <input
                type="number"
                className="admin-sessions__input"
                value={policy.idleTimeoutMs ?? ""}
                onChange={(e) =>
                  setPolicy((p) =>
                    p
                      ? { ...p, idleTimeoutMs: e.target.value ? Number(e.target.value) : null }
                      : p
                  )
                }
              />
            </label>
            <label className="admin-sessions__field">
              Max Session Duration (ms)
              <input
                type="number"
                className="admin-sessions__input"
                value={policy.maxSessionDurationMs ?? ""}
                onChange={(e) =>
                  setPolicy((p) =>
                    p
                      ? { ...p, maxSessionDurationMs: e.target.value ? Number(e.target.value) : null }
                      : p
                  )
                }
              />
            </label>
            <label className="admin-sessions__field">
              <input
                type="checkbox"
                checked={policy.ipAllowlistEnabled}
                onChange={(e) =>
                  setPolicy((p) => p ? { ...p, ipAllowlistEnabled: e.target.checked } : p)
                }
              />
              IP Allowlist Enabled
            </label>
            <div className="admin-sessions__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={handlePolicySave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Policy"}
              </button>
            </div>
          </div>
        ) : (
          <p>No session policy configured.</p>
        )}
      </section>

      {/* ── Active Sessions ─────────────────────────────────────────── */}
      <section className="admin-sessions__card">
        <h2>Active Sessions</h2>
        {sessions.length === 0 ? (
          <p>No active sessions.</p>
        ) : (
          <div className="admin-sessions__table-wrap">
            <table className="admin-sessions__table">
              <thead>
                <tr>
                  <th>IP Address</th>
                  <th>User Agent</th>
                  <th>Device</th>
                  <th>Created</th>
                  <th>Last Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{session.ipAddress ?? "—"}</td>
                    <td className="admin-sessions__ua">{session.userAgent ?? "—"}</td>
                    <td>{session.deviceType ?? "—"}</td>
                    <td>{new Date(session.createdAt).toLocaleString()}</td>
                    <td>{new Date(session.lastActiveAt).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleRevoke(session.id)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── IP Allowlist ────────────────────────────────────────────── */}
      <section className="admin-sessions__card">
        <h2>IP Allowlist</h2>
        <div className="admin-sessions__add-ip">
          <input
            className="admin-sessions__input"
            placeholder="CIDR (e.g. 10.0.0.0/24)"
            value={newCidr}
            onChange={(e) => setNewCidr(e.target.value)}
          />
          <input
            className="admin-sessions__input"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleAddIp}
            disabled={saving || !newCidr.trim()}
          >
            Add
          </button>
        </div>
        {allowlist.length === 0 ? (
          <p>No IP allowlist entries.</p>
        ) : (
          <div className="admin-sessions__table-wrap">
            <table className="admin-sessions__table">
              <thead>
                <tr>
                  <th>CIDR</th>
                  <th>Label</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {allowlist.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.cidr}</td>
                    <td>{entry.label ?? "—"}</td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleRemoveIp(entry.id)}
                      >
                        Remove
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
