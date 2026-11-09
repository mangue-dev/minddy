import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET/POST /api/home/brief (MIN-930): reading Numo's word never calls a
 * model, shows nothing when background Numo is off or the journal holds
 * nothing open or unseen, and marking it seen touches only the entries the
 * user's own version covers.
 */

vi.mock("server-only", () => ({}));

const BRIEF = "66666666-6666-4666-8666-666666666666";

const mocks = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  states: [] as Array<{ id: string; closed_at: string | null; seen_at: string | null }>,
  scheduleHomeBriefRewrite: vi.fn(),
  brief: null as Record<string, unknown> | null,
  conversationExists: true,
  entryIds: null as string[] | null,
  forecast: null as Record<string, unknown> | null,
  markJournalEntriesSeen: vi.fn(async (_service: unknown, _user: string, ids: string[]) => ids.length),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "user-1", user_metadata: mocks.metadata } }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: mocks.conversationExists ? { id: "conv-1" } : null }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/server/numo/journal-content", () => ({
  listJournalEntryStates: async () => mocks.states,
  markJournalEntriesSeen: mocks.markJournalEntriesSeen,
  isJournalUuid: (value: unknown) => typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));
vi.mock("@/lib/server/mention-access", () => ({
  readResultForReader: async (_user: string, value: unknown) =>
    JSON.parse(JSON.stringify(value).replaceAll("[@](mention:issue/i1)", "[@MIN-42](mention:issue/i1)")),
}));
vi.mock("@/lib/server/numo/home-brief", () => ({
  scheduleHomeBriefRewrite: mocks.scheduleHomeBriefRewrite,
}));
vi.mock("@/lib/server/usage-analytics", () => ({ getUsageForecast: async () => mocks.forecast }));
vi.mock("@/lib/server/numo/home-brief-content", () => ({
  getLatestHomeBrief: async () => mocks.brief,
  getHomeBriefEntryIds: async () => mocks.entryIds,
}));

import { GET, POST } from "@/app/api/home/brief/route";
import { homeBriefDigest } from "@/lib/server/numo/home-brief-prompt";

const OLD = "2026-11-08T08:00:00.000Z";

const get = async () => (await GET(new NextRequest("http://localhost/api/home/brief"))).json();
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/home/brief", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
}));

describe("/api/home/brief", () => {
  beforeEach(() => {
    mocks.metadata = {};
    mocks.states = [{ id: "e1", closed_at: null, seen_at: null }];
    mocks.scheduleHomeBriefRewrite.mockClear();
    mocks.conversationExists = true;
    mocks.entryIds = null;
    mocks.markJournalEntriesSeen.mockClear();
    mocks.forecast = null;
    mocks.brief = {
      id: BRIEF, content: "MIN-42 waits for your review.", suggestions: [],
      journal_entry_ids: ["e1"], journal_digest: homeBriefDigest([{ id: "e1", state: "open" }]),
      conversation_id: "conv-1", generated_at: OLD,
    };
  });

  it("returns the latest version, its suggestions labelled for the reader", async () => {
    mocks.brief!.suggestions = [{ label: "Review", prompt: "Review [@](mention:issue/i1)" }];
    expect(await get()).toEqual({ brief: {
      id: BRIEF, content: "MIN-42 waits for your review.",
      suggestions: [{ label: "Review", prompt: "Review [@MIN-42](mention:issue/i1)" }],
      generated_at: OLD,
    } });
    expect(mocks.scheduleHomeBriefRewrite).not.toHaveBeenCalled();
  });

  it("shows nothing once every covered entry is settled and seen, or when Numo wrote nothing", async () => {
    mocks.brief!.journal_digest = homeBriefDigest([{ id: "e1", state: "settled" }]);
    mocks.states = [{ id: "e1", closed_at: OLD, seen_at: new Date().toISOString() }];
    expect(await get()).toEqual({ brief: null });
    expect(mocks.scheduleHomeBriefRewrite).not.toHaveBeenCalled();
    mocks.brief = null;
    expect(await get()).toEqual({ brief: null });
  });

  it("hides an outdated word and rewrites it: a covered entry was closed or left", async () => {
    mocks.states = [{ id: "e1", closed_at: OLD, seen_at: null }];
    expect(await get()).toEqual({ brief: null });
    mocks.states = [];
    expect(await get()).toEqual({ brief: null });
    expect(mocks.scheduleHomeBriefRewrite).toHaveBeenCalledTimes(2);
  });

  it("does not rewrite a word its own turn may still be replacing", async () => {
    mocks.states = [];
    mocks.brief!.generated_at = new Date().toISOString();
    expect(await get()).toEqual({ brief: null });
    expect(mocks.scheduleHomeBriefRewrite).not.toHaveBeenCalled();
  });

  it("keeps showing settled news seen long ago, and rewrites it away", async () => {
    mocks.brief!.journal_entry_ids = ["e1", "e2"];
    mocks.brief!.journal_digest = homeBriefDigest([{ id: "e1", state: "open" }, { id: "e2", state: "settled" }]);
    mocks.states = [{ id: "e1", closed_at: null, seen_at: OLD }, { id: "e2", closed_at: OLD, seen_at: OLD }];
    expect((await get()).brief.id).toBe(BRIEF);
    expect(mocks.scheduleHomeBriefRewrite).toHaveBeenCalledWith("user-1");
  });

  it("rewrites the word when the budget starts running short (MIN-946)", async () => {
    mocks.forecast = {
      status: "short", usedPercent: 70, projectedPercent: 130,
      runsOutAt: "2026-11-20T12:00:00.000Z", resetsAt: "2026-12-01T00:00:00.000Z",
      daysShort: 10, points: [],
    };
    expect(await get()).toEqual({ brief: null });
    expect(mocks.scheduleHomeBriefRewrite).toHaveBeenCalledTimes(1);
    // A word that already says so stays.
    mocks.brief!.journal_digest = homeBriefDigest([{ id: "e1", state: "open" }], "short:2026-11-20");
    expect((await get()).brief.id).toBe(BRIEF);
    expect(mocks.scheduleHomeBriefRewrite).toHaveBeenCalledTimes(1);
    // No word yet: the warning still gets one.
    mocks.brief = null;
    expect(await get()).toEqual({ brief: null });
    expect(mocks.scheduleHomeBriefRewrite).toHaveBeenCalledTimes(2);
  });

  it("shows nothing while background Numo is switched off", async () => {
    mocks.metadata = { numo_background: "false" };
    expect(await get()).toEqual({ brief: null });
  });

  it("marks seen the entries of the user's own version only", async () => {
    expect((await post({ seen: BRIEF })).status).toBe(404);
    mocks.entryIds = ["e1", "e2"];
    const response = await post({ seen: BRIEF });
    expect(await response.json()).toEqual({ seen: 2 });
    expect(mocks.markJournalEntriesSeen).toHaveBeenCalledWith(expect.anything(), "user-1", ["e1", "e2"]);
    expect((await post({ seen: "MIN-42" })).status).toBe(400);
    expect((await post({ seen: "-".repeat(36) })).status).toBe(400);
  });
});
