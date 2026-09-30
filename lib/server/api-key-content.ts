import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type ApiKeyContent = { name: string; agent: string | null };
export type StoredApiKey = {
  id: string;
  user_id: string;
  name: string | null;
  agent: string | null;
  encrypted_content?: string | null;
  encryption_version?: number;
};

function context(row: Pick<StoredApiKey,"id" | "user_id">) {
  return { scope: {kind:"user" as const,id:row.user_id},
    table:"api_keys",column:"content",rowId:row.id };
}

export async function shouldProtectApiKeys():Promise<boolean> {
  if (isContentEncryptionEnabled())
    return true;
  const {data,error}=await getServiceClient().from("api_key_content_scope")
    .select("id").eq("id",true).maybeSingle();
  if(error && !["42P01","PGRST205"].includes(error.code))
    throw new Error("Unable to resolve API key protection state");
  return !!data;
}

export async function encodeApiKeyContent(row:Pick<StoredApiKey,"id" | "user_id">,
  content:ApiKeyContent):Promise<{encrypted_content:string;encryption_version:number}>{
  const store=getEncryptedStore();
  const ciphertext=await store.encrypt(content,context(row));
  return {encrypted_content:ciphertext as string,
    encryption_version:store.versionOf(ciphertext)};
}

export async function decodeApiKeyContent(row:StoredApiKey):Promise<ApiKeyContent>{
  if(!row.encrypted_content){
    if(!row.name) throw new Error("Incomplete API key attribution");
    return {name:row.name,agent:row.agent};
  }
  if(row.name!==null || row.agent!==null)
    throw new Error("API key plaintext copy remains");
  const store=getEncryptedStore();
  const ciphertext=store.fromDatabase<ApiKeyContent>(row.encrypted_content);
  if(store.formatOf(ciphertext)!==3 ||
      store.versionOf(ciphertext)!==row.encryption_version)
    throw new Error("Invalid API key envelope");
  const content=await store.decrypt(ciphertext,context(row));
  if(!content || typeof content.name!=="string" || !content.name ||
      (content.agent!==null && typeof content.agent!=="string"))
    throw new Error("Invalid API key attribution");
  return content;
}
