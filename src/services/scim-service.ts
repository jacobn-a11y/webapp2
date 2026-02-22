/**
 * SCIM Provisioning Service
 *
 * Handles SCIM 2.0 user provisioning and deprovisioning.
 * Maps external identity provider users to internal user records.
 */

import type { PrismaClient, UserRole } from "@prisma/client";
import logger from "../lib/logger.js";

export interface ScimUser {
  schemas: string[];
  id?: string;
  externalId: string;
  userName: string;
  name?: {
    givenName?: string;
    familyName?: string;
  };
  emails?: Array<{
    value: string;
    primary?: boolean;
  }>;
  active?: boolean;
  groups?: Array<{ value: string; display?: string }>;
}

export interface ScimListResponse {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimUser[];
}

export class ScimService {
  constructor(private prisma: PrismaClient) {}

  async provisionUser(
    organizationId: string,
    scimUser: ScimUser
  ): Promise<{ userId: string; created: boolean }> {
    const email =
      scimUser.emails?.find((e) => e.primary)?.value ??
      scimUser.emails?.[0]?.value ??
      scimUser.userName;

    if (!email) {
      throw new Error("SCIM user must have an email address");
    }

    const displayName = scimUser.name
      ? `${scimUser.name.givenName ?? ""} ${scimUser.name.familyName ?? ""}`.trim()
      : scimUser.userName;

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email, organizationId },
    });

    if (existingUser) {
      // Update existing user and link SCIM identity
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { name: displayName || existingUser.name },
      });

      await this.upsertScimIdentity(organizationId, existingUser.id, scimUser);

      logger.info("SCIM: Updated existing user", {
        userId: existingUser.id,
        email,
        externalId: scimUser.externalId,
      });

      return { userId: existingUser.id, created: false };
    }

    // Create new user
    const newUser = await this.prisma.user.create({
      data: {
        email,
        name: displayName || null,
        organizationId,
        role: "MEMBER" as UserRole,
      },
    });

    await this.upsertScimIdentity(organizationId, newUser.id, scimUser);

    logger.info("SCIM: Provisioned new user", {
      userId: newUser.id,
      email,
      externalId: scimUser.externalId,
    });

    return { userId: newUser.id, created: true };
  }

  async deprovisionUser(
    organizationId: string,
    externalId: string
  ): Promise<{ userId: string | null; deprovisioned: boolean }> {
    const identity = await this.findScimIdentity(organizationId, externalId);
    if (!identity) {
      return { userId: null, deprovisioned: false };
    }

    // Mark SCIM identity as inactive
    await (this.prisma as any).scimIdentity.update({
      where: { id: identity.id },
      data: { active: false, deprovisionedAt: new Date() },
    });

    // Deactivate user (don't delete — preserve data)
    // In a real implementation, this might revoke sessions, remove permissions, etc.
    logger.info("SCIM: Deprovisioned user", {
      userId: identity.userId,
      externalId,
    });

    return { userId: identity.userId, deprovisioned: true };
  }

  async listUsers(
    organizationId: string,
    startIndex = 1,
    count = 100
  ): Promise<ScimListResponse> {
    const identities = await (this.prisma as any).scimIdentity.findMany({
      where: { organizationId },
      include: { user: true },
      skip: startIndex - 1,
      take: count,
      orderBy: { createdAt: "asc" },
    });

    const total = await (this.prisma as any).scimIdentity.count({
      where: { organizationId },
    });

    return {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: total,
      startIndex,
      itemsPerPage: count,
      Resources: identities.map((identity: any) =>
        this.toScimUser(identity)
      ),
    };
  }

  async getUser(
    organizationId: string,
    externalId: string
  ): Promise<ScimUser | null> {
    const identity = await this.findScimIdentity(organizationId, externalId);
    if (!identity) return null;
    return this.toScimUser(identity);
  }

  async updateUser(
    organizationId: string,
    externalId: string,
    updates: Partial<ScimUser>
  ): Promise<ScimUser | null> {
    const identity = await this.findScimIdentity(organizationId, externalId);
    if (!identity) return null;

    const email =
      updates.emails?.find((e) => e.primary)?.value ??
      updates.emails?.[0]?.value;

    const displayName = updates.name
      ? `${updates.name.givenName ?? ""} ${updates.name.familyName ?? ""}`.trim()
      : undefined;

    // Update user record
    await this.prisma.user.update({
      where: { id: identity.userId },
      data: {
        ...(displayName ? { name: displayName } : {}),
      },
    });

    // Update SCIM identity
    await (this.prisma as any).scimIdentity.update({
      where: { id: identity.id },
      data: {
        ...(updates.active !== undefined ? { active: updates.active } : {}),
        rawAttributes: updates as any,
      },
    });

    return this.getUser(organizationId, externalId);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private async upsertScimIdentity(
    organizationId: string,
    userId: string,
    scimUser: ScimUser
  ): Promise<void> {
    await (this.prisma as any).scimIdentity.upsert({
      where: {
        organizationId_externalId: {
          organizationId,
          externalId: scimUser.externalId,
        },
      },
      create: {
        organizationId,
        userId,
        externalId: scimUser.externalId,
        userName: scimUser.userName,
        active: scimUser.active ?? true,
        rawAttributes: scimUser as any,
      },
      update: {
        userId,
        userName: scimUser.userName,
        active: scimUser.active ?? true,
        rawAttributes: scimUser as any,
      },
    });
  }

  private async findScimIdentity(organizationId: string, externalId: string) {
    return (this.prisma as any).scimIdentity.findUnique({
      where: {
        organizationId_externalId: { organizationId, externalId },
      },
      include: { user: true },
    });
  }

  private toScimUser(identity: any): ScimUser {
    return {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: identity.id,
      externalId: identity.externalId,
      userName: identity.userName,
      name: identity.user?.name
        ? { givenName: identity.user.name.split(" ")[0], familyName: identity.user.name.split(" ").slice(1).join(" ") }
        : undefined,
      emails: identity.user?.email
        ? [{ value: identity.user.email, primary: true }]
        : [],
      active: identity.active,
    };
  }
}
