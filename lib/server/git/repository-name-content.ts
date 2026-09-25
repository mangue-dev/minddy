import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getBlindIndexKeys, getContentKeys, getEncryptedStore } from
  "@/lib/server/encryption/registry";
import { blindIndex } from "@/lib/server/encryption/store";

const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };
const TOKEN = /^mdyr1:[0-9a-f]{64}$/;

function normalize(provider: string, fullName: string) {
  const name = fullName.trim().toLowerCase();
  if (!/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+$/.test(name) ||
      name.length>512 || !["github","gitlab"].includes(provider)) {
    throw new Error("Invalid forge repository identity");
  }
  return name;
}

function binding(provider: string, token: string) {
  return { scope:SCOPE,table:"forge_repository_names",column:"full_name",
    rowId:`${provider}:${token}` };
}

/** Rewrap a registered identity without changing its stable equality token. */
export async function rotateRepositoryName(provider: string,token: string) {
  const service = getServiceClient();
  const { data,error } = await service.from("forge_repository_names")
    .select("full_name_ciphertext,encryption_version")
    .eq("provider",provider).eq("token",token).single();
  if (error || !data) throw new Error("Forge repository identity unavailable");
  const name = await decodeRepositoryName(provider,token);
  const store = getEncryptedStore();
  const current = await getContentKeys().current(SCOPE);
  const currentVersion = current.version;
  current.bytes.fill(0);
  const previous = store.fromDatabase<string>(data.full_name_ciphertext);
  const fresh = data.encryption_version===currentVersion &&
    store.formatOf(previous)===3;
  const replacement = fresh ? previous : await store.encrypt(name!,binding(provider,token));
  if (await store.decrypt(replacement,binding(provider,token))!==name) {
    throw new Error("Forge repository identity rotation verification failed");
  }
  const { data:changed,error:writeError } = await service.from("forge_repository_names")
    .update({ full_name_ciphertext:replacement,
      encryption_version:store.versionOf(replacement),
      encryption_checked_at:new Date().toISOString() })
    .eq("provider",provider).eq("token",token)
    .eq("full_name_ciphertext",data.full_name_ciphertext)
    .eq("encryption_version",data.encryption_version)
    .select("token").maybeSingle();
  if (writeError) throw new Error("Unable to rotate forge repository identity");
  return changed ? (fresh ? "unchanged" : "migrated") : "conflicted";
}

/** The version-one blind-index key is retained across content-key rotation. */
export async function repositoryNameToken(provider: string, fullName: string) {
  const name = normalize(provider,fullName);
  const keys = getBlindIndexKeys();
  const current = await keys.current(SCOPE);
  current.bytes.fill(0);
  const stable = await keys.byVersion(SCOPE,1);
  try {
    return `mdyr1:${blindIndex(`${provider}:${name}`,{ scope:SCOPE,
      table:"forge_repository_names",column:"full_name_digest" },
    stable.bytes)}`;
  } finally {
    stable.bytes.fill(0);
  }
}

export async function shouldProtectRepositoryNames(
  service: SupabaseClient=getServiceClient()) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_FORGE_REPOSITORY_NAME_ENCRYPTION_ENABLED==="true") {
    return true;
  }
  const { data,error } = await service.from("forge_repository_name_scope")
    .select("id").eq("id",true).maybeSingle();
  if (error && !["42P01","PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve forge repository protection state");
  }
  return !!data;
}

export async function repositoryStorageName(provider: string,
  fullName: string,register=false,service: SupabaseClient=getServiceClient()) {
  if (!await shouldProtectRepositoryNames(service)) return fullName;
  return register ? registerRepositoryName(provider,fullName)
    : repositoryNameToken(provider,fullName);
}

/** Register a recoverable system-key name before a token becomes a foreign key. */
export async function registerRepositoryName(provider: string,
  fullName: string): Promise<string> {
  const name = normalize(provider,fullName);
  const token = await repositoryNameToken(provider,name);
  const service = getServiceClient();
  const store = getEncryptedStore();
  const ciphertext = await store.encrypt(fullName.trim(),binding(provider,token));
  if (await store.decrypt(ciphertext,binding(provider,token))!==fullName.trim()) {
    throw new Error("Forge repository identity verification failed");
  }
  const { error:insertError } = await service.from("forge_repository_names")
    .insert({ provider,token,full_name_ciphertext:ciphertext,
      encryption_version:store.versionOf(ciphertext),
      encryption_checked_at:new Date().toISOString() });
  if (insertError && insertError.code!=="23505") {
    throw new Error("Unable to register forge repository name");
  }
  if (insertError) {
    const decoded = await decodeRepositoryName(provider,token);
    if (!decoded || normalize(provider,decoded)!==name) {
      throw new Error("Forge repository identity collision");
    }
  }
  return token;
}

/** Call only after a project/PR/claim access check or a verified forge event. */
export async function decodeRepositoryName(provider: string,
  value: string|null,actorId: string|null=null): Promise<string|null> {
  if (value===null || !TOKEN.test(value)) return value;
  if (!["github","gitlab"].includes(provider)) {
    throw new Error("Invalid forge repository provider");
  }
  const { data,error } = await getServiceClient().from("forge_repository_names")
    .select("full_name_ciphertext,encryption_version")
    .eq("provider",provider).eq("token",value).single();
  if (error || !data?.full_name_ciphertext) {
    throw new Error("Forge repository identity is unavailable");
  }
  const context = binding(provider,value);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(data.full_name_ciphertext);
  if (store.versionOf(cipher)!==data.encryption_version ||
      store.formatOf(cipher)!==3) {
    throw new Error("Forge repository name key version mismatch");
  }
  const decoded = await store.decrypt(cipher,context);
  if (typeof decoded!=="string" ||
      await repositoryNameToken(provider,decoded)!==value) {
    throw new Error("Forge repository identity mismatch");
  }
  auditDecryption(context,{ actorId,reason:"repository_read" });
  return decoded;
}

export function isProtectedRepositoryName(value: string|null) {
  return typeof value==="string" && TOKEN.test(value);
}
