import { ALL_TOPICS, STORY_FORMATS, TOPIC_LABELS, type TaxonomyTopic, type StoryFormat } from "./taxonomy.js";

export const STORY_LENGTHS = ["SHORT", "MEDIUM", "LONG", "EXECUTIVE"] as const;
export type StoryLength = (typeof STORY_LENGTHS)[number];

export const STORY_OUTLINES = [
  "CHRONOLOGICAL_JOURNEY",
  "PROBLEM_SOLUTION_IMPACT",
  "BY_THE_NUMBERS",
  "EXECUTIVE_BRIEF",
  "IMPLEMENTATION_PLAYBOOK",
  "DEAL_ANATOMY",
  "BEFORE_AFTER",
  "DAY_IN_THE_LIFE",
  "COMPETITIVE_TEARDOWN",
  "STAKEHOLDER_MAP",
  "RISK_MITIGATION",
  "PARTNERSHIP_EVOLUTION",
] as const;
export type StoryOutline = (typeof STORY_OUTLINES)[number];

export const STORY_TYPES = [
  "FULL_ACCOUNT_JOURNEY",
  ...ALL_TOPICS,
] as const;
export type StoryTypeInput = (typeof STORY_TYPES)[number];

export const TARGET_AUDIENCES = [
  "auto",
  "CTO_TECHNICAL_LEADER",
  "CFO_FINANCE_LEADER",
  "CEO_EXECUTIVE",
  "VP_SALES_REVOPS",
  "VP_MARKETING",
  "END_USER_PRACTITIONER",
  "PROCUREMENT_LEGAL",
  "IT_SECURITY",
  "BOARD_INVESTOR",
] as const;
export type TargetAudience = (typeof TARGET_AUDIENCES)[number];

export const CONFIDENTIALITY_LEVELS = [
  "EXTERNAL_PUBLIC",
  "EXTERNAL_GATED",
  "INTERNAL_ONLY",
  "SALES_ENABLEMENT",
] as const;
export type ConfidentialityLevel = (typeof CONFIDENTIALITY_LEVELS)[number];

export interface StoryContextSettings {
  companyOverview?: string;
  products?: string[];
  targetPersonas?: string[];
  targetIndustries?: string[];
  differentiators?: string[];
  proofPoints?: string[];
  bannedClaims?: string[];
  writingStyleGuide?: string;
  approvedTerminology?: string[];
  valueProposition?: string;
  competitiveAdvantages?: string[];
  keyMetrics?: string[];
  customerSegments?: string[];
  brandVoice?: string;
  callToAction?: string;
}

export interface StoryPromptDefaults {
  storyLength?: StoryLength;
  storyOutline?: StoryOutline;
  storyFormat?: StoryFormat;
  storyType?: StoryTypeInput;
  targetAudience?: TargetAudience;
  confidentialityLevel?: ConfidentialityLevel;
}

export function storyTypeLabel(storyType: StoryTypeInput): string {
  if (storyType === "FULL_ACCOUNT_JOURNEY") {
    return "Full Account Journey";
  }
  return TOPIC_LABELS[storyType as TaxonomyTopic] ?? storyType;
}

export function storyLengthWordTarget(length: StoryLength): string {
  switch (length) {
    case "SHORT":
      return "500-800 words";
    case "MEDIUM":
      return "900-1400 words";
    case "LONG":
      return "1500-2400 words";
    case "EXECUTIVE":
      return "350-600 words";
    default:
      return "900-1400 words";
  }
}

export function storyOutlineGuide(outline: StoryOutline): string {
  switch (outline) {
    case "CHRONOLOGICAL_JOURNEY":
      return "Use sections: Executive Summary, Timeline, Journey Phases, Key Outcomes, Notable Quotes.";
    case "PROBLEM_SOLUTION_IMPACT":
      return "Use sections: Context, Problem, Why Previous Approach Failed, Solution Implementation, Impact, Lessons Learned.";
    case "BY_THE_NUMBERS":
      return "Lead with quantified outcomes; include metric table, benchmark comparisons, and key quote callouts.";
    case "EXECUTIVE_BRIEF":
      return "Use concise board-ready sections: Business Context, Strategic Decision, Financial/Operational Impact, Risks, Next Steps.";
    case "IMPLEMENTATION_PLAYBOOK":
      return "Use sections: Initial State, Rollout Plan, Stakeholders, Integrations, Risks/Mitigations, Time-to-Value.";
    case "DEAL_ANATOMY":
      return "Use sections: Opportunity Origin, Evaluation Criteria, Stakeholders, Competitive Landscape, Commercial Terms, Why Won.";
    case "BEFORE_AFTER":
      return "Use sections: The Before State (pain, metrics, workflow), The Turning Point (decision to change), The After State (new metrics, workflow, outcomes), Side-by-Side Comparison Table.";
    case "DAY_IN_THE_LIFE":
      return "Use sections: Meet the Persona, A Typical Day Before, The Adoption Moment, A Typical Day After, What Changed in Practice. Write in present tense, workflow-level detail.";
    case "COMPETITIVE_TEARDOWN":
      return "Use sections: Previous Solution, Evaluation Triggers, Feature-by-Feature Comparison, Migration Experience, Why They Switched, Outcomes vs. Previous.";
    case "STAKEHOLDER_MAP":
      return "Use sections: Decision Makers Involved, Each Stakeholder's Perspective, How Alignment Was Built, Decision Criteria by Stakeholder, Consensus Points. Map the buying committee and their individual concerns.";
    case "RISK_MITIGATION":
      return "Use sections: Business Risk Context, Risk Assessment, How the Solution Addressed Key Risks, Business Continuity Outcomes, Compliance/Security Gains, Residual Risk Management.";
    case "PARTNERSHIP_EVOLUTION":
      return "Use sections: Initial Engagement, First Value Milestones, Expansion Phases, Deepening Partnership, Current State & Future Plans. Show evolution over time with concrete touchpoints.";
    default:
      return "Use a clear B2B case-study structure with outcomes and evidence.";
  }
}

export function targetAudienceLabel(audience: TargetAudience): string {
  switch (audience) {
    case "auto": return "Auto-detect from content";
    case "CTO_TECHNICAL_LEADER": return "CTO / Technical Leader";
    case "CFO_FINANCE_LEADER": return "CFO / Finance Leader";
    case "CEO_EXECUTIVE": return "CEO / Executive";
    case "VP_SALES_REVOPS": return "VP Sales / RevOps";
    case "VP_MARKETING": return "VP Marketing";
    case "END_USER_PRACTITIONER": return "End User / Practitioner";
    case "PROCUREMENT_LEGAL": return "Procurement / Legal";
    case "IT_SECURITY": return "IT / Security";
    case "BOARD_INVESTOR": return "Board / Investor";
    default: return "General Business Audience";
  }
}

export function targetAudiencePromptGuide(audience: TargetAudience): string {
  switch (audience) {
    case "CTO_TECHNICAL_LEADER":
      return "Frame for a CTO/VP Engineering: emphasize architecture decisions, integration complexity, technical debt reduction, developer productivity, scalability, and security. Use technical vocabulary but tie every technical gain to business value.";
    case "CFO_FINANCE_LEADER":
      return "Frame for a CFO/Finance leader: lead with ROI, TCO, payback period, and cost avoidance. Include a financial summary table. Quantify every outcome in dollars or percentage terms. Discuss risk-adjusted returns and budget predictability.";
    case "CEO_EXECUTIVE":
      return "Frame for a CEO/C-suite executive: focus on strategic alignment, competitive advantage, market positioning, board-level metrics, and organizational transformation. Keep the narrative high-level with an emphasis on why this decision mattered to the business.";
    case "VP_SALES_REVOPS":
      return "Frame for Sales/RevOps leadership: highlight pipeline impact, sales cycle compression, win rates, deal velocity, forecasting accuracy, and quota attainment. Include sales-specific metrics and objection-handling insights.";
    case "VP_MARKETING":
      return "Frame for Marketing leadership: emphasize demand generation impact, brand differentiation, market narrative, content leverage, event opportunities, and proof points that can be repurposed across campaigns.";
    case "END_USER_PRACTITIONER":
      return "Frame for an end user/practitioner: focus on daily workflow improvements, ease of use, learning curve, time saved on specific tasks, feature-level benefits, and quality-of-life improvements. Use approachable language.";
    case "PROCUREMENT_LEGAL":
      return "Frame for Procurement/Legal: emphasize vendor evaluation process, compliance requirements met, contract structure, risk mitigation, SLA adherence, data governance, and procurement timeline efficiency.";
    case "IT_SECURITY":
      return "Frame for IT/Security: highlight security posture improvements, compliance certifications, data governance, access controls, audit trail, incident reduction, and infrastructure reliability.";
    case "BOARD_INVESTOR":
      return "Frame for Board/Investor audience: focus on strategic value creation, market differentiation, scalable growth enablement, risk management, and long-term competitive moat. Use board-ready language and financial framing.";
    default:
      return "Write for a general B2B buyer audience. Balance technical detail, business outcomes, and practical implementation insights.";
  }
}

export function confidentialityPromptGuide(level: ConfidentialityLevel): string {
  switch (level) {
    case "EXTERNAL_PUBLIC":
      return "This story is for PUBLIC external use. Use only information the customer has approved for public sharing. Avoid internal-only details, deal specifics, or sensitive competitive intelligence.";
    case "EXTERNAL_GATED":
      return "This story is for GATED external use (shared with qualified leads). Include more detailed implementation specifics and metrics, but still avoid sensitive internal processes or confidential pricing.";
    case "INTERNAL_ONLY":
      return "This story is for INTERNAL audiences only. Include full candor: lessons learned, what went wrong, internal process improvements, competitive intelligence details, and unvarnished metrics. This will not be shared externally.";
    case "SALES_ENABLEMENT":
      return "This story is for SALES ENABLEMENT. Include objection handling, competitive positioning, deal strategy insights, pricing/packaging validation, and specific talk tracks that sales reps can use in conversations. Include a 'How to Use This Story' section at the end.";
    default:
      return "Write for general business distribution.";
  }
}

export function storyFormatPromptGuide(format: StoryFormat): string {
  switch (format) {
    case "before_after_transformation":
      return `Structure as a Before/After Transformation narrative:
- Open with a vivid description of the "before" state: pain points, inefficiencies, frustrations
- Describe the catalyst moment that triggered the search for a solution
- Walk through the transition/implementation briefly
- Paint an equally vivid "after" state with concrete improvements
- Close with a side-by-side comparison or transformation metrics table
- Use present tense for the "after" state to make it feel current and real`;

    case "day_in_the_life":
      return `Structure as a Day-in-the-Life workflow story:
- Introduce a specific persona (role, responsibilities, daily challenges)
- Walk through a typical day BEFORE the solution, showing friction points
- Then walk through the same day AFTER, showing how the workflow improved
- Focus on practical, tangible workflow changes over abstract benefits
- Include specific timestamps/workflow steps to make it feel real
- Close with the persona's own words about the difference`;

    case "by_the_numbers_snapshot":
      return `Structure as a Data-Driven "By the Numbers" Snapshot:
- Lead with a bold headline metric (the most impressive quantified outcome)
- Present 4-6 key metrics in a structured table or callout format
- For each metric, provide: baseline, current, improvement %, and timeframe
- Include benchmark comparisons where available (vs. industry average, vs. previous solution)
- Pull 1-2 quote callouts tied directly to specific metrics
- Keep narrative text minimal — let the numbers tell the story`;

    case "video_testimonial_soundbite":
      return `Structure as a Video Testimonial / Executive Soundbite script:
- Write in first person (the customer's voice)
- Open with a compelling 15-second hook quote
- Include 3-4 key talking points, each 30-60 seconds when spoken aloud
- Each talking point should be a standalone soundbite that works in isolation
- Close with a forward-looking statement or recommendation
- Add [PRODUCER NOTE] annotations for ideal B-roll or data overlay suggestions
- Target total length for a 2-3 minute video`;

    case "joint_webinar_presentation":
      return `Structure as a Joint Webinar / Conference Presentation outline:
- Presentation title and subtitle
- Speaker bios section (slots for vendor + customer speakers)
- Agenda with 4-6 sections, each with key talking points and speaker assignments
- Include audience engagement moments (polls, Q&A prompts)
- Provide slide content suggestions for each section
- Include data points suitable for slide visualization
- Close with a joint CTA and resource list`;

    case "peer_reference_call_guide":
      return `Structure as a Peer Reference Call Guide:
- Briefing section for the reference customer (context on who they'll speak with)
- 8-10 suggested questions organized by theme (evaluation, implementation, outcomes, advice)
- For each question, include the likely answer based on transcript evidence
- Include "Topics to Avoid" or "Sensitive Areas" if apparent from transcripts
- Close with a summary of the strongest proof points this reference can speak to
- Add coaching notes for the sales rep facilitating the call`;

    case "analyst_validated_study":
      return `Structure as an Analyst-Validated / Third-Party Case Study:
- Executive Summary with key findings (written in objective third-person)
- Company Profile section (industry, size, challenge context)
- Methodology note (what data was analyzed, timeframe, scope)
- Detailed Findings organized by theme with evidence citations
- Quantified Outcomes with statistical framing (not just raw numbers)
- Analysis & Commentary section (objective interpretation of results)
- Conclusion with forward-looking assessment
- Use formal, research-paper tone throughout`;

    default:
      return "Use a standard B2B case study narrative structure.";
  }
}

export function storyTypePromptGuide(storyType: StoryTypeInput): string {
  if (storyType === "FULL_ACCOUNT_JOURNEY") {
    return "Tell the complete story of this customer's journey: from initial challenge through evaluation, implementation, and outcomes. Cover the full arc.";
  }

  const guides: Partial<Record<TaxonomyTopic, string>> = {
    // TOFU
    industry_trend_validation: "Focus on how the customer recognized and navigated a macro industry shift. Position this as thought leadership content showing awareness of industry dynamics. Highlight the trend, how it affected the customer's business, and how they responded.",
    problem_challenge_identification: "Paint a detailed picture of the customer's pain points before any solution was in play. This is top-of-funnel awareness content — help the reader recognize their own challenges in this story. Don't sell; empathize and educate.",
    digital_transformation_modernization: "Chronicle the customer's modernization journey: legacy state, drivers for change, transformation approach, and early results. Position as an educational case showing what digital transformation looks like in practice.",
    regulatory_compliance_challenges: "Detail the specific regulatory/compliance challenges the customer faced, the stakes of non-compliance, and how they built a path to compliance. Include specific regulations, audit requirements, and governance frameworks.",
    market_expansion: "Tell the story of how the customer expanded into new markets or segments. Cover the strategic rationale, execution challenges, how they adapted their approach, and early results in the new market.",
    thought_leadership_cocreation: "Frame as a joint insight piece co-created with the customer. Blend the customer's domain expertise with solution capabilities to surface a unique perspective or finding that neither party could have produced alone.",

    // MOFU
    product_capability_deepdive: "Deep-dive into a specific product feature or capability in action. Show the feature solving a real problem, with workflow-level detail. Include before/after of the specific capability, not just high-level outcomes.",
    competitive_displacement: "Detail the journey from a named competitor to the current solution. Cover what triggered the switch, how solutions were evaluated, migration specifics, and comparative outcomes. Be factual, not disparaging.",
    integration_interoperability: "Focus on how the solution fits into the customer's existing tech stack. Detail specific integrations built, data flows, API usage, and how interoperability created compound value across systems.",
    implementation_onboarding: "Chronicle the implementation experience from kickoff to go-live. Cover timeline, team structure, key decisions, challenges encountered, and time-to-first-value. This is a buyer's guide to what implementation actually looks like.",
    security_compliance_governance: "Detail how security, compliance, and data governance requirements were met in practice. Include specific certifications, audit results, data handling practices, and governance frameworks.",
    customization_configurability: "Show how the solution was customized to fit unique business workflows. Detail specific configurations, custom rules/logic, and how the platform adapted to non-standard requirements without custom code.",
    multi_product_cross_sell: "Tell the land-and-expand story: what was the initial use case, how did usage grow to additional products/modules, and what drove each expansion decision. Quantify the compound value of the multi-product approach.",
    partner_ecosystem_solution: "Highlight how a partner (SI, reseller, ISV, or technology partner) was involved in the solution. Show the three-way value creation between vendor, partner, and customer.",
    total_cost_of_ownership: "Build a rigorous TCO analysis narrative. Compare all-in costs (licensing, implementation, training, maintenance, opportunity cost) vs. the previous approach or alternatives. Include a TCO comparison table.",
    pilot_to_production: "Chronicle the journey from initial proof-of-concept/pilot through production deployment. Cover success criteria, pilot scope, what was learned, what changed between pilot and production, and how confidence was built.",

    // BOFU
    roi_financial_outcomes: "Lead with hard financial outcomes: cost savings, revenue generated, payback period, ROI percentage. Include a financial outcomes table. Tie every metric to specific capabilities or decisions. This is decision-stage content.",
    quantified_operational_metrics: "Focus on operational efficiency gains with specific, quantified metrics: time saved, error reduction, throughput increase, cycle time compression. Include metric tables with baselines and improvements.",
    executive_strategic_impact: "Frame the impact at the board/C-suite level. How did this decision affect the company's strategic position, competitive advantage, or market trajectory? Use executive language and strategic framing.",
    risk_mitigation_continuity: "Detail how the solution mitigated specific business risks: downtime, data loss, compliance violations, revenue impact. Quantify risk reduction and business continuity improvements.",
    deployment_speed: "Highlight deployment velocity: time from contract to go-live vs. expectations, factors that accelerated or slowed deployment, and what 'fast' meant in tangible business terms (revenue captured, costs avoided).",
    vendor_selection_criteria: "Walk through the buyer's evaluation framework: what criteria were used, how vendors were scored, what mattered most, and why this solution won. This is invaluable for other buyers in evaluation mode.",
    procurement_experience: "Detail the procurement/buying process experience for enterprise deals: contract negotiation, legal review, security assessment, pricing structure, and what made the procurement experience positive or notable.",

    // POST_SALE
    renewal_partnership_evolution: "Tell the story of a long-term customer relationship: initial purchase, first renewal, how the partnership evolved, deepening engagement, and where it stands today. Show trust built over time.",
    upsell_cross_sell_expansion: "Detail the expansion journey: what started as one use case and grew over time. Cover what triggered each expansion, how business cases were built internally, and compound value of the growing footprint.",
    customer_success_support: "Highlight the customer success and support experience: responsiveness, proactive engagement, issue resolution, strategic guidance. Include specific examples of support interactions that made a difference.",
    training_enablement_adoption: "Detail the adoption journey: training programs, enablement resources, how adoption was measured and driven, and the path from initial rollout to embedded organizational capability.",
    community_advisory_participation: "Show how the customer engaged with the vendor's community: advisory boards, user groups, beta programs, conferences. Highlight the two-way value of community participation.",
    co_innovation_product_feedback: "Tell the story of customer-influenced product development: how feedback was given, how it was incorporated, and how co-innovation benefited both parties. Show a genuine product feedback loop.",
    change_management_champion_dev: "Focus on the internal change management journey: who championed adoption internally, how resistance was overcome, how internal advocates were developed, and what organizational change looked like.",
    scaling_across_org: "Chronicle how usage scaled from an initial team/department to broader organizational adoption. Cover the scaling triggers, governance established, standardization approaches, and multi-team coordination.",
    platform_governance_coe: "Detail how the customer built internal governance and center-of-excellence around the platform: standards, best practices, training programs, and how operational excellence was institutionalized.",

    // INTERNAL
    sales_enablement: "Write specifically for the sales team. Include: objection handling (anticipated objections + evidence-based responses), competitive positioning, ideal customer profile match, discovery questions this story informs, and specific talk tracks. Add a 'How to Use This in a Deal' section.",
    lessons_learned_implementation: "Write a candid internal retrospective: what went well, what went wrong, how issues were resolved, and what the team would do differently next time. Be honest about mistakes — this is for internal learning.",
    cross_functional_collaboration: "Detail how sales, CS, product, and engineering worked together on this account. Highlight coordination points, handoff experiences, and how cross-functional collaboration created better outcomes.",
    voice_of_customer_product: "Extract and organize customer feedback relevant to product development: feature requests mentioned, pain points with current product, competitive feature gaps cited, and specific workflow suggestions.",
    pricing_packaging_validation: "Analyze what this deal reveals about pricing and packaging: was the pricing model well-received, were there packaging friction points, how did pricing compare to alternatives, and what does this suggest for pricing strategy.",
    churn_save_winback: "Tell the churn save or win-back story: what triggered the risk, how it was detected, what interventions were attempted, what worked, and what the customer's current status and sentiment is.",
    deal_anatomy: "Dissect how this deal was sourced, structured, and closed. Cover: lead source, qualification criteria, stakeholder map, competitive dynamics, pricing negotiation, champion identification, and closing strategy.",
    customer_health_sentiment: "Provide a comprehensive customer health assessment: current sentiment, engagement trends, risk indicators, expansion potential, advocacy readiness, and recommended next actions.",
    reference_ability_development: "Assess this customer's reference-ability: willingness to participate in references, what topics they can speak to strongest, any sensitivities or limitations, and a plan to develop them as a public advocate.",
    internal_process_improvement: "Identify internal process improvements inspired by this customer engagement: what could the company do better in sales, onboarding, support, or product based on this experience.",

    // VERTICAL
    industry_specific_usecase: "Frame the story through an industry-specific lens. Include industry jargon, regulatory context, common industry pain points, and position the solution within the industry's technology landscape.",
    company_size_segment: "Tailor the narrative to the company's size segment. For SMB: emphasize speed, simplicity, and value. For mid-market: balance features and support. For enterprise: emphasize scalability, governance, and strategic alignment.",
    persona_specific_framing: "Tell the same core story but framed for the specified persona. Adjust vocabulary, metrics emphasis, and narrative focus to match what this persona cares about most in their daily role.",
    geographic_regional_variation: "Highlight geographic or regional factors: local regulations, market dynamics, cultural considerations, regional deployment challenges, and how the solution adapted to regional requirements.",
    regulated_vs_unregulated: "If the customer is in a regulated industry, emphasize compliance, audit readiness, data handling, and regulatory requirements. If unregulated, emphasize speed and flexibility advantages.",
    public_sector_government: "Frame for public sector: emphasize FedRAMP/StateRAMP compliance, procurement process (RFP/RFI), ATO requirements, data sovereignty, citizen impact, and government-specific deployment considerations.",
  };

  return guides[storyType as TaxonomyTopic] ?? "Center the narrative around this topic, using only evidence from the transcripts.";
}

export const STORY_FORMAT_VALUES = [...STORY_FORMATS] as readonly StoryFormat[];
