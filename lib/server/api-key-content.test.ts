import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material=new Map([[1,randomBytes(32)],[2,randomBytes(32)]]);
const store=new EncryptedStore({
  current:async()=>({version:2,bytes:Buffer.from(material.get(2)!)}),
  byVersion:async(_scope,version)=>({version,
    bytes:Buffer.from(material.get(version)!)})});
vi.mock("@/lib/server/encryption/registry",()=>({getEncryptedStore:()=>store}));
const {encodeApiKeyContent,decodeApiKeyContent}=await import("./api-key-content");

describe("protected API-key attribution",()=>{
  it("seals labels under the owner and stable actor key ID",async()=>{
    const row={id:randomUUID(),user_id:randomUUID()};
    const content={name:"Private OAuth client",agent:"private-agent"};
    const encoded=await encodeApiKeyContent(row,content);
    expect(JSON.stringify(encoded)).not.toContain(content.name);
    expect(JSON.stringify(encoded)).not.toContain(content.agent);
    expect(await decodeApiKeyContent({...row,name:null,agent:null,...encoded}))
      .toEqual(content);
    await expect(decodeApiKeyContent({...row,id:randomUUID(),
      name:null,agent:null,...encoded})).rejects.toThrow();
    await expect(decodeApiKeyContent({...row,user_id:randomUUID(),
      name:null,agent:null,...encoded})).rejects.toThrow();
  });
});
