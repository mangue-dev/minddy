import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeMcpAttempt, decodeMcpConnection, mcpSecret,
  protectMcpAttempt, protectMcpConnection, type McpAttemptRow } from
  "@/lib/server/mcp-content";
import type { McpConnectionRow } from "@/lib/server/mcp-client";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type Table = "user_mcp_connections" | "user_mcp_oauth_attempts";
type QueueRow = (McpConnectionRow | McpAttemptRow) & {
  encryption_checked_at?: string | null;
  encryption_attempted_at?: string | null;
  oauth_lock_until?: string | null;
};

const secretColumns = ["token_encrypted", "headers_encrypted", "oauth_encrypted"] as const;

async function backfill(table: Table, limit: number, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled())
    throw new Error("MCP content encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid MCP batch size");
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const keyColumn = table === "user_mcp_connections" ? "id" : "state";
  const { data, error } = await service.from(table).select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order(keyColumn, { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan MCP content");
  for (const row of (data ?? []) as QueueRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    const id = table === "user_mcp_connections"
      ? (row as McpConnectionRow).id : (row as McpAttemptRow).state;
    const revision = row.content_revision ?? 0;
    try {
      if (table === "user_mcp_connections" && row.oauth_lock_until &&
          Date.parse(row.oauth_lock_until) > Date.now()) {
        result.conflicted++;
        continue;
      }
      const scope = { kind: "user" as const, id: row.user_id };
      const key = await getContentKeys().current(scope);
      const currentVersion = key.version;
      key.bytes.fill(0);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      let replacement: Record<string, unknown> = {};
      if (table === "user_mcp_connections") {
        const source = row as McpConnectionRow;
        const plain = await decodeMcpConnection(source);
        const expected = { name: plain.name, url: plain.url,
          secrets: secretColumns.map((column) => mcpSecret(plain, column)) };
        if (!fresh) replacement = await protectMcpConnection(plain);
        const verified = await decodeMcpConnection({ ...source, ...replacement } as McpConnectionRow);
        if (!isDeepStrictEqual({ name: verified.name, url: verified.url,
          secrets: secretColumns.map((column) => mcpSecret(verified, column)) }, expected))
          throw new Error("MCP connection migration mismatch");
      } else {
        const source = row as McpAttemptRow;
        const plain = await decodeMcpAttempt(source);
        if (!fresh) replacement = await protectMcpAttempt(source);
        const verified = await decodeMcpAttempt({ ...source, ...replacement } as McpAttemptRow);
        if (!isDeepStrictEqual({ endpoint: verified.endpoint,
          payload: verified.payload_encrypted },
        { endpoint: plain.endpoint, payload: plain.payload_encrypted }))
          throw new Error("MCP attempt migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      let update = service.from(table)
        .update({ ...replacement, encryption_checked_at: now,
          encryption_attempted_at: now })
        .eq(keyColumn, id).eq("user_id", row.user_id)
        .eq("content_revision", revision);
      if (table === "user_mcp_connections")
        update = update.or(`oauth_lock_until.is.null,oauth_lock_until.lt.${now}`);
      const write = await update.select(keyColumn).maybeSingle();
      if (write.error) throw new Error("Unable to migrate MCP content");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await service.from(table).update({ encryption_attempted_at: new Date().toISOString() })
        .eq(keyColumn, id).eq("content_revision", revision);
    }
  }
  return result;
}

export const backfillMcpConnectionsBatch = (limit = 25, signal?: AbortSignal) =>
  backfill("user_mcp_connections", limit, signal);
export const backfillMcpAttemptsBatch = (limit = 25, signal?: AbortSignal) =>
  backfill("user_mcp_oauth_attempts", limit, signal);
