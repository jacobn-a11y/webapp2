-- Performance Indexes for Enterprise Features
-- Run after prisma db push / migrate

-- Story queries by account and date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_org_generated
  ON stories (organization_id, generated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_org_account_generated
  ON stories (organization_id, account_id, generated_at DESC);

-- Landing page queries by status and date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_landing_pages_org_status
  ON landing_pages (organization_id, status, created_at DESC);

-- Audit log queries (high-volume table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_org_category_date
  ON audit_logs (organization_id, category, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_org_actor_date
  ON audit_logs (organization_id, actor_user_id, created_at DESC);

-- Integration runs for health dashboards
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_integration_runs_org_provider_status
  ON integration_runs (organization_id, provider, status, started_at DESC);

-- DLQ entries for monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_integration_dlq_org_status_created
  ON integration_dlq_entries (organization_id, status, created_at DESC);

-- Automation executions for history queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_executions_rule_date
  ON automation_executions (rule_id, created_at DESC);

-- CRM writeback action queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_writebacks_org_scheduled
  ON crm_writeback_actions (organization_id, status, scheduled_at);

-- Approval requests by state
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_requests_org_state_date
  ON approval_requests (organization_id, state, created_at DESC);

-- Quality metrics for monitoring dashboards
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_metrics_org_name_date
  ON quality_metrics (organization_id, metric_name, measured_at DESC);

-- User sessions for session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions (user_id, revoked_at, expires_at);

-- Onboarding progress for wizard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_org_order
  ON onboarding_progress (organization_id, sort_order);

-- Retention jobs scheduling
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retention_jobs_scheduled
  ON retention_jobs (status, scheduled_at)
  WHERE status IN ('SCHEDULED', 'RUNNING');

-- Call tags for transcript filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_tags_call_stage
  ON call_tags (call_id, funnel_stage);

-- Transcript chunks for RAG and search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transcript_chunks_call_order
  ON transcript_chunks (call_id, chunk_order);
