import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { decryptMcpToken, encryptMcpToken } from "./mcp-credentials";
import type { McpConnectionRow } from "./mcp-client";

type SecretColumn = "token_encrypted" | "headers_encrypted" | "oauth_encrypted";
type ConnectionContent = Pick<McpConnectionRow, "name" | "url" | SecretColumn>;
export type McpAttemptRow = {
  state: string;
  user_id: string;
  connection_id: string;
  endpoint: string;
  payload_encrypted: string;
  encryption_version?: number;
  encrypted_content?: string | null;
  content_revision?: number;
};

const codec = () => new EncryptedRowCodec(getEncryptedStore());
const context = (table: "user_mcp_connections" | "user_mcp_oauth_attempts", userId: string) =>
  ({ table, scope: { kind: "user" as const, id: userId } });

export async function mcpContentEnabled(): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await getServiceClient().from("mcp_content_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("Unable to resolve MCP protection state");
  return !!data;
}

export function mcpSecret(row: McpConnectionRow, column: SecretColumn): string | null {
  const value = row[column];
  return row.encryption_version ? value : decryptMcpToken(value);
}

export async function decodeMcpConnection(row: McpConnectionRow): Promise<McpConnectionRow> {
  if (!row.encryption_version) {
    if (row.encrypted_content) throw new Error("Invalid legacy MCP connection");
    return row;
  }
  const decoded = await codec().decode(row as unknown as StoredRow,
    context("user_mcp_connections", row.user_id),
    { actorId: row.user_id, reason: "repository_read" });
  return { ...decoded, encryption_version: row.encryption_version,
    encrypted_content: row.encrypted_content,
    content_revision: row.content_revision } as McpConnectionRow;
}

export async function protectMcpConnection(row: McpConnectionRow): Promise<Partial<McpConnectionRow>> {
  const plain: ConnectionContent = {
    name: row.name,
    url: row.url,
    token_encrypted: mcpSecret(row, "token_encrypted"),
    headers_encrypted: mcpSecret(row, "headers_encrypted"),
    oauth_encrypted: mcpSecret(row, "oauth_encrypted"),
  };
  const encoded = await codec().encode({ ...row, ...plain,
    encryption_version: 0, encrypted_content: null } as StoredRow,
  context("user_mcp_connections", row.user_id));
  return { name: encoded.name as string, url: encoded.url as string,
    token_encrypted: encoded.token_encrypted as null,
    headers_encrypted: encoded.headers_encrypted as null,
    oauth_encrypted: encoded.oauth_encrypted as null,
    encryption_version: encoded.encryption_version,
    encrypted_content: encoded.encrypted_content };
}

/** Merge every protected column before a revision-checked write. */
export async function mcpConnectionWrite(
  userId: string,
  values: Partial<McpConnectionRow>,
  current?: McpConnectionRow,
  rawSecrets = false,
): Promise<Partial<McpConnectionRow>> {
  const id = current?.id ?? randomUUID();
  if (!rawSecrets && !await mcpContentEnabled() && !current?.encryption_version) {
    return { ...values, ...(!current ? { id, user_id: userId } : {}) };
  }
  const merged = { ...current, ...values, id, user_id: userId } as McpConnectionRow;
  for (const column of ["token_encrypted", "headers_encrypted", "oauth_encrypted"] as const) {
    merged[column] = Object.hasOwn(values, column)
      ? rawSecrets ? values[column] ?? null : decryptMcpToken(values[column] ?? null)
      : current ? mcpSecret(current, column) : null;
  }
  // The merged row now has raw secrets, which are never written to legacy columns.
  merged.encryption_version = 1;
  const encoded = await protectMcpConnection(merged);
  return { ...values, ...encoded, ...(!current ? { id, user_id: userId } : {}) };
}

export async function mcpOAuthWrite(row: McpConnectionRow, payload: string) {
  if (!row.encryption_version && !await mcpContentEnabled()) {
    return { oauth_encrypted: encryptMcpToken(payload), oauth_connected: true };
  }
  return { ...await protectMcpConnection({ ...row,
    token_encrypted: mcpSecret(row, "token_encrypted"),
    headers_encrypted: mcpSecret(row, "headers_encrypted"),
    oauth_encrypted: payload, encryption_version: 1 }),
    oauth_connected: true };
}

export async function decodeMcpAttempt(row: McpAttemptRow): Promise<McpAttemptRow> {
  if (!row.encryption_version) {
    if (row.encrypted_content) throw new Error("Invalid legacy MCP attempt");
    return { ...row, payload_encrypted: decryptMcpToken(row.payload_encrypted)! };
  }
  const decoded = await codec().decode(row as unknown as StoredRow,
    context("user_mcp_oauth_attempts", row.user_id),
    { actorId: row.user_id, reason: "repository_read" });
  return { ...decoded, encryption_version: row.encryption_version,
    encrypted_content: row.encrypted_content,
    content_revision: row.content_revision } as McpAttemptRow;
}

export async function protectMcpAttempt(row: McpAttemptRow) {
  const plain = row.encryption_version ? row.payload_encrypted
    : decryptMcpToken(row.payload_encrypted)!;
  const encoded = await codec().encode({ ...row, payload_encrypted: plain,
    encryption_version: 0, encrypted_content: null } as StoredRow,
    context("user_mcp_oauth_attempts", row.user_id));
  return { endpoint: encoded.endpoint as null,
    payload_encrypted: encoded.payload_encrypted as null,
    encryption_version: encoded.encryption_version,
    encrypted_content: encoded.encrypted_content };
}

export async function mcpAttemptWrite(row: McpAttemptRow) {
  if (!await mcpContentEnabled()) {
    return { ...row, payload_encrypted: encryptMcpToken(row.payload_encrypted)! };
  }
  return { ...row, ...await protectMcpAttempt({ ...row, encryption_version: 1 }) };
}
