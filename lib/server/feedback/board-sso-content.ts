import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { readBoardSsoSecret } from "./sso-crypto";

const PREFIX = "mdyb3:";
const ENCODED = /^mdyb3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const context = (projectId: string, boardId: string) => ({
  scope: { kind: "project" as const, id: projectId },
  table: "feedback_boards", column: "sso_secret", rowId: boardId,
});

export function isEncryptedBoardSso(value: string | null | undefined): boolean {
  return !!value?.startsWith(PREFIX);
}

export async function shouldProtectBoardSso(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await (service ?? getServiceClient())
    .from("feedback_sso_encryption_scope").select("id").eq("id", true)
    .maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve feedback SSO encryption state");
  }
  return !!data;
}

export async function encodeBoardSso(projectId: string, boardId: string,
  secret: string): Promise<string> {
  if (isEncryptedBoardSso(secret)) throw new Error("Invalid board SSO secret");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(secret, context(projectId, boardId));
  return `${PREFIX}${store.versionOf(cipher)}:${Buffer.from(cipher)
    .toString("base64url")}`;
}

export async function decodeBoardSso(projectId: string, boardId: string,
  value: string | null): Promise<string | null> {
  if (value === null) return null;
  if (!isEncryptedBoardSso(value)) {
    const legacy = readBoardSsoSecret(value);
    if (legacy.plain === null) throw new Error("Unable to read legacy board SSO secret");
    return legacy.plain;
  }
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid board SSO ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid board SSO encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Board SSO key version mismatch");
  }
  const clear = await store.decrypt(cipher, context(projectId, boardId));
  if (typeof clear !== "string") throw new Error("Invalid board SSO secret");
  auditDecryption(context(projectId, boardId), { actorId: null,
    reason: "repository_read" });
  return clear;
}

export function boardSsoState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid board SSO ciphertext");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url")
    .toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Board SSO key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
