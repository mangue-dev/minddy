import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NumoTurn } from "./turns";

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => true,
}));
vi.mock("./surface-conversations", () => ({
  decodeNumoSurfaceEvent: async () => {
    throw new Error("MIN591_PRIVATE_SUBMITTED_RESULT");
  },
}));

import { projectNumoSurfaceTurn } from "./surface-projection";

describe("Numo projection logs", () => {
  it("does not log an exception containing the submitted private result", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const event = { id: "event-id", actor_id: "actor-id",
      projection_status: "pending", thread: { project_id: "project-id" } };
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(),
      order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), update: vi.fn() };
    for (const method of ["select", "eq", "in", "order", "limit", "update"] as const) {
      query[method].mockReturnValue(query);
    }
    query.maybeSingle.mockResolvedValueOnce({ data: event, error: null })
      .mockResolvedValueOnce({ data: { id: event.id }, error: null });
    query.eq.mockImplementation(() => query);
    const service = { from: () => ({ ...query,
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    }) } as unknown as SupabaseClient;
    await projectNumoSurfaceTurn(service, { id: "turn-id", status: "completed" } as NumoTurn);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("MIN591_PRIVATE");
    expect(logged).toHaveBeenCalledWith("[numo-surface] projection_failed", event.id);
    logged.mockRestore();
  });
});
