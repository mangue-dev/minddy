import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoJournalEntry } from "./journal-content";

const ISSUE = "44444444-4444-4444-8444-444444444444";
const HIDDEN = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  open: [] as NumoJournalEntry[],
  unseen: [] as NumoJournalEntry[],
  latestDigest: null as string | null,
  budget: true,
  answer: null as Record<string, unknown> | null,
  forcedToolCall: vi.fn(),
  writeHomeBrief: vi.fn(),
  forecast: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById: async () => ({
      data: { user: { email: "camille@example.com", user_metadata: mocks.metadata } }, error: null,
    }) } },
  }),
}));
vi.mock("./journal-content", () => ({
  listOpenJournalEntries: async () => mocks.open,
  listUnseenJournalEntries: async () => mocks.unseen,
}));
vi.mock("./memory-content", () => ({ listNumoMemories: async () => [] }));
vi.mock("./home-brief-content", async (importOriginal) => ({
  ...await importOriginal<typeof import("./home-brief-content")>(),
  getLatestHomeBriefDigest: async () => mocks.latestDigest,
  writeHomeBrief: mocks.writeHomeBrief,
}));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => mocks.budget }));
vi.mock("@/lib/server/usage-analytics", () => ({ getUsageForecast: async () => mocks.forecast }));
vi.mock("@/lib/server/project-access", () => ({ accessibleProjectIds: async () => new Set<string>() }));
vi.mock("@/lib/server/mention-access", () => ({
  // The label the reader may see, as the real relabeling gives it.
  markdownForReader: async (_user: string, markdown: string) =>
    markdown.replace(`[@](mention:issue/${ISSUE})`, `[@MIN-42](mention:issue/${ISSUE})`)
      .replace(`[@](mention:page/${HIDDEN})`, `[@unavailable](mention:page/${HIDDEN})`),
  UNAVAILABLE_MENTION_LABEL: "unavailable",
}));
vi.mock("@/lib/server/model-config", () => ({
  resolveConfiguredModel: async () => ({ model: "deepseek/deepseek-v4-flash" }),
}));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({
  forcedToolCall: (...args: unknown[]) => {
    mocks.forcedToolCall(...args);
    return Promise.resolve(mocks.answer);
  },
}));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: (work: () => unknown) => void work() }));

import { rewriteHomeBrief } from "./home-brief";
import { homeBriefDigest } from "./home-brief-prompt";

function entry(overrides: Partial<NumoJournalEntry>): NumoJournalEntry {
  return {
    id: "e1", project_id: null, content: "An entry.", source: "wake",
    source_conversation_id: null, created_at: "2026-11-07T10:00:00.000Z",
    seen_at: null, closed_at: null, closed_reason: null, ...overrides,
  };
}

const NOW = new Date("2026-11-08T10:00:00.000Z");

describe("rewriteHomeBrief", () => {
  beforeEach(() => {
    mocks.metadata = { display_name: "Camille Roy", locale: "fr" };
    mocks.open = [];
    mocks.unseen = [];
    mocks.latestDigest = null;
    mocks.budget = true;
    mocks.answer = null;
    mocks.forecast = null;
    mocks.forcedToolCall.mockClear();
    mocks.writeHomeBrief.mockReset();
  });

  it("covers the open entries and the settled ones the user has not seen", async () => {
    const waiting = entry({ id: "open-1", content: `[@](mention:issue/${ISSUE}) attend votre relecture.`,
      source_conversation_id: "conv-old", created_at: "2026-11-06T10:00:00.000Z", seen_at: "2026-11-07T09:00:00.000Z" });
    const settled = entry({ id: "closed-1", content: "J'ai trié le retour de Lina.",
      source_conversation_id: "conv-new", closed_at: "2026-11-08T08:00:00.000Z", closed_reason: "Trié." });
    mocks.open = [waiting];
    mocks.unseen = [settled];
    mocks.answer = {
      text: `Bonjour Camille, [@MIN-42](mention:issue/${ISSUE}) attend toujours votre relecture.`,
      suggestions: [{ label: "Relire MIN-42", prompt: `Résume [@MIN-42](mention:issue/${ISSUE}).` }],
    };

    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("written");

    const [, system, message, , , options] = mocks.forcedToolCall.mock.calls[0];
    expect(system).toContain("French");
    expect(system).toContain("Camille Roy");
    expect(message).toContain(`[@MIN-42](mention:issue/${ISSUE}) attend votre relecture.`);
    expect(message).toContain("settled, not seen yet) J'ai trié le retour de Lina.");
    expect(options).toMatchObject({ modelKey: "home_brief_model", record: { feature: "numo_home_brief", billTo: { userId: "user-1" } } });
    expect(mocks.writeHomeBrief).toHaveBeenCalledWith(expect.anything(), "user-1", {
      content: `[@](mention:issue/${ISSUE}) attend toujours votre relecture.`,
      suggestions: [{ label: "Relire MIN-42", prompt: `Résume [@](mention:issue/${ISSUE}).` }],
      journalEntryIds: ["open-1", "closed-1"],
      journalDigest: homeBriefDigest([{ id: "open-1", state: "open" }, { id: "closed-1", state: "settled" }]),
      conversationId: "conv-new",
    });
  });

  it("never lets the word point at a record the user may not see", async () => {
    mocks.open = [entry({ id: "open-1", content: `See [@](mention:page/${HIDDEN}) and [@](mention:issue/${ISSUE}).` })];
    mocks.answer = { text: `Read [@Secret](mention:page/${HIDDEN}) and [@MIN-42](mention:issue/${ISSUE}).`, suggestions: [] };
    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("written");
    expect(mocks.writeHomeBrief.mock.calls[0][2].content).toBe(`Read Secret and [@](mention:issue/${ISSUE}).`);
  });

  it("writes nothing and calls no model when nothing is open or unseen", async () => {
    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("empty");
    expect(mocks.forcedToolCall).not.toHaveBeenCalled();
    expect(mocks.writeHomeBrief).not.toHaveBeenCalled();
  });

  it("warns about a budget running out even with an empty journal (MIN-946)", async () => {
    mocks.forecast = {
      status: "short", usedPercent: 70, projectedPercent: 130,
      runsOutAt: "2026-11-20T12:00:00.000Z", resetsAt: "2026-12-01T00:00:00.000Z",
      daysShort: 10, points: [],
    };
    mocks.answer = { text: "À ce rythme, votre budget IA sera épuisé vers le [@](mention:date/2026-11-20).", suggestions: [] };

    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("written");

    const [, , message] = mocks.forcedToolCall.mock.calls[0];
    expect(message).toContain("runs out around [@](mention:date/2026-11-20)");
    expect(mocks.writeHomeBrief).toHaveBeenCalledWith(expect.anything(), "user-1", expect.objectContaining({
      content: "À ce rythme, votre budget IA sera épuisé vers le [@](mention:date/2026-11-20).",
      journalEntryIds: [],
      journalDigest: homeBriefDigest([], "short:2026-11-20"),
    }));
  });

  it("does not pay again for the entries the latest word already covers", async () => {
    mocks.open = [entry({ id: "open-1" })];
    mocks.latestDigest = homeBriefDigest([{ id: "open-1", state: "open" }]);
    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("unchanged");
    expect(mocks.forcedToolCall).not.toHaveBeenCalled();
  });

  it("keeps the greeting alone when no AI answers (none configured)", async () => {
    mocks.open = [entry({ id: "open-1" })];
    mocks.answer = null;
    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("no_answer");
    expect(mocks.writeHomeBrief).not.toHaveBeenCalled();
  });

  it("stays silent when background Numo or the budget is off", async () => {
    mocks.open = [entry({ id: "open-1" })];
    mocks.metadata = { numo_background: "false" };
    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("switched_off");
    mocks.metadata = { numo_memory: false };
    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("switched_off");
    mocks.metadata = {};
    mocks.budget = false;
    expect(await rewriteHomeBrief("user-1", undefined, NOW)).toBe("budget_exhausted");
    expect(mocks.forcedToolCall).not.toHaveBeenCalled();
  });
});
