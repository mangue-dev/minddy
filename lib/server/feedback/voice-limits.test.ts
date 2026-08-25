import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc }),
}));

const { consumeFeedbackVoiceLimit } = await import(
  "@/lib/server/feedback/voice-limits"
);

beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
});

describe("consumeFeedbackVoiceLimit", () => {
  it("reserves transcription user and IP quotas in one database call", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(
      consumeFeedbackVoiceLimit({
        boardId: "board-1",
        feedbackUserId: "user-1",
        operation: "transcribe",
        userLimit: 20,
        ip: "203.0.113.8",
        ipLimit: 40,
      })
    ).resolves.toEqual({ allowed: true, retryAfter: 3600 });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "consume_feedback_voice_attempt",
      expect.objectContaining({
        p_board_id: "board-1",
        p_feedback_user_id: "user-1",
        p_operation: "transcribe",
        p_user_limit: 20,
        p_ip_limit: 40,
      })
    );
    expect(rpc.mock.calls[0][1].p_ip_hash).not.toBe("203.0.113.8");
  });

  it("uses the shared user quota for the dictation pass", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(
      consumeFeedbackVoiceLimit({
        boardId: "board-1",
        feedbackUserId: "user-1",
        operation: "dictate",
        userLimit: 40,
      })
    ).resolves.toEqual({ allowed: false, retryAfter: 3600 });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_operation: "dictate",
      p_ip_hash: null,
      p_ip_limit: null,
    });
  });

  it("fails closed when the shared quota cannot be consumed", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(
      consumeFeedbackVoiceLimit({
        boardId: "board-1",
        feedbackUserId: "user-1",
        operation: "transcribe",
        userLimit: 20,
        ip: "203.0.113.8",
        ipLimit: 40,
      })
    ).resolves.toEqual({ allowed: false, retryAfter: 3600 });
  });
});
