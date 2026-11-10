import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const H = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  createNumoMemory: vi.fn(),
  updateNumoMemory: vi.fn(),
  deleteNumoMemory: vi.fn(),
  searchNumoConversations: vi.fn(),
  readNumoConversation: vi.fn(),
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(),
  getProjectAccess: H.getProjectAccess,
}));
vi.mock("@/lib/server/numo/memory-content", async (original) => ({
  ...await original<typeof import("@/lib/server/numo/memory-content")>(),
  createNumoMemory: H.createNumoMemory,
  updateNumoMemory: H.updateNumoMemory,
  deleteNumoMemory: H.deleteNumoMemory,
}));

vi.mock("@/lib/server/numo/conversation-search", async (original) => ({
  ...await original<typeof import("@/lib/server/numo/conversation-search")>(),
  searchNumoConversations: H.searchNumoConversations,
  readNumoConversation: H.readNumoConversation,
}));

import { executeTool, type ToolContext } from "./execute-tool";
import { CONVERSATION_ASSISTANT_TOOLS, PROJECT_SCOPED_TOOLS } from "./tools";
import { NUMO_TOOL_CAPABILITIES, readerToolSet } from "./tool-capabilities";
import { NumoMemoryError } from "@/lib/server/numo/memory-content";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const MEMORY = "22222222-2222-4222-8222-222222222222";

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectId: null,
    requireExplicitProjectTarget: true,
    userId: "user-1",
    supabase: {} as SupabaseClient,
    service: {} as SupabaseClient,
    locale: "en",
    conversationId: "conversation-1",
    memoryWritable: true,
    ...overrides,
  };
}

const tool = (name: string) =>
  CONVERSATION_ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name);

beforeEach(() => {
  vi.clearAllMocks();
  H.getProjectAccess.mockResolvedValue({ project: { id: PROJECT }, role: "reader" });
  H.createNumoMemory.mockImplementation(async (_service, _user, input) => ({
    id: MEMORY, project_id: input.projectId, content: input.content,
  }));
  H.updateNumoMemory.mockImplementation(async (_service, _user, id, input) => ({
    id, project_id: input.projectId, content: input.content,
  }));
});

describe("Numo memory tools (MIN-915)", () => {
  it("asks for every field, and takes the project as a scope rather than a target", () => {
    expect(tool("remember")?.function.parameters.required)
      .toEqual(["content", "project_id", "replaces"]);
    expect(tool("forget")?.function.parameters.required).toEqual(["id"]);
    expect(PROJECT_SCOPED_TOOLS.has("remember")).toBe(false);
    expect(PROJECT_SCOPED_TOOLS.has("forget")).toBe(false);
    expect(tool("update_account_settings")?.function.parameters.properties)
      .toHaveProperty("numo_memory");
  });

  it("stays available to a Reader, since it changes no project", () => {
    expect(NUMO_TOOL_CAPABILITIES.remember).toBe("personal");
    const names = readerToolSet(CONVERSATION_ASSISTANT_TOOLS, false)
      .map((candidate) => candidate.function.name);
    expect(names).toEqual(expect.arrayContaining(["remember", "forget"]));
  });

  it("saves a memory for one project the user can open, from the conversation", async () => {
    const result = await executeTool("remember",
      { content: "Titles in English", project_id: PROJECT, replaces: null }, context());
    expect(result).toMatchObject({ success: true,
      result: { remembered: { id: MEMORY, project_id: PROJECT } } });
    expect(H.createNumoMemory).toHaveBeenCalledWith(expect.anything(), "user-1", {
      content: "Titles in English", projectId: PROJECT, sourceConversationId: "conversation-1",
    });
  });

  it("refuses a project the user cannot open", async () => {
    H.getProjectAccess.mockResolvedValue(null);
    const result = await executeTool("remember",
      { content: "x", project_id: PROJECT, replaces: null }, context());
    expect(result.success).toBe(false);
    expect(H.createNumoMemory).not.toHaveBeenCalled();
  });

  it("rewrites a memory by its id instead of adding another", async () => {
    const result = await executeTool("remember",
      { content: "Titles in French", project_id: null, replaces: MEMORY }, context());
    expect(result.success).toBe(true);
    expect(H.updateNumoMemory).toHaveBeenCalledWith(expect.anything(), "user-1", MEMORY,
      { content: "Titles in French", projectId: null });
    expect(H.createNumoMemory).not.toHaveBeenCalled();
  });

  it("asks the user which memory to drop when the limit is reached", async () => {
    H.createNumoMemory.mockRejectedValue(new NumoMemoryError("limit_reached", "full"));
    const result = await executeTool("remember",
      { content: "One more", project_id: null, replaces: null }, context());
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.result)).toContain("Ask them which memory to replace");
  });

  it("forgets a memory, and reports an unknown id", async () => {
    H.deleteNumoMemory.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await executeTool("forget", { id: MEMORY }, context()))
      .toMatchObject({ success: true, result: { forgotten: MEMORY } });
    expect((await executeTool("forget", { id: MEMORY }, context())).success).toBe(false);
  });

  it("writes nothing where memory is read-only: switched off, a routine or a mention", async () => {
    const readOnly = context({ memoryWritable: false });
    expect((await executeTool("remember",
      { content: "x", project_id: null, replaces: null }, readOnly)).success).toBe(false);
    expect((await executeTool("forget", { id: MEMORY }, readOnly)).success).toBe(false);
    expect(H.createNumoMemory).not.toHaveBeenCalled();
    expect(H.deleteNumoMemory).not.toHaveBeenCalled();
  });
});

describe("Numo's search in earlier conversations (MIN-956)", () => {
  const CURRENT = "33333333-3333-4333-8333-333333333333";
  const EARLIER = "44444444-4444-4444-8444-444444444444";

  it("asks for every field, takes no project and stays available to a Reader", () => {
    expect(tool("search_conversations")?.function.parameters.required)
      .toEqual(["query", "after", "before", "limit"]);
    expect(tool("read_conversation")?.function.parameters.required)
      .toEqual(["conversation_id", "offset"]);
    expect(PROJECT_SCOPED_TOOLS.has("search_conversations")).toBe(false);
    expect(NUMO_TOOL_CAPABILITIES.search_conversations).toBe("personal");
    expect(readerToolSet(CONVERSATION_ASSISTANT_TOOLS, false).map((candidate) => candidate.function.name))
      .toEqual(expect.arrayContaining(["search_conversations", "read_conversation"]));
  });

  it("searches the user's own history and leaves the current conversation out", async () => {
    H.searchNumoConversations.mockResolvedValue({ conversations: [], searched: 0, window_full: false });
    const result = await executeTool("search_conversations",
      { query: "pricing", after: null, before: null, limit: null }, context({ conversationId: CURRENT }));
    expect(result.success).toBe(true);
    expect(H.searchNumoConversations).toHaveBeenCalledWith(expect.anything(), "user-1",
      expect.objectContaining({ query: "pricing", excludeConversationId: CURRENT }));
  });

  it("reads an earlier conversation, but not the current one", async () => {
    H.readNumoConversation.mockResolvedValue({ messages: [], total: 0, next_offset: null });
    const ctx = context({ conversationId: CURRENT });
    expect((await executeTool("read_conversation", { conversation_id: EARLIER, offset: null }, ctx)).success)
      .toBe(true);
    expect((await executeTool("read_conversation", { conversation_id: CURRENT, offset: null }, ctx)).success)
      .toBe(false);
    expect((await executeTool("read_conversation", { conversation_id: "pricing", offset: null }, ctx)).success)
      .toBe(false);
    expect(H.readNumoConversation).toHaveBeenCalledTimes(1);
  });

  it("reads nothing where the memory is off, in a routine or in a mention", async () => {
    const readOnly = context({ memoryWritable: false });
    expect((await executeTool("search_conversations",
      { query: "pricing", after: null, before: null, limit: null }, readOnly)).success).toBe(false);
    expect((await executeTool("read_conversation",
      { conversation_id: EARLIER, offset: null }, readOnly)).success).toBe(false);
    expect(H.searchNumoConversations).not.toHaveBeenCalled();
    expect(H.readNumoConversation).not.toHaveBeenCalled();
  });
});
