import { useEffect, useState } from "react";
import {
  getStoryContextSettings,
  updateStoryContextSettings,
  type StoryContextSettings,
} from "../lib/api";
import {
  STORY_FORMAT_LABELS,
  STORY_LENGTH_LABELS,
  STORY_OUTLINE_LABELS,
  STORY_TYPE_INPUT_LABELS,
  TARGET_AUDIENCE_LABELS,
  CONFIDENTIALITY_LEVEL_LABELS,
} from "../types/taxonomy";

const EMPTY_SETTINGS: StoryContextSettings = {
  company_overview: "",
  products: [],
  target_personas: [],
  target_industries: [],
  differentiators: [],
  proof_points: [],
  banned_claims: [],
  writing_style_guide: "",
  approved_terminology: [],
  value_proposition: "",
  competitive_advantages: [],
  key_metrics: [],
  customer_segments: [],
  brand_voice: "",
  call_to_action: "",
  default_story_length: "MEDIUM",
  default_story_outline: "CHRONOLOGICAL_JOURNEY",
  default_story_format: null,
  default_story_type: "FULL_ACCOUNT_JOURNEY",
  default_target_audience: "auto",
  default_confidentiality_level: "EXTERNAL_PUBLIC",
};

function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AdminStoryContextPage() {
  const [settings, setSettings] = useState<StoryContextSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [productsCsv, setProductsCsv] = useState("");
  const [personasCsv, setPersonasCsv] = useState("");
  const [industriesCsv, setIndustriesCsv] = useState("");
  const [differentiatorsCsv, setDifferentiatorsCsv] = useState("");
  const [proofPointsCsv, setProofPointsCsv] = useState("");
  const [bannedClaimsCsv, setBannedClaimsCsv] = useState("");
  const [terminologyCsv, setTerminologyCsv] = useState("");
  const [competitiveAdvCsv, setCompetitiveAdvCsv] = useState("");
  const [keyMetricsCsv, setKeyMetricsCsv] = useState("");
  const [segmentsCsv, setSegmentsCsv] = useState("");

  useEffect(() => {
    getStoryContextSettings()
      .then((data) => {
        setSettings(data);
        setProductsCsv(data.products.join(", "));
        setPersonasCsv(data.target_personas.join(", "));
        setIndustriesCsv(data.target_industries.join(", "));
        setDifferentiatorsCsv(data.differentiators.join(", "));
        setProofPointsCsv(data.proof_points.join(", "));
        setBannedClaimsCsv(data.banned_claims.join(", "));
        setTerminologyCsv(data.approved_terminology.join(", "));
        setCompetitiveAdvCsv(data.competitive_advantages.join(", "));
        setKeyMetricsCsv(data.key_metrics.join(", "));
        setSegmentsCsv(data.customer_segments.join(", "));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    const payload: StoryContextSettings = {
      ...settings,
      products: splitCsv(productsCsv),
      target_personas: splitCsv(personasCsv),
      target_industries: splitCsv(industriesCsv),
      differentiators: splitCsv(differentiatorsCsv),
      proof_points: splitCsv(proofPointsCsv),
      banned_claims: splitCsv(bannedClaimsCsv),
      approved_terminology: splitCsv(terminologyCsv),
      competitive_advantages: splitCsv(competitiveAdvCsv),
      key_metrics: splitCsv(keyMetricsCsv),
      customer_segments: splitCsv(segmentsCsv),
    };
    try {
      await updateStoryContextSettings(payload);
      setNotice("Story context saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="admin-story-context__page">Loading story context...</div>;
  }

  return (
    <div className="admin-story-context__page">
      <header>
        <h1 className="admin-story-context__title">Story Context & Prompt Settings</h1>
        <p className="admin-story-context__subtitle">
          Configure your company and product context to inform AI-generated stories. These settings shape the tone, focus, and accuracy of every case study.
        </p>
      </header>

      {error && <div className="admin-story-context__error">{error}</div>}
      {notice && <div className="admin-story-context__notice">{notice}</div>}

      {/* ── Company Identity ─────────────────────────────────────────── */}
      <section className="admin-story-context__card">
        <h2>Company Identity</h2>
        <p className="admin-story-context__card-desc">
          Core information about your company that provides foundation context for all generated stories.
        </p>
        <label>
          Company Overview
          <textarea
            value={settings.company_overview}
            onChange={(e) =>
              setSettings((p) => ({ ...p, company_overview: e.target.value }))
            }
            rows={5}
            placeholder="Describe your company, what you do, and who you serve. This is the most important context for story generation."
          />
        </label>
        <label>
          Value Proposition
          <textarea
            value={settings.value_proposition}
            onChange={(e) =>
              setSettings((p) => ({ ...p, value_proposition: e.target.value }))
            }
            rows={3}
            placeholder="Your core value proposition — the primary reason customers choose you. Used to frame the 'why' in customer stories."
          />
        </label>
        <label>
          Products / Solutions (comma-separated)
          <input value={productsCsv} onChange={(e) => setProductsCsv(e.target.value)} placeholder="e.g., Platform Pro, Analytics Suite, Integration Hub" />
        </label>
        <label>
          Brand Voice
          <textarea
            value={settings.brand_voice}
            onChange={(e) =>
              setSettings((p) => ({ ...p, brand_voice: e.target.value }))
            }
            rows={2}
            placeholder="Describe your brand voice: e.g., 'Professional but approachable, data-driven, avoids jargon'"
          />
        </label>
      </section>

      {/* ── Market Positioning ───────────────────────────────────────── */}
      <section className="admin-story-context__card">
        <h2>Market Positioning</h2>
        <p className="admin-story-context__card-desc">
          How you position in the market. Used to frame competitive narratives and buyer-facing stories.
        </p>
        <label>
          Key Differentiators (comma-separated)
          <input
            value={differentiatorsCsv}
            onChange={(e) => setDifferentiatorsCsv(e.target.value)}
            placeholder="e.g., Only platform with native AI, 50% faster deployment, No-code customization"
          />
        </label>
        <label>
          Competitive Advantages (comma-separated)
          <input
            value={competitiveAdvCsv}
            onChange={(e) => setCompetitiveAdvCsv(e.target.value)}
            placeholder="e.g., Lower TCO than Competitor X, Better integration ecosystem, Superior support SLAs"
          />
        </label>
        <label>
          Customer Segments (comma-separated)
          <input
            value={segmentsCsv}
            onChange={(e) => setSegmentsCsv(e.target.value)}
            placeholder="e.g., Mid-market SaaS, Enterprise Financial Services, Healthcare 200-2000 employees"
          />
        </label>
        <label>
          Target Industries (comma-separated)
          <input value={industriesCsv} onChange={(e) => setIndustriesCsv(e.target.value)} placeholder="e.g., Healthcare, Financial Services, Manufacturing, Technology" />
        </label>
        <label>
          Target Buyer Personas (comma-separated)
          <input value={personasCsv} onChange={(e) => setPersonasCsv(e.target.value)} placeholder="e.g., VP of Sales, CTO, Head of RevOps, Marketing Director" />
        </label>
      </section>

      {/* ── Evidence & Proof Points ──────────────────────────────────── */}
      <section className="admin-story-context__card">
        <h2>Evidence & Proof Points</h2>
        <p className="admin-story-context__card-desc">
          Approved proof points and metrics that can be referenced when supported by transcript evidence.
        </p>
        <label>
          Approved Proof Points (comma-separated)
          <input value={proofPointsCsv} onChange={(e) => setProofPointsCsv(e.target.value)} placeholder="e.g., 3x pipeline growth, 40% faster onboarding, 99.9% uptime SLA" />
        </label>
        <label>
          Key Metrics Your Company Tracks (comma-separated)
          <input
            value={keyMetricsCsv}
            onChange={(e) => setKeyMetricsCsv(e.target.value)}
            placeholder="e.g., Time-to-value, NPS, ARR growth, Churn rate, Deployment velocity"
          />
        </label>
        <label>
          Default Call to Action
          <input
            value={settings.call_to_action}
            onChange={(e) =>
              setSettings((p) => ({ ...p, call_to_action: e.target.value }))
            }
            placeholder="e.g., Schedule a demo at example.com/demo"
          />
        </label>
      </section>

      {/* ── Content Guardrails ───────────────────────────────────────── */}
      <section className="admin-story-context__card">
        <h2>Content Guardrails</h2>
        <p className="admin-story-context__card-desc">
          Rules and constraints for generated content. These prevent the AI from making unsupported claims.
        </p>
        <label>
          Banned Claims (comma-separated)
          <input value={bannedClaimsCsv} onChange={(e) => setBannedClaimsCsv(e.target.value)} placeholder="Claims the AI should never make unless explicitly stated in transcripts" />
        </label>
        <label>
          Approved Terminology (comma-separated)
          <input value={terminologyCsv} onChange={(e) => setTerminologyCsv(e.target.value)} placeholder="Preferred terms to use instead of generic alternatives" />
        </label>
        <label>
          Writing Style Guide
          <textarea
            value={settings.writing_style_guide}
            onChange={(e) =>
              setSettings((p) => ({ ...p, writing_style_guide: e.target.value }))
            }
            rows={4}
            placeholder="Detailed writing style instructions: tone, vocabulary, sentence structure preferences, formatting rules, etc."
          />
        </label>
      </section>

      {/* ── Default Generation Settings ──────────────────────────────── */}
      <section className="admin-story-context__card">
        <h2>Default Generation Settings</h2>
        <p className="admin-story-context__card-desc">
          Default values pre-populated when users generate new stories. Users can override per-story.
        </p>
        <label>
          Default Story Length
          <select
            value={settings.default_story_length}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                default_story_length: e.target.value as StoryContextSettings["default_story_length"],
              }))
            }
          >
            {Object.entries(STORY_LENGTH_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Default Story Outline
          <select
            value={settings.default_story_outline}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                default_story_outline: e.target.value as StoryContextSettings["default_story_outline"],
              }))
            }
          >
            {Object.entries(STORY_OUTLINE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Default Story Format
          <select
            value={settings.default_story_format ?? ""}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                default_story_format: (e.target.value || null) as StoryContextSettings["default_story_format"],
              }))
            }
          >
            <option value="">Auto</option>
            {Object.entries(STORY_FORMAT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Default Story Type
          <select
            value={settings.default_story_type}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                default_story_type: e.target.value as StoryContextSettings["default_story_type"],
              }))
            }
          >
            {Object.entries(STORY_TYPE_INPUT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Default Target Audience
          <select
            value={settings.default_target_audience}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                default_target_audience: e.target.value as StoryContextSettings["default_target_audience"],
              }))
            }
          >
            {Object.entries(TARGET_AUDIENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Default Confidentiality Level
          <select
            value={settings.default_confidentiality_level}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                default_confidentiality_level: e.target.value as StoryContextSettings["default_confidentiality_level"],
              }))
            }
          >
            {Object.entries(CONFIDENTIALITY_LEVEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="admin-story-context__actions">
        <button className="btn btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
