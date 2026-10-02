import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManagedDataKeys, type KeyRegistry, type WrappedDataKey } from "./keys";
import { LocalKeyWrapper } from "./local-key-wrapper";
import { EncryptedStore, type EncryptionScope } from "./store";

const h = vi.hoisted(() => ({ service: null as unknown, store: null as unknown }));
vi.mock("./registry", () => ({ getEncryptedStore: () => h.store }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.service }));
const { encodeAttachmentObject, decodeAttachmentObject } = await import("./attachment-object-content");
const { backfillForgeAttachmentsBatch } = await import("./forge-attachment-backfill");
const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const template = process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE ?? "minddy_min591_final_20260929";
const container = "supabase_db_minddy-encryption-test";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(database: string, statement: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At", "-v",
    "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database],
  { input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }).trim();
}
function dump(database: string, tables: string[]) {
  return execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
    "-d", database, "--data-only", "--no-owner", "--no-privileges",
    ...tables.flatMap((table) => ["-t", table])], { encoding: "utf8" });
}
class SqlSession {
  private process;
  private output = "";
  private errors = "";
  private pending: { marker: string; resolve: (value: string) => void;
    reject: (error: Error) => void } | null = null;
  constructor(database: string) {
    this.process = spawn("docker", ["exec", "-i", container, "psql", "-X", "-Atq",
      "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database]);
    this.process.stdout.on("data", (chunk) => {
      this.output += chunk.toString();
      const pending = this.pending;
      if (!pending) return;
      const index = this.output.indexOf(pending.marker);
      if (index < 0) return;
      this.pending = null;
      const response = this.output.slice(0, index).trim();
      this.output = this.output.slice(index + pending.marker.length);
      pending.resolve(response);
    });
    this.process.stderr.on("data", (chunk) => { this.errors += chunk.toString(); });
    this.process.on("close", () => {
      this.pending?.reject(new Error(this.errors || "SQL session closed"));
      this.pending = null;
    });
  }
  run(statement: string) {
    expect(this.pending).toBeNull();
    const marker = `__FORGE_DONE_${randomUUID().replaceAll("-", "")}__`;
    const result = new Promise<string>((resolve, reject) => {
      this.pending = { marker, resolve, reject };
    });
    this.process.stdin.write(`${statement}\n\\echo ${marker}\n`);
    return result;
  }
  close() { this.process.stdin.end(); }
}
async function assertBlocked(promise: Promise<string>) {
  expect(await Promise.race([promise.then(() => "completed"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 150))])).toBe("blocked");
}
function registry(database: string): KeyRegistry {
  const where = (scope: EncryptionScope) => `scope_kind=${quote(scope.kind)} AND
    scope_id=${quote(scope.id)} AND purpose='content'`;
  const record = (raw: string, scope: EncryptionScope): WrappedDataKey | null => {
    if (!raw) return null;
    const row = JSON.parse(raw);
    return { scope, version: row.version, wrappedKey: Buffer.from(row.wrapped_key, "base64") };
  };
  return {
    async loadCurrent(scope) {
      return record(sql(database, `SELECT row_to_json(k) FROM public.envelope_data_keys k WHERE ${where(scope)} AND is_current;`), scope);
    },
    async loadVersion(scope, version) {
      return record(sql(database, `SELECT row_to_json(k) FROM public.envelope_data_keys k WHERE ${where(scope)} AND version=${version};`), scope);
    },
    async insertFirst(key) {
      return record(sql(database, `SELECT row_to_json(k) FROM public.create_envelope_data_key_if_absent(
        ${quote(key.scope.kind)},${quote(key.scope.id)},'content',
        ${quote(Buffer.from(key.wrappedKey).toString("base64"))}) k;`), key.scope)!;
    },
    async rotate(key, expected) {
      return sql(database, `SELECT public.rotate_envelope_data_key(${quote(key.scope.kind)},
        ${quote(key.scope.id)},'content',${expected},${quote(Buffer.from(key.wrappedKey).toString("base64"))});`) === "t";
    },
  };
}
function coldStore(database: string, root: Buffer) {
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", root.toString("hex"));
  const keys = new ManagedDataKeys(registry(database), new LocalKeyWrapper("content"));
  h.store = new EncryptedStore(keys);
  return keys;
}
function service(database: string, objects: Map<string, Buffer>) {
  h.service = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "activate_forge_attachment_encryption") {
        return { data: sql(database, "SELECT public.activate_forge_attachment_encryption();") === "t", error: null };
      }
      if (name === "list_forge_attachment_migration_candidates") {
        const raw = sql(database, `SELECT coalesce(json_agg(c),'[]') FROM public.list_forge_attachment_migration_candidates(${args.p_limit}) c;`);
        return { data: JSON.parse(raw), error: null };
      }
      if (name === "verify_forge_attachment_legacy_cleanup") {
        return { data: sql(database, `SELECT public.verify_forge_attachment_legacy_cleanup(
          ${quote(String(args.p_digest))},${quote(String(args.p_expected_path))},
          ${quote(String(args.p_pr_id))},${quote(String(args.p_project_id))},
          ${args.p_version},${quote(String(args.p_object_digest))});`) === "t", error: null };
      }
      throw new Error("Unexpected forge recovery RPC");
    },
    from: (table: string) => ({
      delete: () => ({ eq: async (_column: string, digest: string) => {
        sql(database, `DELETE FROM public.forge_attachment_legacy_owners WHERE old_path_digest=${quote(digest)};`);
        return { error: null };
      } }),
      upsert: async (row: { old_path_digest: string }) => {
        expect(table).toBe("forge_attachment_migration_attempts");
        sql(database, `INSERT INTO public.forge_attachment_migration_attempts(old_path_digest)
          VALUES(${quote(row.old_path_digest)}) ON CONFLICT (old_path_digest)
          DO UPDATE SET attempted_at=clock_timestamp();`);
        return { error: null };
      },
    }),
    storage: { from: () => ({
      download: async (path: string) => ({ data: objects.has(path)
        ? new Blob([Uint8Array.from(objects.get(path)!)]) : null,
      error: objects.has(path) ? null : { message: "missing" } }),
      remove: async (paths: string[]) => {
        for (const path of paths) {
          sql(database, `BEGIN; SET LOCAL storage.allow_delete_query='true';
            DELETE FROM storage.objects WHERE bucket_id='forge-attachments' AND name=${quote(path)}; COMMIT;`);
          objects.delete(path);
        }
        return { error: null };
      },
    }) },
  };
}

describe.skipIf(!enabled)("forge SQL restores with separately restored simulated Storage bytes", () => {
  it.each(["references-first", "objects-first"])(
    "retains the only source through %s restore, historical cold keys and wrong roots", async (order) => {
      const suffix = randomUUID().replaceAll("-", "");
      const source = `minddy_min591_forge_source_${suffix}`;
      const restored = `minddy_min591_forge_restore_${suffix}`;
      const actor = randomUUID(); const project = randomUUID(); const connection = randomUUID();
      const pr = randomUUID(); const id = randomUUID(); const root = randomBytes(32);
      const oldPath = `${pr}/${id}/synthetic.bin`;
      const path = `projects/${project}/forge/${id}/${randomUUID()}`;
      const clear = Buffer.from("private synthetic forge restore fixture");
      const created: string[] = [];
      const sessions: SqlSession[] = [];
      try {
        expect(sql(template, "SELECT count(*) FROM auth.users;")).toBe("0");
        expect(sql(template, "SELECT count(*) FROM public.envelope_data_keys;")).toBe("0");
        for (const database of [source, restored]) {
          sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${template};`);
          created.push(database);
        }
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
          INSERT INTO public.projects(id,owner_id,name,key) VALUES(${quote(project)},${quote(actor)},'Forge recovery','FREC');
          INSERT INTO public.git_connections(id,user_id,provider) VALUES(${quote(connection)},${quote(actor)},'github');
          INSERT INTO public.project_git_links(project_id,connection_id,provider,external_repo_id,repo_full_name)
            VALUES(${quote(project)},${quote(connection)},'github','restore-fixture','restore/fixture');
          INSERT INTO public.pull_requests(id,provider,repo_full_name,number) VALUES(${quote(pr)},'github','restore/fixture',1);
          INSERT INTO storage.objects(bucket_id,name) VALUES('forge-attachments',${quote(oldPath)});`);
        const keys = coldStore(source, root);
        const sealed = await encodeAttachmentObject(path, clear);
        await keys.rotate({ kind: "project", id: project }, 1);
        sql(source, `INSERT INTO storage.objects(bucket_id,name,user_metadata)
          VALUES('forge-attachments',${quote(path)},'{"minddy_encrypted":"true"}');
          INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
            legacy_path_digest,content_key_version,format_version,published_at)
          VALUES(${quote(id)},${quote(pr)},${quote(project)},${quote(path)},
            ${quote(createHash("sha256").update(oldPath).digest("hex"))},1,4,now());`);
        expect(await decodeAttachmentObject(path, sealed)).toEqual(clear);
        expect(sql(source, `SELECT public.verify_forge_attachment_object(${quote(id)},
          ${quote(path)},1,${quote(createHash("sha256").update(sealed).digest("hex"))});`)).toBe("t");
        const parents = dump(source, ["auth.users", "public.projects", "public.git_connections",
          "public.project_git_links", "public.pull_requests"]);
        const references = dump(source, ["public.forge_attachment_objects"]);
        const storage = dump(source, ["storage.objects"]);
        const historicalKeys = dump(source, ["public.envelope_data_keys"]);
        sql(restored, parents);
        sql(restored, order === "references-first" ? references : storage);
        expect(sql(restored, "SELECT public.forge_attachment_migration_complete();")).toBe("f");
        sql(restored, order === "references-first" ? storage : references);
        expect(sql(restored, `SELECT rotation_checked_at IS NULL AND verified_object_digest IS NULL
          FROM public.forge_attachment_objects WHERE id=${quote(id)};`)).toBe("t");
        sql(restored, historicalKeys);
        const objects = new Map<string, Buffer>([[oldPath, clear]]);
        service(restored, objects);
        coldStore(restored, root);
        expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 0, failed: 1 });
        expect(objects.get(oldPath)).toEqual(clear);
        objects.set(path, sealed);
        coldStore(restored, randomBytes(32));
        expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 0, failed: 1 });
        expect(objects.get(oldPath)).toEqual(clear);
        coldStore(restored, root);
        await decodeAttachmentObject(path, sealed);
        const target = `projects/${project}/forge/${id}/${randomUUID()}`;
        sql(restored, `INSERT INTO storage.objects(bucket_id,name,user_metadata)
          VALUES('forge-attachments',${quote(target)},'{"minddy_encrypted":"true"}');`);
        const digest = createHash("sha256").update(oldPath).digest("hex");
        const proof = createHash("sha256").update(sealed).digest("hex");
        const cleanup = `SELECT public.verify_forge_attachment_legacy_cleanup(${quote(digest)},
          ${quote(path)},${quote(pr)},${quote(project)},1,${quote(proof)});`;
        const rotation = `SELECT public.rotate_forge_attachment_reference(${quote(id)},
          ${quote(path)},${quote(target)},1,2);`;
        // Both commit orders serialize on the immutable registration. Rotation
        // never moves the replacement while the recoverable original exists.
        for (const cleanupFirst of [true, false]) {
          const first = new SqlSession(restored); const second = new SqlSession(restored);
          sessions.push(first, second);
          await first.run("BEGIN;");
          expect(await first.run(cleanupFirst ? cleanup : rotation)).toBe(cleanupFirst ? "t" : "f");
          const pending = second.run(cleanupFirst ? rotation : cleanup);
          await assertBlocked(pending);
          await first.run("COMMIT;");
          expect(await pending).toBe(cleanupFirst ? "f" : "t");
          first.close(); second.close();
        }
        sql(restored, `BEGIN; SET LOCAL storage.allow_delete_query='true';
          DELETE FROM storage.objects WHERE bucket_id='forge-attachments' AND name=${quote(target)}; COMMIT;`);
        expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 1, failed: 0 });
        expect(objects.has(oldPath)).toBe(false);
        expect(await decodeAttachmentObject(path, sealed)).toEqual(clear);
        expect(await backfillForgeAttachmentsBatch()).toMatchObject({ scanned: 0 });
        expect(sql(restored, "SELECT count(*) FROM public.envelope_data_keys;")).toBe("2");
      } finally {
        root.fill(0);
        vi.unstubAllEnvs();
        for (const session of sessions) session.close();
        for (const database of created.reverse()) sql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
      }
    }, 60_000);
});
