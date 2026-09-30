import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/server/encryption/registry", async (importOriginal) => ({
  ...await importOriginal<typeof import("./encryption/registry")>(),
  getBlindIndexKeys: () => ({
    current: async () => ({ bytes: Buffer.alloc(32, 11), version: 1 }),
    byVersion: async () => ({ bytes: Buffer.alloc(32, 11), version: 1 }),
  }),
}));

const { attachmentPathDigest, removeStorageObjects, sweepOrphanAttachments } =
  await import("./attachments");
const prefix = "projects/11111111-1111-4111-8111-111111111111";
const target = `${prefix}/22222222-2222-4222-8222-222222222222`;
const other = `${prefix}/33333333-3333-4333-8333-333333333333`;
const legacy = `${prefix}/historical/report.pdf`;

function fixture(options: {
  paths?: string[];
  referenced?: string[];
  storageFailure?: "error" | "throw";
  failRemovalAt?: number;
  metadataFailure?: "attachment_object_aliases" | "attachment_object_encrypted";
} = {}) {
  const paths = options.paths ?? [target, other];
  const objects = new Set(paths);
  const registry = new Set(paths);
  const aliases = new Map<string, string>();
  const operations: { table: string; column?: string; paths: string[] }[] = [];
  let removalCount = 0;
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, digest: string) => ({
          maybeSingle: async () => ({ data: aliases.has(digest)
            ? { new_path: aliases.get(digest) } : null, error: null }),
        }),
        in: async (_column: string, selected: string[]) => ({
          data: selected.filter((path) => options.referenced?.includes(path))
            .map((storage_path) => ({ storage_path })), error: null,
        }),
      }),
      delete: () => ({ in: async (column: string, selected: string[]) => {
        operations.push({ table, column, paths: selected });
        if (options.metadataFailure === table) return { error: { message: "unavailable" } };
        if (table === "attachment_object_aliases") {
          expect(column).toBe("new_path");
          for (const [digest, path] of aliases) {
            if (selected.includes(path)) aliases.delete(digest);
          }
        } else {
          expect(table).toBe("attachment_object_encrypted");
          expect(column).toBe("path");
          // Model the real foreign key: registry parents cannot precede alias deletion.
          expect([...aliases.values()].some((path) => selected.includes(path))).toBe(false);
          selected.forEach((path) => registry.delete(path));
        }
        return { error: null };
      } }),
    }),
    rpc: async (name: string) => {
      expect(name).toBe("orphan_attachment_objects");
      return { data: paths.map((name) => ({ name })), error: null };
    },
    storage: { from: (bucket: string) => ({ remove: async (selected: string[]) => {
      expect(bucket).toBe("attachments");
      operations.push({ table: "storage", paths: selected });
      removalCount++;
      if (options.storageFailure === "throw") throw new Error("unavailable");
      if (options.storageFailure === "error" || removalCount === options.failRemovalAt) {
        return { error: { message: "unavailable" } };
      }
      selected.forEach((path) => objects.delete(path));
      return { error: null };
    } }) },
  } as unknown as SupabaseClient;
  return { client, objects, registry, aliases, operations };
}

beforeEach(() => {
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", Buffer.alloc(32, 7).toString("hex"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("attachment object metadata retirement", () => {
  it("resolves a legacy alias and retires all target aliases after deleting the bytes", async () => {
    const state = fixture();
    const digest = await attachmentPathDigest(legacy);
    state.aliases.set(digest, target);
    state.aliases.set("another-retired-alias", target);
    state.aliases.set("live-alias", other);

    await removeStorageObjects(state.client, [legacy, target, null]);

    expect(state.operations.map(({ table }) => table))
      .toEqual(["storage", "attachment_object_aliases", "attachment_object_encrypted"]);
    expect(state.operations[0].paths).toEqual([target]);
    expect([...state.registry]).toEqual([other]);
    expect([...state.objects]).toEqual([other]);
    expect([...state.aliases]).toEqual([["live-alias", other]]);
  });

  it("preserves a referenced resolved object and its metadata", async () => {
    const state = fixture({ referenced: [target] });
    state.aliases.set(await attachmentPathDigest(legacy), target);
    await removeStorageObjects(state.client, [legacy]);
    expect(state.operations).toEqual([]);
    expect(state.registry.has(target)).toBe(true);
    expect(state.aliases.size).toBe(1);
  });

  it.each(["error", "throw"] as const)("preserves metadata when Storage returns an %s", async (failure) => {
    const state = fixture({ storageFailure: failure });
    state.aliases.set("retained-alias", target);
    await expect(removeStorageObjects(state.client, [target])).resolves.toBeUndefined();
    expect(state.operations.map(({ table }) => table)).toEqual(["storage"]);
    expect(state.registry.has(target)).toBe(true);
    expect(state.aliases.get("retained-alias")).toBe(target);
  });

  it("keeps immediate metadata failures from failing the business write", async () => {
    const state = fixture({ metadataFailure: "attachment_object_aliases" });
    state.aliases.set("retained-alias", target);
    await expect(removeStorageObjects(state.client, [target])).resolves.toBeUndefined();
    expect(state.registry.has(target)).toBe(true);
    expect(state.aliases.get("retained-alias")).toBe(target);
    expect(console.error).toHaveBeenCalledWith("[attachments] storage_cleanup_failed");
  });

  it("retires only successfully removed nightly batches", async () => {
    const paths = Array.from({ length: 150 }, (_, i) => `${prefix}/object-${i}`);
    const state = fixture({ paths, failRemovalAt: 2 });
    paths.forEach((path, i) => state.aliases.set(`alias-${i}`, path));
    expect(await sweepOrphanAttachments(state.client, "2026-09-01T00:00:00Z")).toBe(100);
    expect([...state.registry]).toEqual(paths.slice(100));
    expect([...state.objects]).toEqual(paths.slice(100));
    expect([...state.aliases.values()]).toEqual(paths.slice(100));
    expect(state.operations.map(({ table }) => table)).toEqual([
      "storage", "attachment_object_aliases", "attachment_object_encrypted", "storage",
    ]);
  });

  it.each(["attachment_object_aliases", "attachment_object_encrypted"] as const)(
    "reports a nightly %s deletion failure", async (table) => {
      const options: { metadataFailure?: typeof table } = { metadataFailure: table };
      const state = fixture(options);
      state.aliases.set("retained-alias", target);
      await expect(sweepOrphanAttachments(state.client, "2026-09-01T00:00:00Z"))
        .rejects.toThrow(/retired attachment/);
      expect(state.registry.has(target)).toBe(true);
      delete options.metadataFailure;
      expect(await sweepOrphanAttachments(state.client, "2026-09-01T00:00:00Z")).toBe(2);
      expect(state.registry.size).toBe(0);
      expect(state.aliases.size).toBe(0);
    },
  );
});
