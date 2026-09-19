import { beforeEach, describe, expect, it, vi } from "vitest";

const { forcedToolCallMock, resolveConfiguredModelMock } = vi.hoisted(() => ({
  forcedToolCallMock: vi.fn(),
  resolveConfiguredModelMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({
  forcedToolCall: forcedToolCallMock,
}));
vi.mock("@/lib/server/model-config", () => ({
  resolveConfiguredModel: resolveConfiguredModelMock,
}));

import { polishDictationTranscript } from "@/lib/server/dictation-polish";

const RECORD = {
  feature: "dictation" as const,
  billTo: { userId: "user-1" },
};

describe("dictation polish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveConfiguredModelMock.mockResolvedValue({ model: "cleanup-model" });
  });

  it("budgets enough output for the largest accepted token-dense transcript", async () => {
    const transcript = "界".repeat(20_000);
    forcedToolCallMock.mockResolvedValue({ text: transcript });

    await expect(
      polishDictationTranscript({
        transcript,
        context: "plain_text",
        record: RECORD,
      }),
    ).resolves.toBe(transcript);

    expect(forcedToolCallMock).toHaveBeenCalledOnce();
    expect(forcedToolCallMock.mock.calls[0]?.[5]).toMatchObject({
      maxTokens: 65_536,
      timeoutMs: 90_000,
    });
  });

  it("does not call the cleanup model when the transcript exceeds that budget", async () => {
    await expect(
      polishDictationTranscript({
        transcript: "界".repeat(20_001),
        context: "plain_text",
        record: RECORD,
      }),
    ).resolves.toBeNull();

    expect(resolveConfiguredModelMock).not.toHaveBeenCalled();
    expect(forcedToolCallMock).not.toHaveBeenCalled();
  });
});
