/**
 * Markdown Story Builder
 *
 * Prompt-chaining function that:
 *  1. Takes all transcripts associated with an Account_ID
 *  2. Filters by specific taxonomy tags (e.g., "Onboarding," "ROI")
 *  3. Summarizes the journey into a structured Markdown document
 *  4. Extracts "High-Value Quotes" (specifically looking for quantified value)
 */

import OpenAI from "openai";
import type { PrismaClient, FunnelStage, StoryType } from "@prisma/client";
import { TOPIC_LABELS, type TaxonomyTopic } from "../types/taxonomy.js";
import { TranscriptMerger } from "./transcript-merger.js";
import {
  storyLengthWordTarget,
  storyOutlineGuide,
  storyTypeLabel,
  storyTypePromptGuide,
  storyFormatPromptGuide,
  targetAudiencePromptGuide,
  confidentialityPromptGuide,
  type StoryContextSettings,
  type StoryLength,
  type StoryOutline,
  type StoryPromptDefaults,
  type StoryTypeInput,
  type TargetAudience,
  type ConfidentialityLevel,
} from "../types/story-generation.js";
import type { StoryFormat } from "../types/taxonomy.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoryBuilderOptions {
  accountId: string;
  organizationId: string;
  /** Filter to specific funnel stages. If empty, includes all. */
  funnelStages?: FunnelStage[];
  /** Filter to specific taxonomy topics. If empty, includes all. */
  filterTopics?: TaxonomyTopic[];
  /** Custom title override. Auto-generated if omitted. */
  title?: string;
  /** Narrative format variation. */
  format?: StoryFormat;
  /** Target length band. */
  storyLength?: StoryLength;
  /** Target outline template. */
  storyOutline?: StoryOutline;
  /** Explicit story type selector (full journey or topic-driven type). */
  storyType?: StoryTypeInput;
  /** Target audience persona for framing the narrative. */
  targetAudience?: TargetAudience;
  /** Confidentiality level — controls disclosure depth. */
  confidentialityLevel?: ConfidentialityLevel;
}

interface TranscriptSegment {
  callId: string;
  callTitle: string | null;
  occurredAt: Date;
  chunkText: string;
  speaker: string | null;
  tags: Array<{ funnelStage: FunnelStage; topic: string; confidence: number }>;
}

interface ExtractedQuote {
  speaker: string | null;
  quoteText: string;
  context: string | null;
  metricType: string | null;
  metricValue: string | null;
  callId: string;
}

interface StoryResult {
  title: string;
  markdownBody: string;
  quotes: ExtractedQuote[];
}

interface EffectiveStoryGenerationSettings {
  storyLength: StoryLength;
  storyOutline: StoryOutline;
  storyType: StoryTypeInput;
  storyFormat?: StoryFormat;
  targetAudience: TargetAudience;
  confidentialityLevel: ConfidentialityLevel;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const JOURNEY_SUMMARY_PROMPT = `You are an expert B2B content strategist and case study writer. You produce evidence-based customer stories that drive pipeline, support sales conversations, and build brand credibility for SaaS companies selling to 100–2,000 employee organizations.

Core Rules:
1. EVIDENCE ONLY: Use only facts, quotes, and metrics from provided transcripts and context. Never fabricate, embellish, or infer metrics that aren't stated.
2. QUANTIFY EVERYTHING: Prioritize quantified outcomes — dollars saved, percentage improvements, time reduced, error rates, adoption metrics. If a metric is stated in transcripts, it MUST appear in the story.
3. ATTRIBUTION: When quoting or paraphrasing, attribute to the speaker's role (not just name). Example: "the VP of Engineering noted..."
4. TIMELINE PRECISION: Be specific about timelines — "within 6 weeks of deployment" not "quickly."
5. DECISION RATIONALE: Always explain WHY decisions were made, not just WHAT happened. Buyer psychology matters.
6. THIRD PERSON: Write in third person, business-professional tone unless the format specifically requires first person (e.g., video testimonial scripts).
7. MARKDOWN: Use markdown headings (##, ###), tables, bullet lists, bold for emphasis, and blockquotes for direct quotes.
8. EVIDENCE vs. INFERENCE: When you must interpret or connect dots, use hedging language ("likely," "appears to have contributed to") and mark it clearly.
9. ACTIONABLE: Make every story useful for a specific business function — RevOps can extract pipeline insights, Marketing can repurpose proof points, Sales can use in live conversations.
10. NO FLUFF: Every sentence must earn its place. No generic SaaS platitudes ("seamless integration," "game-changer," "best-in-class") unless they appear in actual customer quotes.`;

const QUOTE_EXTRACTION_PROMPT = `You are a precision extraction engine. Given transcript segments, extract ONLY direct quotes that contain quantified value — specific numbers, percentages, dollar amounts, time savings, or measurable outcomes.

For each quote found, return JSON with:
- "speaker": who said it (or null if unknown)
- "quote_text": the exact quote
- "context": 1-sentence description of when/why this was said
- "metric_type": one of "cost_savings", "revenue", "time_saved", "efficiency", "error_reduction", "adoption", "scale", "roi", "other"
- "metric_value": the specific number/percentage/amount mentioned

RULES:
1. Only extract REAL quotes from the text — never fabricate.
2. The quote MUST contain a quantified value. Skip purely qualitative statements.
3. Include enough of the quote for context but trim filler words.
4. Respond with JSON: { "quotes": [...] }`;

// ─── Story Builder ───────────────────────────────────────────────────────────

export class StoryBuilder {
  private openai: OpenAI;
  private prisma: PrismaClient;
  private model: string;
  private merger: TranscriptMerger;

  constructor(prisma: PrismaClient, openaiApiKey: string, model = "gpt-4o") {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.prisma = prisma;
    this.model = model;
    this.merger = new TranscriptMerger(prisma);
  }

  /**
   * Main entry point: builds a complete Markdown story for an account.
   * Uses a 3-step prompt chain:
   *   1. Gather & filter transcript segments
   *   2. Generate the journey narrative (Markdown)
   *   3. Extract high-value quotes
   */
  async buildStory(options: StoryBuilderOptions): Promise<StoryResult> {
    const [account, orgSettings] = await Promise.all([
      this.prisma.account.findUniqueOrThrow({
        where: { id: options.accountId },
      }),
      this.prisma.orgSettings.findUnique({
        where: { organizationId: options.organizationId },
        select: { storyContext: true, storyPromptDefaults: true },
      }),
    ]);

    const savedContext = (orgSettings?.storyContext ?? {}) as StoryContextSettings;
    const savedDefaults = (orgSettings?.storyPromptDefaults ?? {}) as StoryPromptDefaults;
    const effectiveSettings: EffectiveStoryGenerationSettings = {
      storyLength: options.storyLength ?? savedDefaults.storyLength ?? "MEDIUM",
      storyOutline: options.storyOutline ?? savedDefaults.storyOutline ?? "CHRONOLOGICAL_JOURNEY",
      storyType: options.storyType ?? savedDefaults.storyType ?? "FULL_ACCOUNT_JOURNEY",
      storyFormat: options.format ?? savedDefaults.storyFormat,
      targetAudience: options.targetAudience ?? savedDefaults.targetAudience ?? "auto",
      confidentialityLevel: options.confidentialityLevel ?? savedDefaults.confidentialityLevel ?? "EXTERNAL_PUBLIC",
    };

    // ── Step 1: Merge all transcripts into a single markdown ─────────
    const mergeResult = await this.merger.mergeTranscripts({
      accountId: options.accountId,
      organizationId: options.organizationId,
    });

    if (mergeResult.includedCalls === 0) {
      return {
        title: options.title ?? "No Data Available",
        markdownBody:
          "No transcripts found for this account.",
        quotes: [],
      };
    }

    // ── Step 2: Also gather tagged segments for filtering & quotes ───
    const segments = await this.gatherSegments(options);

    // ── Step 3: Generate journey narrative from merged transcript ─────
    const markdown = await this.generateNarrativeFromMerged(
      account.name,
      mergeResult.markdown,
      mergeResult.includedCalls,
      mergeResult.truncated,
      segments,
      savedContext,
      effectiveSettings
    );

    // ── Step 4: Extract high-value quotes ────────────────────────────
    const quotes = await this.extractQuotes(segments);

    // ── Persist the story ────────────────────────────────────────────
    const title =
      options.title ?? this.generateTitle(account.name, options.filterTopics);

    const story = await this.prisma.story.create({
      data: {
        organizationId: options.organizationId,
        accountId: options.accountId,
        title,
        markdownBody: markdown,
        storyType: this.inferStoryType(options),
        funnelStages: options.funnelStages ?? [],
        filterTags: [
          ...(options.filterTopics ?? []),
          `story_type:${effectiveSettings.storyType}`,
          `story_length:${effectiveSettings.storyLength}`,
          `story_outline:${effectiveSettings.storyOutline}`,
          ...(effectiveSettings.storyFormat ? [`story_format:${effectiveSettings.storyFormat}`] : []),
          `audience:${effectiveSettings.targetAudience}`,
          `confidentiality:${effectiveSettings.confidentialityLevel}`,
        ],
      },
    });

    // Persist quotes
    for (const q of quotes) {
      await this.prisma.highValueQuote.create({
        data: {
          storyId: story.id,
          speaker: q.speaker,
          quoteText: q.quoteText,
          context: q.context,
          metricType: q.metricType,
          metricValue: q.metricValue,
          callId: q.callId,
        },
      });
    }

    return { title, markdownBody: markdown, quotes };
  }

  // ─── Step 1: Gather Segments ──────────────────────────────────────

  private async gatherSegments(
    options: StoryBuilderOptions
  ): Promise<TranscriptSegment[]> {
    // Build the where clause for chunk tags
    const tagFilter: Record<string, unknown> = {};
    if (options.funnelStages && options.funnelStages.length > 0) {
      tagFilter.funnelStage = { in: options.funnelStages };
    }
    if (options.filterTopics && options.filterTopics.length > 0) {
      tagFilter.topic = { in: options.filterTopics };
    }

    const hasTagFilter = Object.keys(tagFilter).length > 0;

    const calls = await this.prisma.call.findMany({
      where: {
        accountId: options.accountId,
        organizationId: options.organizationId,
      },
      include: {
        transcript: {
          include: {
            chunks: {
              include: {
                tags: hasTagFilter ? { where: tagFilter } : true,
              },
              orderBy: { chunkIndex: "asc" },
            },
          },
        },
      },
      orderBy: { occurredAt: "asc" },
    });

    const segments: TranscriptSegment[] = [];

    for (const call of calls) {
      if (!call.transcript) continue;

      for (const chunk of call.transcript.chunks) {
        // If filtering by tags, only include chunks that have matching tags
        if (hasTagFilter && chunk.tags.length === 0) continue;

        segments.push({
          callId: call.id,
          callTitle: call.title,
          occurredAt: call.occurredAt,
          chunkText: chunk.text,
          speaker: chunk.speaker,
          tags: chunk.tags.map((t) => ({
            funnelStage: t.funnelStage,
            topic: t.topic,
            confidence: t.confidence,
          })),
        });
      }
    }

    return segments;
  }

  // ─── Step 2: Generate Narrative (from merged transcript) ──────────

  /**
   * Generates the journey narrative using the full merged transcript markdown.
   * This provides the LLM with complete, chronologically-ordered context
   * instead of fragmented chunk segments.
   */
  private async generateNarrativeFromMerged(
    accountName: string,
    mergedMarkdown: string,
    callCount: number,
    wasTruncated: boolean,
    segments: TranscriptSegment[],
    context: StoryContextSettings,
    settings: EffectiveStoryGenerationSettings
  ): Promise<string> {
    // Build topic summary from tagged segments for additional context
    const topicSummary = this.buildTopicSummary(segments);

    const truncationNote = wasTruncated
      ? "\n\nNOTE: Some calls were excluded to fit within context limits. The included calls represent the most relevant portion of the account journey."
      : "";

    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      max_tokens: 4000,
      messages: [
        {
          role: "system",
          content: this.buildStorySystemPrompt(context, settings),
        },
        {
          role: "user",
          content: this.buildStoryUserPrompt({
            accountName,
            callCount,
            topicSummary,
            truncationNote,
            mergedMarkdown,
            settings,
          }),
        },
      ],
    });

    return response.choices[0]?.message?.content ?? "# Story generation failed";
  }

  /**
   * Legacy method: generates narrative from chunked segments.
   * Kept for backward compatibility with direct segment-based workflows.
   */
  private async generateNarrative(
    accountName: string,
    segments: TranscriptSegment[]
  ): Promise<string> {
    const transcriptContext = segments
      .map((s) => {
        const date = s.occurredAt.toISOString().split("T")[0];
        const speaker = s.speaker ? `[${s.speaker}]` : "";
        const tags = s.tags.map((t) => TOPIC_LABELS[t.topic as TaxonomyTopic] ?? t.topic).join(", ");
        return `--- Call: "${s.callTitle ?? "Untitled"}" (${date}) ${speaker} [Tags: ${tags}] ---\n${s.chunkText}`;
      })
      .join("\n\n");

    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      max_tokens: 4000,
      messages: [
        { role: "system", content: JOURNEY_SUMMARY_PROMPT },
        {
          role: "user",
          content: `Account Name: ${accountName}
Number of calls: ${new Set(segments.map((s) => s.callId)).size}
Date range: ${segments[0].occurredAt.toISOString().split("T")[0]} to ${segments[segments.length - 1].occurredAt.toISOString().split("T")[0]}

TRANSCRIPT SEGMENTS:
${transcriptContext}`,
        },
      ],
    });

    return response.choices[0]?.message?.content ?? "# Story generation failed";
  }

  /**
   * Builds a comma-separated summary of the most common topics found
   * across all tagged segments.
   */
  private buildTopicSummary(segments: TranscriptSegment[]): string {
    const topicCounts = new Map<string, number>();
    for (const s of segments) {
      for (const t of s.tags) {
        const label = TOPIC_LABELS[t.topic as TaxonomyTopic] ?? t.topic;
        topicCounts.set(label, (topicCounts.get(label) ?? 0) + 1);
      }
    }
    return [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label]) => label)
      .join(", ");
  }

  private buildStorySystemPrompt(
    context: StoryContextSettings,
    settings: EffectiveStoryGenerationSettings
  ): string {
    // Build organization context block
    const contextLines = [
      context.companyOverview
        ? `Company Overview: ${context.companyOverview}`
        : null,
      context.valueProposition
        ? `Value Proposition: ${context.valueProposition}`
        : null,
      context.products?.length
        ? `Products/Solutions: ${context.products.join(", ")}`
        : null,
      context.targetPersonas?.length
        ? `Target Buyer Personas: ${context.targetPersonas.join(", ")}`
        : null,
      context.targetIndustries?.length
        ? `Target Industries: ${context.targetIndustries.join(", ")}`
        : null,
      context.differentiators?.length
        ? `Key Differentiators: ${context.differentiators.join(" | ")}`
        : null,
      context.competitiveAdvantages?.length
        ? `Competitive Advantages: ${context.competitiveAdvantages.join(" | ")}`
        : null,
      context.proofPoints?.length
        ? `Approved Proof Points (use these if supported by transcript): ${context.proofPoints.join(" | ")}`
        : null,
      context.keyMetrics?.length
        ? `Key Metrics the Company Tracks: ${context.keyMetrics.join(", ")}`
        : null,
      context.customerSegments?.length
        ? `Customer Segments: ${context.customerSegments.join(", ")}`
        : null,
      context.bannedClaims?.length
        ? `BANNED CLAIMS (never assert unless verbatim in transcript): ${context.bannedClaims.join(" | ")}`
        : null,
      context.approvedTerminology?.length
        ? `Preferred Terminology (use these terms instead of generic alternatives): ${context.approvedTerminology.join(", ")}`
        : null,
      context.brandVoice
        ? `Brand Voice: ${context.brandVoice}`
        : null,
      context.writingStyleGuide
        ? `Writing Style Guide: ${context.writingStyleGuide}`
        : null,
      context.callToAction
        ? `Preferred Call to Action: ${context.callToAction}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Build story type guidance
    const typeGuide = storyTypePromptGuide(settings.storyType);

    // Build format guidance
    const formatGuide = settings.storyFormat
      ? storyFormatPromptGuide(settings.storyFormat)
      : null;

    // Build audience guidance
    const audienceGuide = targetAudiencePromptGuide(settings.targetAudience);

    // Build confidentiality guidance
    const confidentialityGuide = confidentialityPromptGuide(settings.confidentialityLevel);

    return `${JOURNEY_SUMMARY_PROMPT}

═══ GENERATION PARAMETERS ═══

Story Type: ${storyTypeLabel(settings.storyType)}
${typeGuide}

Target Length: ${settings.storyLength} (${storyLengthWordTarget(settings.storyLength)})

Outline Structure: ${settings.storyOutline}
${storyOutlineGuide(settings.storyOutline)}

${formatGuide ? `Format/Angle:\n${formatGuide}` : "Format: Standard B2B case study narrative."}

Target Audience:
${audienceGuide}

Confidentiality:
${confidentialityGuide}

═══ ORGANIZATION CONTEXT ═══

${contextLines || "No additional organization context provided. Write for a general B2B SaaS audience."}

═══ OUTPUT REQUIREMENTS ═══

1. Start with a compelling title (# heading) that includes the account name and a specific outcome or theme.
2. Follow with an Executive Summary (2-3 sentences max) that gives the reader the core takeaway.
3. Follow the requested outline structure for the body.
4. Include a "Key Outcomes" section with a markdown table of quantified metrics (Metric | Before | After | Improvement).
5. Include at least one blockquote from the transcripts if available.
6. If the story type is internal (sales enablement, lessons learned, etc.), include an "Action Items" or "How to Use This" section.
7. Stay within the requested word count range.
`;
  }

  private buildStoryUserPrompt(input: {
    accountName: string;
    callCount: number;
    topicSummary: string;
    truncationNote: string;
    mergedMarkdown: string;
    settings: EffectiveStoryGenerationSettings;
  }): string {
    const isInternal = input.settings.confidentialityLevel === "INTERNAL_ONLY" ||
      input.settings.confidentialityLevel === "SALES_ENABLEMENT";

    return `Account Name: ${input.accountName}
Number of calls analyzed: ${input.callCount}
Requested Story Type: ${storyTypeLabel(input.settings.storyType)}
Requested Length: ${input.settings.storyLength} (${storyLengthWordTarget(input.settings.storyLength)})
Requested Outline: ${input.settings.storyOutline}
Requested Format: ${input.settings.storyFormat ?? "auto (standard narrative)"}
Target Audience: ${input.settings.targetAudience}
Confidentiality: ${input.settings.confidentialityLevel}
${input.topicSummary ? `\nKey Topics Identified in Transcripts: ${input.topicSummary}\n` : ""}${input.truncationNote}

INSTRUCTIONS:
- Center the narrative around the requested story type: ${storyTypeLabel(input.settings.storyType)}.
- Use ONLY transcript evidence for factual claims and metrics. Cite specifics.
- Surface every explicit metric mentioned in transcripts in a dedicated outcomes section.
- If the transcript lacks quantified metrics, acknowledge this honestly rather than inventing numbers.
${isInternal ? `- This is an INTERNAL story. Be candid about challenges, lessons learned, and areas for improvement.
- Include specific actionable recommendations for the team.` : `- This is an EXTERNAL-facing story. Focus on positive outcomes and professional framing.
- Ensure nothing sensitive, proprietary, or competitively damaging is included.`}
- Match the tone and vocabulary to the target audience.
- Respect the requested word count: ${storyLengthWordTarget(input.settings.storyLength)}.

FULL MERGED TRANSCRIPT:
${input.mergedMarkdown}`;
  }

  // ─── Step 3: Extract Quotes ───────────────────────────────────────

  private async extractQuotes(
    segments: TranscriptSegment[]
  ): Promise<ExtractedQuote[]> {
    // Only send segments likely to contain quantified value (BoFu + Post-Sale)
    const valuableSegments = segments.filter((s) =>
      s.tags.some(
        (t) =>
          t.funnelStage === "BOFU" ||
          t.funnelStage === "POST_SALE" ||
          t.topic === "roi_financial_outcomes" ||
          t.topic === "quantified_operational_metrics"
      )
    );

    // Fall back to all segments if no BoFu/Post-Sale ones found
    const targetSegments =
      valuableSegments.length > 0 ? valuableSegments : segments;

    const transcriptText = targetSegments
      .map((s) => {
        const speaker = s.speaker ? `[${s.speaker}]:` : "";
        return `${speaker} ${s.chunkText}`;
      })
      .join("\n\n");

    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: QUOTE_EXTRACTION_PROMPT },
        {
          role: "user",
          content: `Extract high-value quotes with quantified metrics from these transcript segments:\n\n${transcriptText}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    try {
      const parsed = JSON.parse(content);
      const rawQuotes: Array<{
        speaker?: string;
        quote_text: string;
        context?: string;
        metric_type?: string;
        metric_value?: string;
      }> = parsed.quotes ?? [];

      // Find the call ID for each quote (best-effort match)
      return rawQuotes.map((q) => {
        const matchingSegment = targetSegments.find((s) =>
          s.chunkText.includes(q.quote_text.slice(0, 50))
        );
        return {
          speaker: q.speaker ?? null,
          quoteText: q.quote_text,
          context: q.context ?? null,
          metricType: q.metric_type ?? null,
          metricValue: q.metric_value ?? null,
          callId: matchingSegment?.callId ?? targetSegments[0].callId,
        };
      });
    } catch {
      return [];
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private generateTitle(
    accountName: string,
    topics?: TaxonomyTopic[]
  ): string {
    if (!topics || topics.length === 0) {
      return `${accountName}: Account Journey`;
    }
    const topicLabel = TOPIC_LABELS[topics[0]] ?? topics[0];
    return `${accountName}: ${topicLabel} Story`;
  }

  private inferStoryType(
    options: StoryBuilderOptions
  ): StoryType {
    const explicitType = options.storyType ?? options.filterTopics?.[0];

    const typeMap: Record<string, string> = {
      FULL_ACCOUNT_JOURNEY: "FULL_JOURNEY",
      // TOFU
      industry_trend_validation: "INDUSTRY_TREND",
      problem_challenge_identification: "PROBLEM_IDENTIFICATION",
      digital_transformation_modernization: "DIGITAL_TRANSFORMATION",
      regulatory_compliance_challenges: "REGULATORY_COMPLIANCE",
      market_expansion: "MARKET_EXPANSION",
      thought_leadership_cocreation: "THOUGHT_LEADERSHIP",
      // MOFU
      product_capability_deepdive: "PRODUCT_DEEPDIVE",
      competitive_displacement: "COMPETITIVE_WIN",
      integration_interoperability: "INTEGRATION",
      implementation_onboarding: "ONBOARDING",
      security_compliance_governance: "SECURITY_GOVERNANCE",
      customization_configurability: "CUSTOMIZATION",
      multi_product_cross_sell: "EXPANSION",
      partner_ecosystem_solution: "PARTNER_ECOSYSTEM",
      total_cost_of_ownership: "TCO_ANALYSIS",
      pilot_to_production: "PILOT_TO_PRODUCTION",
      // BOFU
      roi_financial_outcomes: "ROI_ANALYSIS",
      quantified_operational_metrics: "OPERATIONAL_METRICS",
      executive_strategic_impact: "EXECUTIVE_IMPACT",
      risk_mitigation_continuity: "RISK_MITIGATION",
      deployment_speed: "DEPLOYMENT_SPEED",
      vendor_selection_criteria: "VENDOR_SELECTION",
      procurement_experience: "PROCUREMENT",
      // POST_SALE
      renewal_partnership_evolution: "RENEWAL_PARTNERSHIP",
      upsell_cross_sell_expansion: "EXPANSION",
      customer_success_support: "CUSTOMER_SUCCESS",
      training_enablement_adoption: "TRAINING_ENABLEMENT",
      community_advisory_participation: "COMMUNITY_ADVISORY",
      co_innovation_product_feedback: "CO_INNOVATION",
      change_management_champion_dev: "CHANGE_MANAGEMENT",
      scaling_across_org: "SCALING",
      platform_governance_coe: "PLATFORM_GOVERNANCE",
      // INTERNAL
      sales_enablement: "SALES_ENABLEMENT",
      lessons_learned_implementation: "LESSONS_LEARNED",
      cross_functional_collaboration: "CROSS_FUNCTIONAL",
      voice_of_customer_product: "VOICE_OF_CUSTOMER",
      pricing_packaging_validation: "PRICING_VALIDATION",
      churn_save_winback: "CHURN_SAVE",
      deal_anatomy: "DEAL_ANATOMY",
      customer_health_sentiment: "CUSTOMER_HEALTH",
      reference_ability_development: "REFERENCE_DEVELOPMENT",
      internal_process_improvement: "PROCESS_IMPROVEMENT",
      // VERTICAL
      industry_specific_usecase: "INDUSTRY_USECASE",
      company_size_segment: "SEGMENT_SPECIFIC",
      persona_specific_framing: "PERSONA_SPECIFIC",
      geographic_regional_variation: "GEOGRAPHIC_VARIATION",
      regulated_vs_unregulated: "REGULATED_INDUSTRY",
      public_sector_government: "PUBLIC_SECTOR",
    };

    if (explicitType && typeMap[explicitType]) {
      return typeMap[explicitType] as StoryType;
    }

    return "FULL_JOURNEY" as StoryType;
  }
}
