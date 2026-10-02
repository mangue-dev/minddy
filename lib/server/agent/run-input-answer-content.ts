import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

function context(projectId: string, requestId: string) {
  if (!projectId || !requestId) throw new Error("Agent input answer scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_run_input_requests", column: "answer", rowId: requestId };
}

export async function encodeAgentInputAnswer(projectId: string,
  requestId: string, answer: string) {
  const store = getEncryptedStore();
  const encrypted = await store.encrypt(answer, context(projectId, requestId));
  return { answer: encrypted, answer_encryption_version: store.versionOf(encrypted) };
}

export async function decodeAgentInputAnswer<T extends {
  id: string; answer: string | null; answer_encryption_version?: number;
}>(projectId: string, row: T, actorId: string | null = null): Promise<T> {
  const version = row.answer_encryption_version ?? 0;
  if (version === 0) return row;
  if (!Number.isSafeInteger(version) || version < 1 || !row.answer) {
    throw new Error("Invalid encrypted agent input answer");
  }
  const binding = context(projectId, row.id);
  const store = getEncryptedStore();
  const encrypted = store.fromDatabase<string>(row.answer);
  if (store.versionOf(encrypted) !== version) throw new Error("Agent input answer key version mismatch");
  const clear = await store.decrypt(encrypted, binding);
  if (typeof clear !== "string") throw new Error("Invalid agent input answer");
  auditDecryption(binding, { actorId, reason: "repository_read" });
  return { ...row, answer: clear };
}
