import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./execute-tool";
import { executeTool } from "./execute-tool";
import { EncryptedStore } from "@/lib/server/encryption/store";
import { encodeNumoUserMessage } from "@/lib/server/numo/user-message-content";
import { encodeAttachmentValue } from "@/lib/server/attachment-content";
import { attachmentOffset, copyConversationAttachment, listConversationAttachments,
  readConversationAttachment, resolveConversationAttachment,
  withConversationAttachmentPreviews } from "./conversation-attachments";
import { CONVERSATION_ASSISTANT_TOOLS } from "./tools";
import { processChat, type ChatMessage } from "./loop";
import { serializeToolResult, getToolResultCharLimit } from "./tool-result-serialization";

const h = vi.hoisted(() => ({ access: vi.fn(), download: vi.fn(), upload: vi.fn(),
  insert: vi.fn(), remove: vi.fn(), quota: vi.fn(), signed: vi.fn(), chat: vi.fn() }));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(), getProjectAccess: h.access,
}));
vi.mock("@/lib/server/storage-quota", () => ({ projectStorageAllowed: h.quota }));
vi.mock("@/lib/server/attachments", async (original) => ({
  ...await original<typeof import("@/lib/server/attachments")>(), downloadAttachment: h.download,
  uploadPrivateAttachmentObject: h.upload, insertAttachments: h.insert,
  removeStorageObjects: h.remove, signedAttachmentUrl: h.signed,
}));
vi.mock("@/lib/server/encryption/registry", async (original) => ({
  ...await original<typeof import("@/lib/server/encryption/registry")>(),
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.alloc(32, 63) }),
    byVersion: async (_scope: unknown, version: number) => ({ version, bytes: Buffer.alloc(32, 63) }),
  }),
}));

vi.mock("@/lib/server/ai-runtime", async (original) => ({
  ...await original<typeof import("@/lib/server/ai-runtime")>(), fetchAiChat: h.chat,
}));
vi.mock("@/lib/server/agent/openrouter-index", async (original) => ({
  ...await original<typeof import("@/lib/server/agent/openrouter-index")>(),
  getOpenRouterModelInfo: async () => ({ inputModalities: ["text", "image", "file"] }),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const REF = `${MESSAGE}:0`;
const ISSUE = "44444444-4444-4444-8444-444444444444";
const OBJECTIVE = "55555555-5555-4555-8555-555555555555";
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let databaseError: { message: string } | null;
let ranges: number[];
let persisted: Row[];
function database() {
  return { from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let start = 0, end = Infinity;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row))).slice(start, end);
    const q = {
      select: () => q,
      insert(row: Row) { persisted.push(row); return q; },
      single: async () => ({ data: { id: "saved-message" }, error: null }),
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return q; },
      is(key: string, value: unknown) { filters.push((row) => (row[key] ?? null) === value); return q; },
      order: () => q,
      range(from: number, to: number) { ranges.push(from); start = from; end = to + 1; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: databaseError }),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows(), error: databaseError }).then(resolve); },
    };
    return q;
  } };
}
function ctx(): ToolContext {
  return { userId: USER, conversationId: "current", projectId: null,
    requireExplicitProjectTarget: true, service: database() as never,
    supabase: database() as never, locale: "en" };
}
function file(overrides = {}) {
  return { storage_path: `chat/${USER}/object`, file_name: "notes.txt", mime_type: "text/plain", size_bytes: 5, ...overrides };
}
function message(id = MESSAGE, attachments: unknown[] = [file()]): Row {
  return { id, conversation_id: "current", role: "user", content: "Please read this",
    context: null, metadata: { attachments }, created_at: "2026-10-08T10:00:00Z" };
}
beforeEach(() => {
  vi.clearAllMocks();
  databaseError = null; ranges = []; persisted = [];
  h.access.mockResolvedValue({ project: { id: PROJECT, key: "MIN" } });
  h.download.mockResolvedValue(Buffer.from("hello"));
  h.quota.mockResolvedValue(true);
  h.signed.mockResolvedValue("https://signed.test/image");
  h.insert.mockResolvedValue([{ id: "resource", file_name: "notes.txt", mime_type: "text/plain", size_bytes: 5 }]);
  h.upload.mockResolvedValue(undefined); h.remove.mockResolvedValue(undefined);
  tables = { conversations: [{ id: "current", user_id: USER }], assistant_messages: [message()],
    issues: [{ id: ISSUE, project_id: PROJECT }], objectives: [{ id: OBJECTIVE, project_id: PROJECT }],
    comments: [{ id: "comment", issue_id: ISSUE, objective_id: null, author_id: USER }] };
});

describe("conversation file references", () => {
  it("reads protected metadata and encrypted project filenames without exposing storage paths", async () => {
    const projectFile = file({ id: "resource", project_id: PROJECT, storage_path: `projects/${PROJECT}/object`,
      file_name: await encodeAttachmentValue("attachments", PROJECT, "resource", "file_name", "private.txt") });
    const encrypted = await encodeNumoUserMessage(USER, MESSAGE, {
      content: "Private", context: null, metadata: { attachments: [projectFile] },
      tool_calls: null, tool_call_id: null, tool_name: null,
    });
    tables.assistant_messages = [{ ...message(), ...encrypted }];
    const result = await listConversationAttachments(ctx());
    expect(result.attachments[0]).toMatchObject({ attachment_id: REF, file_name: "private.txt" });
    expect(JSON.stringify(result)).not.toContain("storage_path");
    expect(await readConversationAttachment(ctx(), REF)).toMatchObject({ content: "hello" });
  });

  it("scans beyond both the prompt history and a database page, with complete bounded results", async () => {
    tables.assistant_messages = Array.from({ length: 201 }, (_, i) => message(
      `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`));
    const result = await listConversationAttachments(ctx(), 190);
    expect(ranges).toEqual([0, 200]);
    expect(result).toMatchObject({ total: 201, next_offset: null });
    expect(result.attachments).toHaveLength(11);
    const first = await listConversationAttachments(ctx());
    expect(first).toMatchObject({ next_offset: 20 });
    expect(JSON.parse(serializeToolResult(first, getToolResultCharLimit("list_conversation_attachments")))).toEqual(first);
  });

  it("rejects foreign conversations, foreign messages and fabricated object paths before downloading", async () => {
    tables.assistant_messages.push({ ...message(), id: "other", conversation_id: "foreign" });
    await expect(resolveConversationAttachment(ctx(), `chat/${USER}/object`)).rejects.toThrow("attachment_id");
    tables.assistant_messages[0].conversation_id = "foreign";
    await expect(readConversationAttachment(ctx(), REF)).rejects.toThrow("this conversation");
    tables.conversations[0].user_id = "other";
    await expect(listConversationAttachments(ctx())).rejects.toThrow("not accessible");
    expect(h.download).not.toHaveBeenCalled();
  });

  it("excludes links, malformed files, another user's files and revoked project sources", async () => {
    tables.assistant_messages = [message(MESSAGE, [file(), { kind: "link", url: "https://example.com" },
      file({ storage_path: "chat/other/object" }), file({ size_bytes: -1 }),
      file({ storage_path: `projects/${PROJECT}/object` })])];
    h.access.mockResolvedValue(null);
    expect((await listConversationAttachments(ctx())).attachments).toHaveLength(1);
    await expect(resolveConversationAttachment(ctx(), `${MESSAGE}:4`)).rejects.toThrow("no longer accessible");
  });

  it("fails closed on database errors and missing conversation context", async () => {
    databaseError = { message: "Database failure" };
    await expect(listConversationAttachments(ctx())).rejects.toThrow();
    await expect(listConversationAttachments({ ...ctx(), conversationId: null })).rejects.toThrow("No current");
  });

  it("lets Numo page through text and reports missing bytes", async () => {
    h.download.mockResolvedValue(Buffer.from("a".repeat(3000) + "the end"));
    const first = await readConversationAttachment(ctx(), REF);
    expect(first).toMatchObject({ content: "a".repeat(3000), next_offset: 3000 });
    expect(await readConversationAttachment(ctx(), REF, 3000)).toMatchObject({ content: "the end", next_offset: null });
    h.download.mockResolvedValue(null);
    await expect(readConversationAttachment(ctx(), REF)).rejects.toThrow("unavailable");
    for (const bad of [-1, 0.5, "0", NaN]) expect(() => attachmentOffset(bad)).toThrow();
  });
});

describe("reusable file copies", () => {
  it.each(["issue", "objective", "comment"])("creates an independent object for a %s", async (target) => {
    const parent = { projectId: PROJECT, createdBy: USER, issueId: target === "objective" ? null : ISSUE,
      objectiveId: target === "objective" ? OBJECTIVE : null, commentId: target === "comment" ? "comment" : null };
    await copyConversationAttachment(ctx(), REF, parent);
    const path = h.upload.mock.calls[0][1];
    expect(path).toMatch(new RegExp(`^projects/${PROJECT}/`));
    expect(path).not.toEqual(file().storage_path);
    expect(h.upload.mock.calls[0][2]).toEqual(Buffer.from("hello"));
    expect(h.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ...parent,
      resources: [expect.objectContaining({ storage_path: path, size_bytes: 5 })] }));
  });

  it("refuses quota exhaustion before upload and cleans a failed registration without removing the source", async () => {
    const parent = { projectId: PROJECT, issueId: ISSUE, createdBy: USER };
    h.quota.mockResolvedValue(false);
    await expect(copyConversationAttachment(ctx(), REF, parent)).rejects.toThrow("quota");
    expect(h.upload).not.toHaveBeenCalled();
    h.quota.mockResolvedValue(true); h.insert.mockRejectedValue(new Error("Registration failed"));
    await expect(copyConversationAttachment(ctx(), REF, parent)).rejects.toThrow("Registration failed");
    expect(h.remove).toHaveBeenCalledWith(expect.anything(), [h.upload.mock.calls[0][1]]);
    expect(h.remove.mock.calls[0][1]).not.toContain(file().storage_path);
  });

  it("executes chat reads without a project and copies to the selected comment", async () => {
    expect((await executeTool("list_conversation_attachments", {}, ctx())).success).toBe(true);
    expect((await executeTool("read_conversation_attachment", { attachment_id: REF }, ctx())).success).toBe(true);
    expect((await executeTool("add_resource", { project_id: PROJECT, issue_id: ISSUE,
      comment_id: "comment", attachment_id: REF }, ctx())).success).toBe(true);
    expect(h.insert.mock.calls[0][1]).toMatchObject({ issueId: ISSUE, commentId: "comment", createdBy: USER });
  });

  it.each([false, true])("copies to an objective, optionally targeting its comment: %s", async (comment) => {
    tables.comments[0] = { id: "comment", issue_id: null, objective_id: OBJECTIVE, author_id: USER };
    expect((await executeTool("add_resource", { project_id: PROJECT, objective_id: OBJECTIVE,
      ...(comment ? { comment_id: "comment" } : {}), attachment_id: REF }, ctx())).success).toBe(true);
    expect(h.insert.mock.calls[0][1]).toMatchObject({ objectiveId: OBJECTIVE, issueId: null,
      commentId: comment ? "comment" : null });
  });

  it.each(["foreign", "deleted"])("refuses a %s issue target before copying", async (state) => {
    if (state === "foreign") tables.issues[0].project_id = "another-project";
    else tables.issues[0].deleted_at = "2026-10-08";
    expect((await executeTool("add_resource", { project_id: PROJECT, issue_id: ISSUE, attachment_id: REF }, ctx())).success).toBe(false);
    expect(h.download).not.toHaveBeenCalled();
  });

  it.each(["foreign parent", "other author", "both parents", "both sources", "inaccessible project"])("rejects %s before copying", async (failure) => {
    const args: Record<string, unknown> = { project_id: PROJECT, issue_id: ISSUE, comment_id: "comment", attachment_id: REF };
    if (failure === "foreign parent") tables.comments[0].issue_id = "other";
    if (failure === "other author") tables.comments[0].author_id = "other";
    if (failure === "both parents") args.objective_id = OBJECTIVE;
    if (failure === "both sources") args.url = "https://example.com";
    if (failure === "inaccessible project") h.access.mockResolvedValue(null);
    expect((await executeTool("add_resource", args, ctx())).success).toBe(false);
    expect(h.upload).not.toHaveBeenCalled();
  });
});

describe("multimodal rereads and durable replay", () => {
  function history(result: unknown, name = "read_conversation_attachment"): ChatMessage[] {
    return [{ role: "assistant", content: null, tool_calls: [{ id: "read", type: "function",
      function: { name, arguments: JSON.stringify({ attachment_id: REF }) } }] },
    { role: "tool", name, tool_call_id: "read", content: JSON.stringify(result) }];
  }
  it.each(["image/png", "application/pdf"])("supplies %s to supported models using only a persisted reference", async (mime) => {
    tables.assistant_messages = [message(MESSAGE, [file({ mime_type: mime, file_name: "file" })])];
    const result = await readConversationAttachment(ctx(), REF);
    const messages = history(result);
    expect(JSON.stringify(messages)).not.toContain("base64");
    const next = await withConversationAttachmentPreviews(messages, ctx(), async () => new Set(["image", "file"]));
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ role: "user", content: expect.arrayContaining([
      expect.objectContaining({ type: mime === "image/png" ? "image_url" : "file" })]) });
    expect(messages).toHaveLength(2);
    // A fresh process reconstructs the same model input from persisted JSON.
    expect(await withConversationAttachmentPreviews(JSON.parse(JSON.stringify(messages)), ctx(), async () => new Set(["image", "file"]))).toEqual(next);
  });

  it("retains a requested image through later tool rounds without persisting its signed URL", async () => {
    tables.assistant_messages = [message(MESSAGE, [file({ mime_type: "image/png", file_name: "image.png" })])];
    const requests: ChatMessage[][] = [];
    const rounds = [
      { tool_calls: [{ index: 0, id: "read", function: { name: "read_conversation_attachment", arguments: JSON.stringify({ attachment_id: REF }) } }] },
      { tool_calls: [{ index: 0, id: "list", function: { name: "list_conversation_attachments", arguments: "{}" } }] },
      { content: "The image is ready to attach." },
    ];
    h.chat.mockImplementation(async (_runtime, _model, body) => {
      requests.push(body("model").messages);
      const delta = rounds.shift();
      const chunk = { choices: [{ delta, finish_reason: delta?.tool_calls ? "tool_calls" : "stop" }] };
      return { model: "model", response: new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`) };
    });
    await processChat([{ role: "user", content: "Review the old image" }], CONVERSATION_ASSISTANT_TOOLS,
      { emit: vi.fn() } as never, { ...ctx(), conversationId: "current", model: "model",
        aiRuntime: { apiKey: "test", provider: "openrouter", mode: "platform", baseUrl: "https://example.com", model: "model",
          requestProfile: { usageAccounting: true, streamUsage: true, outputTokenField: "max_completion_tokens",
            defaultMaxOutputTokens: 8192, attribution: true, promptCaching: true } } });
    expect(requests).toHaveLength(3);
    for (const request of requests.slice(1)) {
      expect(request.at(-1)).toMatchObject({ role: "user", content: expect.arrayContaining([
        { type: "image_url", image_url: { url: "https://signed.test/image" } }]) });
    }
    expect(JSON.stringify(persisted)).not.toContain("https://signed.test/image");
    expect(JSON.stringify(persisted)).toContain("preview_attachment_id");
  });

  it("reports unsupported or oversized formats and refuses references produced by unrelated tools", async () => {
    tables.assistant_messages = [message(MESSAGE, [file({ mime_type: "image/png", size_bytes: 11 * 1024 * 1024 })])];
    const result = await readConversationAttachment(ctx(), REF);
    const messages = history(result);
    const next = await withConversationAttachmentPreviews(messages, ctx(), async () => new Set(["text"]));
    expect(JSON.stringify(next[2])).toContain("not included");
    const unrelated = history(result, "call_mcp_tool");
    expect(await withConversationAttachmentPreviews(unrelated, ctx(), async () => new Set(["image"]))).toBe(unrelated);
  });

  it("advertises conversation references independently of project targets", () => {
    for (const name of ["list_conversation_attachments", "read_conversation_attachment"]) {
      const tool = CONVERSATION_ASSISTANT_TOOLS.find((t) => t.function.name === name)!;
      expect(tool.function.parameters.properties).not.toHaveProperty("project_id");
    }
    const resource = CONVERSATION_ASSISTANT_TOOLS.find((t) => t.function.name === "add_resource")!;
    expect(resource.function.parameters.properties).toHaveProperty("attachment_id");
    expect(resource.function.parameters.properties).toHaveProperty("comment_id");
    expect(resource.function.parameters.required).toContain("project_id");
  });
});
