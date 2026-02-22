# StoryEngine — System Architecture

## Overview

StoryEngine consolidates call recordings from 10+ providers (Gong, Chorus, Zoom,
Fireflies, etc.) and Google Meet into a unified **Account Journey** view. It syncs
with Salesforce/HubSpot to resolve inconsistent naming and extracts high-value
customer stories tagged against a B2B sales-funnel taxonomy.

---

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RECORDING SOURCES                                │
│  Gong · Chorus · Zoom · Google Meet · Fireflies · Teams · Dialpad ...  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         MERGE.DEV UNIFIED API                           │
│                                                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │  Video/Conferencing  │    │     CRM (HRIS)       │                    │
│  │  Unified Model       │    │  Salesforce/HubSpot  │                    │
│  └─────────┬───────────┘    └──────────┬───────────┘                    │
└────────────┼───────────────────────────┼────────────────────────────────┘
             │  Webhooks                 │  Webhooks + Polling
             ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      STORYENGINE BACKEND (Node.js / Express)            │
│                                                                          │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────────┐   │
│  │   Webhook     │   │  Entity          │   │  PII Masking           │   │
│  │   Receiver    │──▶│  Resolution      │   │  Middleware             │   │
│  │  (Merge.dev)  │   │  (Email Domain + │   │  (Pre-LLM Redaction)   │   │
│  └──────────────┘   │   Fuzzy Match)   │   └───────────┬────────────┘   │
│                      └────────┬─────────┘               │                │
│                               │                         │                │
│                      Resolved │ Account_ID              │                │
│                               ▼                         ▼                │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                    AI PROCESSING PIPELINE (BullMQ)               │    │
│  │                                                                  │    │
│  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │    │
│  │  │  Transcript   │  │  Taxonomy      │  │  Embedding           │  │    │
│  │  │  Chunking     │──▶  Tagger        │──▶  Generator           │  │    │
│  │  │              │  │  (LLM)         │  │  (text-embedding-3)  │  │    │
│  │  └──────────────┘  └───────────────┘  └──────────┬───────────┘  │    │
│  └──────────────────────────────────────────────────┼──────────────┘    │
│                                                      │                   │
│  ┌──────────────────┐  ┌─────────────────┐          │                   │
│  │  Story Builder    │  │  RAG Endpoint    │◀─────────┤                   │
│  │  (Prompt Chain)   │  │  /api/rag/query  │          │                   │
│  └────────┬─────────┘  └─────────────────┘          │                   │
│           │                                          │                   │
│           ▼                                          ▼                   │
│  ┌──────────────┐                          ┌─────────────────┐          │
│  │  Markdown     │                          │  Pinecone        │          │
│  │  Output       │                          │  Vector DB       │          │
│  └──────────────┘                          └─────────────────┘          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    MIDDLEWARE LAYER                                 │  │
│  │  WorkOS Auth │ Stripe Billing │ Free Trial Gate │ Rate Limiter     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
             │                                          │
             ▼                                          ▼
┌──────────────────────┐                    ┌──────────────────────┐
│   PostgreSQL (Prisma) │                    │  Third-Party          │
│                        │                    │  Chatbot Connector    │
│  Accounts · Contacts   │                    │  (via RAG API)        │
│  Calls · Transcripts   │                    └──────────────────────┘
│  Tags · SF Events      │
│  Organizations · Users │
└──────────────────────┘
```

## 2. Data Flow — Recording to Story

```
1. INGEST    Zoom/Gong creates a recording
                 ↓
2. WEBHOOK   Merge.dev fires POST /api/webhooks/merge
                 ↓
3. RESOLVE   Entity Resolution matches call participants
             to CRM Account_ID via email domain + fuzzy name
                 ↓
4. STORE     Call + Transcript persisted to PostgreSQL
                 ↓
5. MASK      PII Redactor strips emails, phone numbers,
             SSNs before any LLM call
                 ↓
6. TAG       LLM classifies each transcript chunk against
             the taxonomy (ToFu / MoFu / BoFu / Post-Sale / Internal)
                 ↓
7. EMBED     text-embedding-3-small generates vectors;
             stored in Pinecone with Account_ID metadata
                 ↓
8. BUILD     Story Builder prompt chain assembles
             structured Markdown per Account
                 ↓
9. SERVE     RAG endpoint answers queries from chatbots;
             Account Journey UI renders the timeline
```

## 3. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Unified API | Merge.dev | Handles 10+ recording providers + CRM in one integration layer |
| Auth | WorkOS | Native Google SSO, email/password, org-level SAML for enterprise |
| Vector DB | Pinecone | Managed, scales independently of PostgreSQL |
| Queue | BullMQ + Redis | Async processing of transcripts prevents webhook timeouts |
| LLM | OpenAI GPT-4o, Anthropic Claude, Google Gemini | Configurable per-org; unified AIClient interface for taxonomy tagging, story generation, and RAG |
| Billing | Stripe | Usage-based metering on transcript minutes processed |
| Entity Resolution | Email domain primary, Fuse.js fuzzy secondary | Email domain is the most reliable signal across inconsistent naming |

## 4. Taxonomy Tags

Calls are tagged against a comprehensive B2B case-study taxonomy:

- **Top of Funnel (ToFu)**: Industry trends, problem identification, digital transformation, compliance, market expansion, thought leadership
- **Mid-Funnel (MoFu)**: Feature deep-dives, competitive displacement, integration, onboarding, security, customization, multi-product, TCO, pilots
- **Bottom of Funnel (BoFu)**: ROI, operational metrics, executive impact, risk mitigation, deployment speed, vendor selection, procurement
- **Post-Sale**: Renewal, upsell, CS experience, training, community, co-innovation, change management, scaling, governance
- **Internal**: Sales enablement, lessons learned, cross-functional, VoC, pricing validation, churn saves, deal anatomy, health trajectory, reference-ability

See `src/types/taxonomy.ts` for the full enumeration.

## 5. Landing Pages & Story Publishing

Reps can generate editable Markdown stories from AI output, then publish them as
standalone landing pages.

### Flow

```
Story Builder → Editable Draft → Rep edits on screen → Publish
                                                         │
                     ┌───────────────────────────────────┤
                     │                                   │
                  [Named]                          [Scrubbed]
               (Admin-only)                    (Default for all)
                     │                                   │
          Company name + "Name,              Company scrubbed,
          Title, Company" quotes            "a senior exec at
          e.g., "Jeff Bezos,                the client" quotes
          CEO, Amazon"                               │
                     │                                   │
                     └──────────┬────────────────────────┘
                                │
                          Published at /s/{slug}
                          • noindex, nofollow
                          • Floating AI badge
                          • Callout boxes
                          • Password-optional
                          • Private or shared link
```

### Permission Model

| Permission | Who | Description |
|---|---|---|
| CREATE_LANDING_PAGE | Granted by admin | Can create drafts from stories |
| PUBLISH_LANDING_PAGE | Granted by admin | Can publish scrubbed (anonymous) pages |
| PUBLISH_NAMED_LANDING_PAGE | Admin-only grant | Can publish with real company name |
| EDIT_ANY_LANDING_PAGE | Granted by admin | Can edit pages they didn't create |
| DELETE_ANY_LANDING_PAGE | Granted by admin | Can delete any page |

### Account Access Scoping

Admins can restrict which accounts a user can generate pages for:

- **ALL_ACCOUNTS** — unrestricted (default for admins)
- **SINGLE_ACCOUNT** — one specific CRM account
- **ACCOUNT_LIST** — manually curated list of account IDs
- **CRM_REPORT** — defined by a Salesforce Report or HubSpot List (synced periodically)

### Company Scrubbing

The scrubber removes:
1. Company name + all variations (abbreviations, normalized forms)
2. Contact names + titles → anonymized by seniority level
3. Email domains → `[client-domain]`
4. Domain aliases

Quote attribution format:
- **Named pages**: "Jeff Bezos, CEO, Amazon"
- **Scrubbed pages**: "a senior executive at the client"

See `src/services/company-scrubber.ts` for implementation.

## 6. Enterprise Services

### Policy Engine (`src/services/policy-engine.ts`)

Comprehensive RBAC/ABAC engine with 70+ namespaced `PolicyAction` types (e.g., `story:generate`, `page:create`, `admin:manage_permissions`). Features:
- Full `BASE_ROLE_PERMISSIONS` matrix for OWNER/ADMIN/MEMBER/VIEWER roles
- MFA enforcement for sensitive actions
- Batch policy evaluation
- Deny telemetry buffering for security analytics
- Role profile caching with 60-second TTL

### Data Governance (`src/services/data-governance.ts`)

Full data governance service with:
- Retention policy CRUD and automated retention job execution
- Legal hold management (create/release)
- Deletion request workflow with approval/rejection
- Backward-compatible standalone `getDataGovernancePolicy()` and `isLegalHoldEnabled()` exports

### Workflow Automation (`src/services/workflow-automation.ts`)

Event-driven automation engine supporting:
- Trigger types: event-based, threshold-based, cron-scheduled
- Action types: Slack, email, webhook, in-app notifications
- Rule CRUD with cooldown and daily limit enforcement
- Template variable interpolation (`{{variable}}` substitution)
- Delivery target management

### Integration Reliability (`src/services/integration-reliability.ts`)

Integration health management with:
- Run ledger tracking per provider
- Dead-letter queue (DLQ) management with retry policies
- Provider-specific retry policies with jitter/backoff (Gong, Grain, Salesforce, Merge.dev)
- Health dashboard aggregation
- Backfill support and idempotency key generation

## 7. Middleware

### Cache Control (`src/middleware/cache-control.ts`)

Factory-based HTTP cache headers with presets:
- `dashboardCache` (60s), `configCache` (300s), `staticCache` (3600s)
- `noCache()` for sensitive endpoints

### Pagination (`src/middleware/pagination.ts`)

Standard pagination utilities:
- `parsePagination()` for request parsing
- `paginatedResponse<T>()` for consistent response format
- `prismaPaginationArgs()` supporting both cursor and offset-based pagination

## 8. Story Builder — Advanced Features

The Story Builder (`src/services/story-builder.ts`) combines rich prompt engineering with lineage tracking:

**Prompt Engineering:**
- 10-rule system prompt covering evidence-only writing, quantification, attribution, confidentiality, and audience framing
- 40+ story type prompt guides mapped to the full B2B taxonomy
- 7 format-specific guides (before/after, day-in-the-life, by-the-numbers, video soundbite, webinar, reference call, analyst study)
- 9 target audience personas (CTO, CFO, CEO, VP Sales, VP Marketing, End User, Procurement, IT/Security, Board/Investor)
- 4 confidentiality levels (External Public, External Gated, Internal Only, Sales Enablement)

**Lineage Tracking:**
- `confidenceScore` computed per story and per quote
- `lineageSummary` recording calls considered, segments used, model version
- `storyClaimLineage` records linking each quote back to source call, chunk, and timestamp
- `lineageMetadata` on `HighValueQuote` records for full traceability

## 9. Admin Pages

| Page | Route | Purpose |
|------|-------|---------|
| Permissions | `/admin/permissions` | RBAC permission management |
| Roles | `/admin/roles` | Role profile configuration |
| Story Context | `/admin/story-context` | Organization-level story generation settings |
| Audit Logs | `/admin/audit-logs` | Security and change audit trail |
| Ops Diagnostics | `/admin/ops` | System health and diagnostics |
| Security Policy | `/admin/security` | Security policy configuration |
| Data Governance | `/admin/governance` | Retention, legal holds, deletion requests |
| Publish Approvals | `/admin/publish-approvals` | Content approval workflow |
| Data Quality | `/admin/data-quality` | Data quality monitoring |
| Setup Wizard | `/admin/setup` | Guided onboarding |
| Billing | `/admin/billing` | Billing readiness and management |
| KPIs | `/admin/kpis` | Pipeline, content, and team metrics with executive reporting |
| Disaster Recovery | `/admin/dr` | DR status, validation checks, export manifests |
| Support | `/admin/support` | Org overview, user management, feature flags, diagnostics |
