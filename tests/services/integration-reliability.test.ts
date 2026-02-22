import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntegrationReliabilityService } from "../../src/services/integration-reliability.js";

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    integrationRun: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    integrationDlqEntry: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("IntegrationReliabilityService", () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: IntegrationReliabilityService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new IntegrationReliabilityService(prisma);
  });

  // ─── startRun() ───────────────────────────────────────────────────────

  describe("startRun() creates a run with RUNNING status", () => {
    it("creates a new run record with RUNNING status", async () => {
      const now = new Date();
      prisma.integrationRun.create.mockResolvedValue({
        id: "run-1",
        organizationId: "org-1",
        provider: "GONG",
        runType: "SYNC",
        idempotencyKey: "GONG:SYNC:org-1:12345",
        status: "RUNNING",
        recordsProcessed: 0,
        recordsFailed: 0,
        retryCount: 0,
        startedAt: now,
        completedAt: null,
        errorMessage: null,
        metadata: {},
      });

      const run = await service.startRun({
        organizationId: "org-1",
        provider: "GONG",
        runType: "SYNC",
      });

      expect(run.status).toBe("RUNNING");
      expect(run.provider).toBe("GONG");
      expect(run.runType).toBe("SYNC");
      expect(run.recordsProcessed).toBe(0);
      expect(run.recordsFailed).toBe(0);
      expect(prisma.integrationRun.create).toHaveBeenCalledTimes(1);
    });

    it("returns existing run when duplicate idempotency key is detected", async () => {
      const existingRun = {
        id: "run-existing",
        organizationId: "org-1",
        provider: "GONG",
        runType: "SYNC",
        idempotencyKey: "my-key",
        status: "RUNNING",
        recordsProcessed: 0,
        recordsFailed: 0,
        retryCount: 0,
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
        metadata: {},
      };

      prisma.integrationRun.findFirst.mockResolvedValue(existingRun);

      const run = await service.startRun({
        organizationId: "org-1",
        provider: "GONG",
        runType: "SYNC",
        idempotencyKey: "my-key",
      });

      expect(run.id).toBe("run-existing");
      expect(prisma.integrationRun.create).not.toHaveBeenCalled();
    });

    it("passes metadata through to the created run", async () => {
      prisma.integrationRun.create.mockResolvedValue({
        id: "run-meta",
        organizationId: "org-1",
        provider: "SALESFORCE",
        runType: "BACKFILL",
        idempotencyKey: "key",
        status: "RUNNING",
        recordsProcessed: 0,
        recordsFailed: 0,
        retryCount: 0,
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
        metadata: { startDate: "2024-01-01" },
      });

      const run = await service.startRun({
        organizationId: "org-1",
        provider: "SALESFORCE",
        runType: "BACKFILL",
        metadata: { startDate: "2024-01-01" },
      });

      expect(run.metadata).toEqual({ startDate: "2024-01-01" });
    });
  });

  // ─── completeRun() ────────────────────────────────────────────────────

  describe("completeRun() updates status and itemsProcessed", () => {
    it("updates run to COMPLETED with records processed count", async () => {
      prisma.integrationRun.update.mockResolvedValue({});

      await service.completeRun("run-1", {
        recordsProcessed: 150,
        recordsFailed: 3,
      });

      expect(prisma.integrationRun.update).toHaveBeenCalledWith({
        where: { id: "run-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          recordsProcessed: 150,
          recordsFailed: 3,
          completedAt: expect.any(Date),
        }),
      });
    });

    it("sets status to FAILED when all records fail", async () => {
      prisma.integrationRun.update.mockResolvedValue({});

      await service.completeRun("run-2", {
        recordsProcessed: 0,
        recordsFailed: 10,
      });

      expect(prisma.integrationRun.update).toHaveBeenCalledWith({
        where: { id: "run-2" },
        data: expect.objectContaining({
          status: "FAILED",
          recordsProcessed: 0,
          recordsFailed: 10,
        }),
      });
    });
  });

  // ─── failRun() ────────────────────────────────────────────────────────

  describe("failRun() sets error message and FAILED status", () => {
    it("sets status to RETRYING when retries remain", async () => {
      prisma.integrationRun.findUnique.mockResolvedValue({
        id: "run-fail",
        provider: "GONG",
        retryCount: 0,
      });
      prisma.integrationRun.update.mockResolvedValue({});

      await service.failRun("run-fail", "API rate limit exceeded");

      expect(prisma.integrationRun.update).toHaveBeenCalledWith({
        where: { id: "run-fail" },
        data: expect.objectContaining({
          status: "RETRYING",
          retryCount: 1,
          errorMessage: "API rate limit exceeded",
          nextRetryAt: expect.any(Date),
        }),
      });
    });

    it("sets status to FAILED when max retries exhausted", async () => {
      prisma.integrationRun.findUnique.mockResolvedValue({
        id: "run-final-fail",
        provider: "GONG",
        retryCount: 5, // GONG has maxRetries: 5
      });
      prisma.integrationRun.update.mockResolvedValue({});

      await service.failRun("run-final-fail", "Service unavailable");

      expect(prisma.integrationRun.update).toHaveBeenCalledWith({
        where: { id: "run-final-fail" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Service unavailable",
          completedAt: expect.any(Date),
        }),
      });
    });

    it("does nothing when run is not found", async () => {
      prisma.integrationRun.findUnique.mockResolvedValue(null);

      await service.failRun("nonexistent", "error");

      expect(prisma.integrationRun.update).not.toHaveBeenCalled();
    });
  });

  // ─── addToDlq() ──────────────────────────────────────────────────────

  describe("addToDlq() creates a DLQ entry", () => {
    it("creates a new PENDING DLQ entry", async () => {
      prisma.integrationDlqEntry.create.mockResolvedValue({
        id: "dlq-1",
      });

      const id = await service.addToDlq({
        organizationId: "org-1",
        provider: "GONG",
        recordType: "call",
        externalId: "ext-123",
        payload: { title: "Test Call" },
        errorMessage: "Parsing failed",
      });

      expect(id).toBe("dlq-1");
      expect(prisma.integrationDlqEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "org-1",
          provider: "GONG",
          recordType: "call",
          externalId: "ext-123",
          payload: { title: "Test Call" },
          errorMessage: "Parsing failed",
          status: "PENDING",
          retryCount: 0,
        }),
      });
    });

    it("updates existing DLQ entry for same externalId instead of creating duplicate", async () => {
      prisma.integrationDlqEntry.findFirst.mockResolvedValue({
        id: "dlq-existing",
        retryCount: 2,
      });
      prisma.integrationDlqEntry.update.mockResolvedValue({});

      const id = await service.addToDlq({
        organizationId: "org-1",
        provider: "GONG",
        recordType: "call",
        externalId: "ext-123",
        payload: { title: "Test Call Updated" },
        errorMessage: "New error",
      });

      expect(id).toBe("dlq-existing");
      expect(prisma.integrationDlqEntry.create).not.toHaveBeenCalled();
      expect(prisma.integrationDlqEntry.update).toHaveBeenCalledWith({
        where: { id: "dlq-existing" },
        data: expect.objectContaining({
          errorMessage: "New error",
          retryCount: 3,
        }),
      });
    });
  });

  // ─── replayDlqEntry() ────────────────────────────────────────────────

  describe("replayDlqEntry() updates status to RETRIED", () => {
    it("sets status to RETRIED and increments retryCount", async () => {
      prisma.integrationDlqEntry.findUnique.mockResolvedValue({
        id: "dlq-1",
        status: "PENDING",
        retryCount: 1,
      });
      prisma.integrationDlqEntry.update.mockResolvedValue({});

      const result = await service.replayDlqEntry("dlq-1");

      expect(result.success).toBe(true);
      expect(prisma.integrationDlqEntry.update).toHaveBeenCalledWith({
        where: { id: "dlq-1" },
        data: expect.objectContaining({
          status: "RETRIED",
          retryCount: 2,
          lastRetriedAt: expect.any(Date),
        }),
      });
    });

    it("returns failure when entry is not in PENDING state", async () => {
      prisma.integrationDlqEntry.findUnique.mockResolvedValue({
        id: "dlq-2",
        status: "DISCARDED",
        retryCount: 0,
      });

      const result = await service.replayDlqEntry("dlq-2");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not in PENDING state");
    });

    it("returns failure when entry does not exist", async () => {
      prisma.integrationDlqEntry.findUnique.mockResolvedValue(null);

      const result = await service.replayDlqEntry("nonexistent");

      expect(result.success).toBe(false);
    });
  });

  // ─── generateIdempotencyKey() ─────────────────────────────────────────

  describe("generateIdempotencyKey() produces deterministic keys", () => {
    it("produces the same key for the same inputs", () => {
      const ts = new Date("2024-06-15T00:00:00Z");
      const key1 = service.generateIdempotencyKey("GONG", "call", "ext-1", ts);
      const key2 = service.generateIdempotencyKey("GONG", "call", "ext-1", ts);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(32);
    });

    it("produces different keys for different inputs", () => {
      const ts = new Date("2024-06-15T00:00:00Z");
      const key1 = service.generateIdempotencyKey("GONG", "call", "ext-1", ts);
      const key2 = service.generateIdempotencyKey("GONG", "call", "ext-2", ts);

      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different providers", () => {
      const ts = new Date("2024-06-15T00:00:00Z");
      const key1 = service.generateIdempotencyKey("GONG", "call", "ext-1", ts);
      const key2 = service.generateIdempotencyKey("SALESFORCE", "call", "ext-1", ts);

      expect(key1).not.toBe(key2);
    });

    it("produces 32-character hex string", () => {
      const key = service.generateIdempotencyKey("GONG", "call", "ext-1");
      expect(key).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  // ─── getHealthSummary() ───────────────────────────────────────────────

  describe("getHealthSummary() aggregates provider health correctly", () => {
    it("returns healthy status when all runs succeed", async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      // GONG has successful runs
      prisma.integrationRun.findMany.mockImplementation(async (args: any) => {
        if (args.where.provider === "GONG") {
          return [
            {
              status: "COMPLETED",
              recordsProcessed: 50,
              startedAt: oneHourAgo,
              completedAt: new Date(oneHourAgo.getTime() + 5000),
            },
          ];
        }
        return [];
      });

      prisma.integrationDlqEntry.count.mockResolvedValue(0);

      prisma.integrationRun.findFirst.mockImplementation(async (args: any) => {
        if (args.where.provider === "GONG" && args.where.status === "COMPLETED") {
          return { completedAt: new Date(now.getTime() - 3600000) };
        }
        return null;
      });

      const summaries = await service.getHealthSummary("org-1");

      const gongSummary = summaries.find((s) => s.provider === "GONG");
      expect(gongSummary).toBeDefined();
      expect(gongSummary!.status).toBe("healthy");
      expect(gongSummary!.totalRuns24h).toBe(1);
      expect(gongSummary!.failedRuns24h).toBe(0);
    });

    it("returns unknown status when no runs exist", async () => {
      prisma.integrationRun.findMany.mockResolvedValue([]);
      prisma.integrationDlqEntry.count.mockResolvedValue(0);
      prisma.integrationRun.findFirst.mockResolvedValue(null);

      const summaries = await service.getHealthSummary("org-1");

      for (const summary of summaries) {
        expect(summary.status).toBe("unknown");
        expect(summary.totalRuns24h).toBe(0);
      }
    });

    it("returns down status when all runs fail", async () => {
      prisma.integrationRun.findMany.mockImplementation(async (args: any) => {
        if (args.where.provider === "SALESFORCE") {
          return [
            { status: "FAILED", recordsProcessed: 0, startedAt: new Date(), completedAt: new Date() },
            { status: "FAILED", recordsProcessed: 0, startedAt: new Date(), completedAt: new Date() },
          ];
        }
        return [];
      });

      prisma.integrationDlqEntry.count.mockResolvedValue(5);
      prisma.integrationRun.findFirst.mockResolvedValue(null);

      const summaries = await service.getHealthSummary("org-1");

      const sfSummary = summaries.find((s) => s.provider === "SALESFORCE");
      expect(sfSummary).toBeDefined();
      expect(sfSummary!.status).toBe("down");
      expect(sfSummary!.failedRuns24h).toBe(2);
    });

    it("returns summaries for all configured providers", async () => {
      prisma.integrationRun.findMany.mockResolvedValue([]);
      prisma.integrationDlqEntry.count.mockResolvedValue(0);
      prisma.integrationRun.findFirst.mockResolvedValue(null);

      const summaries = await service.getHealthSummary("org-1");

      const providers = summaries.map((s) => s.provider);
      expect(providers).toContain("GONG");
      expect(providers).toContain("GRAIN");
      expect(providers).toContain("SALESFORCE");
      expect(providers).toContain("MERGE_DEV");
      expect(summaries).toHaveLength(4);
    });
  });
});
