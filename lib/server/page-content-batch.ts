import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { encodePage } from "./page-content";
import type { Page } from "@/lib/pages";

type StoredPage = Page & {
  content_revision: number;
  encryption_version: number;
  database_revision: number;
};

export type PageContentEdit = {
  previous: StoredPage;
  next: StoredPage;
};

/** A lock ordered SQL claim applies only encrypted envelopes and bounded metadata. */
export async function commitPageContentBatch({
  projectId, actorId, parentId, expected, edits, expectedChildren,
  kind = "human", mcpKeyId = null,
}: {
  projectId: string;
  actorId: string;
  parentId: string;
  expected: StoredPage[];
  edits: PageContentEdit[];
  expectedChildren?: string[];
  kind?: "human" | "agent";
  mcpKeyId?: string | null;
}): Promise<"updated" | "conflict" | "not_found"> {
  if (expected.length === 0 || edits.length === 0 ||
      expected.some((row) => row.project_id !== projectId ||
        row.encryption_version < 1)) throw new Error("Invalid protected page batch");
  const service = getServiceClient();
  const updates = await Promise.all(edits.map(async ({ next }) => {
    const encoded = await encodePage({ ...next }, { service, force: true });
    return {
      id: next.id,
      ciphertext: encoded.encrypted_content,
      keyVersion: encoded.encryption_version,
      isDatabase: encoded.page_is_database,
      hasValues: encoded.page_has_values,
      isBlank: encoded.page_is_blank,
      databaseRevision: next.database_revision,
    };
  }));
  const { data, error } = await service.rpc("commit_page_content_batch", {
    p_project_id: projectId,
    p_actor_id: actorId,
    p_parent_id: parentId,
    p_expected: expected.map((row) => ({ id: row.id,
      revision: row.content_revision,
      databaseRevision: row.database_revision,
      version: row.version,
      parentId: row.parent_id })),
    p_updates: updates,
    p_expected_children: expectedChildren?.sort() ?? null,
    p_kind: kind,
    p_mcp_key_id: kind === "agent" ? mcpKeyId : null,
  });
  if (error) throw new Error(`Protected page batch failed: ${error.code}`);
  if (data?.status === "updated" || data?.status === "conflict" ||
      data?.status === "not_found") return data.status;
  throw new Error("Invalid protected page batch result");
}
