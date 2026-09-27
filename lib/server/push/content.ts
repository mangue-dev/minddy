import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getBlindIndexKeys, getEncryptedStore } from "@/lib/server/encryption/registry";
import { blindIndex, type EncryptionScope } from "@/lib/server/encryption/store";

const SYSTEM: EncryptionScope = { kind: "system",
  id: "00000000-0000-0000-0000-000000000000" };
const PREFIX = "mdye3:";

export interface PushPrivateContent {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  native_installation_id: string | null;
  device_label: string | null;
  user_agent: string | null;
}
export type StoredPush = {
  id: string; user_id: string; endpoint_digest?: string | null;
  encrypted_content?: string | null;
  endpoint: string | null; p256dh: string | null; auth: string | null;
  native_installation_id: string | null; device_label: string | null;
  user_agent: string | null;
  transport?: unknown; locale?: unknown; enabled?: unknown;
  created_at?: unknown; last_seen_at?: unknown; last_push_at?: unknown;
};

export async function shouldProtectPush(): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_PUSH_CONTENT_ENCRYPTION_ENABLED === "true") return true;
  for (const table of ["push_content_scope", "push_content_write_scope"] as const) {
    const { data, error } = await getServiceClient().from(table)
      .select("id").eq("id", true).maybeSingle();
    if (error && !["42P01", "PGRST205"].includes(error.code))
      throw new Error("Unable to resolve push protection state");
    if (data) return true;
  }
  return false;
}

export async function pushIndex(value: string, field: "endpoint" |
  "native_installation_id", userId?: string): Promise<string> {
  if (!value || value.length > 4096 ||
      (field === "native_installation_id" && !userId))
    throw new Error("Invalid push identity");
  const keys = getBlindIndexKeys();
  const current = await keys.current(SYSTEM);
  current.bytes.fill(0);
  const stable = await keys.byVersion(SYSTEM, 1);
  try {
    const normalized = field === "native_installation_id"
      ? `${userId}:${value}` : value;
    return blindIndex(normalized, { scope: SYSTEM,
      table: "push_subscriptions", column: field }, stable.bytes);
  } finally {
    stable.bytes.fill(0);
  }
}

function context(row: Pick<StoredPush, "endpoint_digest" | "user_id">) {
  if (!row.endpoint_digest || !row.user_id) throw new Error("Push scope is required");
  return { scope: { kind: "user" as const, id: row.user_id },
    table: "push_subscriptions", column: "content", rowId: row.endpoint_digest };
}

export async function sealPush(row: Pick<StoredPush, "endpoint_digest" | "user_id">,
  content: PushPrivateContent): Promise<string> {
  if (!content.endpoint || content.endpoint.length > 4096 ||
      (content.native_installation_id ?? "").length > 512 ||
      (content.user_agent ?? "").length > 4096 ||
      (content.device_label ?? "").length > 256)
    throw new Error("Invalid push content");
  return PREFIX + await getEncryptedStore().encrypt(content, context(row));
}

export async function openPush<T extends StoredPush>(row: T):
  Promise<T & PushPrivateContent> {
  if (!row.encrypted_content) {
    if (!row.endpoint) throw new Error("Push endpoint is missing");
    return row as T & PushPrivateContent;
  }
  if (!row.encrypted_content.startsWith(PREFIX) || row.endpoint || row.p256dh ||
      row.auth || row.native_installation_id || row.device_label || row.user_agent)
    throw new Error("Invalid sealed push row");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<PushPrivateContent>(
    row.encrypted_content.slice(PREFIX.length));
  if (store.formatOf(cipher) !== 3) throw new Error("Invalid push envelope");
  const content = await store.decrypt(cipher, context(row));
  if (!content || typeof content.endpoint !== "string" || !content.endpoint)
    throw new Error("Invalid push content");
  return { ...row, ...content };
}

export function pushVersion(value: string | null | undefined): number {
  if (!value) return 0;
  if (!value.startsWith(PREFIX)) throw new Error("Invalid push envelope");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value.slice(PREFIX.length));
  if (store.formatOf(cipher) !== 3) throw new Error("Invalid push envelope");
  return store.versionOf(cipher);
}

export function pushDevice(row: StoredPush) {
  const { id, endpoint, transport, native_installation_id, device_label,
    locale, enabled, created_at, last_seen_at, last_push_at } = row;
  return { id, endpoint, transport, native_installation_id, device_label,
    locale, enabled, created_at, last_seen_at, last_push_at };
}
