import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: [] as unknown[], error: null as { code: string } | null, calls: [] as unknown[][] }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => {
    const query = {
      from: (...args: unknown[]) => { state.calls.push(["from", ...args]); return query; },
      select: (...args: unknown[]) => { state.calls.push(["select", ...args]); return query; },
      eq: (...args: unknown[]) => { state.calls.push(["eq", ...args]); return query; },
      lt: (...args: unknown[]) => { state.calls.push(["lt", ...args]); return query; },
      order: (...args: unknown[]) => { state.calls.push(["order", ...args]); return query; },
      limit: (...args: unknown[]) => {
        state.calls.push(["limit", ...args]);
        return Promise.resolve({ data: state.data, error: state.error });
      },
    };
    return query;
  },
}));

const { listDueContentKeys } = await import("./registry");

beforeEach(() => { state.data = []; state.error = null; state.calls = []; });

describe("rotation registry scan", () => {
  it("selects only current content keys before the cutoff, excluding equality-index keys", async () => {
    state.data = [{ scope_kind: "user", scope_id: "user-1", version: 2 }];
    const cutoff = "2026-06-25T00:00:00.000Z";
    expect(await listDueContentKeys(cutoff, 20)).toEqual([{ scope: { kind: "user", id: "user-1" }, version: 2 }]);
    expect(state.calls).toEqual([
      ["from", "envelope_data_keys"], ["select", "scope_kind,scope_id,version"],
      ["eq", "purpose", "content"], ["eq", "is_current", true], ["lt", "created_at", cutoff],
      ["order", "rotation_attempted_at", { ascending: true, nullsFirst: true }],
      ["order", "created_at", { ascending: true }], ["order", "scope_kind", { ascending: true }],
      ["order", "scope_id", { ascending: true }], ["limit", 20],
    ]);
  });

  it("fails on malformed scope or version metadata before requesting a rotation", async () => {
    state.data = [{ scope_kind: "unclassified", scope_id: "user-1", version: 1 }];
    await expect(listDueContentKeys("2026-06-25T00:00:00.000Z", 20)).rejects.toThrow("Invalid due data key");
    state.data = [{ scope_kind: "user", scope_id: "user-1", version: 0 }];
    await expect(listDueContentKeys("2026-06-25T00:00:00.000Z", 20)).rejects.toThrow("Invalid due data key");
  });
});
