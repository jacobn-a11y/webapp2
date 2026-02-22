/**
 * Session Management Routes
 *
 * Provides API endpoints for managing:
 *   - Session policy (get/update)
 *   - Active sessions (list, revoke one, revoke all)
 *   - IP allowlist (list, add, remove)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { SessionManager } from "../services/session-manager.js";

// ─── Validation ──────────────────────────────────────────────────────────────

const UpdateSessionPolicySchema = z.object({
  maxSessionDurationHours: z.number().int().min(1).max(720).optional(),
  idleTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  mfaRequired: z.boolean().optional(),
  mfaRequiredForPrivilegedActions: z.boolean().optional(),
  ssoEnforced: z.boolean().optional(),
  ssoDomains: z.array(z.string()).optional(),
  maxConcurrentSessions: z.number().int().min(1).max(100).optional(),
  reAuthRequiredForSensitiveActions: z.boolean().optional(),
  reAuthWindowMinutes: z.number().int().min(1).max(60).optional(),
});

const AddIpAllowlistEntrySchema = z.object({
  cidr: z
    .string()
    .min(1, "CIDR is required")
    .max(50, "CIDR must be under 50 characters"),
  label: z
    .string()
    .min(1, "Label is required")
    .max(100, "Label must be under 100 characters"),
});

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createSessionRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const sessionManager = new SessionManager(prisma);

  // ── Get Session Policy ──────────────────────────────────────────────

  /**
   * GET /policy
   *
   * Returns the session policy configuration for the organization.
   */
  router.get("/policy", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const policy = await sessionManager.getSessionPolicy(organizationId);
      res.json({ policy });
    } catch (err) {
      console.error("Get session policy error:", err);
      res.status(500).json({ error: "Failed to load session policy" });
    }
  });

  // ── Update Session Policy ───────────────────────────────────────────

  /**
   * PUT /policy
   *
   * Updates the session policy for the organization. Admin only.
   */
  router.put("/policy", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userRole = (req as any).userRole;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (userRole !== "ADMIN" && userRole !== "OWNER") {
      res.status(403).json({
        error: "permission_denied",
        message: "Only admins can update session policy.",
      });
      return;
    }

    const parseResult = UpdateSessionPolicySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "validation_error",
        details: parseResult.error.issues,
      });
      return;
    }

    try {
      const policy = await sessionManager.updateSessionPolicy(
        organizationId,
        parseResult.data
      );
      res.json({ policy });
    } catch (err) {
      console.error("Update session policy error:", err);
      res.status(500).json({ error: "Failed to update session policy" });
    }
  });

  // ── List Active Sessions ────────────────────────────────────────────

  /**
   * GET /sessions
   *
   * Lists all active sessions for the current user.
   */
  router.get("/sessions", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userId = (req as any).userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const sessions = await sessionManager.listActiveSessions(
        organizationId,
        userId
      );
      res.json({ sessions });
    } catch (err) {
      console.error("List sessions error:", err);
      res.status(500).json({ error: "Failed to list sessions" });
    }
  });

  // ── Revoke a Specific Session ───────────────────────────────────────

  /**
   * DELETE /sessions/:sessionId
   *
   * Revokes a specific session for the current user.
   */
  router.delete(
    "/sessions/:sessionId",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId;
      const userId = (req as any).userId;
      if (!organizationId || !userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const sessionId = req.params.sessionId as string;

      try {
        // Verify the session belongs to the current user
        const sessions = await sessionManager.listActiveSessions(
          organizationId,
          userId
        );
        const session = sessions.find((s) => s.id === sessionId);

        if (!session) {
          res.status(404).json({ error: "Session not found" });
          return;
        }

        await sessionManager.revokeSession(sessionId);
        res.json({ revoked: true, sessionId });
      } catch (err) {
        console.error("Revoke session error:", err);
        res.status(500).json({ error: "Failed to revoke session" });
      }
    }
  );

  // ── Revoke All Sessions ─────────────────────────────────────────────

  /**
   * POST /sessions/revoke-all
   *
   * Revokes all active sessions for the current user.
   */
  router.post("/sessions/revoke-all", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userId = (req as any).userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const count = await sessionManager.revokeAllUserSessions(
        userId,
        organizationId
      );
      res.json({ revoked: true, count });
    } catch (err) {
      console.error("Revoke all sessions error:", err);
      res.status(500).json({ error: "Failed to revoke sessions" });
    }
  });

  // ── List IP Allowlist ───────────────────────────────────────────────

  /**
   * GET /ip-allowlist
   *
   * Returns all IP allowlist entries for the organization.
   */
  router.get("/ip-allowlist", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const entries = await sessionManager.getIpAllowlist(organizationId);
      res.json({ entries });
    } catch (err) {
      console.error("List IP allowlist error:", err);
      res.status(500).json({ error: "Failed to list IP allowlist" });
    }
  });

  // ── Add IP Allowlist Entry ──────────────────────────────────────────

  /**
   * POST /ip-allowlist
   *
   * Adds a new IP allowlist entry. Admin only.
   */
  router.post("/ip-allowlist", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userRole = (req as any).userRole;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (userRole !== "ADMIN" && userRole !== "OWNER") {
      res.status(403).json({
        error: "permission_denied",
        message: "Only admins can manage the IP allowlist.",
      });
      return;
    }

    const parseResult = AddIpAllowlistEntrySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "validation_error",
        details: parseResult.error.issues,
      });
      return;
    }

    try {
      const entryId = await sessionManager.addIpAllowlistEntry(
        organizationId,
        parseResult.data.cidr,
        parseResult.data.label
      );
      res.status(201).json({ id: entryId });
    } catch (err) {
      console.error("Add IP allowlist entry error:", err);
      res.status(500).json({ error: "Failed to add IP allowlist entry" });
    }
  });

  // ── Remove IP Allowlist Entry ───────────────────────────────────────

  /**
   * DELETE /ip-allowlist/:entryId
   *
   * Removes an IP allowlist entry. Admin only.
   */
  router.delete(
    "/ip-allowlist/:entryId",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId;
      const userRole = (req as any).userRole;
      if (!organizationId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (userRole !== "ADMIN" && userRole !== "OWNER") {
        res.status(403).json({
          error: "permission_denied",
          message: "Only admins can manage the IP allowlist.",
        });
        return;
      }

      const entryId = req.params.entryId as string;

      try {
        await sessionManager.removeIpAllowlistEntry(entryId);
        res.json({ removed: true, id: entryId });
      } catch (err) {
        console.error("Remove IP allowlist entry error:", err);
        res.status(500).json({ error: "Failed to remove IP allowlist entry" });
      }
    }
  );

  return router;
}
