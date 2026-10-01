import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BeginNumoTurnInput } from "./turns";
import type { encodeNumoUserMessage } from "./user-message-content";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  protectUserMessage: vi.fn(async () => true),
  protectIntent: vi.fn(async () => true),
  encodeUserMessage: vi.fn(async (_userId: string, _messageId: string, _payload: Parameters<typeof encodeNumoUserMessage>[2]) =>
    ({ content: "sealed-user-message", user_payload_version: 1 })),
  encodeIntent: vi.fn(async (_userId: string, _conversationId: string, _requestId: string, _intent: BeginNumoTurnInput["intent"]) =>
    ({ encrypted_intent: "sealed-intent", encryption_version: 1 })),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: h.rpc }) }));
vi.mock("./user-message-content", () => ({
  shouldProtectNumoUserMessages: () => h.protectUserMessage(),
  encodeNumoUserMessage: (...args: Parameters<typeof h.encodeUserMessage>) => h.encodeUserMessage(...args),
}));
vi.mock("./turn-intent-content", () => ({
  shouldProtectNumoTurnIntent: () => h.protectIntent(),
  encodeNumoTurnIntent: (...args: Parameters<typeof h.encodeIntent>) => h.encodeIntent(...args),
  decodeNumoTurnIntent: async () => ({}),
}));

const { beginNumoTurn } = await import("./turns");
const input: BeginNumoTurnInput = {
  conversationId: "conversation", userId: "user", requestId: "request", runId: "run",
  content: "List projects", context: null, metadata: {}, model: "z-ai/glm-5.3-flash", reasoningLevel: "low",
  intent: { projectId: null, locale: "en", timezone: "UTC", numoDefaultStatus: "triage", webSearchEnabled: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.protectUserMessage.mockResolvedValue(true);
  h.protectIntent.mockResolvedValue(true);
  h.encodeUserMessage.mockResolvedValue({ content: "sealed-user-message", user_payload_version: 1 });
  h.encodeIntent.mockResolvedValue({ encrypted_intent: "sealed-intent", encryption_version: 1 });
  h.rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
    const turn = { id: "turn", user_id: input.userId, conversation_id: input.conversationId,
      request_id: input.requestId, intent: params.p_intent, checkpoint: {}, outcome: null, error_message: null };
    return { data: name === "begin_numo_turn_with_budget" ? { turn } : [turn], error: null };
  });
});

describe("Numo admission preparation", () => {
  it.each([false, true])("prepares both protected payloads concurrently before admission (managed budget: %s)", async (managedBudget) => {
    let releaseUserMessage!: (value: { content: string; user_payload_version: number }) => void;
    h.encodeUserMessage.mockImplementationOnce(() => new Promise((resolve) => { releaseUserMessage = resolve; }));
    const admissionInput = managedBudget ? { ...input, managedBudget: {
      periodStart: "2026-10-01T00:00:00Z", accountCapUsd: 5, requestedUsd: 5,
    } } : input;
    const pending = beginNumoTurn(admissionInput);
    try {
      await vi.waitFor(() => expect(h.encodeIntent).toHaveBeenCalledOnce(), { timeout: 100 });
      expect(h.encodeUserMessage).toHaveBeenCalledOnce();
      expect(h.rpc).not.toHaveBeenCalled();
    } finally {
      releaseUserMessage?.({ content: "sealed-user-message", user_payload_version: 1 });
    }
    await pending;
    expect(h.rpc).toHaveBeenCalledWith(managedBudget ? "begin_numo_turn_with_budget" : "begin_numo_turn", expect.objectContaining({
      p_content: "sealed-user-message", p_user_payload_version: 1,
      p_context: null, p_metadata: {}, p_intent: { encrypted_intent: "sealed-intent", encryption_version: 1 },
    }));
    expect(h.encodeUserMessage).toHaveBeenCalledWith("user", expect.any(String), expect.objectContaining({ content: input.content }));
    expect(h.encodeIntent).toHaveBeenCalledWith("user", "conversation", "request", input.intent);
  });

  it("does not admit plaintext when either concurrent protection preparation fails", async () => {
    h.encodeIntent.mockRejectedValueOnce(new Error("Intent protection unavailable"));
    await expect(beginNumoTurn(input)).rejects.toThrow("Intent protection unavailable");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
