import "server-only";

import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { getServiceClient } from "@/lib/supabase-service";

export type AgentLiveSnapshotKind = "stream" | "diff";

type SnapshotRow = {
  stream_content: string | null;
  stream_version: number;
  stream_at: number;
  diff_content: string | null;
  diff_version: number;
  diff_at: number;
};

function binding(projectId: string, runId: string, kind: AgentLiveSnapshotKind) {
  if (!projectId || !runId) throw new Error("Agent snapshot scope is required");
  return {
    scope: { kind: "project" as const, id: projectId },
    table: "agent_run_live_snapshots", column: kind, rowId: runId,
  };
}

/** Replace one current snapshot without storing live content in Realtime. */
export async function saveAgentLiveSnapshot(input: {
  projectId: string;
  runId: string;
  kind: AgentLiveSnapshotKind;
  payload: Record<string, unknown>;
  at: number;
}): Promise<void> {
  const context = binding(input.projectId, input.runId, input.kind);
  const store = getEncryptedStore();
  const content = await store.encrypt(input.payload, context);
  const decoded = await store.decrypt(
    store.fromDatabase<Record<string, unknown>>(content), context,
  );
  if (JSON.stringify(decoded) !== JSON.stringify(input.payload)) {
    throw new Error("Agent snapshot verification failed");
  }
  const { data, error } = await getServiceClient().rpc("set_agent_run_live_snapshot", {
    p_run_id: input.runId, p_kind: input.kind, p_content: content,
    p_version: store.versionOf(content), p_at: input.at,
  });
  if (error || data !== true) throw new Error("Unable to save agent live snapshot");
}

/** The caller must authorize the run before using this service-role read. */
export async function readAgentLiveSnapshot(input: {
  projectId: string;
  runId: string;
  actorId: string;
}): Promise<{ stream: Record<string, unknown> | null;
  diff: Record<string, unknown> | null }> {
  const { data, error } = await getServiceClient()
    .from("agent_run_live_snapshots")
    .select("stream_content,stream_version,stream_at,diff_content,diff_version,diff_at")
    .eq("run_id", input.runId).maybeSingle();
  if (error) throw new Error("Unable to read agent live snapshot");
  if (!data) return { stream: null, diff: null };
  const row = data as SnapshotRow;
  const decode = async (kind: AgentLiveSnapshotKind) => {
    const content = row[`${kind}_content`];
    const version = row[`${kind}_version`];
    const at = row[`${kind}_at`];
    if (content === null && version === 0) return null;
    if (!content || version < 1) throw new Error("Invalid agent live snapshot");
    const context = binding(input.projectId, input.runId, kind);
    const store = getEncryptedStore();
    const cipher = store.fromDatabase<Record<string, unknown>>(content);
    if (store.versionOf(cipher) !== version) {
      throw new Error("Agent live snapshot key version mismatch");
    }
    const clear = await store.decrypt(cipher, context);
    if (!clear || typeof clear !== "object" || Array.isArray(clear)) {
      throw new Error("Invalid agent live snapshot payload");
    }
    auditDecryption(context, { actorId: input.actorId, reason: "repository_read" });
    return { ...clear, at };
  };
  return { stream: await decode("stream"), diff: await decode("diff") };
}
