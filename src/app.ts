/**
 * Express Application
 *
 * Creates and configures the Express app with all middleware and route
 * registration. Separated from the server entry point so the app can
 * be imported independently for testing.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { WorkOS } from "@workos-inc/node";

// ─── Webhooks ────────────────────────────────────────────────────────────────
import { createMergeWebhookHandler } from "./webhooks/merge-webhook.js";
import { createGongWebhookHandler } from "./webhooks/gong-webhook.js";
import { createGrainWebhookHandler } from "./webhooks/grain-webhook.js";

// ─── API Routes ──────────────────────────────────────────────────────────────
import { createAuthRoutes } from "./api/auth-routes.js";
import { createRAGRoutes } from "./api/rag-routes.js";
import { createStoryRoutes } from "./api/story-routes.js";
import { createLandingPageRoutes } from "./api/landing-page-routes.js";
import { createExportRoutes } from "./api/export-routes.js";
import { createPublicPageRoutes } from "./api/public-page-renderer.js";
import { createDashboardRoutes } from "./api/dashboard-routes.js";
import { createAdminMetricsRoutes } from "./api/admin-metrics-routes.js";
import { createQueueHealthRoutes } from "./api/queue-health-routes.js";
import { createApiKeyRoutes } from "./api/api-key-routes.js";
import { createMergeRoutes } from "./api/merge-routes.js";
import { createIntegrationRoutes } from "./api/integration-routes.js";
import { createAISettingsRoutes } from "./api/ai-settings-routes.js";
import { createPlatformAdminRoutes } from "./api/platform-admin-routes.js";
import { createTranscriptViewerRoutes } from "./api/transcript-viewer-routes.js";
import { createEntityResolutionRoutes } from "./api/entity-resolution-routes.js";
import { createEditorPageRoutes } from "./api/editor-page-renderer.js";
import { createDashboardPageRoutes } from "./api/dashboard-page-renderer.js";
import { createAdminAccountAccessPage } from "./api/admin-account-access-page.js";
import { createAdminPermissionsPage } from "./api/admin-permissions-page.js";
import { createOrgSettingsRoutes } from "./api/org-settings-routes.js";
import { createIntegrationsRoutes } from "./api/integrations-routes.js";
import { createBillingRoutes } from "./api/billing-routes.js";
import { createApiKeysRoutes } from "./api/api-keys-routes.js";
import { createAccountsRoutes } from "./api/accounts-routes.js";
import { createAccountJourneyRoutes } from "./api/account-journey-routes.js";
import { createAccountMergeRoutes } from "./api/account-merge-routes.js";
import { createChatbotConnectorRoutes } from "./api/chatbot-connector.js";
import { createSetupRoutes } from "./api/setup-routes.js";
import { createNotificationRoutes } from "./api/notification-routes.js";
import { createAnalyticsRoutes } from "./api/analytics-routes.js";

// ─── Enterprise API Routes ──────────────────────────────────────────────────
import { createSessionRoutes } from "./api/session-routes.js";
import { createScimRoutes } from "./api/scim-routes.js";
import { createIntegrationHealthRoutes } from "./api/integration-health-routes.js";
import { createGovernanceRoutes } from "./api/governance-routes.js";
import { createCrmWritebackRoutes } from "./api/crm-writeback-routes.js";
import { createAutomationRoutes } from "./api/automation-routes.js";
import { createApprovalRoutes } from "./api/approval-routes.js";
import { createOnboardingRoutes } from "./api/onboarding-routes.js";
import { createArtifactRoutes } from "./api/artifact-routes.js";
import { createDataQualityRoutes } from "./api/data-quality-routes.js";
import { createMergePreviewRoutes } from "./api/merge-preview-routes.js";
import { createKpiRoutes } from "./api/kpi-routes.js";
import { createRoleDashboardRoutes } from "./api/role-dashboard-routes.js";
import { createSeatManagementRoutes } from "./api/seat-management-routes.js";
import { createDrReadinessRoutes } from "./api/dr-readiness-routes.js";
import { createSupportConsoleRoutes } from "./api/support-console-routes.js";

// ─── Middleware ───────────────────────────────────────────────────────────────
import { requireAuth } from "./middleware/auth.js";
import {
  createTrialGate,
  createCheckoutHandler,
  createPortalHandler,
  createStripeWebhookHandler,
} from "./middleware/billing.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requestLoggingMiddleware } from "./middleware/request-logging.js";
import { createApiKeyAuth, requireScope } from "./middleware/api-key-auth.js";
import { createDevAuthBypass } from "./middleware/dev-auth.js";
import {
  createRateLimiter,
  apiRateLimiter,
  webhookRateLimiter,
  passwordRateLimiter,
} from "./middleware/rate-limiter.js";
import { createApiUsageLogger } from "./middleware/api-usage-logger.js";
import { requirePermission } from "./middleware/permissions.js";

// ─── Observability ───────────────────────────────────────────────────────────
import { Sentry } from "./lib/sentry.js";

import type { Services } from "./services.js";
import type { Queues } from "./queues.js";

export interface AppDeps {
  prisma: PrismaClient;
  stripe: Stripe;
  workos: WorkOS;
  queues: Queues;
  services: Services;
}

export function createApp(deps: AppDeps): express.Application {
  const { prisma, stripe, workos, queues, services } = deps;
  const {
    ragEngine,
    storyBuilder,
    mergeClient,
    providerRegistry,
    syncEngine,
    aiConfigService,
    aiUsageTracker,
    notificationService,
  } = services;

  const app = express();

  // Sentry request handler (must be first middleware)
  Sentry.setupExpressErrorHandler(app);

  // Global middleware
  app.use(helmet());

  const allowedOrigins = process.env.APP_URL
    ? [process.env.APP_URL]
    : ["http://localhost:3000"];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // Request ID tracing (before any route handlers)
  app.use(requestIdMiddleware);

  // Stripe webhooks need raw body
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    webhookRateLimiter,
    createStripeWebhookHandler(prisma, stripe)
  );

  // All other routes use JSON parsing
  app.use(express.json({ limit: "10mb" }));

  // Request logging (after body parsing so we can log status codes)
  app.use(requestLoggingMiddleware);

  // ─── Public Routes ───────────────────────────────────────────────────────

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "storyengine", version: "1.0.0" });
  });

  // Webhook endpoints (authenticated by signature, not user auth)
  app.post(
    "/api/webhooks/merge",
    express.raw({ type: "application/json" }),
    webhookRateLimiter,
    createMergeWebhookHandler({ prisma, processingQueue: queues.processingQueue })
  );

  app.post(
    "/api/webhooks/gong",
    express.raw({ type: "application/json" }),
    webhookRateLimiter,
    createGongWebhookHandler({ prisma, processingQueue: queues.processingQueue })
  );

  app.post(
    "/api/webhooks/grain",
    express.raw({ type: "application/json" }),
    webhookRateLimiter,
    createGrainWebhookHandler({ prisma, processingQueue: queues.processingQueue })
  );

  // Public landing pages — no auth, served at /s/:slug
  app.use("/s", passwordRateLimiter, createPublicPageRoutes(prisma));

  // ─── Admin Metrics ─────────────────────────────────────────────────────
  app.use("/api/admin/metrics", createAdminMetricsRoutes(prisma));
  app.use(
    "/api/admin/queues",
    requirePermission(prisma, "manage_permissions"),
    createQueueHealthRoutes(queues)
  );

  // ─── Public API (API-key authenticated, for third-party consumers) ─────

  const apiKeyAuth = createApiKeyAuth(prisma);
  const publicApiRateLimiter = createRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
  });
  const apiUsageLogger = createApiUsageLogger(prisma);

  app.use(
    "/api/v1/rag",
    apiKeyAuth,
    requireScope("rag:query"),
    publicApiRateLimiter,
    apiUsageLogger,
    createRAGRoutes(ragEngine, prisma)
  );

  // ─── Platform Admin (API-key protected, no user auth) ──────────────────
  app.use("/api/platform", createPlatformAdminRoutes(aiConfigService));

  // ─── Auth Routes (public — no JWT required) ────────────────────────────
  app.use("/api/auth", createAuthRoutes(prisma, workos));

  // Local development convenience: inject seeded auth context when enabled.
  app.use(createDevAuthBypass(prisma));

  // ─── Setup Wizard (before auth — needed for first-run onboarding) ──────
  app.use("/api/setup", createSetupRoutes(prisma, stripe));

  // ─── Authenticated Routes ──────────────────────────────────────────────
  app.use(requireAuth);

  const trialGate = createTrialGate(prisma, stripe);

  // Billing
  app.post("/api/billing/checkout", createCheckoutHandler(prisma, stripe));
  app.post("/api/billing/portal", createPortalHandler(prisma, stripe));

  // API Key Management (behind auth + trial gate)
  app.use("/api/keys", trialGate, createApiKeyRoutes(prisma));

  // RAG Chatbot Connector — internal use (behind trial gate)
  app.use(
    "/api/rag",
    trialGate,
    apiRateLimiter,
    createRAGRoutes(ragEngine, prisma)
  );

  // Story Builder (behind trial gate)
  app.use(
    "/api/stories",
    trialGate,
    apiRateLimiter,
    createStoryRoutes(storyBuilder, prisma)
  );

  // Landing Pages — CRUD, edit, publish, share (behind trial gate)
  app.use(
    "/api/pages",
    trialGate,
    apiRateLimiter,
    createLandingPageRoutes(prisma)
  );

  // Landing Page Exports — PDF, Google Doc, Slack (behind trial gate)
  app.use("/api/pages", trialGate, createExportRoutes(prisma));

  // Dashboard — stats, page list, admin settings, permissions, account access
  app.use(
    "/api/dashboard",
    trialGate,
    apiRateLimiter,
    createDashboardRoutes(prisma)
  );

  // Transcript Viewer
  app.use("/api/calls", trialGate, createTranscriptViewerRoutes(prisma));

  // Entity Resolution Queue
  app.use(
    "/api/entity-resolution",
    trialGate,
    createEntityResolutionRoutes(prisma)
  );

  // Accounts — list, journey timeline, merge tool
  app.use("/api/accounts", trialGate, createAccountsRoutes(prisma));
  app.use("/api/accounts", trialGate, createAccountJourneyRoutes(prisma));
  app.use("/api/accounts", trialGate, createAccountMergeRoutes(prisma));

  // Merge.dev integration
  app.use("/api/merge", trialGate, createMergeRoutes(mergeClient, prisma));

  // Direct integrations (Grain, Gong, Salesforce)
  app.use(
    "/api/integrations",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createIntegrationRoutes(prisma, providerRegistry, syncEngine)
  );

  // AI Settings
  app.use(
    "/api/ai",
    trialGate,
    createAISettingsRoutes(prisma, aiConfigService, aiUsageTracker)
  );

  // Notifications
  app.use(
    "/api/notifications",
    trialGate,
    createNotificationRoutes(notificationService)
  );

  // Analytics Dashboard
  app.use("/api/analytics", trialGate, createAnalyticsRoutes(prisma));

  // Admin Settings Pages
  app.use(
    "/api/settings/org",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createOrgSettingsRoutes(prisma)
  );
  app.use(
    "/api/settings/integrations",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createIntegrationsRoutes(prisma)
  );
  app.use(
    "/api/settings/billing",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createBillingRoutes(prisma, stripe)
  );
  app.use(
    "/api/settings/api-keys",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createApiKeysRoutes(prisma)
  );

  // Admin UI Pages (server-rendered)
  app.use(
    "/admin/account-access",
    trialGate,
    createAdminAccountAccessPage(prisma)
  );
  app.use("/admin/permissions", trialGate, createAdminPermissionsPage(prisma));

  // Editor & Dashboard Pages (server-rendered)
  app.use("/editor", trialGate, createEditorPageRoutes(prisma));
  app.use("/dashboard", trialGate, createDashboardPageRoutes(prisma));

  // Chatbot Connector UI
  app.use("/chat", trialGate, createChatbotConnectorRoutes());

  // ─── Enterprise: Session Management & IP Allowlists ───────────────────────
  app.use("/api/sessions", trialGate, createSessionRoutes(prisma));

  // ─── Enterprise: SCIM 2.0 Provisioning ────────────────────────────────────
  app.use(
    "/api/scim/v2",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createScimRoutes(prisma)
  );

  // ─── Enterprise: Integration Health & DLQ ─────────────────────────────────
  app.use(
    "/api/integration-health",
    trialGate,
    createIntegrationHealthRoutes(prisma)
  );

  // ─── Enterprise: Data Governance ──────────────────────────────────────────
  app.use("/api/governance", trialGate, createGovernanceRoutes(prisma));

  // ─── Enterprise: CRM Writeback ────────────────────────────────────────────
  app.use("/api/crm-writeback", trialGate, createCrmWritebackRoutes(prisma));

  // ─── Enterprise: Workflow Automation ──────────────────────────────────────
  app.use("/api/automation", trialGate, createAutomationRoutes(prisma));

  // ─── Enterprise: Approval Workflows ───────────────────────────────────────
  app.use("/api/approvals", trialGate, createApprovalRoutes(prisma));

  // ─── Enterprise: Onboarding & Health ──────────────────────────────────────
  app.use("/api/onboarding", trialGate, createOnboardingRoutes(prisma));

  // ─── Enterprise: Artifact Versioning & Publish Approvals ──────────────────
  app.use("/api/artifacts", trialGate, createArtifactRoutes(prisma));

  // ─── Enterprise: Data Quality, Lineage & Saved Views ─────────────────────
  app.use("/api/data-quality", trialGate, createDataQualityRoutes(prisma));

  // ─── Enterprise: Merge Previews & Shared Assets ──────────────────────────
  app.use("/api/merge-preview", trialGate, createMergePreviewRoutes(prisma));

  // ─── Enterprise: KPI Reporting ────────────────────────────────────────────
  app.use("/api/kpi", trialGate, createKpiRoutes(prisma));

  // ─── Enterprise: Role-Specific Dashboards ─────────────────────────────────
  app.use("/api/dashboards", trialGate, createRoleDashboardRoutes(prisma));

  // ─── Enterprise: Seat Management & Metering ───────────────────────────────
  app.use("/api/billing/seats", trialGate, createSeatManagementRoutes(prisma));

  // ─── Enterprise: DR Readiness ─────────────────────────────────────────────
  app.use(
    "/api/dr",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createDrReadinessRoutes(prisma)
  );

  // ─── Enterprise: Support Console ──────────────────────────────────────────
  app.use(
    "/api/support",
    trialGate,
    requirePermission(prisma, "manage_permissions"),
    createSupportConsoleRoutes(prisma)
  );

  return app;
}
