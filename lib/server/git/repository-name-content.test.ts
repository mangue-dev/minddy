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
  current:vi.fn(async () => ({ version:1,bytes:Buffer.from(indexKey) })),
  byVersion:async () => ({ version:1,bytes:Buffer.from(indexKey) }),
};
const store = new EncryptedStore(contentKeys);
const reads = vi.fn();
const registrations = vi.fn();
let registrationError: { code: string } | null = null;
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
      single:async () => { reads(filters.provider, filters.token); return { data:matching(),error:matching()?null:{ code:"PGRST116" } }; },
      maybeSingle:async () => {
        const row=matching();
        if (row && patch && Object.entries(filters).every(([key,value]) =>
            row[key]===value)) Object.assign(row,patch);
        return { data:row,error:null };
      },
      upsert:async (value:Record<string,unknown>, options:Record<string,unknown>) => {
        registrations(value, options);
        expect(options).toEqual({ onConflict: "provider,token", ignoreDuplicates: true });
        if (registrationError) return { error: registrationError };
        const key=`${value.provider}:${value.token}`;
        if (rows.has(key)) return { error:null };
        rows.set(key,{ ...value });return { error:null };
      },
      update:(value:Record<string,unknown>) => { patch=value;return query; },
    };
    return query;
  } }),
}));

const { registerRepositoryName,decodeRepositoryName,repositoryNameToken,
  rotateRepositoryName, createRepositoryNameDecoder } = await import("./repository-name-content");

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
  it("registers concurrent duplicates without overwriting the stored ciphertext", async () => {
    const name = "Private/Concurrent";
    const tokens = await Promise.all(Array.from({ length: 12 }, () =>
      registerRepositoryName("github", name)));
    expect(new Set(tokens).size).toBe(1);
    const original = { ...rows.get(`github:${tokens[0]}`)! };
    expect(await registerRepositoryName("github", name.toLowerCase())).toBe(tokens[0]);
    expect(rows.get(`github:${tokens[0]}`)).toEqual(original);
    expect(await decodeRepositoryName("github", tokens[0])).toBe(name);
  });

  it("fails registration on database errors and rejects a corrupted stored identity", async () => {
    registrationError = { code: "57014" };
    try {
      await expect(registerRepositoryName("github", "Private/Unavailable"))
        .rejects.toThrow("Unable to register forge repository name");
    } finally { registrationError = null; }
    const first = await registerRepositoryName("github", "Private/Corrupt");
    const second = await registerRepositoryName("github", "Private/Other");
    rows.set(`github:${first}`, { ...rows.get(`github:${second}`)! });
    await expect(registerRepositoryName("github", "Private/Corrupt")).rejects.toThrow();
  });

  it("coalesces an authorized operation and revalidates identities on the next operation", async () => {
    const token = await registerRepositoryName("github", "Private/Shared");
    reads.mockClear();
    blindKeys.current.mockClear();
    const decode = createRepositoryNameDecoder("actor-1");
    expect(await Promise.all(Array.from({ length: 51 }, () => decode("github", token))))
      .toEqual(Array(51).fill("Private/Shared"));
    expect(reads).toHaveBeenCalledTimes(1);
    expect(blindKeys.current).not.toHaveBeenCalled();

    const next = createRepositoryNameDecoder("actor-2");
    expect(await next("github", token)).toBe("Private/Shared");
    expect(reads).toHaveBeenCalledTimes(2);
    await expect(decode("gitlab", token)).rejects.toThrow("unavailable");
  });

  it("retries failed identity loads and rejects a transplanted ciphertext", async () => {
    const first = await registerRepositoryName("github", "Private/First");
    const second = await registerRepositoryName("github", "Private/Second");
    const original = rows.get(`github:${first}`)!;
    const decode = createRepositoryNameDecoder();
    rows.delete(`github:${first}`);
    await expect(decode("github", first)).rejects.toThrow("unavailable");
    rows.set(`github:${first}`, rows.get(`github:${second}`)!);
    await expect(decode("github", first)).rejects.toThrow();
    rows.set(`github:${first}`, original);
    expect(await decode("github", first)).toBe("Private/First");
  });

});
