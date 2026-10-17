import { beforeEach, expect, it, vi } from "vitest";

/**
 * MIN-688: sealing a plaintext page drops its plaintext collaboration journal
 * (and the database refuses while some of it is pending), so the backfill
 * writes pending typing into the scanned rows before converting them.
 */

const h = vi.hoisted(() => ({
  scans: 0,
  materialize: vi.fn(async (_service: unknown, _ids: readonly string[]) => 1),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        order: () => query,
        limit: async () => {
          h.scans += 1;
          return { data: [
            { id: "plain", project_id: "project", encryption_version: 0, content_revision: 1 },
            { id: "sealed", project_id: "project", encryption_version: 1, content_revision: 1 },
          ], error: null };
        },
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/pages", () => ({ materializePendingPages: h.materialize }));
// Every attempt is claimed by someone else: this test stops before conversion.
vi.mock("./backfill-attempt", () => ({ recordBackfillAttempt: async () => false }));

import { backfillPageContentBatch } from "./page-content-backfill";

beforeEach(() => {
  h.scans = 0;
  h.materialize.mockClear();
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
});

it("materializes pending typing of plaintext pages before sealing them, then scans again", async () => {
  const result = await backfillPageContentBatch(10);
  expect(h.materialize).toHaveBeenCalledWith(expect.anything(), ["plain"]);
  expect(h.scans).toBe(2);
  expect(result).toMatchObject({ scanned: 2, conflicted: 2 });
});

it("scans once when nothing was pending", async () => {
  h.materialize.mockResolvedValueOnce(0);
  await backfillPageContentBatch(10);
  expect(h.scans).toBe(1);
});
