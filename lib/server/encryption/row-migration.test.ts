import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EncryptedStore, type DataKeyProvider, type EncryptionScope } from "./store";
import { ManagedDataKeys, type KeyRegistry, type KeyWrapper, type WrappedDataKey } from "./keys";
import { EncryptedRowCodec, type RowContext, type StoredRow } from "./row-codec";
import { migrateProtectedRows, type MigrationCandidate, type RowMigrationRepository } from "./row-migration";

const scope = { kind: "project" as const, id: "project-1" };
const context: RowContext = { table: "issues", scope };
const audit = { actorId: null, reason: "migration_verification" as const };

function legacy(id: string): StoredRow {
  return {
    id, project_id: scope.id, title: `Private ${id}`, description: "Body", plan: null,
    automation_override: { nested: [null, false, 2] }, remote_url: null,
    encryption_version: 0, encrypted_content: null,
  };
}

class RevisionRepository implements RowMigrationRepository {
  readonly rows = new Map<string, MigrationCandidate>();
  writes = 0;
  beforeWrite?: (candidate: MigrationCandidate) => void;
  afterWrite?: () => void;

  constructor(rows: StoredRow[], rowContext = context) {
    for (const row of rows) this.rows.set(String(row.id), { row, revision: "1", context: rowContext });
  }

  async scan(limit: number) {
    return structuredClone([...this.rows.values()].slice(0, limit));
  }

  async compareAndSwap(candidate: MigrationCandidate, replacement: StoredRow) {
    this.beforeWrite?.(candidate);
    const current = this.rows.get(String(candidate.row.id));
    if (!current || current.revision !== candidate.revision ||
        JSON.stringify(current.context) !== JSON.stringify(candidate.context)) return false;
    this.rows.set(String(candidate.row.id), {
      ...current, row: replacement, revision: String(Number(current.revision) + 1),
    });
    this.writes += 1;
    this.afterWrite?.();
    return true;
  }
}

function fixture() {
  const material = randomBytes(32);
  let version = 1;
  const provider: DataKeyProvider = {
    current: vi.fn(async () => ({ version, bytes: Buffer.from(material) })),
    byVersion: vi.fn(async (_scope, requested) => ({ version: requested, bytes: Buffer.from(material) })),
  };
  return { provider, store: new EncryptedStore(provider), advance: () => { version += 1; } };
}

beforeEach(() => vi.spyOn(console, "info").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("protected row migration and rotation", () => {
  it("clears legacy content only after round-trip verification and is restartable", async () => {
    const { store, advance } = fixture();
    const source = legacy("issue-1");
    const repository = new RevisionRepository([source]);
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ migrated: 1, failed: 0 });
    const saved = repository.rows.get("issue-1")!.row;
    expect(saved.title).toBeNull();
    expect(saved.description).toBeNull();
    expect(saved.encryption_version).toBe(1);
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ migrated: 0, unchanged: 1 });
    advance();
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ migrated: 1, unchanged: 0 });
    expect(repository.rows.get("issue-1")!.row.encryption_version).toBe(2);
    const codec = new EncryptedRowCodec(store);
    expect(await codec.decode(repository.rows.get("issue-1")!.row, context, audit)).toMatchObject({
      title: source.title, description: source.description, automation_override: source.automation_override,
    });
  });

  it("removes page search projections without mistaking the deliberate removal for data loss", async () => {
    const { store } = fixture();
    const row: StoredRow = {
      id: "page-1", project_id: scope.id, title: "Private page", icon: null,
      content: { type: "doc", content: [] }, database_schema: null, database_title_name: "Name",
      property_values: {}, search_text: "Private page", search_tsv: "'private':1",
      encryption_version: 0, encrypted_content: null,
    };
    const repository = new RevisionRepository([row], { table: "pages", scope });
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ migrated: 1, failed: 0 });
    expect(repository.rows.get("page-1")!.row.search_text).toBeNull();
    expect(repository.rows.get("page-1")!.row).not.toHaveProperty("search_tsv");
  });

  it.each(["edit", "delete", "move"])("preserves a concurrent %s instead of applying an obsolete snapshot", async (operation) => {
    const { store } = fixture();
    const repository = new RevisionRepository([legacy("issue-1")]);
    repository.beforeWrite = () => {
      const current = repository.rows.get("issue-1")!;
      if (operation === "delete") repository.rows.delete("issue-1");
      else if (operation === "edit") repository.rows.set("issue-1", {
        ...current, revision: "2", row: { ...current.row, title: "Concurrent title" },
      });
      else repository.rows.set("issue-1", {
        ...current, context: { ...context, scope: { ...scope, id: "other-project" } },
        row: { ...current.row, project_id: "other-project" },
      });
    };
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ conflicted: 1, migrated: 0, failed: 0 });
    expect(repository.writes).toBe(0);
    if (operation === "edit") expect(repository.rows.get("issue-1")!.row.title).toBe("Concurrent title");
  });

  it("resumes after an uncertain commit without encrypting ciphertext or losing content", async () => {
    const { store } = fixture();
    const repository = new RevisionRepository([legacy("issue-1")]);
    repository.afterWrite = () => { throw new Error("Connection closed after commit"); };
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ failed: 1, migrated: 0 });
    repository.afterWrite = undefined;
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ failed: 0, unchanged: 1 });
    expect(repository.writes).toBe(1);
    expect((await new EncryptedRowCodec(store).decode(repository.rows.get("issue-1")!.row, context, audit)).title)
      .toBe("Private issue-1");
  });

  it("preserves source rows during a KMS outage and does not expose provider errors", async () => {
    const { provider, store } = fixture();
    vi.mocked(provider.current).mockRejectedValue(new Error("Provider error with secret request content"));
    const source = legacy("issue-1");
    const repository = new RevisionRepository([source]);
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ failed: 1, migrated: 0 });
    expect(repository.rows.get("issue-1")!.row).toEqual(source);
    expect(repository.writes).toBe(0);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("secret request content");
  });

  it("refuses to clear a row if verification fails or a historical key is unavailable", async () => {
    const { provider, store } = fixture();
    const repository = new RevisionRepository([legacy("issue-1")]);
    vi.mocked(provider.byVersion).mockRejectedValue(new Error("Key unavailable"));
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ failed: 1, migrated: 0 });
    expect(repository.writes).toBe(0);
    expect(repository.rows.get("issue-1")!.row.title).toBe("Private issue-1");
  });

  it("continues past corruption without overwriting it and catches mismatched provider keys", async () => {
    const { provider, store } = fixture();
    const codec = new EncryptedRowCodec(store);
    const broken = await codec.encode(legacy("broken"), context);
    const envelope = JSON.parse(broken.encrypted_content!);
    broken.encrypted_content = store.fromDatabase(JSON.stringify({ ...envelope, tag: randomBytes(16).toString("base64url") }));
    const repository = new RevisionRepository([broken, legacy("healthy")]);
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ migrated: 1, failed: 1 });
    expect(repository.rows.get("broken")!.row).toEqual(broken);
    vi.mocked(provider.current).mockResolvedValue({ version: 2, bytes: randomBytes(32) });
    // A provider mismatch is caught during verification before any persistent write.
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ migrated: 0, failed: 2 });
  });

  it("never downgrades a historical row even if a restored registry reports an older current key", async () => {
    const { provider, store, advance } = fixture();
    advance();
    const source = await new EncryptedRowCodec(store).encode(legacy("issue-1"), context);
    const repository = new RevisionRepository([source]);
    vi.mocked(provider.current).mockImplementation(() => provider.byVersion(scope, 1));
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ failed: 1, migrated: 0 });
    expect(repository.rows.get("issue-1")!.row).toEqual(source);
    expect(repository.writes).toBe(0);
  });

  it("stops before persistence when cancelled and does not scan an already cancelled batch", async () => {
    const { provider, store } = fixture();
    const repository = new RevisionRepository([legacy("issue-1"), legacy("issue-2")]);
    const controller = new AbortController();
    const unwrap = provider.byVersion;
    provider.byVersion = async (...args) => { controller.abort(); return unwrap(...args); };
    expect(await migrateProtectedRows(repository, store, { signal: controller.signal }))
      .toMatchObject({ interrupted: true, scanned: 1, migrated: 0, failed: 0 });
    const scan = vi.spyOn(repository, "scan");
    expect(await migrateProtectedRows(repository, store, { signal: controller.signal }))
      .toMatchObject({ interrupted: true, scanned: 0 });
    expect(scan).not.toHaveBeenCalled();
    expect(repository.writes).toBe(0);
  });

  it("enforces batch bounds before writing and refuses candidates without a revision", async () => {
    const { store } = fixture();
    const repository = new RevisionRepository([legacy("one"), legacy("two")]);
    for (const limit of [0, -1, 501, 1.5, NaN]) {
      await expect(migrateProtectedRows(repository, store, { limit })).rejects.toThrow("batch size");
    }
    repository.scan = async () => [...repository.rows.values()];
    await expect(migrateProtectedRows(repository, store, { limit: 1 })).rejects.toThrow("batch limit");
    repository.rows.get("one")!.revision = "";
    expect(await migrateProtectedRows(repository, store)).toMatchObject({ migrated: 1, failed: 1 });
  });
});

/** A local KMS fixture: the root is kept outside the serialized backup. */
class FixtureKms implements KeyWrapper {
  constructor(private readonly root: Buffer) {}
  async generate(scope: EncryptionScope) {
    const bytes = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.root, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(scope)));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return { bytes, wrappedKey: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]) };
  }
  async unwrap(record: WrappedDataKey) {
    const wrapped = Buffer.from(record.wrappedKey);
    const cipher = createDecipheriv("aes-256-gcm", this.root, wrapped.subarray(0, 12));
    cipher.setAAD(Buffer.from(JSON.stringify(record.scope)));
    cipher.setAuthTag(wrapped.subarray(12, 28));
    return Buffer.concat([cipher.update(wrapped.subarray(28)), cipher.final()]);
  }
}

function memoryKeys(records: WrappedDataKey[] = []): KeyRegistry {
  return {
    loadCurrent: async (asked) => records.filter((row) => JSON.stringify(row.scope) === JSON.stringify(asked)).at(-1) ?? null,
    loadVersion: async (asked, version) => records.find((row) => JSON.stringify(row.scope) === JSON.stringify(asked) && row.version === version) ?? null,
    insertFirst: async (record) => { records.push(record); return record; },
    rotate: async (record, expected) => {
      const current = records.filter((row) => JSON.stringify(row.scope) === JSON.stringify(record.scope)).at(-1);
      if (current?.version !== expected) return false;
      records.push(record);
      return true;
    },
  };
}

describe("encrypted backup restoration rehearsal (local KMS fixture)", () => {
  it("restores old and current rows without a warm cache and fails closed without the root or historical keys", async () => {
    const root = randomBytes(32);
    const records: WrappedDataKey[] = [];
    const keys = new ManagedDataKeys(memoryKeys(records), new FixtureKms(root));
    const store = new EncryptedStore(keys);
    const codec = new EncryptedRowCodec(store);
    const old = await codec.encode(legacy("old"), context);
    await keys.rotate(scope, 1);
    const current = await codec.encode(legacy("current"), context);
    const backup = JSON.stringify({ rows: [old, current], keys: records.map((record) => ({
      ...record, wrappedKey: Buffer.from(record.wrappedKey).toString("base64"),
    })) });
    expect(backup).not.toContain("Private");
    expect(backup).not.toContain(root.toString("base64"));
    keys.invalidate(scope);
    const snapshot = JSON.parse(backup);
    const restoredKeys: WrappedDataKey[] = snapshot.keys.map((record: WrappedDataKey & { wrappedKey: string }) => ({
      ...record, wrappedKey: Buffer.from(record.wrappedKey, "base64"),
    }));
    const restore = (rootKey: Buffer, registry = restoredKeys) => new EncryptedStore(
      new ManagedDataKeys(memoryKeys(registry), new FixtureKms(rootKey)),
    );
    const restored = restore(root);
    const restoredCodec = new EncryptedRowCodec(restored);
    for (const row of snapshot.rows) {
      expect((await restoredCodec.decode(row, context, audit)).title).toBe(`Private ${row.id}`);
    }
    const repository = new RevisionRepository(snapshot.rows);
    expect(await migrateProtectedRows(repository, restored)).toMatchObject({ migrated: 1, unchanged: 1, failed: 0 });
    for (const row of repository.rows.values()) expect(row.row.encryption_version).toBe(2);
    await expect(new EncryptedRowCodec(restore(randomBytes(32))).decode(old, context, audit)).rejects.toThrow();
    await expect(new EncryptedRowCodec(restore(root, restoredKeys.filter((key) => key.version !== 1)))
      .decode(old, context, audit)).rejects.toThrow("unavailable");
  });
});
