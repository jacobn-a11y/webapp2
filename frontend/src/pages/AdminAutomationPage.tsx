import { useEffect, useState } from "react";
import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  getAutomationExecutions,
  getDeliveryTargets,
  createDeliveryTarget,
  deleteDeliveryTarget,
  type AutomationRuleEntry,
  type AutomationExecutionEntry,
  type DeliveryTargetEntry,
} from "../lib/api";

export function AdminAutomationPage() {
  const [rules, setRules] = useState<AutomationRuleEntry[]>([]);
  const [executions, setExecutions] = useState<AutomationExecutionEntry[]>([]);
  const [targets, setTargets] = useState<DeliveryTargetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // New rule form
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleDescription, setNewRuleDescription] = useState("");
  const [newRuleTriggerType, setNewRuleTriggerType] = useState("STORY_GENERATED");
  const [newRuleActionType, setNewRuleActionType] = useState("SEND_NOTIFICATION");

  // New delivery target form
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetType, setNewTargetType] = useState("WEBHOOK");
  const [newTargetUrl, setNewTargetUrl] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, execsRes, targetsRes] = await Promise.all([
        getAutomationRules(),
        getAutomationExecutions({ limit: 50 }),
        getDeliveryTargets(),
      ]);
      setRules(rulesRes.rules);
      setExecutions(execsRes.executions);
      setTargets(targetsRes.targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automation data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateRule = async () => {
    if (!newRuleName.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createAutomationRule({
        name: newRuleName.trim(),
        description: newRuleDescription.trim() || undefined,
        triggerType: newRuleTriggerType,
        triggerConfig: {},
        actionType: newRuleActionType,
        actionConfig: {},
      });
      setRules((prev) => [...prev, res.rule]);
      setNewRuleName("");
      setNewRuleDescription("");
      setNotice("Automation rule created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    setError(null);
    setNotice(null);
    try {
      const res = await updateAutomationRule(ruleId, { enabled: !currentEnabled });
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? res.rule : r))
      );
      setNotice(`Rule ${!currentEnabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule");
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm("Delete this automation rule?")) return;
    setError(null);
    setNotice(null);
    try {
      await deleteAutomationRule(ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setNotice("Automation rule deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  const handleCreateTarget = async () => {
    if (!newTargetName.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await createDeliveryTarget({
        name: newTargetName.trim(),
        targetType: newTargetType,
        config: { url: newTargetUrl.trim() },
      });
      setTargets((prev) => [...prev, res.target]);
      setNewTargetName("");
      setNewTargetUrl("");
      setNotice("Delivery target created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create delivery target");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTarget = async (targetId: string) => {
    if (!window.confirm("Delete this delivery target?")) return;
    setError(null);
    setNotice(null);
    try {
      await deleteDeliveryTarget(targetId);
      setTargets((prev) => prev.filter((t) => t.id !== targetId));
      setNotice("Delivery target deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete delivery target");
    }
  };

  if (loading) {
    return (
      <div className="admin-automation__page">
        <header className="admin-automation__header">
          <h1 className="admin-automation__title">Workflow Automation</h1>
          <p className="admin-automation__subtitle">
            Manage automation rules, execution history, and delivery targets.
          </p>
        </header>
        <div className="admin-automation__loading">Loading automation data...</div>
      </div>
    );
  }

  if (error && rules.length === 0 && executions.length === 0) {
    return (
      <div className="admin-automation__page">
        <header className="admin-automation__header">
          <h1 className="admin-automation__title">Workflow Automation</h1>
        </header>
        <div className="admin-automation__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-automation__page">
      <header className="admin-automation__header">
        <h1 className="admin-automation__title">Workflow Automation</h1>
        <p className="admin-automation__subtitle">
          Manage automation rules, execution history, and delivery targets.
        </p>
      </header>

      {error && <div className="admin-automation__error">{error}</div>}
      {notice && <div className="admin-automation__notice">{notice}</div>}

      {/* ── Automation Rules ─────────────────────────────────────── */}
      <section className="admin-automation__card">
        <h2>Automation Rules</h2>
        <div className="admin-automation__rule-form">
          <input
            className="admin-automation__input"
            placeholder="Rule name"
            value={newRuleName}
            onChange={(e) => setNewRuleName(e.target.value)}
          />
          <input
            className="admin-automation__input"
            placeholder="Description (optional)"
            value={newRuleDescription}
            onChange={(e) => setNewRuleDescription(e.target.value)}
          />
          <select
            className="admin-automation__select"
            value={newRuleTriggerType}
            onChange={(e) => setNewRuleTriggerType(e.target.value)}
          >
            <option value="STORY_GENERATED">Story Generated</option>
            <option value="PAGE_PUBLISHED">Page Published</option>
            <option value="CALL_INGESTED">Call Ingested</option>
            <option value="ACCOUNT_CREATED">Account Created</option>
          </select>
          <select
            className="admin-automation__select"
            value={newRuleActionType}
            onChange={(e) => setNewRuleActionType(e.target.value)}
          >
            <option value="SEND_NOTIFICATION">Send Notification</option>
            <option value="WEBHOOK">Webhook</option>
            <option value="EMAIL">Email</option>
            <option value="SLACK">Slack</option>
          </select>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleCreateRule}
            disabled={saving || !newRuleName.trim()}
          >
            Create Rule
          </button>
        </div>
        {rules.length === 0 ? (
          <p>No automation rules configured.</p>
        ) : (
          <div className="admin-automation__table-wrap">
            <table className="admin-automation__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trigger</th>
                  <th>Action</th>
                  <th>Priority</th>
                  <th>Enabled</th>
                  <th>Last Triggered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <div className="admin-automation__rule-name">{rule.name}</div>
                      {rule.description && (
                        <div className="admin-automation__rule-desc">
                          {rule.description}
                        </div>
                      )}
                    </td>
                    <td>{rule.triggerType}</td>
                    <td>{rule.actionType}</td>
                    <td>{rule.priority}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => handleToggleRule(rule.id, rule.enabled)}
                      />
                    </td>
                    <td>
                      {rule.lastTriggeredAt
                        ? new Date(rule.lastTriggeredAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td className="admin-automation__actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Execution History ────────────────────────────────────── */}
      <section className="admin-automation__card">
        <h2>Execution History</h2>
        {executions.length === 0 ? (
          <p>No executions recorded.</p>
        ) : (
          <div className="admin-automation__table-wrap">
            <table className="admin-automation__table">
              <thead>
                <tr>
                  <th>Rule ID</th>
                  <th>Status</th>
                  <th>Duration (ms)</th>
                  <th>Error</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((exec) => (
                  <tr key={exec.id}>
                    <td>{exec.ruleId}</td>
                    <td>
                      <span
                        className={
                          "admin-automation__status-badge admin-automation__status-badge--" +
                          exec.status.toLowerCase()
                        }
                      >
                        {exec.status}
                      </span>
                    </td>
                    <td>{exec.durationMs ?? "—"}</td>
                    <td className="admin-automation__error-cell">
                      {exec.errorMessage ?? "—"}
                    </td>
                    <td>{new Date(exec.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Delivery Targets ─────────────────────────────────────── */}
      <section className="admin-automation__card">
        <h2>Delivery Targets</h2>
        <div className="admin-automation__target-form">
          <input
            className="admin-automation__input"
            placeholder="Target name"
            value={newTargetName}
            onChange={(e) => setNewTargetName(e.target.value)}
          />
          <select
            className="admin-automation__select"
            value={newTargetType}
            onChange={(e) => setNewTargetType(e.target.value)}
          >
            <option value="WEBHOOK">Webhook</option>
            <option value="SLACK">Slack</option>
            <option value="EMAIL">Email</option>
            <option value="MS_TEAMS">MS Teams</option>
          </select>
          <input
            className="admin-automation__input"
            placeholder="URL / Endpoint"
            value={newTargetUrl}
            onChange={(e) => setNewTargetUrl(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleCreateTarget}
            disabled={saving || !newTargetName.trim()}
          >
            Add Target
          </button>
        </div>
        {targets.length === 0 ? (
          <p>No delivery targets configured.</p>
        ) : (
          <div className="admin-automation__table-wrap">
            <table className="admin-automation__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Enabled</th>
                  <th>Last Used</th>
                  <th>Last Error</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id}>
                    <td>{target.name}</td>
                    <td>{target.targetType}</td>
                    <td>{target.enabled ? "Yes" : "No"}</td>
                    <td>
                      {target.lastUsedAt
                        ? new Date(target.lastUsedAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td className="admin-automation__error-cell">
                      {target.lastError ?? "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleDeleteTarget(target.id)}
                      >
                        Delete
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
