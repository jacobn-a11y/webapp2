import { useEffect, useState } from "react";
import {
  getOnboardingProgress,
  completeOnboardingStep,
  initializeOnboarding,
  getOrgHealthScore,
  calculateOrgHealthScore,
  type OnboardingStep,
  type OrgHealthScore,
} from "../lib/api";

export function AdminOnboardingPage() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [healthScore, setHealthScore] = useState<OrgHealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [progressRes, healthRes] = await Promise.all([
        getOnboardingProgress(),
        getOrgHealthScore(),
      ]);
      setSteps(progressRes.steps.sort((a, b) => a.sortOrder - b.sortOrder));
      setHealthScore(healthRes.score);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load onboarding data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCompleteStep = async (stepKey: string) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await completeOnboardingStep(stepKey);
      setSteps((prev) =>
        prev.map((s) => (s.stepKey === stepKey ? res.step : s))
      );
      setNotice("Step marked as complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete step");
    } finally {
      setSaving(false);
    }
  };

  const handleInitialize = async () => {
    if (!window.confirm("Initialize onboarding? This will reset all steps.")) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await initializeOnboarding();
      setSteps(res.steps.sort((a, b) => a.sortOrder - b.sortOrder));
      setNotice("Onboarding initialized.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize onboarding");
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await calculateOrgHealthScore();
      setHealthScore(res.score);
      setNotice("Health score recalculated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate health score");
    } finally {
      setSaving(false);
    }
  };

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="admin-onboarding__page">
        <header className="admin-onboarding__header">
          <h1 className="admin-onboarding__title">Onboarding & Org Health</h1>
          <p className="admin-onboarding__subtitle">
            Track onboarding progress and monitor organization health.
          </p>
        </header>
        <div className="admin-onboarding__loading">Loading onboarding data...</div>
      </div>
    );
  }

  if (error && steps.length === 0 && !healthScore) {
    return (
      <div className="admin-onboarding__page">
        <header className="admin-onboarding__header">
          <h1 className="admin-onboarding__title">Onboarding & Org Health</h1>
        </header>
        <div className="admin-onboarding__error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-onboarding__page">
      <header className="admin-onboarding__header">
        <h1 className="admin-onboarding__title">Onboarding & Org Health</h1>
        <p className="admin-onboarding__subtitle">
          Track onboarding progress and monitor organization health.
        </p>
      </header>

      {error && <div className="admin-onboarding__error">{error}</div>}
      {notice && <div className="admin-onboarding__notice">{notice}</div>}

      {/* ── Onboarding Checklist ─────────────────────────────────── */}
      <section className="admin-onboarding__card">
        <div className="admin-onboarding__card-header">
          <h2>Onboarding Checklist</h2>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleInitialize}
            disabled={saving}
          >
            Reset / Initialize
          </button>
        </div>

        {steps.length === 0 ? (
          <p>No onboarding steps found. Click "Reset / Initialize" to set up onboarding.</p>
        ) : (
          <>
            <div className="admin-onboarding__progress">
              <div className="admin-onboarding__progress-bar">
                <div
                  className="admin-onboarding__progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="admin-onboarding__progress-label">
                {completedCount} / {totalCount} steps completed ({progressPercent}%)
              </span>
            </div>

            <div className="admin-onboarding__table-wrap">
              <table className="admin-onboarding__table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Step</th>
                    <th>Status</th>
                    <th>Completed At</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step) => (
                    <tr
                      key={step.id}
                      className={
                        step.completed ? "admin-onboarding__row--completed" : ""
                      }
                    >
                      <td>{step.sortOrder}</td>
                      <td>
                        <div className="admin-onboarding__step-name">
                          {step.stepName}
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            "admin-onboarding__status-badge admin-onboarding__status-badge--" +
                            (step.completed ? "done" : "pending")
                          }
                        >
                          {step.completed ? "Completed" : "Pending"}
                        </span>
                      </td>
                      <td>
                        {step.completedAt
                          ? new Date(step.completedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        {!step.completed && (
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={() => handleCompleteStep(step.stepKey)}
                            disabled={saving}
                          >
                            Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── Org Health Score ──────────────────────────────────────── */}
      <section className="admin-onboarding__card">
        <div className="admin-onboarding__card-header">
          <h2>Org Health Score</h2>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleRecalculate}
            disabled={saving}
          >
            Recalculate
          </button>
        </div>

        {healthScore ? (
          <div className="admin-onboarding__health">
            <div className="admin-onboarding__health-overall">
              <span className="admin-onboarding__health-score">
                {healthScore.overallScore}
              </span>
              <span className="admin-onboarding__health-label">Overall Score</span>
              {healthScore.trend && (
                <span className="admin-onboarding__health-trend">
                  Trend: {healthScore.trend}
                </span>
              )}
              <span className="admin-onboarding__health-date">
                Calculated: {new Date(healthScore.calculatedAt).toLocaleString()}
              </span>
            </div>

            <h3>Dimension Breakdown</h3>
            <div className="admin-onboarding__table-wrap">
              <table className="admin-onboarding__table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(healthScore.dimensions).map(([name, score]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>
                        <div className="admin-onboarding__dimension-score">
                          <div className="admin-onboarding__dimension-bar">
                            <div
                              className="admin-onboarding__dimension-fill"
                              style={{ width: `${Math.min(score, 100)}%` }}
                            />
                          </div>
                          <span>{score}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p>
            No health score available. Click "Recalculate" to compute your organization
            health score.
          </p>
        )}
      </section>
    </div>
  );
}
