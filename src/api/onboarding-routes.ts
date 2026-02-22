/**
 * Onboarding & Org Health Routes
 *
 * Provides admin endpoints for managing:
 *   - Onboarding wizard progress (list, complete, initialize steps)
 *   - Organization health score (view and calculate)
 *
 * Routes:
 *   GET  /progress                    — List onboarding steps for the org
 *   POST /progress/:stepKey/complete  — Mark a step as completed
 *   POST /progress/initialize         — Initialize default onboarding steps (admin only)
 *   GET  /health                      — Get latest org health score
 *   POST /health/calculate            — Trigger health score calculation (admin only)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";

// ─── Validation ──────────────────────────────────────────────────────────────

const CompleteStepSchema = z.object({
  metadata: z.record(z.unknown()).optional(),
});

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createOnboardingRoutes(prisma: PrismaClient): Router {
  const router = Router();

  const isAdmin = (req: Request): boolean => {
    const role = (req as any).userRole;
    return !!role && ["OWNER", "ADMIN"].includes(role);
  };

  // ── GET /progress ─────────────────────────────────────────────────
  //
  // List all onboarding steps for the authenticated org, sorted by sortOrder.

  router.get("/progress", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const steps = await prisma.onboardingProgress.findMany({
        where: { organizationId },
        orderBy: { sortOrder: "asc" },
      });

      res.json({
        steps: steps.map((s) => ({
          id: s.id,
          step_key: s.stepKey,
          step_name: s.stepName,
          completed: s.completed,
          completed_at: s.completedAt,
          completed_by_id: s.completedById,
          metadata: s.metadata,
          sort_order: s.sortOrder,
        })),
      });
    } catch (err) {
      console.error("List onboarding progress error:", err);
      res.status(500).json({ error: "Failed to load onboarding progress" });
    }
  });

  // ── POST /progress/:stepKey/complete ──────────────────────────────
  //
  // Mark a specific onboarding step as completed.

  router.post(
    "/progress/:stepKey/complete",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId;
      const userId = (req as any).userId;
      if (!organizationId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const parse = CompleteStepSchema.safeParse(req.body);
      if (!parse.success) {
        res
          .status(400)
          .json({ error: "validation_error", details: parse.error.issues });
        return;
      }

      const stepKey = req.params.stepKey as string;

      try {
        const step = await prisma.onboardingProgress.findUnique({
          where: {
            organizationId_stepKey: {
              organizationId,
              stepKey,
            },
          },
        });

        if (!step) {
          res.status(404).json({ error: "Onboarding step not found" });
          return;
        }

        if (step.completed) {
          res.json({
            already_completed: true,
            step_key: step.stepKey,
            completed_at: step.completedAt,
          });
          return;
        }

        const updated = await prisma.onboardingProgress.update({
          where: {
            organizationId_stepKey: {
              organizationId,
              stepKey,
            },
          },
          data: {
            completed: true,
            completedAt: new Date(),
            completedById: userId ?? null,
            metadata: (parse.data.metadata ?? step.metadata) as Prisma.InputJsonValue,
          },
        });

        res.json({
          completed: true,
          step_key: updated.stepKey,
          step_name: updated.stepName,
          completed_at: updated.completedAt,
        });
      } catch (err) {
        console.error("Complete onboarding step error:", err);
        res.status(500).json({ error: "Failed to complete onboarding step" });
      }
    }
  );

  // ── POST /progress/initialize ─────────────────────────────────────
  //
  // Initialize default onboarding steps for the org. Admin only.
  // Skips any steps that already exist (upsert behavior).

  router.post("/progress/initialize", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({
        error: "permission_denied",
        message: "Only admins and owners can initialize onboarding steps.",
      });
      return;
    }

    const defaultSteps = [
      { stepKey: "connect_integration", sortOrder: 1, stepName: "Connect Your First Integration" },
      { stepKey: "invite_team", sortOrder: 2, stepName: "Invite Team Members" },
      { stepKey: "configure_roles", sortOrder: 3, stepName: "Configure Role Permissions" },
      { stepKey: "generate_first_story", sortOrder: 4, stepName: "Generate Your First Story" },
      { stepKey: "publish_first_page", sortOrder: 5, stepName: "Publish Your First Landing Page" },
      { stepKey: "configure_brand", sortOrder: 6, stepName: "Set Up Brand & Style Guide" },
      { stepKey: "review_security", sortOrder: 7, stepName: "Review Security Settings" },
    ];

    try {
      const results = await Promise.all(
        defaultSteps.map((step) =>
          prisma.onboardingProgress.upsert({
            where: {
              organizationId_stepKey: {
                organizationId,
                stepKey: step.stepKey,
              },
            },
            create: {
              organizationId,
              stepKey: step.stepKey,
              stepName: step.stepName,
              sortOrder: step.sortOrder,
              completed: false,
            },
            update: {},
          })
        )
      );

      res.status(201).json({
        initialized: true,
        steps: results.map((s) => ({
          step_key: s.stepKey,
          step_name: s.stepName,
          completed: s.completed,
          sort_order: s.sortOrder,
        })),
      });
    } catch (err) {
      console.error("Initialize onboarding steps error:", err);
      res.status(500).json({ error: "Failed to initialize onboarding steps" });
    }
  });

  // ── GET /health ───────────────────────────────────────────────────
  //
  // Returns the most recent org health score.

  router.get("/health", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const latest = await prisma.orgHealthScore.findFirst({
        where: { organizationId },
        orderBy: { calculatedAt: "desc" },
      });

      if (!latest) {
        res.json({ health: null });
        return;
      }

      res.json({
        health: {
          id: latest.id,
          overall_score: latest.overallScore,
          dimensions: latest.dimensions,
          trend: latest.trend,
          calculated_at: latest.calculatedAt,
        },
      });
    } catch (err) {
      console.error("Get org health score error:", err);
      res.status(500).json({ error: "Failed to load org health score" });
    }
  });

  // ── POST /health/calculate ────────────────────────────────────────
  //
  // Triggers a health score calculation based on org activity. Admin only.
  // Dimensions: users, integrations, stories, landing pages, feature flags.

  router.post("/health/calculate", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({
        error: "permission_denied",
        message: "Only admins and owners can trigger health score calculation.",
      });
      return;
    }

    try {
      // Gather dimension counts in parallel
      const [
        userCount,
        integrationCount,
        storyCount,
        landingPageCount,
        featureFlagCount,
      ] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.integrationConfig.count({ where: { organizationId } }),
        prisma.story.count({ where: { organizationId } }),
        prisma.landingPage.count({ where: { organizationId } }),
        prisma.orgFeatureFlag.count({
          where: { organizationId, enabled: true },
        }),
      ]);

      // Score each dimension (0-20 scale, total max 100)
      const userScore = Math.min(userCount * 4, 20);
      const integrationScore = Math.min(integrationCount * 10, 20);
      const storyScore = Math.min(storyCount * 2, 20);
      const landingPageScore = Math.min(landingPageCount * 4, 20);
      const featureFlagScore = Math.min(featureFlagCount * 5, 20);

      const overallScore =
        userScore +
        integrationScore +
        storyScore +
        landingPageScore +
        featureFlagScore;

      const dimensions = {
        users: { count: userCount, score: userScore },
        integrations: { count: integrationCount, score: integrationScore },
        stories: { count: storyCount, score: storyScore },
        landing_pages: { count: landingPageCount, score: landingPageScore },
        feature_flags: { count: featureFlagCount, score: featureFlagScore },
      };

      // Determine trend by comparing with previous score
      const previous = await prisma.orgHealthScore.findFirst({
        where: { organizationId },
        orderBy: { calculatedAt: "desc" },
      });

      let trend: string = "stable";
      if (previous) {
        if (overallScore > previous.overallScore) {
          trend = "improving";
        } else if (overallScore < previous.overallScore) {
          trend = "declining";
        }
      } else {
        trend = "initial";
      }

      const healthScore = await prisma.orgHealthScore.create({
        data: {
          organizationId,
          overallScore,
          dimensions,
          trend,
          calculatedAt: new Date(),
        },
      });

      res.status(201).json({
        health: {
          id: healthScore.id,
          overall_score: healthScore.overallScore,
          dimensions: healthScore.dimensions,
          trend: healthScore.trend,
          calculated_at: healthScore.calculatedAt,
        },
      });
    } catch (err) {
      console.error("Calculate org health score error:", err);
      res.status(500).json({ error: "Failed to calculate org health score" });
    }
  });

  return router;
}
