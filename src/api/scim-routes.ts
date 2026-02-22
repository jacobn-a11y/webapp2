/**
 * SCIM 2.0 Provisioning Routes
 *
 * Provides endpoints for SCIM 2.0 user provisioning and lifecycle management.
 * Supports listing, retrieving, creating, updating, and deprovisioning users
 * via an external identity provider.
 *
 * All responses conform to the SCIM 2.0 protocol (RFC 7644).
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { ScimService } from "../services/scim-service.js";

// ─── Validation ──────────────────────────────────────────────────────────────

const ListUsersQuerySchema = z.object({
  startIndex: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1)),
  count: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100))
    .pipe(z.number().int().min(1).max(1000)),
});

const ScimEmailSchema = z.object({
  value: z.string().email(),
  primary: z.boolean().optional(),
});

const ScimNameSchema = z.object({
  givenName: z.string().optional(),
  familyName: z.string().optional(),
});

const CreateUserSchema = z.object({
  schemas: z.array(z.string()),
  externalId: z.string().min(1, "externalId is required"),
  userName: z.string().min(1, "userName is required"),
  name: ScimNameSchema.optional(),
  emails: z.array(ScimEmailSchema).optional(),
  active: z.boolean().optional(),
});

const PatchUserSchema = z.object({
  schemas: z.array(z.string()).optional(),
  userName: z.string().optional(),
  name: ScimNameSchema.optional(),
  emails: z.array(ScimEmailSchema).optional(),
  active: z.boolean().optional(),
});

// ─── SCIM Response Helpers ───────────────────────────────────────────────────

function formatScimUser(user: {
  id?: string;
  externalId: string;
  userName: string;
  name?: { givenName?: string; familyName?: string };
  emails?: Array<{ value: string; primary?: boolean }>;
  active?: boolean;
}) {
  return {
    schemas: ["urn:ietf:params:scim:core:2.0:User"],
    id: user.id,
    userName: user.userName,
    displayName: user.name
      ? `${user.name.givenName ?? ""} ${user.name.familyName ?? ""}`.trim()
      : user.userName,
    emails: user.emails ?? [],
    active: user.active ?? true,
  };
}

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createScimRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const scimService = new ScimService(prisma);

  /**
   * GET /Users
   *
   * List SCIM users for the organization with pagination support.
   * Returns a SCIM 2.0 ListResponse.
   */
  router.get("/Users", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = ListUsersQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error: "validation_error",
        details: parseResult.error.issues,
      });
      return;
    }

    const { startIndex, count } = parseResult.data;

    try {
      const listResponse = await scimService.listUsers(
        organizationId,
        startIndex,
        count
      );

      res.json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: listResponse.totalResults,
        startIndex: listResponse.startIndex,
        itemsPerPage: listResponse.itemsPerPage,
        Resources: listResponse.Resources.map(formatScimUser),
      });
    } catch (err) {
      console.error("SCIM list users error:", err);
      res.status(500).json({ error: "Failed to list SCIM users" });
    }
  });

  /**
   * GET /Users/:id
   *
   * Retrieve a specific SCIM user by their external ID.
   * Returns a SCIM 2.0 User resource.
   */
  router.get("/Users/:id", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const externalId = req.params.id as string;

    try {
      const user = await scimService.getUser(organizationId, externalId);

      if (!user) {
        res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found",
          status: "404",
        });
        return;
      }

      res.json(formatScimUser(user));
    } catch (err) {
      console.error("SCIM get user error:", err);
      res.status(500).json({ error: "Failed to retrieve SCIM user" });
    }
  });

  /**
   * POST /Users
   *
   * Provision a new SCIM user within the organization.
   * If the user already exists (matched by email), it will be linked instead.
   * Returns the created or linked SCIM User resource.
   */
  router.post("/Users", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = CreateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid SCIM user payload",
        status: "400",
        scimType: "invalidValue",
        errors: parseResult.error.issues,
      });
      return;
    }

    try {
      const result = await scimService.provisionUser(
        organizationId,
        parseResult.data
      );

      // Fetch the full user to return proper SCIM representation
      const user = await scimService.getUser(
        organizationId,
        parseResult.data.externalId
      );

      const statusCode = result.created ? 201 : 200;
      res.status(statusCode).json(
        user
          ? formatScimUser(user)
          : formatScimUser(parseResult.data)
      );
    } catch (err) {
      console.error("SCIM provision user error:", err);
      const message =
        err instanceof Error ? err.message : "Failed to provision SCIM user";
      res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: message,
        status: "500",
      });
    }
  });

  /**
   * PATCH /Users/:id
   *
   * Update an existing SCIM user's attributes.
   * Supports partial updates to name, emails, and active status.
   * Returns the updated SCIM User resource.
   */
  router.patch("/Users/:id", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const externalId = req.params.id as string;

    const parseResult = PatchUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid SCIM patch payload",
        status: "400",
        scimType: "invalidValue",
        errors: parseResult.error.issues,
      });
      return;
    }

    try {
      const updatedUser = await scimService.updateUser(
        organizationId,
        externalId,
        parseResult.data
      );

      if (!updatedUser) {
        res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found",
          status: "404",
        });
        return;
      }

      res.json(formatScimUser(updatedUser));
    } catch (err) {
      console.error("SCIM update user error:", err);
      res.status(500).json({ error: "Failed to update SCIM user" });
    }
  });

  /**
   * DELETE /Users/:id
   *
   * Deprovision a SCIM user. The user is deactivated rather than deleted
   * to preserve data integrity. The SCIM identity is marked as inactive.
   * Returns 204 No Content on success.
   */
  router.delete("/Users/:id", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const externalId = req.params.id as string;

    try {
      const result = await scimService.deprovisionUser(
        organizationId,
        externalId
      );

      if (!result.deprovisioned) {
        res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found",
          status: "404",
        });
        return;
      }

      res.status(204).send();
    } catch (err) {
      console.error("SCIM deprovision user error:", err);
      res.status(500).json({ error: "Failed to deprovision SCIM user" });
    }
  });

  return router;
}
