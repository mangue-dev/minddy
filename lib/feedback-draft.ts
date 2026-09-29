export const FEEDBACK_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const FEEDBACK_DRAFT_MAX_BYTES = 32 * 1024;
export type FeedbackDraft = { title: string; body: string };
export type FeedbackDraftSnapshot = { format: "minddy-feedback-draft-v1"; nonce: string; expiresAt: number; ciphertext: string };
export function validFeedbackDraft(value: unknown): value is FeedbackDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as FeedbackDraft;
  return typeof draft.title === "string" && typeof draft.body === "string"
    && Object.keys(draft).every((key) => key === "title" || key === "body")
    && draft.title.length <= 500 && new TextEncoder().encode(JSON.stringify(draft)).length <= FEEDBACK_DRAFT_MAX_BYTES;
}
