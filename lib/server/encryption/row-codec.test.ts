import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import policies from "./data-policy.json";
import { EncryptedRowCodec, type ProtectedTable, type StoredRow } from "./row-codec";
import { EncryptedStore, type DataKeyProvider } from "./store";

const bytes = randomBytes(32);
const provider: DataKeyProvider = {
  current: async () => ({ version: 1, bytes: Buffer.from(bytes) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(bytes) }),
};
const store = new EncryptedStore(provider);
const codec = new EncryptedRowCodec(store);
const context = { table: "issues" as const, scope: { kind: "project" as const, id: "project-1" } };
const audit = { actorId: "user-1", reason: "repository_read" as const };

function row(table: ProtectedTable, metadata: Record<string, unknown> = {}): StoredRow {
  return {
    id: "row-1", project_id: "project-1", encryption_version: 0, encrypted_content: null,
    ...Object.fromEntries(policies[table].encrypted.map((column) => [column, null])),
    ...metadata,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("encrypted row codec", () => {
  it("preserves content types, clears every protected column and audits without content", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const source = row("issues", {
      title: "Confidential title", description: "", plan: null,
      automation_override: { nested: [1, false, "private", null] }, status: "in_progress",
    });
    const saved = await codec.encode(source, context);
    expect(saved.encryption_version).toBe(1);
    for (const column of policies.issues.encrypted) expect(saved[column]).toBeNull();
    expect(JSON.stringify(saved)).not.toContain("Confidential title");
    expect(source.title).toBe("Confidential title");
    const { encryption_version: _version, encrypted_content: _content, ...expected } = source;
    expect(await codec.decode(saved, context, audit)).toEqual(expected);
    expect(log).toHaveBeenCalledWith("[data-decrypt]", expect.objectContaining({
      actor_id: "user-1", table: "issues", row_id: '["row-1"]',
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("Confidential title");
  });

  it("rejects ciphertext transplanted to another real primary key, table or owner", async () => {
    const saved = await codec.encode(row("issues"), context);
    await expect(codec.decode({ ...saved, id: "row-2" }, context, audit)).rejects.toThrow("Unable to decrypt");
    await expect(codec.decode(saved, { ...context, table: "objectives" }, audit)).rejects.toThrow();
    await expect(codec.decode(saved, { ...context, scope: { kind: "project", id: "other" } }, audit))
      .rejects.toThrow("row ownership");
    await expect(codec.decode({ ...saved, project_id: "other" }, {
      ...context, scope: { kind: "project", id: "other" },
    }, audit)).rejects.toThrow("Unable to decrypt");
  });

  it("requires full rows and non-sensitive primary keys before encrypting", async () => {
    const source = row("issues");
    delete source.title;
    await expect(codec.encode(source, context)).rejects.toThrow("Incomplete protected row");
    await expect(codec.encode(row("issues", { id: null }), context)).rejects.toThrow("primary key");
    await expect(codec.encode(row("forge_mention_throttle", { key: "private repository" }), {
      table: "forge_mention_throttle", scope: { kind: "system", id: "00000000-0000-0000-0000-000000000000" },
    })).rejects.toThrow("primary key");
  });

  it("reads mixed migration states using the persisted version and rejects inconsistent states", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const source = row("issues", { title: "Legacy" });
    expect((await codec.decode(source, context, audit)).title).toBe("Legacy");
    const saved = await codec.encode(source, context);
    await expect(codec.decode({ ...saved, encryption_version: 0 }, context, audit)).rejects.toThrow("legacy row");
    await expect(codec.decode({ ...saved, encryption_version: 2 }, context, audit)).rejects.toThrow("row encryption version");
    await expect(codec.decode({ ...saved, encryption_version: -1 }, context, audit)).rejects.toThrow("row encryption version");
    await expect(codec.decode({ ...saved, title: "leftover plaintext" }, context, audit)).rejects.toThrow("retains plaintext");
    await expect(codec.decode({ ...saved, encrypted_content: null }, context, audit)).rejects.toThrow("Invalid encrypted value");
  });

  it("removes page search projections as part of the encoded row", async () => {
    const saved = await codec.encode(row("pages", { search_text: "private", search_tsv: "private" }), {
      ...context, table: "pages",
    });
    expect(saved.search_text).toBeNull();
    expect(saved).not.toHaveProperty("search_tsv");
    await expect(codec.decode({ ...saved, search_text: "leftover" }, { ...context, table: "pages" }, audit))
      .rejects.toThrow("plaintext search projection");
  });

  it("chooses project ownership before personal ownership and enforces the system scope", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const personal = row("views", { project_id: null, user_id: "user-1" });
    const personalContext = { table: "views" as const, scope: { kind: "user" as const, id: "user-1" } };
    const saved = await codec.encode(personal, personalContext);
    expect((await codec.decode(saved, personalContext, audit)).user_id).toBe("user-1");
    await expect(codec.encode({ ...personal, project_id: "project-1" }, personalContext)).rejects.toThrow("row ownership");
    const systemContext = { table: "app_config" as const, scope: policies.app_config.scope };
    const configuration = row("app_config", { key: "configuration-key", value: "private" });
    const systemSaved = await codec.encode(configuration, {
      ...systemContext, scope: { kind: "system", id: systemContext.scope.id },
    });
    expect((await codec.decode(systemSaved, {
      ...systemContext, scope: { kind: "system", id: systemContext.scope.id },
    }, audit)).value).toBe("private");
    await expect(codec.decode(systemSaved, { table: "app_config", scope: { kind: "system", id: "other" } }, audit))
      .rejects.toThrow("system ownership");
  });
});
