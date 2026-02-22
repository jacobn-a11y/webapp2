# Manual Data Requirements

This document describes what someone must prepare if they want to manually
populate StoryEngine with data instead of connecting a live integration
(Gong, Grain, Salesforce, Merge.dev, etc.).

It is derived entirely from how the system ingests and processes data
automatically — the same rules apply regardless of whether data arrives
via webhook or is entered by hand.

---

## The Core Data Flow

```
Accounts + Contacts      (who the customer is)
       ↓
Calls + Participants     (which meetings happened)
       ↓
Transcripts              (what was said)
       ↓
AI pipeline              (chunks → PII masking → tagging → embeddings)
       ↓
Stories + Landing Pages  (generated output)
```

Each layer depends on the one above it. You must populate them in order.

---

## 1. Accounts

An Account represents a customer company. Every story is ultimately
about one Account.

| Field           | Required | Description |
|-----------------|----------|-------------|
| `name`          | Yes      | Human-readable company name, e.g. `"Acme Corp"` |
| `normalizedName`| Derived  | Lowercase, suffixes stripped (Inc/Corp/LLC/Ltd/Co/Group/Holdings/PLC/GmbH). Computed automatically if entered through the API |
| `domain`        | Strongly recommended | The company's email domain, e.g. `"acme.com"`. This is the **primary entity resolution key** — without it the system falls back to fuzzy name matching |
| `industry`      | No       | Free text |
| `employeeCount` | No       | Integer |
| `annualRevenue` | No       | Float (USD) |

**Why `domain` matters so much:** The entity resolution service tries to
link call participants to accounts by matching participant email domains
(e.g. `john@acme.com` → domain `acme.com`) against `Account.domain`.
A successful domain match scores 0.95 confidence. Fuzzy name matching is
capped at 0.75 and is considerably less reliable.

You can also add domain aliases via `AccountDomain` records if a company
uses multiple email domains (e.g. `acme.com` and `acme.co.uk`).

---

## 2. Contacts

Contacts are individuals at an Account. They are optional but improve
entity resolution reliability.

| Field         | Required | Description |
|---------------|----------|-------------|
| `accountId`   | Yes      | The Account this person belongs to |
| `email`       | Yes      | Business email address (lowercase). Must be unique per account |
| `emailDomain` | Derived  | Extracted from `email` |
| `name`        | No       | Full name |
| `title`       | No       | Job title |
| `phone`       | No       | Phone number |

**Free email domains are ignored for entity resolution** — the following
domains (and others) are excluded: gmail.com, yahoo.com, hotmail.com,
outlook.com, aol.com, icloud.com, protonmail.com, live.com, and similar.
Only corporate/business email domains are used for matching.

---

## 3. Calls

A Call represents a single recorded meeting. Transcripts are attached to
calls; stories are generated from the transcripts of all calls linked to
an account.

| Field           | Required | Description |
|-----------------|----------|-------------|
| `occurredAt`    | Yes      | ISO 8601 datetime of when the call happened. Used for chronological ordering in the merged transcript |
| `provider`      | Yes      | Must be one of the valid enum values (see below) |
| `title`         | No       | Meeting title. Used as a secondary fuzzy signal in entity resolution if participant emails are unavailable |
| `accountId`     | Conditional | Link directly if you know the account. If omitted, entity resolution will attempt to infer it from participant emails |
| `duration`      | No       | Duration in **seconds** (integer). Displayed in the merged transcript document header |
| `recordingUrl`  | No       | URL to the recording file |

**Valid `provider` values:**
`GONG`, `GRAIN`, `CHORUS`, `ZOOM`, `GOOGLE_MEET`, `TEAMS`, `FIREFLIES`,
`DIALPAD`, `AIRCALL`, `RINGCENTRAL`, `SALESLOFT`, `OUTREACH`, `OTHER`

Use `OTHER` for any source that doesn't map to a named provider.

---

## 4. Call Participants

Participants are the attendees of a call. They are the **primary mechanism
for linking a call to an Account** when `accountId` is not set directly.

| Field     | Required | Description |
|-----------|----------|-------------|
| `callId`  | Yes      | The call this person attended |
| `email`   | Recommended | Business email address. The system extracts the domain and matches it against known Account domains and Contact records |
| `name`    | No       | Display name. Used as tertiary fuzzy matching signal |
| `isHost`  | No       | Boolean, defaults to `false`. Hosts are shown in bold in the merged transcript |

**At minimum, include one non-host participant with a business email
address** if you want reliable automatic account linking. Otherwise, set
`accountId` directly on the Call.

**Entity resolution confidence levels:**
- Account.domain match → **0.95**
- AccountDomain alias match → **0.90**
- Contact.emailDomain match → **0.85**
- Fuzzy name match → **up to 0.75**
- No match → routed to manual review queue

---

## 5. Transcripts

The transcript is the actual content from which stories are generated.
This is the most important input.

| Field       | Required | Description |
|-------------|----------|-------------|
| `callId`    | Yes      | The call this transcript belongs to. One-to-one |
| `fullText`  | Yes      | The full transcript text. Plain text, no required encoding |
| `wordCount` | Derived  | Computed by splitting on whitespace |
| `language`  | No       | ISO 639-1 language code, defaults to `"en"` |

### What makes a useful transcript

The AI pipeline (chunking → tagging → story generation → quote extraction)
works best when the transcript has these characteristics:

**Speaker attribution** — prefix each turn with the speaker's name or
role in square brackets:
```
[Sales Rep]: Can you walk us through the results since going live?

[VP of Operations]: We've reduced processing time by 40% and saved
roughly $200,000 in the first quarter alone.
```
Without speaker labels, quotes cannot be attributed to a role, which
weakens the output quality.

**Quantified outcomes** — the quote extraction AI specifically hunts for
statements containing numbers, percentages, dollar amounts, time savings,
or measurable improvements. Every quantified claim the customer made
should appear in the transcript verbatim. Transcripts with no metrics
will yield no high-value quotes.

**Complete sentences** — the chunker splits on sentence-ending punctuation
(`.!?`). Use normal punctuation throughout.

**Sufficient length** — the chunker targets ~1,500 character chunks with
200-character overlap. Very short transcripts (a few hundred words or
fewer) produce only a single chunk, which limits tagging coverage.

**Coverage across funnel stages** — the richer the story, the more funnel
stages are represented. The taxonomy spans:

| Stage | What it covers |
|-------|---------------|
| TOFU | Awareness: industry trends, digital transformation, compliance pain points |
| MOFU | Evaluation: product deep-dives, competitive displacement, integrations, security, TCO |
| BOFU | Decision: ROI, operational metrics, executive impact, risk mitigation, procurement |
| POST_SALE | Expansion: renewals, upsell, success stories, training, co-innovation |
| INTERNAL | Internal use: sales enablement, deal anatomy, lessons learned, customer health |
| VERTICAL | Segment-specific: industry use cases, persona framing, regulated industries |

Transcripts from multiple stages across the account lifecycle produce the
fullest stories.

### Transcript processing pipeline (automatic)

Once stored, the system automatically:
1. Splits into ~1,500 character chunks preserving sentence boundaries
2. Applies PII masking (emails, phone numbers, SSNs, credit cards, IP
   addresses, dates of birth, street addresses) — only masked text is
   sent to any AI model
3. Tags each chunk with one or more taxonomy topics and a confidence score
4. Generates vector embeddings and indexes in Pinecone for RAG retrieval

You do not need to pre-chunk, pre-mask, or pre-tag. Store the raw full
transcript text and the pipeline handles the rest.

---

## 6. CRM Events (Optional)

If you want the account journey view to reflect deal progression, you can
manually create `SalesforceEvent` records. These are not required for
story generation but enrich the account timeline.

| Field           | Required | Description |
|-----------------|----------|-------------|
| `accountId`     | Yes      | The account this event belongs to |
| `eventType`     | Yes      | One of: `OPPORTUNITY_CREATED`, `OPPORTUNITY_STAGE_CHANGE`, `CLOSED_WON`, `CLOSED_LOST`, `CONTACT_CREATED`, `LEAD_CONVERTED`, `TASK_COMPLETED`, `NOTE_ADDED` |
| `stageName`     | No       | Pipeline stage name |
| `amount`        | No       | Deal value (float) |
| `closeDate`     | No       | ISO 8601 date |
| `description`   | No       | Free text note |

---

## 7. Organization Story Context (Optional but High-Impact)

This is a JSON blob stored at the Organization level
(`OrgSettings.storyContext`). The story generation AI reads this to
ground its output in your company's specific context. Without it, the AI
writes for a generic B2B SaaS audience.

| Key                    | Description |
|------------------------|-------------|
| `companyOverview`      | Who the vendor is |
| `valueProposition`     | Core value pitch |
| `products`             | Product/solution names (array of strings) |
| `targetPersonas`       | Buyer persona types (array) |
| `targetIndustries`     | Vertical focus areas (array) |
| `differentiators`      | What sets the vendor apart (array) |
| `competitiveAdvantages`| Advantages over named competitors (array) |
| `proofPoints`          | Pre-approved statistics to include if supported by transcript (array) |
| `keyMetrics`           | Metrics the company tracks and values (array) |
| `customerSegments`     | Market segments served (array) |
| `bannedClaims`         | Claims never to assert unless verbatim in transcript (array) |
| `approvedTerminology`  | Preferred vocabulary over generic alternatives (array) |
| `brandVoice`           | Tone description (string) |
| `writingStyleGuide`    | Writing conventions (string) |
| `callToAction`         | Preferred CTA for external-facing stories (string) |

---

## 8. Minimum Viable Dataset for One Story

To generate a single story for one customer account:

1. **One Account** record — with `domain` set if at all possible
2. **One or more Calls** — with `occurredAt` set; `provider` can be `OTHER`
3. **Participants** on each call — at least one with a business email
   matching the account domain, **or** set `accountId` directly on the call
4. **One Transcript per call** — plain text, ideally with speaker labels
   and at least one quantified outcome statement

That is the minimum. The story quality improves substantially with:
- More calls covering more funnel stages
- Speaker attribution throughout
- Quantified metrics (numbers, percentages, dollar amounts)
- Organization story context configured

---

## 9. What the System Does Automatically

These steps happen automatically once transcript text is stored — you do
not need to provide this data manually:

- **Chunking** — transcript split into ~1,500 character segments with
  200-character overlap at sentence boundaries
- **PII masking** — emails, phones, SSNs, credit cards, IPs, DOBs,
  addresses redacted before any AI call
- **Taxonomy tagging** — each chunk classified against the 42-topic
  funnel taxonomy with a confidence score
- **Embedding generation** — chunks embedded (OpenAI `text-embedding-3-small`)
  and indexed in Pinecone
- **Entity resolution** — call participants matched to CRM accounts via
  email domain → fuzzy name fallback
- **Story generation** — all transcripts for an account merged
  chronologically (up to 600,000 words / ~1M tokens), then summarized
  into a structured Markdown case study
- **Quote extraction** — AI identifies all quantified-value quotes,
  attributing them to speaker and call
