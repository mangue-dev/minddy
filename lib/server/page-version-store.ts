import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canWriteLegacyHistory, decodeHistoryRow, encodeHistoryRow } from "./encryption/history-content";

export async function storePageVersion(service: SupabaseClient, row: Record<string, unknown>): Promise<void> {
  const stored = canWriteLegacyHistory() ? row : await encodeHistoryRow("page_versions", { ...row, id: randomUUID() });
  const { error } = await service.from("page_versions").insert(stored);
  if (error) throw new Error("Unable to persist page snapshot");
}

export async function hasRecentPageVersion(service: SupabaseClient, pageId: string, after: string): Promise<boolean> {
  const { data } = await service.from("page_versions").select("id")
    .eq("page_id", pageId).gte("created_at", after).limit(1);
  return !!data?.length;
}

/** Call only after authorizing this page. The project also binds the decoded snapshot's key. */
export async function readPageVersions(service: SupabaseClient, pageId: string, projectId: string,
  actorId: string, versionId?: string): Promise<{ data: Record<string, unknown>[] | null; error: boolean }> {
  try {
    let ids: string[];
    if (versionId) ids = [versionId];
    else {
      // Pin the list before loading envelopes. Concurrent inserts cannot shift offsets,
      // and up to 200 large document snapshots are never resident in one response.
      const { data, error } = await service.from("page_versions").select("id")
        .eq("page_id", pageId).order("version", { ascending: false }).limit(200);
      if (error) throw new Error("Snapshot list failed");
      ids = (data ?? []).map((row) => row.id as string);
    }
    const decoded: Record<string, unknown>[] = [];
    for (let offset = 0; offset < ids.length; offset += 10) {
      const batch = ids.slice(offset, offset + 10);
      const { data, error } = await service.from("page_versions").select("*")
        .eq("page_id", pageId).in("id", batch);
      if (error) throw new Error("Snapshot read failed");
      const byId = new Map((data ?? []).map((row) => [row.id, row]));
      for (const id of batch) {
        const row = byId.get(id);
        if (!row) continue; // Retention can remove a version after the list read.
        const plain = await decodeHistoryRow("page_versions", row, actorId, projectId);
        if (!versionId) delete plain.content;
        decoded.push(plain);
      }
    }
    return { data: decoded, error: false };
  } catch {
    return { data: null, error: true };
  }
}
