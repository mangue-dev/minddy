import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { sha256Hex } from "@/lib/server/oauth/crypto";

const WINDOW_SECONDS = 60 * 60;

type VoiceOperation = "transcribe" | "dictate";

function hashIp(ip: string): string {
  return sha256Hex(
    `feedback-voice-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ip}`
  );
}

/**
 * Atomically reserve one public feedback voice operation in shared storage.
 * A failed guard closes the paid AI surface instead of bypassing its quota.
 */
export async function consumeFeedbackVoiceLimit(params: {
  boardId: string;
  feedbackUserId: string;
  operation: VoiceOperation;
  userLimit: number;
  ip?: string;
  ipLimit?: number;
}): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { data, error } = await getServiceClient().rpc(
      "consume_feedback_voice_attempt",
      {
        p_board_id: params.boardId,
        p_feedback_user_id: params.feedbackUserId,
        p_operation: params.operation,
        p_ip_hash: params.ip ? hashIp(params.ip) : null,
        p_now: new Date().toISOString(),
        p_window_seconds: WINDOW_SECONDS,
        p_user_limit: params.userLimit,
        p_ip_limit: params.ipLimit ?? null,
      }
    );
    if (error) {
      console.error("[feedback-voice] atomic rate limit failed:", error.message);
      return { allowed: false, retryAfter: WINDOW_SECONDS };
    }
    return { allowed: data === true, retryAfter: WINDOW_SECONDS };
  } catch (error) {
    console.error(
      "[feedback-voice] atomic rate limit failed:",
      error instanceof Error ? error.message : String(error)
    );
    return { allowed: false, retryAfter: WINDOW_SECONDS };
  }
}
