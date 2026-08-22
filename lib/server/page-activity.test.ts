import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MIN-278 — THROUGHPUT, which is all that is delicate about this module.
 *
 * “No noise” is the fourth condition of the ticket, and it is the one that we do
 * note that by undergoing it: a page is re-recorded one second after the
 * last keystroke, so an afternoon of writing makes a thousand lines of activity —
 * and an agent who returns to the same page ten times, ten notifications. Both
 * terminals live here, and nothing on screen shows them before they give way.
 */

// Explicit signatures: without them, `mock.calls` is typed on an empty tuple
// and reading `c[1]` does not compile (same remark as notifications.test.ts).
const H = vi.hoisted(() => ({
  insertEvents: vi.fn<
    (service: unknown, rows: Array<Record<string, unknown>>) => Promise<void>
  >(async () => {}),
  insertNotifications: vi.fn<
    (
      service: unknown,
      rows: Array<Record<string, unknown>>,
      opts?: Record<string, unknown>
    ) => Promise<void>
  >(async () => {}),
}));

vi.mock("./issue-events", () => ({ insertEvents: H.insertEvents }));
vi.mock("./notifications", () => ({ insertNotifications: H.insertNotifications }));

const { recordPageEvent, notifyAgentPageWrite } = await import("./page-activity");

const PAGE = "page-1";
const PROJECT = "project-1";
const ACTOR = "user-1";

/** False PostgREST: the coalescence reading returns what it is told, and on
 * keeps the filters set — it is their EXACTNESS which decides the bound. */
function stubService(existing: unknown[]) {
  const filters: Array<[string, unknown]> = [];
  const service = {
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      };
      query.filter = (column: string, op: string, value: unknown) => {
        filters.push([`${column}:${op}`, value]);
        return query;
      };
      query.gte = (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      };
      query.limit = () => Promise.resolve({ data: existing, error: null });
      return query;
    },
  } as unknown as SupabaseClient;
  return { service, filters };
}

beforeEach(() => {
  H.insertEvents.mockClear();
  H.insertNotifications.mockClear();
});

describe("recordPageEvent", () => {
  it("marks an agent write `via_assistant` — the line names Numo", async () => {
    const { service } = stubService([]);
    await recordPageEvent(service, {
      pageId: PAGE,
      actorId: ACTOR,
      kind: "agent",
      type: "page_updated",
    });
    // Without this flag, the activity would say “Clément modified this page” with a
    // text that Clément did not write: the opposite of the identity rule.
    expect(H.insertEvents.mock.calls[0][1]).toEqual([
      {
        page_id: PAGE,
        actor_id: ACTOR,
        type: "page_updated",
        field: "agent",
        via_assistant: true,
      },
    ]);
  });

  it("nomme l'agent de la CLÉ quand l'écriture vient du MCP", async () => {
    const { service } = stubService([]);
    await recordPageEvent(service, {
      pageId: PAGE,
      actorId: ACTOR,
      kind: "agent",
      type: "page_updated",
      mcpKeyId: "key-1",
    });
    // The two flags do not cumulate: the timeline tests `via_assistant`
    // BEFORE `via_mcp`, so wearing them together would make one say “Numo” with a gesture
    // whose agent we know by name.
    expect(H.insertEvents.mock.calls[0][1][0]).toEqual({
      page_id: PAGE,
      actor_id: ACTOR,
      type: "page_updated",
      field: "agent",
      via_assistant: false,
      via_mcp: true,
      api_key_id: "key-1",
    });
  });

  it("n'écrit RIEN quand la même personne vient de modifier la page", async () => {
    const { service, filters } = stubService([{ id: "existing" }]);
    await recordPageEvent(service, {
      pageId: PAGE,
      actorId: ACTOR,
      kind: "human",
      type: "page_updated",
    });
    expect(H.insertEvents).not.toHaveBeenCalled();
    // The window is limited to the PAGE, the TYPE, the NATURE of the gesture and
    // the ACTOR. A blown filter would silence another's lines.
    expect(filters.map(([column]) => column)).toEqual([
      "page_id",
      "type",
      "field",
      "actor_id:eq",
      "created_at",
    ]);
  });

  it("still writes when the AGENT overwrites a human's write", async () => {
    // The window never covers a change of nature: “the agent is
    // passed after me” is exactly what we came to read.
    const { service, filters } = stubService([]);
    await recordPageEvent(service, {
      pageId: PAGE,
      actorId: ACTOR,
      kind: "agent",
      type: "page_updated",
    });
    expect(filters).toContainEqual(["field", "agent"]);
    expect(H.insertEvents).toHaveBeenCalledTimes(1);
  });

  it("does NOT coalesce creation, trashing, or restoration", async () => {
    // A recent line exists: it must not swallow any of these three — we
    // don't trash a page forty times in a row, and miss the gesture
    // destructive would be to miss the only one we are looking for.
    for (const type of ["page_created", "page_trashed", "page_restored"] as const) {
      const { service } = stubService([{ id: "existing" }]);
      await recordPageEvent(service, { pageId: PAGE, actorId: ACTOR, kind: "human", type });
    }
    expect(H.insertEvents).toHaveBeenCalledTimes(3);
  });
});

describe("notifyAgentPageWrite", () => {
  it("notifies the launcher without an actor and moves its unread row", async () => {
    const { service, filters } = stubService([]);
    await notifyAgentPageWrite(service, {
      projectId: PROJECT,
      pageId: PAGE,
      actorId: ACTOR,
    });

    const [, rows, opts] = H.insertNotifications.mock.calls[0];
    expect(rows).toEqual([
      {
        user_id: ACTOR,
        project_id: PROJECT,
        type: "page_agent_edit",
        issue_id: null,
        page_id: PAGE,
        // `actor_id` NULL: the actor is not a person. Filled, the
        // recipient would see their own portrait on an agent's writing.
        actor_id: null,
      },
    ]);
    // Ten passages on the same page = one line, not ten (MIN-278, “no
    // noise "). The `page_id` clause of `insertNotifications` limits it to this one.
    expect(opts).toEqual({ replaceUnread: true });
    // The watching read comes FIRST, and only for THIS page and THIS reader.
    expect(filters.map(([column]) => column)).toEqual([
      "page_id",
      "user_id",
      "seen_at",
    ]);
  });

  it("says NOTHING to a reader who has the page open right now", async () => {
    const { service } = stubService([{ user_id: ACTOR }]);
    await notifyAgentPageWrite(service, {
      projectId: PROJECT,
      pageId: PAGE,
      actorId: ACTOR,
    });
    // The write is already arriving live in their editor; an inbox line
    // would only repeat what they are seeing happen.
    expect(H.insertNotifications).not.toHaveBeenCalled();
  });
});
