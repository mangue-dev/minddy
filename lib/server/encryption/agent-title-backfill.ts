import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentTitle, encodeAgentTitle } from "@/lib/server/agent/run-title-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type TitleRow = { id: string; project_id: string; conversation_id?: string;
  title: string | null; title_ciphertext: string | null;
  title_encryption_version: number };

function replacementNeeded(row: TitleRow, version: number) {
  return row.title_encryption_version !== version || !row.title_ciphertext ||
    getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.title_ciphertext)) !== 3;
}

async function currentVersion(projectId: string) {
  const key = await getContentKeys().current({ kind: "project", id: projectId });
  const version = key.version;
  key.bytes.fill(0);
  return version;
}

/** Convert run titles and their conversation copies under one SQL compare-and-swap. */
export async function backfillAgentTitleBatch(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_TITLE_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent title encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent title batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,conversation_id,title,title_ciphertext,title_encryption_version,conversation:agent_conversations(id,project_id,title,title_ciphertext,title_encryption_version)")
    .order("title_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent run titles");
  for (const raw of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const run = raw as unknown as TitleRow & { conversation_id: string;
        conversation: TitleRow | null };
      const conversation = run.conversation;
      if (!run.id || !run.project_id || !run.conversation_id ||
          !conversation || conversation.id !== run.conversation_id ||
          conversation.project_id !== run.project_id) {
        throw new Error("Invalid agent title migration scope");
      }
      const [readableRun, readableConversation, version] = await Promise.all([
        decodeAgentTitle(run), decodeAgentTitle(conversation), currentVersion(run.project_id),
      ]);
      const runCipher = replacementNeeded(run, version)
        ? (await encodeAgentTitle(run.project_id, run.conversation_id, readableRun.title)).title_ciphertext
        : run.title_ciphertext!;
      const conversationCipher = replacementNeeded(conversation, version)
        ? (await encodeAgentTitle(run.project_id, run.conversation_id, readableConversation.title)).title_ciphertext
        : conversation.title_ciphertext!;
      const verifiedRun = await decodeAgentTitle({ ...run, title: null,
        title_ciphertext: runCipher, title_encryption_version: version });
      const verifiedConversation = await decodeAgentTitle({ ...conversation, title: null,
        title_ciphertext: conversationCipher, title_encryption_version: version });
      if (verifiedRun.title !== readableRun.title ||
          verifiedConversation.title !== readableConversation.title) {
        throw new Error("Agent title migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_title_ciphertext", {
        p_run_id: run.id, p_project_id: run.project_id,
        p_conversation_id: run.conversation_id,
        p_old_run_title: run.title, p_old_run_cipher: run.title_ciphertext,
        p_old_run_version: run.title_encryption_version,
        p_old_conversation_title: conversation.title,
        p_old_conversation_cipher: conversation.title_ciphertext,
        p_old_conversation_version: conversation.title_encryption_version,
        p_run_cipher: runCipher, p_conversation_cipher: conversationCipher,
        p_version: version,
      });
      if (committed.error) throw new Error("Unable to commit agent title migration");
      if (!committed.data) result.conflicted++;
      else if (runCipher === run.title_ciphertext &&
               conversationCipher === conversation.title_ciphertext) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
    }
  }
  const conversations = await service.from("agent_conversations")
    .select("id,project_id,title,title_ciphertext,title_encryption_version")
    .order("title_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (conversations.error) throw new Error("Unable to scan agent conversation titles");
  for (const row of (conversations.data ?? []) as TitleRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const plain = await decodeAgentTitle(row);
      const version = await currentVersion(row.project_id);
      const cipher = replacementNeeded(row, version)
        ? (await encodeAgentTitle(row.project_id, row.id, plain.title)).title_ciphertext
        : row.title_ciphertext!;
      const verified = await decodeAgentTitle({ ...row, title: null,
        title_ciphertext: cipher, title_encryption_version: version });
      if (verified.title !== plain.title) throw new Error("Agent title verification failed");
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_conversation_title_ciphertext", {
        p_id: row.id, p_project_id: row.project_id, p_old_title: row.title,
        p_old_cipher: row.title_ciphertext, p_old_version: row.title_encryption_version,
        p_cipher: cipher, p_version: version,
      });
      if (committed.error) throw new Error("Unable to commit agent conversation title");
      if (!committed.data) result.conflicted++;
      else if (cipher === row.title_ciphertext) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
