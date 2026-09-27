import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeIntegrationField, encodeIntegrationField,
  integrationFieldVersion, type StoredIntegration } from
  "@/lib/server/integration-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type Row=StoredIntegration & {content_revision:number;
  name_encryption_checked_at:string|null;
  webhook_encryption_checked_at:string|null};

/** Rotate the source and webhook copy under one exact revision CAS. */
export async function backfillIntegrationsBatch(limit=25,signal?:AbortSignal){
  if(!isContentEncryptionEnabled() ||
      process.env.MINDDY_INTEGRATION_CONTENT_ENCRYPTION_ENABLED!=="true")
    throw new Error("Integration encryption is not enabled");
  if(!Number.isSafeInteger(limit) || limit<1 || limit>100)
    throw new Error("Invalid integration batch size");
  const result={scanned:0,migrated:0,unchanged:0,conflicted:0,failed:0,
    interrupted:false};
  const service=getServiceClient();
  const {data,error}=await service.from("integrations")
    .select("id,project_id,name,webhook_url,content_revision,name_encryption_checked_at,webhook_encryption_checked_at")
    .order("encryption_attempted_at",{ascending:true,nullsFirst:true})
    .order("id",{ascending:true}).limit(limit);
  if(error) throw new Error("Unable to scan integrations");
  for(const row of (data??[]) as Row[]){
    if(signal?.aborted){result.interrupted=true;break;}
    result.scanned++;
    try{
      const key=await getContentKeys().current({kind:"project",id:row.project_id});
      const currentVersion=key.version;
      key.bytes.fill(0);
      const name=await decodeIntegrationField(row,"name",row.name);
      const webhook=await decodeIntegrationField(row,"webhook_url",row.webhook_url);
      if(!name) throw new Error("Invalid integration name");
      const nameFresh=integrationFieldVersion(row.name)===currentVersion &&
        !!row.name_encryption_checked_at;
      const webhookFresh=row.webhook_url===null ||
        (integrationFieldVersion(row.webhook_url)===currentVersion &&
          !!row.webhook_encryption_checked_at);
      const nextName=nameFresh ? row.name
        : await encodeIntegrationField(row,"name",name);
      const nextWebhook=webhook===null ? null : webhookFresh
        ? row.webhook_url
        : await encodeIntegrationField(row,"webhook_url",webhook);
      if(await decodeIntegrationField(row,"name",nextName)!==name ||
          await decodeIntegrationField(row,"webhook_url",nextWebhook)!==webhook)
        throw new Error("Integration migration mismatch");
      if(signal?.aborted){result.interrupted=true;break;}
      const now=new Date().toISOString();
      let query=service.from("integrations").update({name:nextName,
        webhook_url:nextWebhook,name_encryption_checked_at:now,
        webhook_encryption_checked_at:nextWebhook?now:null,
        encryption_attempted_at:now})
        .eq("id",row.id).eq("project_id",row.project_id)
        .eq("content_revision",row.content_revision).eq("name",row.name);
      query=row.webhook_url===null ? query.is("webhook_url",null)
        : query.eq("webhook_url",row.webhook_url);
      const {data:saved,error:writeError}=await query.select("id").maybeSingle();
      if(writeError) throw new Error("Unable to migrate integration");
      if(!saved) result.conflicted++;
      else if(nameFresh && webhookFresh) result.unchanged++;
      else result.migrated++;
    }catch{
      result.failed++;
      await service.from("integrations")
        .update({encryption_attempted_at:new Date().toISOString()})
        .eq("id",row.id).eq("content_revision",row.content_revision);
    }
  }
  return result;
}
