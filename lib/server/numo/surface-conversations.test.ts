import { describe, expect, it } from "vitest";

import {
  pendingSurfaceWorkerInput,
  reserveNumoSurfaceEvent,
} from "./surface-conversations";

describe("Numo shared-surface event admission", () => {
  it("returns the durable event instead of admitting a repeated webhook twice", async () => {
    const events = new Map<string, Record<string, unknown>>();
    const service = {
      from(table: string) {
        expect(table).toBe("numo_surface_events");
        let insert: Record<string, unknown> | null = null;
        const filters: Record<string, unknown> = {};
        const builder = {
          insert(value: Record<string, unknown>) {
            insert = value;
            return builder;
          },
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            filters[column] = value;
            return builder;
          },
          async single() {
            const key = `${insert!.thread_id}:${insert!.source_event_id}`;
            if (events.has(key)) {
              return { data: null, error: { message: "duplicate key" } };
            }
            const row = {
              id: "event-id",
              ...insert,
              turn_id: null,
              response_id: null,
              projection_status: "pending",
              projected_turn_status: null,
              projected_at: null,
              notified_at: null,
              created_at: "2026-09-13T00:00:00Z",
            };
            events.set(key, row);
            return { data: row, error: null };
          },
          async maybeSingle() {
            const key = `${filters.thread_id}:${filters.source_event_id}`;
            return { data: events.get(key) ?? null, error: null };
          },
        };
        return builder;
      },
    };
    const input = {
      service: service as never,
      threadId: "thread",
      sourceEventId: "delivery",
      actorId: "actor",
      destination: {
        kind: "pull_request" as const,
        pullRequestId: "pr",
      },
    };

    const first = await reserveNumoSurfaceEvent(input);
    const replay = await reserveNumoSurfaceEvent(input);

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.event.id).toBe(first.event.id);
    expect(events).toHaveLength(1);
  });

  it("returns the exact pending worker correlation for a subsequent reply", async () => {
    const checkpoint = {
      phase: "worker_input_wait",
      input_request: {
        runId: "run-id",
        questionId: "question-id",
      },
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({
        data: { id: "turn-id", checkpoint },
        error: null,
      }),
    };
    const service = { from: () => builder };

    await expect(
      pendingSurfaceWorkerInput(service as never, "conversation-id"),
    ).resolves.toEqual({
      turnId: "turn-id",
      runId: "run-id",
      questionId: "question-id",
    });
  });
});
