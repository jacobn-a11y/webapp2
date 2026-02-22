/**
 * API client for StoryEngine backend.
 */

import type { FunnelStage, TaxonomyTopic, StoryFormat, TargetAudience, ConfidentialityLevel } from "../types/taxonomy";
import type { StoryLength, StoryOutline, StoryTypeInput } from "../types/taxonomy";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BuildStoryRequest {
  account_id: string;
  funnel_stages?: FunnelStage[];
  filter_topics?: TaxonomyTopic[];
  title?: string;
  format?: StoryFormat;
  story_length?: StoryLength;
  story_outline?: StoryOutline;
  story_type?: StoryTypeInput;
  target_audience?: TargetAudience;
  confidentiality_level?: ConfidentialityLevel;
}

export interface StoryQuote {
  speaker: string | null;
  quote_text: string;
  context: string | null;
  metric_type: string | null;
  metric_value: string | null;
  call_id?: string;
}

export interface BuildStoryResponse {
  title: string;
  markdown: string;
  quotes: StoryQuote[];
}

export interface StorySummary {
  id: string;
  title: string;
  story_type: string;
  funnel_stages: FunnelStage[];
  filter_tags: string[];
  generated_at: string;
  markdown: string;
  quotes: StoryQuote[];
}

export interface CreateLandingPageRequest {
  story_id: string;
  title: string;
  subtitle?: string;
  callout_boxes?: Array<{
    title: string;
    body: string;
    icon?: string;
  }>;
}

export interface CreateLandingPageResponse {
  id: string;
  slug: string;
  title: string;
  status: string;
  editable_body: string;
  callout_boxes: unknown[];
  total_call_hours: number;
}

// ─── Admin Account Access ───────────────────────────────────────────────────

export interface AccessUser {
  user_id: string;
  user_name: string | null;
  user_email: string;
  role: string;
  grants: AccessGrant[];
}

export interface AccessGrant {
  id: string;
  scope_type: string;
  account?: { id: string; name: string; domain: string | null };
  cached_account_count: number;
  crm_report_id?: string;
  crm_provider?: string;
  crm_report_name?: string;
  last_synced_at?: string;
}

export interface AccountSearchResult {
  id: string;
  name: string;
  domain: string | null;
}

export interface CrmReport {
  id: string;
  name: string;
}

// ─── Admin Permissions ──────────────────────────────────────────────────────

export interface PermissionUser {
  userId: string;
  userName: string | null;
  userEmail: string;
  role: string;
  permissions: string[];
  accessGrants?: PermissionAccessGrant[];
}

export interface PermissionAccessGrant {
  id: string;
  scopeType: string;
  account: { id: string; name: string; domain: string | null } | null;
  cachedAccountIds: string[];
  crmReportId: string | null;
  crmProvider: string | null;
  crmReportName: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

// ─── Role Profiles ─────────────────────────────────────────────────────────

export interface RoleProfile {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isPreset: boolean;
  permissions: string[];
  canAccessAnonymousStories: boolean;
  canGenerateAnonymousStories: boolean;
  canAccessNamedStories: boolean;
  canGenerateNamedStories: boolean;
  defaultAccountScopeType: string;
  defaultAccountIds: string[];
  maxTokensPerDay: number | null;
  maxTokensPerMonth: number | null;
  maxRequestsPerDay: number | null;
  maxRequestsPerMonth: number | null;
  maxStoriesPerMonth: number | null;
  assignments: Array<{
    userId: string;
    user: { name: string | null; email: string };
  }>;
}

export interface RoleAssignableUser {
  id: string;
  name: string | null;
  email: string;
  base_role: string;
  role_profile_id: string | null;
}

export interface UpsertRoleProfileRequest {
  key: string;
  name: string;
  description?: string;
  permissions: string[];
  can_access_anonymous_stories: boolean;
  can_generate_anonymous_stories: boolean;
  can_access_named_stories: boolean;
  can_generate_named_stories: boolean;
  default_account_scope_type: string;
  default_account_ids?: string[];
  max_tokens_per_day?: number | null;
  max_tokens_per_month?: number | null;
  max_requests_per_day?: number | null;
  max_requests_per_month?: number | null;
  max_stories_per_month?: number | null;
}

export interface StoryContextSettings {
  company_overview: string;
  products: string[];
  target_personas: string[];
  target_industries: string[];
  differentiators: string[];
  proof_points: string[];
  banned_claims: string[];
  writing_style_guide: string;
  approved_terminology: string[];
  value_proposition: string;
  competitive_advantages: string[];
  key_metrics: string[];
  customer_segments: string[];
  brand_voice: string;
  call_to_action: string;
  default_story_length: StoryLength;
  default_story_outline: StoryOutline;
  default_story_format: StoryFormat | null;
  default_story_type: StoryTypeInput;
  default_target_audience: TargetAudience;
  default_confidentiality_level: ConfidentialityLevel;
}

export interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  category: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  severity: string;
  metadata: unknown;
  ip_address: string | null;
  user_agent: string | null;
}

// ─── Transcript Viewer ──────────────────────────────────────────────────────

export interface TranscriptSegmentTag {
  funnelStage: string;
  topic: string;
  confidence: number;
}

export interface TranscriptSegment {
  id: string;
  chunkIndex: number;
  speaker: string | null;
  text: string;
  startMs: number | null;
  endMs: number | null;
  tags: TranscriptSegmentTag[];
}

export interface TranscriptParticipant {
  name: string | null;
  email: string | null;
  isHost: boolean;
  contactName: string | null;
  contactTitle: string | null;
}

export interface TranscriptEntityInfo {
  accountId: string | null;
  accountName: string | null;
  accountDomain: string | null;
  accountIndustry: string | null;
}

export interface TranscriptCallMeta {
  id: string;
  title: string | null;
  provider: string;
  duration: number | null;
  occurredAt: string;
  recordingUrl: string | null;
  language: string;
  wordCount: number;
}

export interface TranscriptData {
  meta: TranscriptCallMeta;
  segments: TranscriptSegment[];
  participants: TranscriptParticipant[];
  entity: TranscriptEntityInfo;
  callTags: TranscriptSegmentTag[];
}

// ─── Editor Page ────────────────────────────────────────────────────────────

export interface EditorPageData {
  pageId: string;
  title: string;
  subtitle: string;
  editableBody: string;
  status: string;
  visibility: string;
  includeCompanyName: boolean;
  canPublishNamed: boolean;
}

// ─── Dashboard Pages ────────────────────────────────────────────────────────

export interface DashboardStats {
  totalPages: number;
  publishedPages: number;
  draftPages: number;
  totalViews: number;
}

export interface DashboardPageSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  viewCount: number;
  accountName: string;
  createdByName: string;
  createdByEmail: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface DashboardCreator {
  userId: string;
  name: string | null;
  email: string;
}

// ─── Chatbot Connector ──────────────────────────────────────────────────────

export interface ChatAccount {
  id: string;
  name: string;
  domain: string | null;
  call_count: number;
}

export interface ChatSource {
  call_id: string;
  call_title: string;
  call_date: string;
  speaker: string;
  text: string;
  relevance_score: number;
}

// ─── Analytics Dashboard ────────────────────────────────────────────────────

export interface AnalyticsData {
  summary: {
    totalCalls: number;
    totalAccounts: number;
    totalTranscriptHours: number;
    overallResolutionRate: number;
    totalQuotes: number;
    totalPageViews: number;
  };
  callsPerWeek: Array<{ weekStart: string; count: number }>;
  funnelDistribution: Array<{ stage: string; count: number }>;
  topAccounts: Array<{ accountName: string; callCount: number }>;
  entityResolutionOverTime: Array<{ weekStart: string; rate: number; resolvedCalls: number; totalCalls: number }>;
  topTopics: Array<{ label: string; count: number; funnelStage: string }>;
  quoteLeaderboard: Array<{ accountName: string; quoteCount: number }>;
  topPagesByViews: Array<{ title: string; slug: string; viewCount: number; publishedAt: string | null }>;
  viewsOverTime: Array<{ weekStart: string; totalViews: number; pagesPublished: number }>;
}

// ─── Account Journey ────────────────────────────────────────────────────────

export interface JourneyAccount {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  employee_count: number | null;
  annual_revenue: number | null;
  salesforce_id: string | null;
  hubspot_id: string | null;
  contact_count: number;
  call_count: number;
  total_call_minutes: number;
  story_count: number;
  top_contacts: Array<{
    id: string;
    name: string | null;
    email: string | null;
    title: string | null;
    call_appearances: number;
  }>;
}

export interface JourneyTimelineNode {
  type: "call" | "crm_event";
  id: string;
  date: string;
  // Call-specific
  title?: string;
  provider?: string;
  duration?: number;
  primary_stage?: string;
  participants?: Array<{
    id: string;
    name: string | null;
    email: string | null;
    is_host: boolean;
    title: string | null;
  }>;
  tags?: Array<{
    funnel_stage: string;
    topic: string;
    topic_label: string;
    confidence: number;
  }>;
  // CRM event-specific
  event_type?: string;
  stage_name?: string;
  opportunity_id?: string;
  amount?: number;
  description?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

const BASE_URL = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function buildStory(
  req: BuildStoryRequest
): Promise<BuildStoryResponse> {
  return request<BuildStoryResponse>("/stories/build", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getAccountStories(
  accountId: string
): Promise<{ stories: StorySummary[] }> {
  return request<{ stories: StorySummary[] }>(`/stories/${accountId}`);
}

export async function createLandingPage(
  req: CreateLandingPageRequest
): Promise<CreateLandingPageResponse> {
  return request<CreateLandingPageResponse>("/pages", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ─── Admin Account Access ───────────────────────────────────────────────────

export async function getAccessUsers(): Promise<{ users: AccessUser[] }> {
  return request<{ users: AccessUser[] }>("/dashboard/access");
}

export async function searchAccounts(query: string): Promise<{ accounts: AccountSearchResult[] }> {
  return request<{ accounts: AccountSearchResult[] }>(`/dashboard/accounts/search?q=${encodeURIComponent(query)}`);
}

export async function grantAccess(body: {
  user_id: string;
  scope_type: string;
  account_id?: string;
  account_ids?: string[];
  crm_report_id?: string;
  crm_provider?: string;
  crm_report_name?: string;
}): Promise<void> {
  return request<void>("/dashboard/access/grant", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function revokeAccess(grantId: string): Promise<void> {
  return request<void>(`/dashboard/access/${grantId}`, { method: "DELETE" });
}

export async function syncAccessGrant(grantId: string): Promise<{ account_count: number }> {
  return request<{ account_count: number }>(`/dashboard/access/${grantId}/sync`, { method: "POST" });
}

export async function getCrmReports(provider: string): Promise<{ reports: CrmReport[] }> {
  return request<{ reports: CrmReport[] }>(`/dashboard/crm-reports?provider=${encodeURIComponent(provider)}`);
}

// ─── Admin Permissions ──────────────────────────────────────────────────────

export async function getPermissions(): Promise<{ users: PermissionUser[] }> {
  return request<{ users: PermissionUser[] }>("/dashboard/permissions");
}

export async function grantPermission(userId: string, permission: string): Promise<void> {
  return request<void>("/dashboard/permissions/grant", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, permission }),
  });
}

export async function revokePermission(userId: string, permission: string): Promise<void> {
  return request<void>("/dashboard/permissions/revoke", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, permission }),
  });
}

export async function getStoryContextSettings(): Promise<StoryContextSettings> {
  return request<StoryContextSettings>("/dashboard/story-context");
}

export async function updateStoryContextSettings(
  body: StoryContextSettings
): Promise<void> {
  return request<void>("/dashboard/story-context", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function getAuditLogs(params?: {
  limit?: number;
  category?: string;
  actor_user_id?: string;
}): Promise<{ logs: AuditLogEntry[] }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.category) qs.set("category", params.category);
  if (params?.actor_user_id) qs.set("actor_user_id", params.actor_user_id);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ logs: AuditLogEntry[] }>(`/dashboard/audit-logs${suffix}`);
}

export async function getRoleProfiles(): Promise<{
  roles: RoleProfile[];
  users: RoleAssignableUser[];
}> {
  return request<{ roles: RoleProfile[]; users: RoleAssignableUser[] }>("/dashboard/roles");
}

export async function createRoleProfile(body: UpsertRoleProfileRequest): Promise<RoleProfile> {
  const res = await request<{ role: RoleProfile }>("/dashboard/roles", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.role;
}

export async function updateRoleProfile(roleId: string, body: UpsertRoleProfileRequest): Promise<RoleProfile> {
  const res = await request<{ role: RoleProfile }>(`/dashboard/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return res.role;
}

export async function deleteRoleProfile(roleId: string): Promise<void> {
  return request<void>(`/dashboard/roles/${roleId}`, {
    method: "DELETE",
  });
}

export async function assignRoleProfile(userId: string, roleProfileId: string): Promise<void> {
  return request<void>("/dashboard/roles/assign", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role_profile_id: roleProfileId }),
  });
}

// ─── Transcript Viewer ──────────────────────────────────────────────────────

export async function getTranscriptData(callId: string): Promise<TranscriptData> {
  return request<TranscriptData>(`/calls/${callId}/transcript`);
}

// ─── Editor Page ────────────────────────────────────────────────────────────

export async function getEditorPageData(pageId: string): Promise<EditorPageData> {
  return request<EditorPageData>(`/pages/${pageId}/edit-data`);
}

export async function savePageDraft(pageId: string, body: string): Promise<void> {
  return request<void>(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ editable_body: body }),
  });
}

export async function getPreviewScrub(pageId: string): Promise<{
  original: { body: string };
  scrubbed: { body: string };
  replacements_made: number;
}> {
  return request<{ original: { body: string }; scrubbed: { body: string }; replacements_made: number }>(
    `/pages/${pageId}/preview-scrub`,
    { method: "POST" }
  );
}

export async function publishPage(pageId: string, options: {
  visibility: string;
  password?: string;
  expires_at?: string;
}): Promise<{ url: string }> {
  return request<{ url: string }>(`/pages/${pageId}/publish`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

// ─── Dashboard Pages ────────────────────────────────────────────────────────

export async function getDashboardPagesData(params?: {
  search?: string;
  status?: string;
  visibility?: string;
  created_by?: string;
  sort_by?: string;
  sort_dir?: string;
}): Promise<{
  stats: DashboardStats;
  pages: DashboardPageSummary[];
  creators: DashboardCreator[];
  isAdmin: boolean;
}> {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  }
  const query = qs.toString();
  return request<{
    stats: DashboardStats;
    pages: DashboardPageSummary[];
    creators: DashboardCreator[];
    isAdmin: boolean;
  }>(`/dashboard/pages/data${query ? `?${query}` : ""}`);
}

export async function unpublishPage(pageId: string): Promise<void> {
  return request<void>(`/pages/${pageId}/unpublish`, { method: "POST" });
}

export async function archivePage(pageId: string): Promise<void> {
  return request<void>(`/pages/${pageId}/archive`, { method: "POST" });
}

export async function deletePage(pageId: string): Promise<void> {
  return request<void>(`/pages/${pageId}`, { method: "DELETE" });
}

// ─── Chatbot Connector ──────────────────────────────────────────────────────

export async function getChatAccounts(search?: string): Promise<{ accounts: ChatAccount[] }> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<{ accounts: ChatAccount[] }>(`/rag/accounts${qs}`);
}

export async function sendChatMessage(body: {
  query: string;
  account_id: string | null;
  history: Array<{ role: string; content: string }>;
  top_k?: number;
}): Promise<{ answer: string; sources: ChatSource[] }> {
  return request<{ answer: string; sources: ChatSource[] }>("/rag/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Analytics Dashboard ────────────────────────────────────────────────────

export async function getAnalyticsData(): Promise<AnalyticsData> {
  return request<AnalyticsData>("/analytics");
}

// ─── Account Journey ────────────────────────────────────────────────────────

export async function getAccountJourney(accountId: string): Promise<{
  account: JourneyAccount;
  timeline: JourneyTimelineNode[];
  stage_counts: Record<string, number>;
}> {
  return request<{
    account: JourneyAccount;
    timeline: JourneyTimelineNode[];
    stage_counts: Record<string, number>;
  }>(`/accounts/${accountId}/journey`);
}

// ─── Session Management ──────────────────────────────────────────────────────

export interface SessionPolicy {
  id: string;
  maxSessionDurationMs: number | null;
  idleTimeoutMs: number | null;
  mfaRequired: boolean;
  mfaGracePeriodMs: number | null;
  ipAllowlistEnabled: boolean;
  defaultAction: string;
}

export interface UserSessionEntry {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  lastActiveAt: string;
  createdAt: string;
}

export interface IpAllowlistEntry {
  id: string;
  cidr: string;
  label: string | null;
  createdAt: string;
}

export async function getSessionPolicy(): Promise<{ policy: SessionPolicy | null }> {
  return request<{ policy: SessionPolicy | null }>("/sessions/policy");
}

export async function updateSessionPolicy(policy: Partial<SessionPolicy>): Promise<{ policy: SessionPolicy }> {
  return request<{ policy: SessionPolicy }>("/sessions/policy", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export async function getActiveSessions(): Promise<{ sessions: UserSessionEntry[] }> {
  return request<{ sessions: UserSessionEntry[] }>("/sessions/sessions");
}

export async function revokeSession(sessionId: string): Promise<void> {
  return request<void>(`/sessions/sessions/${sessionId}`, { method: "DELETE" });
}

export async function revokeAllSessions(): Promise<void> {
  return request<void>("/sessions/sessions/revoke-all", { method: "POST" });
}

export async function getIpAllowlist(): Promise<{ entries: IpAllowlistEntry[] }> {
  return request<{ entries: IpAllowlistEntry[] }>("/sessions/ip-allowlist");
}

export async function addIpAllowlistEntry(entry: { cidr: string; label?: string }): Promise<{ entry: IpAllowlistEntry }> {
  return request<{ entry: IpAllowlistEntry }>("/sessions/ip-allowlist", {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

export async function removeIpAllowlistEntry(entryId: string): Promise<void> {
  return request<void>(`/sessions/ip-allowlist/${entryId}`, { method: "DELETE" });
}

// ─── Integration Health ──────────────────────────────────────────────────────

export interface IntegrationHealthSummary {
  provider: string;
  status: string;
  lastRunAt: string | null;
  successRate: number;
  totalRuns: number;
  dlqCount: number;
}

export interface IntegrationRunEntry {
  id: string;
  provider: string;
  status: string;
  itemsProcessed: number;
  itemsFailed: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface DlqEntry {
  id: string;
  externalId: string | null;
  errorMessage: string;
  retryCount: number;
  status: string;
  createdAt: string;
}

export async function getIntegrationHealth(): Promise<{ providers: IntegrationHealthSummary[] }> {
  return request<{ providers: IntegrationHealthSummary[] }>("/integration-health/health");
}

export async function getIntegrationRuns(params?: {
  provider?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ runs: IntegrationRunEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
  const query = qs.toString();
  return request<{ runs: IntegrationRunEntry[]; total: number }>(`/integration-health/runs${query ? `?${query}` : ""}`);
}

export async function getDlqEntries(params?: {
  status?: string;
  provider?: string;
}): Promise<{ entries: DlqEntry[] }> {
  const qs = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  const query = qs.toString();
  return request<{ entries: DlqEntry[] }>(`/integration-health/dlq${query ? `?${query}` : ""}`);
}

export async function replayDlqEntry(entryId: string): Promise<void> {
  return request<void>(`/integration-health/dlq/${entryId}/replay`, { method: "POST" });
}

export async function discardDlqEntry(entryId: string): Promise<void> {
  return request<void>(`/integration-health/dlq/${entryId}`, { method: "DELETE" });
}

// ─── Data Governance ──────────────────────────────────────────────────────────

export interface GovernancePolicy {
  defaultRetentionDays: number;
  callRetentionDays: number;
  storyRetentionDays: number;
  transcriptRetentionDays: number;
  piiExportAllowed: boolean;
  namedStoryExportAllowed: boolean;
}

export interface RetentionJobEntry {
  id: string;
  policyName: string;
  targetType: string;
  retentionDays: number;
  status: string;
  itemsEvaluated: number;
  itemsDeleted: number;
  scheduledAt: string;
}

export interface LegalHoldEntry {
  id: string;
  scope: string;
  targetId: string | null;
  reason: string;
  holdStartedAt: string;
  holdEndedAt: string | null;
}

export interface DeletionRequestEntry {
  id: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  status: string;
  createdAt: string;
}

export async function getGovernancePolicy(): Promise<{ policy: GovernancePolicy | null }> {
  return request<{ policy: GovernancePolicy | null }>("/governance/policy");
}

export async function updateGovernancePolicy(policy: Partial<GovernancePolicy>): Promise<{ policy: GovernancePolicy }> {
  return request<{ policy: GovernancePolicy }>("/governance/policy", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export async function getRetentionJobs(): Promise<{ jobs: RetentionJobEntry[] }> {
  return request<{ jobs: RetentionJobEntry[] }>("/governance/retention");
}

export async function getLegalHolds(): Promise<{ holds: LegalHoldEntry[] }> {
  return request<{ holds: LegalHoldEntry[] }>("/governance/legal-holds");
}

export async function createLegalHold(hold: { scope: string; targetId?: string; reason: string; externalRef?: string }): Promise<{ hold: LegalHoldEntry }> {
  return request<{ hold: LegalHoldEntry }>("/governance/legal-holds", {
    method: "POST",
    body: JSON.stringify(hold),
  });
}

export async function releaseLegalHold(holdId: string): Promise<void> {
  return request<void>(`/governance/legal-holds/${holdId}/release`, { method: "POST" });
}

export async function getDeletionRequests(): Promise<{ requests: DeletionRequestEntry[] }> {
  return request<{ requests: DeletionRequestEntry[] }>("/governance/deletion-requests");
}

export async function createDeletionRequest(req: { targetType: string; targetId: string; reason?: string }): Promise<{ request: DeletionRequestEntry }> {
  return request<{ request: DeletionRequestEntry }>("/governance/deletion-requests", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function approveDeletion(requestId: string): Promise<void> {
  return request<void>(`/governance/deletion-requests/${requestId}/approve`, { method: "POST" });
}

export async function rejectDeletion(requestId: string): Promise<void> {
  return request<void>(`/governance/deletion-requests/${requestId}/reject`, { method: "POST" });
}

// ─── Automation ──────────────────────────────────────────────────────────────

export interface AutomationRuleEntry {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: unknown;
  actionType: string;
  actionConfig: unknown;
  enabled: boolean;
  priority: number;
  lastTriggeredAt: string | null;
}

export interface AutomationExecutionEntry {
  id: string;
  ruleId: string;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface DeliveryTargetEntry {
  id: string;
  name: string;
  targetType: string;
  config: unknown;
  enabled: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
}

export async function getAutomationRules(): Promise<{ rules: AutomationRuleEntry[] }> {
  return request<{ rules: AutomationRuleEntry[] }>("/automation/rules");
}

export async function createAutomationRule(rule: {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: unknown;
  actionType: string;
  actionConfig: unknown;
  priority?: number;
}): Promise<{ rule: AutomationRuleEntry }> {
  return request<{ rule: AutomationRuleEntry }>("/automation/rules", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function updateAutomationRule(ruleId: string, updates: Partial<AutomationRuleEntry>): Promise<{ rule: AutomationRuleEntry }> {
  return request<{ rule: AutomationRuleEntry }>(`/automation/rules/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteAutomationRule(ruleId: string): Promise<void> {
  return request<void>(`/automation/rules/${ruleId}`, { method: "DELETE" });
}

export async function getAutomationExecutions(params?: {
  ruleId?: string;
  status?: string;
  limit?: number;
}): Promise<{ executions: AutomationExecutionEntry[] }> {
  const qs = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
  const query = qs.toString();
  return request<{ executions: AutomationExecutionEntry[] }>(`/automation/executions${query ? `?${query}` : ""}`);
}

export async function getDeliveryTargets(): Promise<{ targets: DeliveryTargetEntry[] }> {
  return request<{ targets: DeliveryTargetEntry[] }>("/automation/delivery-targets");
}

export async function createDeliveryTarget(target: {
  name: string;
  targetType: string;
  config: unknown;
}): Promise<{ target: DeliveryTargetEntry }> {
  return request<{ target: DeliveryTargetEntry }>("/automation/delivery-targets", {
    method: "POST",
    body: JSON.stringify(target),
  });
}

export async function deleteDeliveryTarget(targetId: string): Promise<void> {
  return request<void>(`/automation/delivery-targets/${targetId}`, { method: "DELETE" });
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingStep {
  id: string;
  stepKey: string;
  stepName: string;
  completed: boolean;
  completedAt: string | null;
  sortOrder: number;
}

export interface OrgHealthScore {
  id: string;
  overallScore: number;
  dimensions: Record<string, number>;
  trend: string | null;
  calculatedAt: string;
}

export async function getOnboardingProgress(): Promise<{ steps: OnboardingStep[] }> {
  return request<{ steps: OnboardingStep[] }>("/onboarding/progress");
}

export async function completeOnboardingStep(stepKey: string): Promise<{ step: OnboardingStep }> {
  return request<{ step: OnboardingStep }>(`/onboarding/progress/${stepKey}/complete`, { method: "POST" });
}

export async function initializeOnboarding(): Promise<{ steps: OnboardingStep[] }> {
  return request<{ steps: OnboardingStep[] }>("/onboarding/progress/initialize", { method: "POST" });
}

export async function getOrgHealthScore(): Promise<{ score: OrgHealthScore | null }> {
  return request<{ score: OrgHealthScore | null }>("/onboarding/health");
}

export async function calculateOrgHealthScore(): Promise<{ score: OrgHealthScore }> {
  return request<{ score: OrgHealthScore }>("/onboarding/health/calculate", { method: "POST" });
}

// ─── Approval Workflows ──────────────────────────────────────────────────────

export interface ApprovalWorkflowEntry {
  id: string;
  name: string;
  targetType: string;
  stepsJson: unknown;
  enabled: boolean;
}

export interface ApprovalRequestEntry {
  id: string;
  workflowId: string;
  targetType: string;
  targetId: string;
  requesterId: string;
  state: string;
  currentStep: number;
  reviewerId: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export async function getApprovalWorkflows(): Promise<{ workflows: ApprovalWorkflowEntry[] }> {
  return request<{ workflows: ApprovalWorkflowEntry[] }>("/approvals/workflows");
}

export async function createApprovalWorkflow(workflow: {
  name: string;
  targetType: string;
  stepsJson: unknown;
}): Promise<{ workflow: ApprovalWorkflowEntry }> {
  return request<{ workflow: ApprovalWorkflowEntry }>("/approvals/workflows", {
    method: "POST",
    body: JSON.stringify(workflow),
  });
}

export async function getApprovalRequests(params?: { state?: string; targetType?: string }): Promise<{ requests: ApprovalRequestEntry[] }> {
  const qs = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  const query = qs.toString();
  return request<{ requests: ApprovalRequestEntry[] }>(`/approvals/requests${query ? `?${query}` : ""}`);
}

export async function approveRequest(requestId: string, note?: string): Promise<void> {
  return request<void>(`/approvals/requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function rejectRequest(requestId: string, note?: string): Promise<void> {
  return request<void>(`/approvals/requests/${requestId}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

// ─── CRM Writeback ───────────────────────────────────────────────────────────

export interface CrmWritebackEntry {
  id: string;
  provider: string;
  writebackType: string;
  targetObject: string;
  targetId: string;
  status: string;
  retryCount: number;
  errorMessage: string | null;
  createdAt: string;
}

export async function getCrmWritebacks(params?: {
  status?: string;
  provider?: string;
  limit?: number;
}): Promise<{ actions: CrmWritebackEntry[] }> {
  const qs = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
  const query = qs.toString();
  return request<{ actions: CrmWritebackEntry[] }>(`/crm-writeback${query ? `?${query}` : ""}`);
}

export async function approveCrmWriteback(actionId: string): Promise<void> {
  return request<void>(`/crm-writeback/${actionId}/approve`, { method: "POST" });
}

export async function rejectCrmWriteback(actionId: string): Promise<void> {
  return request<void>(`/crm-writeback/${actionId}/reject`, { method: "POST" });
}

// ─── KPI Reporting ───────────────────────────────────────────────────────────

export interface PipelineMetrics {
  totalAccounts: number;
  accountsWithStories: number;
  storiesGenerated: number;
  pagesPublished: number;
  averageStoriesPerAccount: number;
}

export interface ContentMetrics {
  totalStories: number;
  storiesByType: Record<string, number>;
  storiesByFunnel: Record<string, number>;
  averageStoryLength: number;
  totalLandingPages: number;
  publishedPages: number;
  draftPages: number;
}

export interface TeamMetrics {
  totalUsers: number;
  activeUsers: number;
  storiesPerUser: Record<string, number>;
  topContributors: Array<{ userId: string; name: string | null; storyCount: number }>;
}

export interface ExecutiveReport {
  generatedAt: string;
  timeRange: { startDate: string; endDate: string };
  pipeline: PipelineMetrics;
  content: ContentMetrics;
  team: TeamMetrics;
}

export async function getKpiPipeline(start?: string, end?: string): Promise<{ metrics: PipelineMetrics }> {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  const query = qs.toString();
  return request<{ metrics: PipelineMetrics }>(`/kpi/pipeline${query ? `?${query}` : ""}`);
}

export async function getKpiContent(start?: string, end?: string): Promise<{ metrics: ContentMetrics }> {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  const query = qs.toString();
  return request<{ metrics: ContentMetrics }>(`/kpi/content${query ? `?${query}` : ""}`);
}

export async function getKpiTeam(start?: string, end?: string): Promise<{ metrics: TeamMetrics }> {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  const query = qs.toString();
  return request<{ metrics: TeamMetrics }>(`/kpi/team${query ? `?${query}` : ""}`);
}

export async function getExecutiveReport(start?: string, end?: string): Promise<{ report: ExecutiveReport }> {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  const query = qs.toString();
  return request<{ report: ExecutiveReport }>(`/kpi/executive${query ? `?${query}` : ""}`);
}

// ─── Role Dashboards ─────────────────────────────────────────────────────────

export async function getRevOpsDashboard(): Promise<any> {
  return request<any>("/dashboards/revops");
}

export async function getMarketingDashboard(): Promise<any> {
  return request<any>("/dashboards/marketing");
}

export async function getSalesDashboard(): Promise<any> {
  return request<any>("/dashboards/sales");
}

export async function getCsDashboard(): Promise<any> {
  return request<any>("/dashboards/cs");
}

// ─── Seat Management ─────────────────────────────────────────────────────────

export interface SeatUsage {
  seatLimit: number | null;
  seatsUsed: number;
  seatsAvailable: number | null;
  overLimit: boolean;
}

export interface UsageSummaryData {
  storiesGenerated: number;
  pagesPublished: number;
  callsProcessed: number;
  aiTokensUsed: number;
  apiCallsMade: number;
}

export interface EntitlementEntry {
  feature: string;
  entitled: boolean;
  limit: number | null;
  used: number;
}

export async function getSeatUsage(): Promise<{ usage: SeatUsage }> {
  return request<{ usage: SeatUsage }>("/billing/seats/seats");
}

export async function getUsageSummary(start?: string, end?: string): Promise<{ summary: UsageSummaryData }> {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  const query = qs.toString();
  return request<{ summary: UsageSummaryData }>(`/billing/seats/usage${query ? `?${query}` : ""}`);
}

export async function getEntitlements(): Promise<{ entitlements: EntitlementEntry[] }> {
  return request<{ entitlements: EntitlementEntry[] }>("/billing/seats/entitlements");
}

export async function updateSeatLimit(limit: number | null): Promise<{ usage: SeatUsage }> {
  return request<{ usage: SeatUsage }>("/billing/seats/seats/limit", {
    method: "PUT",
    body: JSON.stringify({ limit }),
  });
}

// ─── DR Readiness ────────────────────────────────────────────────────────────

export async function getDrStatus(): Promise<any> {
  return request<any>("/dr/status");
}

export async function validateDr(): Promise<any> {
  return request<any>("/dr/validate", { method: "POST" });
}

export async function getExportManifest(): Promise<any> {
  return request<any>("/dr/export-manifest");
}

// ─── Support Console ─────────────────────────────────────────────────────────

export async function getSupportOrgOverview(): Promise<any> {
  return request<any>("/support/org-overview");
}

export async function getSupportUsers(): Promise<any> {
  return request<any>("/support/users");
}

export async function getSupportFeatureFlags(): Promise<any> {
  return request<any>("/support/feature-flags");
}

export async function getSupportRecentActivity(limit?: number): Promise<any> {
  const qs = limit ? `?limit=${limit}` : "";
  return request<any>(`/support/recent-activity${qs}`);
}

export async function getSupportIntegrationStatus(): Promise<any> {
  return request<any>("/support/integration-status");
}
