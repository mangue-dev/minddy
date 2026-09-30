import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore } from "./encryption/registry";
import type { AppTab } from "@/lib/app-tabs";
import { APP_TAB_MAX_NAME } from "@/lib/app-tabs";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";

const marker = "mdye3:";
type Column = "href" | "custom_name";

function binding(userId: string, id: string, column: Column) {
  if (!userId || !id) throw new Error("Application tab scope is required");
  return { scope: {kind:"user" as const,id:userId},
    table:"app_tabs",column,rowId:id };
}

export async function shouldProtectAppTabs(
  service: SupabaseClient = getServiceClient(),
): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const {data,error} = await service.from("app_tab_content_scope")
    .select("id").eq("id",true).maybeSingle();
  if (error && !["42P01","PGRST205"].includes(error.code))
    throw new Error("Unable to resolve application tab protection state");
  return !!data;
}

export async function encodeAppTabValue(userId:string,id:string,
  column:Column,value:string):Promise<string> {
  if (column === "href" ? normalizeAppTabLocation(value) !== value :
      !value || value.length > APP_TAB_MAX_NAME ||
      // eslint-disable-next-line no-control-regex -- Match the tab name constraint.
      /[\u0000-\u001f\u007f]/.test(value))
    throw new Error("Invalid application tab content");
  const cipher=await getEncryptedStore().encrypt(value,binding(userId,id,column));
  return `${marker}${cipher}`;
}

export async function decodeAppTabValue(userId:string,id:string,
  column:Column,value:string|null):Promise<string|null> {
  if (value===null) return null;
  if (!value.startsWith(marker)) return value;
  const store=getEncryptedStore();
  const cipher=store.fromDatabase<string>(value.slice(marker.length));
  if (store.formatOf(cipher)!==3) throw new Error("Invalid application tab envelope");
  const opened=await store.decrypt(cipher,binding(userId,id,column));
  if (typeof opened!=="string" || (column === "href" ?
      normalizeAppTabLocation(opened) !== opened :
      !opened || opened.length > APP_TAB_MAX_NAME ||
      // eslint-disable-next-line no-control-regex -- Reject invalid restored tab names.
      /[\u0000-\u001f\u007f]/.test(opened)))
    throw new Error("Invalid application tab content");
  return opened;
}

export function appTabValueVersion(value:string|null):number {
  if (!value || !value.startsWith(marker)) return 0;
  const store=getEncryptedStore();
  const cipher=store.fromDatabase(value.slice(marker.length));
  if (store.formatOf(cipher)!==3) throw new Error("Invalid application tab envelope");
  return store.versionOf(cipher);
}

export async function decodeAppTab(userId:string,row:AppTab):Promise<AppTab> {
  if (row.user_id!==userId) throw new Error("Application tab owner changed");
  return { ...row,
    href:(await decodeAppTabValue(userId,row.id,"href",row.href))!,
    custom_name:await decodeAppTabValue(userId,row.id,"custom_name",row.custom_name),
  };
}
