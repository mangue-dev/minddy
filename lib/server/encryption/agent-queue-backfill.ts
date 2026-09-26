import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeQueueMessage, encodeQueueMessage,
  type StoredQueueMessage } from "@/lib/server/agent/run-queue-content";
import { decodeAgentInputAnswer, encodeAgentInputAnswer } from
  "@/lib/server/agent/run-input-answer-content";
import { decodeWorkerParentMessage, encodeWorkerParentMessage } from
  "@/lib/server/agent/worker-parent-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type QueueRow = StoredQueueMessage & {
  run: { project_id: string } | null;
};
type AnswerRow = { id: string; answer: string | null;
  answer_encryption_version: number };
type ParentRow = { id: string; content: string | null;
  context: Record<string, unknown> | null; metadata: Record<string, unknown>;
  worker_content_encryption_version: number };

/** Convert the queue row and its SQL transcript copy under one compare-and-swap RPC. */
export async function backfillAgentQueueBatch(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent launch encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent queue batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_run_messages")
    .select("id,run_id,content,mentions,content_encryption_version,run:agent_runs!inner(project_id)")
    .order("encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent queue messages");
  for (const row of (data ?? []) as unknown as QueueRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const projectId = row.run?.project_id;
      if (!projectId || !row.id || !row.run_id ||
          !Number.isSafeInteger(row.content_encryption_version) ||
          row.content_encryption_version! < 0) {
        throw new Error("Invalid agent queue migration scope");
      }
      const [answerResult, parentResult] = await Promise.all([
        service.from("agent_run_input_requests")
          .select("id,answer,answer_encryption_version")
          .eq("run_id", row.run_id).eq("answer_message_id", row.id).maybeSingle(),
        service.from("assistant_messages")
          .select("id,content,context,metadata,worker_content_encryption_version")
          .eq("id", row.id).maybeSingle(),
      ]);
      if (answerResult.error || parentResult.error) {
        throw new Error("Unable to read agent queue derived copies");
      }
      const answer = answerResult.data as AnswerRow | null;
      const parent = parentResult.data as ParentRow | null;
      if (parent && !Object.hasOwn(parent.metadata ?? {}, "worker_input") &&
          !Object.hasOwn(parent.metadata ?? {}, "worker_steering")) {
        throw new Error("Agent queue parent copy has no worker source");
      }
      const expected = { content: row.content, mentions: row.mentions,
        version: row.content_encryption_version,
        ...(answer ? { answer: { id: answer.id, content: answer.answer,
          version: answer.answer_encryption_version } } : {}),
        ...(parent ? { parent: { content: parent.content, context: parent.context,
          metadata: parent.metadata, version: parent.worker_content_encryption_version } } : {}),
      };
      const identity = { p_id: row.id, p_run_id: row.run_id,
        p_project_id: projectId, p_expected: expected };
      const attempt = await service.rpc("migrate_agent_queue_bundle", identity);
      if (attempt.error) throw new Error("Unable to mark agent queue attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeQueueMessage(projectId, row);
      const decodedAnswer = answer && await decodeAgentInputAnswer(projectId, answer);
      const decodedParent = parent && await decodeWorkerParentMessage(projectId, parent);
      const current = await getContentKeys().current({ kind: "project", id: projectId });
      const keyVersion = current.version;
      current.bytes.fill(0);
      const currentFormat = (value: string | null) => !!value &&
        getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(value)) === 3;
      if (row.content_encryption_version === keyVersion && currentFormat(row.content) &&
          (!answer || answer.answer_encryption_version === keyVersion &&
            currentFormat(answer.answer)) &&
          (!parent || parent.worker_content_encryption_version === keyVersion &&
            currentFormat(parent.content) && parent.context === null &&
            Object.keys(parent.metadata).every((key) =>
              key === "worker_input" || key === "worker_steering"))) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeQueueMessage(projectId, row.id, {
        content: decoded.content, mentions: decoded.mentions,
      });
      const verified = await decodeQueueMessage(projectId, { ...row, ...replacement });
      if (JSON.stringify([verified.content, verified.mentions]) !==
          JSON.stringify([decoded.content, decoded.mentions])) {
        throw new Error("Agent queue migration verification failed");
      }
      const answerReplacement = answer && decodedAnswer?.answer != null
        ? await encodeAgentInputAnswer(projectId, answer.id, decodedAnswer.answer) : null;
      if (answer && !answerReplacement) throw new Error("Agent queue answer is missing");
      const parentReplacement = parent && decodedParent?.content != null
        ? await encodeWorkerParentMessage(projectId, parent.id, {
            content: decodedParent.content,
            context: decodedParent.context,
            metadata: decodedParent.metadata ?? {},
          }) : null;
      if (parent && !parentReplacement) throw new Error("Agent queue parent is missing");
      if (answerReplacement && (await decodeAgentInputAnswer(projectId, {
        ...answer!, ...answerReplacement,
      })).answer !== decodedAnswer?.answer) {
        throw new Error("Agent queue answer verification failed");
      }
      if (parentReplacement && (await decodeWorkerParentMessage(projectId, {
        ...parent!, ...parentReplacement,
      })).content !== decodedParent?.content) {
        throw new Error("Agent queue parent verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_queue_bundle", {
        ...identity, p_replacement: {
          content: replacement.content,
          version: replacement.content_encryption_version,
          ...(answerReplacement ? { answer: { content: answerReplacement.answer,
            version: answerReplacement.answer_encryption_version } } : {}),
          ...(parentReplacement ? { parent: { content: parentReplacement.content,
            version: parentReplacement.worker_content_encryption_version } } : {}),
        },
      });
      if (committed.error) throw new Error("Unable to commit agent queue migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
