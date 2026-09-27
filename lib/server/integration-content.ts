import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const marker="mdye3:";
type Field="name" | "webhook_url";
export type StoredIntegration = {id:string;project_id:string;name:string;
  webhook_url:string|null};

function context(row:Pick<StoredIntegration,"id" | "project_id">,
  field:Field){
  if(!row.id || !row.project_id) throw new Error("Integration scope is required");
  return {scope:{kind:"project" as const,id:row.project_id},
    table:"integrations",column:field,rowId:row.id};
}

export async function shouldProtectIntegrations():Promise<boolean>{
  if(isContentEncryptionEnabled() &&
      process.env.MINDDY_INTEGRATION_CONTENT_ENCRYPTION_ENABLED==="true")
    return true;
  const {data,error}=await getServiceClient()
    .from("integration_content_scope").select("id").eq("id",true)
    .maybeSingle();
  if(error && !["42P01","PGRST205"].includes(error.code))
    throw new Error("Unable to resolve integration protection state");
  return !!data;
}

export async function encodeIntegrationField(row:Pick<StoredIntegration,
  "id" | "project_id">,field:Field,value:string):Promise<string>{
  if(!value || (field==="name" ? value.length>60 : value.length>2048))
    throw new Error("Invalid integration content");
  const ciphertext=await getEncryptedStore().encrypt(value,context(row,field));
  return `${marker}${ciphertext}`;
}

export async function decodeIntegrationField(row:Pick<StoredIntegration,
  "id" | "project_id">,field:Field,value:string|null):Promise<string|null>{
  if(value===null) return null;
  if(!value.startsWith(marker)) return value;
  const store=getEncryptedStore();
  const ciphertext=store.fromDatabase<string>(value.slice(marker.length));
  if(store.formatOf(ciphertext)!==3)
    throw new Error("Invalid integration envelope");
  const opened=await store.decrypt(ciphertext,context(row,field));
  if(typeof opened!=="string" || !opened ||
      (field==="name" ? opened.length>60 : opened.length>2048))
    throw new Error("Invalid integration content");
  return opened;
}

export function integrationFieldVersion(value:string|null):number{
  if(!value || !value.startsWith(marker)) return 0;
  const store=getEncryptedStore();
  const ciphertext=store.fromDatabase(value.slice(marker.length));
  if(store.formatOf(ciphertext)!==3)
    throw new Error("Invalid integration envelope");
  return store.versionOf(ciphertext);
}

export async function decodeIntegration<T extends StoredIntegration>(row:T):
  Promise<T>{
  return {...row,name:(await decodeIntegrationField(row,"name",row.name))!,
    webhook_url:await decodeIntegrationField(row,"webhook_url",row.webhook_url)};
}
