import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

let actorRow:Record<string,unknown>|null=null;
const key=randomBytes(32);
const store=new EncryptedStore({
  current:async()=>({version:2,bytes:Buffer.from(key)}),
  byVersion:async(_scope,version)=>({version,bytes:Buffer.from(key)})});
vi.mock("@/lib/server/encryption/registry",()=>({getEncryptedStore:()=>store}));
vi.mock("@/lib/supabase-service",()=>({getServiceClient:()=>({
  from:(table:string)=>{
    expect(table).toBe("api_keys");
    return {select:()=>({in:async(_column:string,ids:string[])=>({
      data:actorRow && ids.includes(actorRow.id as string)?[actorRow]:[],
      error:null})})};
  }})}));
const {encodeApiKeyContent}=await import("./api-key-content");
const {resolveApiKeyActors}=await import("./api-key-actors");

describe("protected API-key actor projection",()=>{
  it("decrypts only requested event actors after row lookup",async()=>{
    const row={id:randomUUID(),user_id:randomUUID()};
    actorRow={...row,name:null,agent:null,
      ...await encodeApiKeyContent(row,{name:"Private client",agent:"Cursor"})};
    expect(JSON.stringify(actorRow)).not.toContain("Private client");
    const resolved=await resolveApiKeyActors([row.id,row.id,null]);
    expect(resolved.get(row.id)).toEqual({name:"Private client",agent:"Cursor"});
    expect(await resolveApiKeyActors([randomUUID()])).toEqual(new Map());
  });
});
