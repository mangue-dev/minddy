import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Decryption is covered by each content module; here the rows are clear.
vi.mock("./user-message-content", () => ({
  hydrateNumoUserMessages: vi.fn(async (_client: unknown, rows: unknown[]) => rows),
}));
vi.mock("./final-content", () => ({
  hydrateNumoFinalMessages: vi.fn(async (_client: unknown, rows: unknown[]) => rows),
}));
vi.mock("./tool-content", () => ({
  hydrateNumoToolMessages: vi.fn(async (_client: unknown, rows: unknown[]) => rows),
}));
vi.mock("./conversation-title-content", () => ({
  decodeConversationTitle: vi.fn(async (_user: string, _id: string, title: string | null) => title),
}));

import {
  CONVERSATION_READ_PAGE,
  ConversationSearchError,
  excerptAround,
  readNumoConversation,
  searchNumoConversations,
  searchTerms,
} from "./conversation-search";

type Row = Record<string, unknown>;

/** A Supabase client over in-memory tables that applies the filters it gets. */
function fakeService(tables: Record<string, Row[]>) {
  const reads: Array<{ table: string; filters: string[] }> = [];
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const filters: string[] = [];
    reads.push({ table, filters });
    let window: [number, number] | null = null;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push(`eq:${column}`);
        rows = rows.filter((row) => row[column] === value);
        return query;
      },
      neq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] !== value);
        return query;
      },
      gte: (column: string, value: string) => {
        rows = rows.filter((row) => String(row[column]) >= value);
        return query;
      },
      lt: (column: string, value: string) => {
        rows = rows.filter((row) => String(row[column]) < value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return query;
      },
      order: (column: string, options: { ascending: boolean }) => {
        // Stable sorts applied in call order: the first order wins, so sort
        // by later keys first is not needed for these fixtures.
        if (filters.includes("ordered")) return query;
        filters.push("ordered");
        rows.sort((a, b) => String(a[column]).localeCompare(String(b[column]))
          * (options.ascending ? 1 : -1));
        return query;
      },
      limit: (count: number) => {
        window = [0, count];
        return query;
      },
      range: (from: number, to: number) => {
        window = [from, to + 1];
        return query;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: window ? rows.slice(...window) : rows, error: null }),
    };
    return query;
  }
  return { client: { from: builder } as unknown as SupabaseClient, reads };
}

const USER = "user-1";
const CURRENT = "c0000000-0000-4000-8000-000000000000";
const PRICING = "c1111111-1111-4111-8111-111111111111";
const LAUNCH = "c2222222-2222-4222-8222-222222222222";
const OTHER_USER = "c3333333-3333-4333-8333-333333333333";

function conversation(id: string, title: string, updatedAt: string, userId = USER): Row {
  return { legacy_id: id, user_id: userId, project_id: null, title, archived_at: null,
    created_at: "2026-10-01T09:00:00Z", updated_at: updatedAt };
}

let seq = 0;
function message(conversationId: string, role: string, content: string, createdAt: string,
  extra: Row = {}): Row {
  seq += 1;
  return { id: `m-${String(seq).padStart(4, "0")}`, conversation_id: conversationId, role, content,
    tool_calls: null, tool_call_id: null, tool_name: null, metadata: {}, context: null,
    created_at: createdAt, ...extra };
}

let tables: Record<string, Row[]>;

beforeEach(() => {
  seq = 0;
  tables = {
    numo_user_conversation_history: [
      conversation(CURRENT, "Today", "2026-11-10T10:00:00Z"),
      conversation(PRICING, "Plans", "2026-11-03T10:00:00Z"),
      conversation(LAUNCH, "Launch prep", "2026-11-08T10:00:00Z"),
      conversation(OTHER_USER, "Pricing secrets", "2026-11-09T10:00:00Z", "user-2"),
    ],
    assistant_messages: [
      message(CURRENT, "user", "What did we decide about pricing?", "2026-11-10T10:00:00Z"),
      message(PRICING, "user", "Help me set the réunion agenda for pricing", "2026-11-03T09:00:00Z"),
      message(PRICING, "assistant", "", "2026-11-03T09:01:00Z",
        { tool_calls: [{ function: { name: "search_issues", arguments: "{\"query\":\"stripe\"}" } }] }),
      message(PRICING, "tool", "stripe stripe stripe", "2026-11-03T09:02:00Z"),
      message(PRICING, "assistant", "We settled on Stripe with a yearly plan at 90 EUR.", "2026-11-03T09:03:00Z"),
      message(LAUNCH, "user", "Draft the launch checklist", "2026-11-08T09:00:00Z"),
      message(LAUNCH, "assistant", "Here it is. Pricing page last.", "2026-11-08T09:01:00Z"),
      message(OTHER_USER, "user", "stripe pricing", "2026-11-09T09:00:00Z"),
    ],
  };
});

describe("search terms", () => {
  it("folds case and accents, keeps quoted phrases whole and drops one-letter noise", () => {
    expect(searchTerms("Réunion  \"Yearly Plan\" a pricing, pricing"))
      .toEqual(["reunion", "yearly plan", "pricing"]);
  });

  it("centers the excerpt on the first term it contains", () => {
    const text = `${"x ".repeat(300)}the Stripe decision ${"y ".repeat(300)}`;
    const excerpt = excerptAround(text, ["stripe"]);
    expect(excerpt).toContain("Stripe decision");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});

describe("searchNumoConversations (MIN-956)", () => {
  it("finds the user's earlier conversations, best match first, never the current one or another user's", async () => {
    const { client, reads } = fakeService(tables);
    const result = await searchNumoConversations(client, USER,
      { query: "stripe pricing", excludeConversationId: CURRENT });
    expect(result.conversations.map((match) => match.conversation_id)).toEqual([PRICING, LAUNCH]);
    expect(result.conversations[0]).toMatchObject({ title: "Plans", archived: false });
    expect(result.conversations[0].excerpts?.map((excerpt) => excerpt.role)).toEqual(["user", "assistant"]);
    expect(result.conversations[0].excerpts?.[1].text).toContain("Stripe with a yearly plan");
    expect(reads.find((read) => read.table === "numo_user_conversation_history")?.filters)
      .toContain("eq:user_id");
  });

  it("searches what was said, not tool calls or tool results", async () => {
    tables.assistant_messages = tables.assistant_messages.filter((row) => row.content !== "We settled on Stripe with a yearly plan at 90 EUR.");
    const { client } = fakeService(tables);
    const result = await searchNumoConversations(client, USER,
      { query: "stripe", excludeConversationId: CURRENT });
    expect(result.conversations).toEqual([]);
  });

  it("ignores case and accents", async () => {
    const { client } = fakeService(tables);
    const result = await searchNumoConversations(client, USER, { query: "REUNION" });
    expect(result.conversations.map((match) => match.conversation_id)).toEqual([PRICING]);
  });

  it("lists the most recently active conversations with their opening when there is no query", async () => {
    const { client } = fakeService(tables);
    const result = await searchNumoConversations(client, USER,
      { query: null, limit: 5, excludeConversationId: CURRENT });
    expect(result.conversations.map((match) => [match.conversation_id, match.opening])).toEqual([
      [LAUNCH, "Draft the launch checklist"],
      [PRICING, "Help me set the réunion agenda for pricing"],
    ]);
  });

  it("keeps to the conversations active in the period", async () => {
    const { client } = fakeService(tables);
    const result = await searchNumoConversations(client, USER,
      { query: "pricing", after: "2026-11-05", excludeConversationId: CURRENT });
    expect(result.conversations.map((match) => match.conversation_id)).toEqual([LAUNCH]);
  });

  it("refuses malformed dates and an inverted period", async () => {
    const { client } = fakeService(tables);
    await expect(searchNumoConversations(client, USER, { after: "last week" }))
      .rejects.toBeInstanceOf(ConversationSearchError);
    await expect(searchNumoConversations(client, USER, { after: "2026-11-05", before: "2026-11-01" }))
      .rejects.toMatchObject({ code: "invalid_range" });
  });
});

describe("readNumoConversation (MIN-956)", () => {
  it("returns what was said, oldest first, without tool rows", async () => {
    const { client } = fakeService(tables);
    const result = await readNumoConversation(client, USER, { conversationId: PRICING });
    expect(result.messages.map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(result).toMatchObject({ title: "Plans", total: 2, next_offset: null });
  });

  it("pages a long conversation", async () => {
    for (let index = 0; index < CONVERSATION_READ_PAGE + 5; index += 1) {
      tables.assistant_messages.push(message(LAUNCH, "user", `Point ${index}`,
        `2026-11-08T10:${String(index).padStart(2, "0")}:00Z`));
    }
    const { client } = fakeService(tables);
    const first = await readNumoConversation(client, USER, { conversationId: LAUNCH });
    expect(first.messages).toHaveLength(CONVERSATION_READ_PAGE);
    expect(first.next_offset).toBe(CONVERSATION_READ_PAGE);
    const second = await readNumoConversation(client, USER,
      { conversationId: LAUNCH, offset: first.next_offset });
    expect(second.messages).toHaveLength(7);
    expect(second.next_offset).toBeNull();
  });

  it("does not open another user's conversation", async () => {
    const { client } = fakeService(tables);
    await expect(readNumoConversation(client, USER, { conversationId: OTHER_USER }))
      .rejects.toMatchObject({ code: "not_found" });
  });
});
