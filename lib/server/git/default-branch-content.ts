import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const PREFIX="mdyg3";
const ENCODED=/^mdyg3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;

function binding(projectId:string) {
  if (!projectId) throw new Error("Forge default branch project is required");
  return { scope:{ kind:"project" as const,id:projectId },
    table:"project_git_links",column:"default_branch",rowId:projectId };
}

export function isEncryptedDefaultBranch(value:string|null):boolean {
  return typeof value==="string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptDefaultBranch(
  service:SupabaseClient=getServiceClient()) {
  if (isContentEncryptionEnabled()) {
    return true;
  }
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data,error } = await service.from("forge_default_branch_scope")
    .select("id").eq("id",true).maybeSingle();
  if (error && !["42P01","PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve forge default branch protection state");
  }
  return !!data;
}

export async function encodeDefaultBranch(projectId:string,
  value:string|null):Promise<string|null> {
  if (value===null) return null;
  if (!value || isEncryptedDefaultBranch(value)) {
    throw new Error("Invalid forge default branch");
  }
  const store=getEncryptedStore();
  const cipher=await store.encrypt(value,binding(projectId));
  if (await store.decrypt(cipher,binding(projectId))!==value) {
    throw new Error("Forge default branch verification failed");
  }
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeDefaultBranch(projectId:string,
  value:string|null,actorId:string|null=null):Promise<string|null> {
  if (!isEncryptedDefaultBranch(value)) return value;
  const match=ENCODED.exec(value!);
  if (!match) throw new Error("Invalid forge default branch ciphertext");
  const serialized=Buffer.from(match[2],"base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url")!==match[2]) {
    throw new Error("Invalid forge default branch encoding");
  }
  const store=getEncryptedStore();
  const cipher=store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher)!==Number(match[1])) {
    throw new Error("Forge default branch key version mismatch");
  }
  const clear=await store.decrypt(cipher,binding(projectId));
  if (typeof clear!=="string" || !clear) {
    throw new Error("Invalid forge default branch content");
  }
  auditDecryption(binding(projectId),{ actorId,reason:"repository_read" });
  return clear;
}

export function defaultBranchState(value:string) {
  const match=ENCODED.exec(value);
  if (!match) throw new Error("Invalid forge default branch ciphertext");
  const serialized=Buffer.from(match[2],"base64url").toString("utf8");
  const store=getEncryptedStore();
  const cipher=store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher)!==Number(match[1])) {
    throw new Error("Forge default branch key version mismatch");
  }
  return { version:store.versionOf(cipher),format:store.formatOf(cipher) };
}
