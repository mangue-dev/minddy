import { describe,expect,it,vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const bytes=Buffer.alloc(32,82);
const store=new EncryptedStore({
  current:async () => ({ version:2,bytes:Buffer.from(bytes) }),
  byVersion:async (_scope,version) => ({ version,bytes:Buffer.from(bytes) }),
});
vi.mock("@/lib/server/encryption/registry",() => ({ getEncryptedStore:() => store }));
vi.mock("@/lib/server/encryption/audit",() => ({ auditDecryption:vi.fn() }));

const { encodeDefaultBranch,decodeDefaultBranch,defaultBranchState } =
  await import("./default-branch-content");

describe("project-bound forge default branches",() => {
  it("protects the SQL value and binds it to the authorized project",async () => {
    const clear="private/issue-591";
    const sealed=await encodeDefaultBranch("project-a",clear);
    expect(sealed).not.toContain(clear);
    expect(defaultBranchState(sealed!)).toEqual({ version:2,format:3 });
    expect(await decodeDefaultBranch("project-a",sealed)).toBe(clear);
    await expect(decodeDefaultBranch("project-b",sealed)).rejects.toThrow();
    await expect(decodeDefaultBranch("project-a",sealed!.replace(":2:",":3:")))
      .rejects.toThrow();
  });
});
