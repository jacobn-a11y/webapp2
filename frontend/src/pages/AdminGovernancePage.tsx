import { useEffect, useState } from "react";
import {
  getGovernancePolicy,
  updateGovernancePolicy,
  getRetentionJobs,
  getLegalHolds,
  createLegalHold,
  releaseLegalHold,
  getDeletionRequests,
  approveDeletion,
  rejectDeletion,
  type GovernancePolicy,
  type RetentionJobEntry,
  type LegalHoldEntry,
  type DeletionRequestEntry,
} from "../lib/api";

export function AdminGovernancePage() {
  const [policy, setPolicy] = useState<GovernancePolicy | null>(null);
  const [retentionJobs, setRetentionJobs] = useState<RetentionJobEntry[]>([]);
  const [legalHolds, setLegalHolds] = useState<LegalHoldEntry[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Legal hold form
  const [holdScope, setHoldScope] = useState("ORG");
  const [holdTargetId, setHoldTargetId] = useState("");
  const [holdReason, setHoldReason] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [policyRes, jobsRes, holdsRes, deletionsRes] = await Promise.all([
        getGovernancePolicy(),
        getRetentionJobs(),
        getLegalHolds(),
        getDeletionRequests(),
      ]);
      setPolicy(policyRes.policy);
      setRetentionJobs(jobsRes.jobs);
      setLegalHolds(holdsRes.holds);
      setDeletionRequests(deletionsRes.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load governance data");
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
      const res = await updateGovernancePolicy(policy);
      setPolicy(res.policy);
      setNotice("Governance policy updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update policy");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateHold = async () => {
    if (!holdReason.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createLegalHold({
        scope: holdScope,
        targetId: holdTargetId.trim() || undefined,
        reason: holdReason.trim(),
      });
      setLegalHolds((prev) => [...prev, res.hold]);
      setHoldScope("ORG");
      setHoldTargetId("");
      setHoldReason("");
      setNotice("Legal hold created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create legal hold");
    } finally {
      setSaving(false);
    }
  };

  const handleReleaseHold = async (holdId: string) => {
    if (!window.confirm("Release this legal hold?")) return;
    setError(null);
    setNotice(null);
    try {
      await releaseLegalHold(holdId);
      setLegalHolds((prev) =>
        prev.map((h) =>
          h.id === holdId ? { ...h, holdEndedAt: new Date().toISOString() } : h
        )
      );
      setNotice("Legal hold released.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release legal hold");
    }
  };

  const handleApproveDeletion = async (requestId: string) => {
    if (!window.confirm("Approve this deletion request? This may be irreversible.")) return;
    setError(null);
    setNotice(null);
    try {
      await approveDeletion(requestId);
      setDeletionRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: "APPROVED" } : r))
      );
      setNotice("Deletion request approved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve deletion");
    }
  };

  const handleRejectDeletion = async (requestId: string) => {
    setError(null);
    setNotice(null);
    try {
      await rejectDeletion(requestId);
      setDeletionRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: "REJECTED" } : r))
      );
      setNotice("Deletion request rejected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject deletion");
    }
  };

  if (loading) {
    return (
      <div className="admin-governance__page">
        <header className="admin-governance__header">
          <h1 className="admin-governance__title">Data Governance</h1>
          <p className="admin-governance__subtitle">
            Manage data retention, legal holds, and deletion requests.
          </p>
        </header>
        <div className="admin-governance__loading">Loading governance data...</div>
      </div>
    );
  }

  if (error && !policy && retentionJobs.length === 0) {
    return (
      <div className="admin-governance__page">
        <header className="admin-governance__header">
          <h1 className="admin-governance__title">Data Governance</h1>
        </header>
        <div className="admin-governance__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-governance__page">
      <header className="admin-governance__header">
        <h1 className="admin-governance__title">Data Governance</h1>
        <p className="admin-governance__subtitle">
          Manage data retention, legal holds, and deletion requests.
        </p>
      </header>

      {error && <div className="admin-governance__error">{error}</div>}
      {notice && <div className="admin-governance__notice">{notice}</div>}

      {/* ── Governance Policy ───────────────────────────────────── */}
      <section className="admin-governance__card">
        <h2>Governance Policy</h2>
        {policy ? (
          <div className="admin-governance__policy-form">
            <label className="admin-governance__field">
              Default Retention (days)
              <input
                type="number"
                className="admin-governance__input"
                value={policy.defaultRetentionDays}
                onChange={(e) =>
                  setPolicy((p) =>
                    p ? { ...p, defaultRetentionDays: Number(e.target.value) } : p
                  )
                }
                min={1}
              />
            </label>
            <label className="admin-governance__field">
              Call Retention (days)
              <input
                type="number"
                className="admin-governance__input"
                value={policy.callRetentionDays}
                onChange={(e) =>
                  setPolicy((p) =>
                    p ? { ...p, callRetentionDays: Number(e.target.value) } : p
                  )
                }
                min={1}
              />
            </label>
            <label className="admin-governance__field">
              Story Retention (days)
              <input
                type="number"
                className="admin-governance__input"
                value={policy.storyRetentionDays}
                onChange={(e) =>
                  setPolicy((p) =>
                    p ? { ...p, storyRetentionDays: Number(e.target.value) } : p
                  )
                }
                min={1}
              />
            </label>
            <label className="admin-governance__field">
              Transcript Retention (days)
              <input
                type="number"
                className="admin-governance__input"
                value={policy.transcriptRetentionDays}
                onChange={(e) =>
                  setPolicy((p) =>
                    p ? { ...p, transcriptRetentionDays: Number(e.target.value) } : p
                  )
                }
                min={1}
              />
            </label>
            <label className="admin-governance__field">
              <input
                type="checkbox"
                checked={policy.piiExportAllowed}
                onChange={(e) =>
                  setPolicy((p) =>
                    p ? { ...p, piiExportAllowed: e.target.checked } : p
                  )
                }
              />
              PII Export Allowed
            </label>
            <label className="admin-governance__field">
              <input
                type="checkbox"
                checked={policy.namedStoryExportAllowed}
                onChange={(e) =>
                  setPolicy((p) =>
                    p ? { ...p, namedStoryExportAllowed: e.target.checked } : p
                  )
                }
              />
              Named Story Export Allowed
            </label>
            <div className="admin-governance__actions">
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
          <p>No governance policy configured.</p>
        )}
      </section>

      {/* ── Retention Jobs ──────────────────────────────────────── */}
      <section className="admin-governance__card">
        <h2>Retention Jobs</h2>
        {retentionJobs.length === 0 ? (
          <p>No retention jobs recorded.</p>
        ) : (
          <div className="admin-governance__table-wrap">
            <table className="admin-governance__table">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Target Type</th>
                  <th>Retention Days</th>
                  <th>Status</th>
                  <th>Evaluated</th>
                  <th>Deleted</th>
                  <th>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {retentionJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.policyName}</td>
                    <td>{job.targetType}</td>
                    <td>{job.retentionDays}</td>
                    <td>{job.status}</td>
                    <td>{job.itemsEvaluated}</td>
                    <td>{job.itemsDeleted}</td>
                    <td>{new Date(job.scheduledAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Legal Holds ─────────────────────────────────────────── */}
      <section className="admin-governance__card">
        <h2>Legal Holds</h2>
        <div className="admin-governance__hold-form">
          <select
            className="admin-governance__select"
            value={holdScope}
            onChange={(e) => setHoldScope(e.target.value)}
          >
            <option value="ORG">Org-wide</option>
            <option value="ACCOUNT">Account</option>
            <option value="USER">User</option>
          </select>
          {holdScope !== "ORG" && (
            <input
              className="admin-governance__input"
              placeholder="Target ID"
              value={holdTargetId}
              onChange={(e) => setHoldTargetId(e.target.value)}
            />
          )}
          <input
            className="admin-governance__input"
            placeholder="Reason for legal hold"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleCreateHold}
            disabled={saving || !holdReason.trim()}
          >
            Create Hold
          </button>
        </div>
        {legalHolds.length === 0 ? (
          <p>No legal holds.</p>
        ) : (
          <div className="admin-governance__table-wrap">
            <table className="admin-governance__table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Target ID</th>
                  <th>Reason</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {legalHolds.map((hold) => (
                  <tr key={hold.id}>
                    <td>{hold.scope}</td>
                    <td>{hold.targetId ?? "—"}</td>
                    <td>{hold.reason}</td>
                    <td>{new Date(hold.holdStartedAt).toLocaleString()}</td>
                    <td>
                      {hold.holdEndedAt
                        ? new Date(hold.holdEndedAt).toLocaleString()
                        : "Active"}
                    </td>
                    <td>
                      {!hold.holdEndedAt && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleReleaseHold(hold.id)}
                        >
                          Release
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Deletion Requests ───────────────────────────────────── */}
      <section className="admin-governance__card">
        <h2>Deletion Requests</h2>
        {deletionRequests.length === 0 ? (
          <p>No deletion requests.</p>
        ) : (
          <div className="admin-governance__table-wrap">
            <table className="admin-governance__table">
              <thead>
                <tr>
                  <th>Target Type</th>
                  <th>Target ID</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deletionRequests.map((req) => (
                  <tr key={req.id}>
                    <td>{req.targetType}</td>
                    <td>{req.targetId}</td>
                    <td>{req.reason ?? "—"}</td>
                    <td>{req.status}</td>
                    <td>{new Date(req.createdAt).toLocaleString()}</td>
                    <td className="admin-governance__actions">
                      {req.status === "PENDING" && (
                        <>
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={() => handleApproveDeletion(req.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => handleRejectDeletion(req.id)}
                          >
                            Reject
                          </button>
                        </>
                      )}
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
