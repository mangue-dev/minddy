import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoEventBatch } from "./event-batches";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  batches: [] as NumoEventBatch[],
  unrouted: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: h.rpc,
    from: (table: string) => {
      if (table === "routine_events") {
        // The sweep's read: recent rows finished without being routed.
        const q = {
          select: () => q, not: () => q, is: () => q, gte: () => q, order: () => q,
          limit: () => Promise.resolve({ data: h.unrouted, error: null }),
        };
        return q;
      }
      const filters: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> = {};
      const q = {
        update: (values: Record<string, unknown>) => { patch = values; return q; },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
        select: () => q,
        then: (resolve: (value: unknown) => unknown) => {
          // A conditional update, as PostgREST applies it: only matching rows.
          const matched = h.batches.filter(batch =>
            filters.every(([key, value]) => (batch as unknown as Record<string, unknown>)[key] === value));
          for (const batch of matched) Object.assign(batch, patch);
          return Promise.resolve({ data: matched.map(({ id }) => ({ id })), error: null }).then(resolve);
        },
      };
      return q;
    },
  }),
}));

const { isBatchableEvent, routeEventToBatches, sweepUnroutedEvents, drainNumoEventBatches } = await import("./event-batches");

function batch(overrides: Partial<NumoEventBatch> = {}): NumoEventBatch {
  return { id: crypto.randomUUID(), user_id: "user", opened_at: "", due_at: "", event_ids: [1],
    status: "processing", claimed_at: "", attempts: 1, ...overrides };
}

beforeEach(() => {
  h.batches = [];
  h.unrouted = [];
  h.rpc.mockReset();
});

describe("the batch filter", () => {
  const event = { id: 1, subject_type: "issue" };

  it("drops Numo's own writes and maintenance, keeps people and automated news", () => {
    expect(isBatchableEvent({ ...event, event: "issue.created", actor_kind: "numo" })).toBe(false);
    expect(isBatchableEvent({ ...event, event: "issue.updated", actor_kind: "maintenance" })).toBe(false);
    expect(isBatchableEvent({ ...event, event: "issue.created", actor_kind: "user" })).toBe(true);
    expect(isBatchableEvent({ ...event, event: "issue.assigned", actor_kind: "system" })).toBe(true);
  });

  it("drops reorders and maintenance, keeps any edit that touches content or workflow", () => {
    expect(isBatchableEvent({ ...event, event: "issue.updated", changed_fields: ["position"] })).toBe(false);
    // Every write of a protected issue bumps its revision, a reorder included.
    expect(isBatchableEvent({ ...event, event: "issue.updated", changed_fields: ["encryption_revision", "position"] })).toBe(false);
    expect(isBatchableEvent({ ...event, event: "issue.updated", changed_fields: ["encryption_revision", "priority"] })).toBe(true);
    expect(isBatchableEvent({ ...event, event: "page.updated", changed_fields: ["encryption_checked_at", "search_text"] })).toBe(false);
    // The first edit of a legacy row, or after a key rotation, also seals it.
    expect(isBatchableEvent({ ...event, event: "issue.updated", changed_fields: ["encrypted_content", "encryption_version", "title"] })).toBe(true);
    expect(isBatchableEvent({ ...event, event: "page.updated", changed_fields: ["position", "updated_by"] })).toBe(false);
    expect(isBatchableEvent({ ...event, event: "page.updated", changed_fields: ["body_revision", "title_revision"] })).toBe(false);
    expect(isBatchableEvent({ ...event, event: "feedback.updated", changed_fields: ["moderation_reason", "sensitivity"] })).toBe(false);
    expect(isBatchableEvent({ ...event, event: "feedback.updated", changed_fields: ["vote_count"] })).toBe(false);
    expect(isBatchableEvent({ ...event, event: "issue.updated", changed_fields: ["position", "priority"] })).toBe(true);
    // A journal row from before the column existed has no changed fields.
    expect(isBatchableEvent({ ...event, event: "issue.updated", changed_fields: null })).toBe(true);
  });

  it("keeps a failed routine run, not a successful or stopped one", () => {
    expect(isBatchableEvent({ id: 1, subject_type: "routine", event: "routine.finished", after_state: { status: "failed" } })).toBe(true);
    expect(isBatchableEvent({ id: 1, subject_type: "routine", event: "routine.finished", after_state: { status: "completed" } })).toBe(false);
    expect(isBatchableEvent({ id: 1, subject_type: "routine", event: "routine.finished", after_state: { status: "stopped" } })).toBe(false);
  });

  it("marks a filtered row as routed without batching it, so the sweep skips it", async () => {
    h.rpc.mockResolvedValue({ data: 0, error: null });
    expect(await routeEventToBatches({ ...event, event: "issue.updated", changed_fields: ["position"] })).toBe(0);
    expect(h.rpc).toHaveBeenCalledWith("route_numo_event", { p_event_id: 1, p_batchable: false });
    h.rpc.mockResolvedValue({ data: 2, error: null });
    expect(await routeEventToBatches({ ...event, event: "issue.created" })).toBe(2);
    expect(h.rpc).toHaveBeenLastCalledWith("route_numo_event", { p_event_id: 1, p_batchable: true });
  });

  it("routes the rows a failed or earlier worker finished without routing", async () => {
    h.unrouted = [{ id: 7, subject_type: "issue", event: "issue.created" }, { id: 8, subject_type: "issue", event: "issue.updated", changed_fields: ["position"] }];
    h.rpc.mockImplementation(async (_name: string, args: { p_batchable: boolean }) => ({ data: args.p_batchable ? 1 : 0, error: null }));
    expect(await sweepUnroutedEvents(50)).toBe(1);
    expect(h.rpc.mock.calls.map(([, args]) => args)).toEqual([
      { p_event_id: 7, p_batchable: true }, { p_event_id: 8, p_batchable: false },
    ]);
  });
});

describe("draining due batches", () => {
  it("triages each claimed batch once and closes it", async () => {
    const claimed = batch();
    h.batches = [claimed];
    // The second tick finds nothing: the claim moved the batch out of `open`.
    h.rpc.mockResolvedValueOnce({ data: [claimed], error: null }).mockResolvedValueOnce({ data: [], error: null });
    const triage = vi.fn(async () => {});
    expect(await drainNumoEventBatches(10, triage)).toEqual({ claimed: 1, outcomes: [{ id: claimed.id, outcome: "done" }] });
    expect(await drainNumoEventBatches(10, triage)).toEqual({ claimed: 0, outcomes: [] });
    expect(triage).toHaveBeenCalledTimes(1);
    expect(claimed.status).toBe("done");
    expect(h.rpc).toHaveBeenCalledWith("claim_numo_event_batches", { p_limit: 10 });
  });

  it("closes without waking anyone until the decision model exists", async () => {
    const claimed = batch();
    h.batches = [claimed];
    h.rpc.mockResolvedValue({ data: [claimed], error: null });
    await drainNumoEventBatches(10);
    expect(claimed).toMatchObject({ status: "done", error_code: null });
  });

  it("leaves a failed triage to a later tick, then gives up after three attempts", async () => {
    const retried = batch({ attempts: 1 });
    const exhausted = batch({ attempts: 3 });
    h.batches = [retried, exhausted];
    h.rpc.mockResolvedValue({ data: [retried, exhausted], error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await drainNumoEventBatches(10, async () => { throw new Error("model down"); });
    expect(result.outcomes).toEqual([{ id: retried.id, outcome: "retry" }, { id: exhausted.id, outcome: "failed" }]);
    expect(retried.status).toBe("processing");
    expect(exhausted).toMatchObject({ status: "done", error_code: "triageFailed" });
  });

  it("does not close a batch another worker reclaimed meanwhile", async () => {
    const claimed = batch({ attempts: 1 });
    h.batches = [claimed];
    h.rpc.mockResolvedValue({ data: [{ ...claimed }], error: null });
    const result = await drainNumoEventBatches(10, async () => { claimed.attempts = 2; });
    expect(result.outcomes).toEqual([{ id: claimed.id, outcome: "superseded" }]);
    expect(claimed.status).toBe("processing");
  });
});
