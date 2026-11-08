import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const H = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  writeJournalEntry: vi.fn(),
  closeJournalEntry: vi.fn(),
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(),
  getProjectAccess: H.getProjectAccess,
}));
vi.mock("@/lib/server/numo/journal-content", async (original) => ({
  ...await original<typeof import("@/lib/server/numo/journal-content")>(),
  writeJournalEntry: H.writeJournalEntry,
  closeJournalEntry: H.closeJournalEntry,
}));

import { executeTool, type ToolContext } from "./execute-tool";
import { CONVERSATION_ASSISTANT_TOOLS, PROJECT_SCOPED_TOOLS } from "./tools";
import { NUMO_TOOL_CAPABILITIES, readerToolSet } from "./tool-capabilities";
import { NumoJournalError } from "@/lib/server/numo/journal-content";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ENTRY = "22222222-2222-4222-8222-222222222222";
const ISSUE = "33333333-3333-4333-8333-333333333333";

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectId: null,
    requireExplicitProjectTarget: true,
    userId: "user-1",
    supabase: {} as SupabaseClient,
    service: {} as SupabaseClient,
    locale: "en",
    conversationId: "conversation-1",
    journalSource: "conversation",
    ...overrides,
  };
}

const tool = (name: string) =>
  CONVERSATION_ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name);

beforeEach(() => {
  vi.clearAllMocks();
  H.getProjectAccess.mockResolvedValue({ project: { id: PROJECT }, role: "reader" });
  H.writeJournalEntry.mockImplementation(async (_service, _user, input) => ({
    id: ENTRY, project_id: input.projectId, content: input.content,
  }));
  H.closeJournalEntry.mockImplementation(async (_service, _user, id, reason) => ({
    id, closed_reason: reason,
  }));
});

describe("Numo journal tools (MIN-927)", () => {
  it("asks for every field, and takes the project as a subject rather than a target", () => {
    expect(tool("journal_write")?.function.parameters.required).toEqual(["content", "project_id"]);
    expect(tool("journal_close")?.function.parameters.required).toEqual(["entry_id", "reason"]);
    expect(PROJECT_SCOPED_TOOLS.has("journal_write")).toBe(false);
    expect(PROJECT_SCOPED_TOOLS.has("journal_close")).toBe(false);
    expect(tool("journal_write")?.function.parameters.properties).not.toHaveProperty("source");
  });

  it("stays available to a Reader, since it changes no project", () => {
    expect(NUMO_TOOL_CAPABILITIES.journal_write).toBe("personal");
    expect(NUMO_TOOL_CAPABILITIES.journal_close).toBe("personal");
    const names = readerToolSet(CONVERSATION_ASSISTANT_TOOLS, false)
      .map((candidate) => candidate.function.name);
    expect(names).toEqual(expect.arrayContaining(["journal_write", "journal_close"]));
  });

  it("writes an entry from the turn's source, with its mentions stored without labels", async () => {
    // The echoed entry carries no mention, so the result needs no label lookup.
    H.writeJournalEntry.mockResolvedValueOnce({ id: ENTRY, project_id: PROJECT, content: "Done" });
    const result = await executeTool("journal_write", {
      content: `I did the web research asked for in [@MIN-42](mention:issue/${ISSUE})`,
      project_id: PROJECT,
    }, context({ journalSource: "mention" }));
    expect(result).toEqual({ success: true,
      result: { journaled: { id: ENTRY, project_id: PROJECT } } });
    expect(H.writeJournalEntry).toHaveBeenCalledWith(expect.anything(), "user-1", {
      content: `I did the web research asked for in [@](mention:issue/${ISSUE})`,
      projectId: PROJECT, source: "mention", sourceConversationId: "conversation-1",
    });
  });

  it("refuses a project the user cannot open", async () => {
    H.getProjectAccess.mockResolvedValue(null);
    const result = await executeTool("journal_write",
      { content: "x", project_id: PROJECT }, context());
    expect(result.success).toBe(false);
    expect(H.writeJournalEntry).not.toHaveBeenCalled();
  });

  it("asks Numo to close settled entries when the journal is full", async () => {
    H.writeJournalEntry.mockRejectedValue(new NumoJournalError("limit_reached", "full"));
    const result = await executeTool("journal_write",
      { content: "One more", project_id: null }, context());
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.result)).toContain("journal_close");
  });

  it("closes an entry with its reason, and reports an unknown or closed one", async () => {
    expect(await executeTool("journal_close", { entry_id: ENTRY, reason: "Reviewed" }, context()))
      .toMatchObject({ success: true, result: { closed: { id: ENTRY, reason: "Reviewed" } } });
    H.closeJournalEntry.mockRejectedValueOnce(new NumoJournalError("not_found", "gone"));
    expect((await executeTool("journal_close", { entry_id: ENTRY, reason: "Again" }, context())).success)
      .toBe(false);
    expect((await executeTool("journal_close", { entry_id: "MIN-42", reason: "x" }, context())).success)
      .toBe(false);
    expect(H.closeJournalEntry).toHaveBeenCalledTimes(2);
  });

  it("closes within the turn's scope on a shared surface", async () => {
    await executeTool("journal_close", { entry_id: ENTRY, reason: "Reviewed" },
      context({ journalSource: "mention", journalScope: { projectId: PROJECT } }));
    expect(H.closeJournalEntry).toHaveBeenCalledWith(expect.anything(), "user-1", ENTRY, "Reviewed",
      { scope: { projectId: PROJECT } });
  });

  it("writes nothing where the turn has no journal", async () => {
    const none = context({ journalSource: null });
    expect((await executeTool("journal_write", { content: "x", project_id: null }, none)).success)
      .toBe(false);
    expect((await executeTool("journal_close", { entry_id: ENTRY, reason: "x" }, none)).success)
      .toBe(false);
    expect(H.writeJournalEntry).not.toHaveBeenCalled();
    expect(H.closeJournalEntry).not.toHaveBeenCalled();
  });
});
