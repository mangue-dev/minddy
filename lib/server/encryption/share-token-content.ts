import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getBlindIndexKeys, getEncryptedStore } from "./registry";
import { blindIndex, type EncryptionScope } from "./store";
import { auditDecryption } from "./audit";

const SCOPE: EncryptionScope = { kind: "system",
  id: "00000000-0000-0000-0000-000000000000" };
const PREFIX = "mdys3";
const ENCODED = /^mdys3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const context = (id: string) => ({ scope: SCOPE, table: "view_shares",
  column: "token", rowId: id });

export function isEncryptedShareToken(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export async function shouldProtectShareTokens(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_SHARE_TOKEN_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await service.from("view_share_token_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve share token encryption state");
  }
  return !!data;
}

export async function encodeShareToken(id: string, token: string): Promise<string> {
  if (isEncryptedShareToken(token)) throw new Error("Invalid share token");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(token, context(id));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeShareToken(id: string, value: string): Promise<string> {
  if (!isEncryptedShareToken(value)) return value;
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid share token ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid share token encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Share token key version mismatch");
  }
  const clear = await store.decrypt(cipher, context(id));
  if (typeof clear !== "string") throw new Error("Invalid share token content");
  auditDecryption(context(id), { actorId: null, reason: "repository_read" });
  return clear;
}

export async function shareTokenLookup(token: string): Promise<string> {
  const initial = await getBlindIndexKeys().current(SCOPE);
  initial.bytes.fill(0);
  const key = await getBlindIndexKeys().byVersion(SCOPE, 1);
  try {
    return blindIndex(token, { scope: SCOPE, table: "view_shares",
      column: "token" }, key.bytes);
  } finally { key.bytes.fill(0); }
}

export function shareTokenState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid share token ciphertext");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Share token key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
