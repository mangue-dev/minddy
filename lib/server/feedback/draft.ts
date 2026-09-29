import "server-only";
import { randomUUID } from "node:crypto";
import { FEEDBACK_DRAFT_TTL_MS, validFeedbackDraft, type FeedbackDraft, type FeedbackDraftSnapshot } from "@/lib/feedback-draft";
import { getEncryptedStore } from "../encryption/registry";

type BoardScope = { id: string; project_id: string };
const context = (board: BoardScope, nonce: string) => ({
  scope: { kind: "project" as const, id: board.project_id },
  table: "public_feedback_local_drafts", column: "self_authored_draft", rowId: `${board.id}:${nonce}`,
});

export async function sealFeedbackDraft(board: BoardScope, value: FeedbackDraft): Promise<FeedbackDraftSnapshot> {
  if (!validFeedbackDraft(value)) throw new Error("Invalid feedback draft");
  const nonce = randomUUID();
  const expiresAt = Date.now() + FEEDBACK_DRAFT_TTL_MS;
  const ciphertext = await getEncryptedStore().encrypt({ value, expiresAt }, context(board, nonce));
  return { format: "minddy-feedback-draft-v1", nonce, expiresAt, ciphertext };
}

export async function openFeedbackDraft(board: BoardScope, snapshot: FeedbackDraftSnapshot): Promise<FeedbackDraft> {
  if (snapshot?.format !== "minddy-feedback-draft-v1" || typeof snapshot.nonce !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(snapshot.nonce)
    || typeof snapshot.ciphertext !== "string" || snapshot.ciphertext.length > 60 * 1024) throw new Error("Invalid feedback snapshot");
  const store = getEncryptedStore();
  const decoded = await store.decrypt<{ value: FeedbackDraft; expiresAt: number }>(store.fromDatabase(snapshot.ciphertext), context(board, snapshot.nonce));
  if (!validFeedbackDraft(decoded.value) || !Number.isSafeInteger(decoded.expiresAt)
    || decoded.expiresAt <= Date.now() || decoded.expiresAt !== snapshot.expiresAt
    || decoded.expiresAt > Date.now() + FEEDBACK_DRAFT_TTL_MS) throw new Error("Invalid feedback snapshot");
  return decoded.value;
}
