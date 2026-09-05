import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "./loop";

const { executeTool, fetchAiChat } = vi.hoisted(() => ({
  executeTool: vi.fn(),
  fetchAiChat: vi.fn(),
}));

vi.mock("./execute-tool", () => ({ executeTool }));
vi.mock("@/lib/server/ai-runtime", () => ({ fetchAiChat }));
vi.mock("@/lib/server/ai-usage", () => ({
  newRunId: () => "comment-run",
  recordAiUsage: vi.fn(),
}));
vi.mock("./reasoning", () => ({ getAssistantReasoningLevel: async () => "low" }));
vi.mock("@/lib/server/web-search", () => ({
  isWebSearchEnabled: async () => true,
}));

import { runCommentLoop } from "./comment-agent";

function stream(delta: Record<string, unknown>) {
  return {
    response: new Response(
      `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`,
    ),
  };
}

describe("MCP results in Numo comment mentions", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      "list_mcp_tools",
      {
        tools: [{
          name: "search",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "x".repeat(20_000) },
            },
          },
        }],
        nextCursor: "next-page",
      },
    ],
    [
      "call_mcp_tool",
      { content: [{ type: "text", text: "x".repeat(30_000) }] },
    ],
    ["get_page", { markdown: "x".repeat(10_000) }],
  ])("preserves %s results in the next model round", async (name, result) => {
    executeTool.mockResolvedValue({ success: true, result });
    fetchAiChat
      .mockResolvedValueOnce(stream({
        tool_calls: [{
          index: 0,
          id: "call-1",
          function: { name, arguments: '{"connection_id":"connection"}' },
        }],
      }))
      .mockImplementationOnce(async (_runtime, _model, buildRequest) => {
        const request = buildRequest();
        const toolResult = request.messages.find(
          (message: ChatMessage) => message.role === "tool",
        );
        expect(JSON.parse(toolResult.content)).toEqual(result);
        return stream({ content: "Completed." });
      });

    const messages: ChatMessage[] = [
      { role: "user", content: "@Numo find the page" },
    ];
    await expect(
      runCommentLoop(messages, {
        model: "test-model",
        aiRuntime: { model: "test-model" } as never,
        projectId: "project",
        userId: "requester",
        service: {} as never,
        supabase: {} as never,
        locale: "en",
        numoDefaultStatus: "backlog",
        onTool: vi.fn(),
        onText: vi.fn(),
      }),
    ).resolves.toBe("Completed.");
    expect(executeTool).toHaveBeenCalledWith(
      name,
      { connection_id: "connection" },
      expect.objectContaining({ userId: "requester", triggerSource: "mention" }),
    );
    expect(fetchAiChat).toHaveBeenCalledTimes(2);
  });
});
