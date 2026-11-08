import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  brief: null as { id: string; content: string } | null,
  protect: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("./home-brief-content", () => ({
  getHomeBrief: async (_service: unknown, userId: string, id: string) =>
    mocks.brief && userId === "user-1" && id === mocks.brief.id ? mocks.brief : null,
}));
vi.mock("./final-content", () => ({
  shouldProtectNumoFinalContent: async () => mocks.protect,
  encodeNumoFinalMessage: async (_user: string, id: string) =>
    ({ id, content: "sealed", final_payload_version: 2 }),
}));

import { openConversationWithHomeBrief } from "./home-brief-opening";

function fakeService() {
  const inserted: Array<Record<string, unknown>> = [];
  const service = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        expect(table).toBe("assistant_messages");
        inserted.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { service, inserted };
}

const NOW = new Date("2026-11-08T20:00:00.000Z");

describe("openConversationWithHomeBrief (MIN-933)", () => {
  beforeEach(() => {
    mocks.brief = { id: "brief-1", content: "[@](mention:issue/i1) waits for your review." };
    mocks.protect = false;
  });

  it("opens the conversation with the summary as Numo's message, before the user's", async () => {
    const { service, inserted } = fakeService();
    expect(await openConversationWithHomeBrief(service, {
      userId: "user-1", conversationId: "conv-1", briefId: "brief-1", now: NOW,
    })).toBe(true);
    expect(inserted).toEqual([expect.objectContaining({
      conversation_id: "conv-1", turn_id: null, role: "assistant",
      content: "[@](mention:issue/i1) waits for your review.",
      metadata: { home_brief: "brief-1" },
      created_at: "2026-11-08T19:59:59.000Z",
    })]);
  });

  it("seals it like any Numo answer when content protection is on", async () => {
    mocks.protect = true;
    const { service, inserted } = fakeService();
    await openConversationWithHomeBrief(service, { userId: "user-1", conversationId: "conv-1", briefId: "brief-1", now: NOW });
    expect(inserted[0]).toMatchObject({ content: "sealed", metadata: {}, final_payload_version: 2 });
  });

  it("stores nothing for a summary that is not the user's", async () => {
    const { service, inserted } = fakeService();
    expect(await openConversationWithHomeBrief(service, {
      userId: "user-2", conversationId: "conv-1", briefId: "brief-1",
    })).toBe(false);
    expect(inserted).toEqual([]);
  });
});
