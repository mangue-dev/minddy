import { randomBytes } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const contentVersions = new Map([[1,randomBytes(32)]]);
let currentVersion = 1;
const indexKey = randomBytes(32);
const contentKeys = {
  current:async () => ({ version:currentVersion,
    bytes:Buffer.from(contentVersions.get(currentVersion)!) }),
  byVersion:async (_scope:unknown,version:number) => ({ version,
    bytes:Buffer.from(contentVersions.get(version)!) }),
};
const blindKeys = {
  current:async () => ({ version:1,bytes:Buffer.from(indexKey) }),
  byVersion:async () => ({ version:1,bytes:Buffer.from(indexKey) }),
};
const store = new EncryptedStore(contentKeys);
const rows = new Map<string,Record<string,unknown>>();

vi.mock("@/lib/server/encryption/registry",() => ({
  getContentKeys:() => contentKeys,
  getBlindIndexKeys:() => blindKeys,
  getEncryptedStore:() => store,
}));
vi.mock("@/lib/server/encryption/audit",() => ({ auditDecryption:vi.fn() }));
vi.mock("@/lib/supabase-service",() => ({
  getServiceClient:() => ({ from:() => {
    const filters:Record<string,unknown> = {};
    let patch:Record<string,unknown>|null=null;
    const matching = () => rows.get(`${filters.provider}:${filters.token}`) ?? null;
    const query = {
      select:() => query,
      eq:(field:string,value:unknown) => {
        filters[field]=value; return query;
      },
      single:async () => ({ data:matching(),error:matching()?null:{ code:"PGRST116" } }),
      maybeSingle:async () => {
        const row=matching();
        if (row && patch && Object.entries(filters).every(([key,value]) =>
            row[key]===value)) Object.assign(row,patch);
        return { data:row,error:null };
      },
      insert:async (value:Record<string,unknown>) => {
        const key=`${value.provider}:${value.token}`;
        if (rows.has(key)) return { error:{ code:"23505" } };
        rows.set(key,{ ...value });return { error:null };
      },
      update:(value:Record<string,unknown>) => { patch=value;return query; },
    };
    return query;
  } }),
}));

const { registerRepositoryName,decodeRepositoryName,repositoryNameToken,
  rotateRepositoryName } = await import("./repository-name-content");

describe("recoverable forge repository identities",() => {
  it("keeps one stable opaque key while rotating ciphertext and refuses a wrong key",async () => {
    const clear="Private/Repository";
    const token=await registerRepositoryName("github",clear);
    expect(token).toMatch(/^mdyr1:[0-9a-f]{64}$/);
    expect(await repositoryNameToken("github",clear.toLowerCase())).toBe(token);
    expect(JSON.stringify([...rows.values()])).not.toContain(clear);
    expect(await decodeRepositoryName("github",token)).toBe(clear);
    expect(await registerRepositoryName("github",clear)).toBe(token);

    currentVersion=2;
    contentVersions.set(2,randomBytes(32));
    expect(await rotateRepositoryName("github",token)).toBe("migrated");
    expect(await decodeRepositoryName("github",token)).toBe(clear);
    expect(await repositoryNameToken("github",clear)).toBe(token);
    expect(JSON.stringify([...rows.values()])).not.toContain(clear);

    const correct=contentVersions.get(2)!;
    contentVersions.set(2,randomBytes(32));
    await expect(decodeRepositoryName("github",token)).rejects.toThrow();
    contentVersions.set(2,correct);
    expect(await decodeRepositoryName("github",token)).toBe(clear);
  });
});
