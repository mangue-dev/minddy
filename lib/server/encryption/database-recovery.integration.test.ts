import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManagedDataKeys, type KeyRegistry, type KeyWrapper, type WrappedDataKey } from "./keys";
import { EncryptedStore, type EncryptionScope } from "./store";
import { EncryptedRowCodec, type StoredRow } from "./row-codec";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const template = "minddy_min591_full_audit";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(database: string, statement: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database], {
    input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

/** Test-only KMS substitute. Its root stays in memory, outside both databases/dump. */
function kms(root: Buffer): KeyWrapper {
  return {
    async generate(scope) {
      const bytes = randomBytes(32);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", root, iv);
      cipher.setAAD(Buffer.from(JSON.stringify(scope)));
      const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
      return { bytes, wrappedKey: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]) };
    },
    async unwrap(record) {
      const wrapped = Buffer.from(record.wrappedKey);
      const cipher = createDecipheriv("aes-256-gcm", root, wrapped.subarray(0, 12));
      cipher.setAAD(Buffer.from(JSON.stringify(record.scope)));
      cipher.setAuthTag(wrapped.subarray(12, 28));
      return Buffer.concat([cipher.update(wrapped.subarray(28)), cipher.final()]);
    },
  };
}

function registry(database: string): KeyRegistry {
  const predicate = (scope: EncryptionScope) => `scope_kind=${quote(scope.kind)} AND scope_id=${quote(scope.id)} AND purpose='content'`;
  const record = (raw: string, scope: EncryptionScope): WrappedDataKey | null => {
    if (!raw) return null;
    const row = JSON.parse(raw);
    return { scope, version: row.version, wrappedKey: Buffer.from(row.wrapped_key, "base64") };
  };
  return {
    async loadCurrent(scope) {
      return record(sql(database, `SELECT row_to_json(k) FROM public.envelope_data_keys k WHERE ${predicate(scope)} AND is_current;`), scope);
    },
    async loadVersion(scope, version) {
      return record(sql(database, `SELECT row_to_json(k) FROM public.envelope_data_keys k WHERE ${predicate(scope)} AND version=${version};`), scope);
    },
    async insertFirst(key) {
      return record(sql(database, `SELECT row_to_json(k) FROM public.create_envelope_data_key_if_absent(${quote(key.scope.kind)},${quote(key.scope.id)},'content',${quote(Buffer.from(key.wrappedKey).toString("base64"))}) k;`), key.scope)!;
    },
    async rotate(key, expected) {
      return sql(database, `SELECT public.rotate_envelope_data_key(${quote(key.scope.kind)},${quote(key.scope.id)},'content',${expected},${quote(Buffer.from(key.wrappedKey).toString("base64"))});`) === "t";
    },
  };
}

describe.skipIf(!enabled)("isolated PostgreSQL dump/restore with a local KMS fixture", () => {
  it("restores mixed row/key versions with cold caches and cannot recover without the external root", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_source_${suffix}`;
    const restored = `minddy_min591_restore_${suffix}`;
    const created: string[] = [];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const root = randomBytes(32);
    const users = [randomUUID(), randomUUID(), randomUUID()];
    const contexts = users.map((userId) => ({ table: "user_scratchpad" as const, scope: { kind: "user" as const, id: userId } }));
    try {
      // The template is a schema-only audit database, never a production connection.
      expect(sql(template, "SELECT count(*) FROM auth.users;")).toBe("0");
      expect(sql(template, "SELECT count(*) FROM public.envelope_data_keys;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${template};`);
        created.push(name);
      }
      const keys = new ManagedDataKeys(registry(source), kms(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const [index, userId] of users.entries()) {
        const row: StoredRow = { user_id: userId, content: `Private restore fixture ${index}`, rev: 4,
          encryption_version: 0, encrypted_content: null };
        let stored = row;
        if (index < 2) {
          stored = await codec.encode(row, contexts[index]);
          await keys.rotate(contexts[index].scope, 1);
          if (index === 1) stored = await codec.encode(row, contexts[index]);
        }
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(userId)});
          INSERT INTO public.user_scratchpad(user_id,content,rev,encryption_version,encrypted_content)
          VALUES(${quote(userId)},${stored.content === null ? "NULL" : quote(String(stored.content))},4,${stored.encryption_version},${stored.encrypted_content === null ? "NULL" : quote(stored.encrypted_content)});`);
        const statistic = await codec.encode({ id: randomUUID(), user_id: userId,
          project_name: `Private project snapshot ${index}`, issue_title: null, task_text: `Private task snapshot ${index}`,
          encryption_version: 0, encrypted_content: null }, { table: "stat_events", scope: contexts[index].scope });
        sql(source, `INSERT INTO public.stat_events(id,user_id,kind,occurred_at,encryption_version,encrypted_content)
          VALUES(${quote(String(statistic.id))},${quote(userId)},'scratchpad_task_completed',now(),${statistic.encryption_version},${quote(statistic.encrypted_content!)});`);
        keys.invalidate(contexts[index].scope);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", "--table=auth.users", "--table=public.envelope_data_keys", "--table=public.user_scratchpad", "--table=public.stat_events"], {
        encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      });
      expect(dump).not.toContain("Private restore fixture 0");
      expect(dump).not.toContain("Private restore fixture 1");
      expect(dump).toContain("Private restore fixture 2"); // An explicitly legacy row stays legacy.
      expect(dump).not.toContain(root.toString("base64"));
      expect(dump).not.toContain("Private project snapshot");
      expect(dump).not.toContain("Private task snapshot");
      sql(restored, dump);
      const rows: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(s) FROM public.user_scratchpad s;"));
      const statistics: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(s) FROM public.stat_events s;"));
      const restoredKeys = new ManagedDataKeys(registry(restored), kms(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const [index, userId] of users.entries()) {
        const row = rows.find((candidate) => candidate.user_id === userId)!;
        expect((await restoredCodec.decode(row, contexts[index], { actorId: userId, reason: "migration_verification" })).content)
          .toBe(`Private restore fixture ${index}`);
        expect(row.encryption_version).toBe([1, 2, 0][index]);
        restoredKeys.invalidate(contexts[index].scope);
        const snapshot = await restoredCodec.decode(statistics.find((candidate) => candidate.user_id === userId)!,
          { table: "stat_events", scope: contexts[index].scope }, { actorId: userId, reason: "migration_verification" });
        expect(snapshot).toMatchObject({ project_name: `Private project snapshot ${index}`, task_text: `Private task snapshot ${index}` });
        restoredKeys.invalidate(contexts[index].scope);
      }
      const missingRoot = new EncryptedRowCodec(new EncryptedStore(new ManagedDataKeys(registry(restored), kms(randomBytes(32)))));
      await expect(missingRoot.decode(rows.find((row) => row.user_id === users[0])!, contexts[0], {
        actorId: users[0], reason: "migration_verification",
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);
});
