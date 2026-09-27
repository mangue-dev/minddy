import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeApiKeyContent, encodeApiKeyContent,
  type StoredApiKey } from "@/lib/server/api-key-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type Row = StoredApiKey & { content_revision:number;
  encryption_checked_at:string|null };

/** Verify and rotate actor attribution in bounded user-key batches. */
export async function backfillApiKeysBatch(limit=25,signal?:AbortSignal){
  if(!isContentEncryptionEnabled() ||
      process.env.MINDDY_API_KEY_CONTENT_ENCRYPTION_ENABLED!=="true")
    throw new Error("API key content encryption is not enabled");
  if(!Number.isSafeInteger(limit) || limit<1 || limit>100)
    throw new Error("Invalid API key batch size");
  const result={scanned:0,migrated:0,unchanged:0,conflicted:0,failed:0,
    interrupted:false};
  const service=getServiceClient();
  const {data,error}=await service.from("api_keys")
    .select("id,user_id,name,agent,encrypted_content,encryption_version,content_revision,encryption_checked_at")
    .order("encryption_attempted_at",{ascending:true,nullsFirst:true})
    .order("id",{ascending:true}).limit(limit);
  if(error) throw new Error("Unable to scan API keys");
  for(const row of (data??[]) as Row[]){
    if(signal?.aborted){result.interrupted=true;break;}
    result.scanned++;
    try{
      const key=await getContentKeys().current({kind:"user",id:row.user_id});
      const currentVersion=key.version;
      key.bytes.fill(0);
      const content=await decodeApiKeyContent(row);
      const fresh=row.encryption_version===currentVersion &&
        !!row.encryption_checked_at;
      const encoded=fresh ? {encrypted_content:row.encrypted_content!,
        encryption_version:row.encryption_version!}
        : await encodeApiKeyContent(row,content);
      const replacement:Row={...row,...encoded,name:null,agent:null};
      if(JSON.stringify(await decodeApiKeyContent(replacement))!==
          JSON.stringify(content)) throw new Error("API key migration mismatch");
      if(signal?.aborted){result.interrupted=true;break;}
      const now=new Date().toISOString();
      let query=service.from("api_keys").update({...encoded,name:null,
        agent:null,encryption_checked_at:now,encryption_attempted_at:now})
        .eq("id",row.id).eq("user_id",row.user_id)
        .eq("content_revision",row.content_revision);
      query=row.encrypted_content===null || row.encrypted_content===undefined
        ? query.is("encrypted_content",null)
        : query.eq("encrypted_content",row.encrypted_content);
      const {data:saved,error:writeError}=await query.select("id").maybeSingle();
      if(writeError) throw new Error("Unable to migrate API key");
      if(!saved) result.conflicted++;
      else if(fresh) result.unchanged++;
      else result.migrated++;
    }catch{
      result.failed++;
      await service.from("api_keys")
        .update({encryption_attempted_at:new Date().toISOString()})
        .eq("id",row.id).eq("content_revision",row.content_revision);
    }
  }
  return result;
}
