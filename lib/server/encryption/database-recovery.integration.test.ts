import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManagedDataKeys, type KeyRegistry, type WrappedDataKey } from "./keys";
import { LocalKeyWrapper } from "./local-key-wrapper";
import { EncryptedStore, type EncryptionScope } from "./store";
import { EncryptedRowCodec, type StoredRow } from "./row-codec";
import { buildRootSwapSql, parseRegistryOutput, planRootRewrap } from "@/scripts/rewrap-data-root.mjs";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const template = "minddy_min591_full_audit";
const objectiveTemplate = "minddy_min591_objective_audit";
const categoryTemplate = "minddy_min591_category_audit";
const draftTemplate = "minddy_min591_draft_audit";
const feedbackTemplate = "minddy_min591_feedback_audit";
const issueTemplate = "minddy_min591_issue_audit";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(database: string, statement: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database], {
    input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

function wrapper(root: Buffer): LocalKeyWrapper {
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", root.toString("hex"));
  return new LocalKeyWrapper();
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

describe.skipIf(!enabled)("isolated PostgreSQL dump/restore with the local root key", () => {
  it("restores mixed row/key versions with cold caches and cannot recover without the external root", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_source_${suffix}`;
    const restored = `minddy_min591_restore_${suffix}`;
    const created: string[] = [];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const root = randomBytes(32);
    const nextRoot = randomBytes(32);
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
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
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
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
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
      const missingRoot = new EncryptedRowCodec(new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      await expect(missingRoot.decode(rows.find((row) => row.user_id === users[0])!, contexts[0], {
        actorId: users[0], reason: "migration_verification",
      })).rejects.toThrow();

      const readKeys = () => sql(restored, "SELECT row_to_json(k) FROM public.envelope_data_keys k ORDER BY scope_kind,scope_id,purpose,version;");
      const beforeRewrap = readKeys();
      const rewrap = await planRootRewrap(parseRegistryOutput(beforeRewrap), root.toString("hex"), nextRoot.toString("hex"));
      expect(() => sql(restored, buildRootSwapSql([
        { ...rewrap[0], old_wrapped_key: "AA==" }, ...rewrap.slice(1),
      ]))).toThrow();
      expect(readKeys()).toBe(beforeRewrap);
      sql(restored, buildRootSwapSql(rewrap));
      const freshKeys = new ManagedDataKeys(registry(restored), wrapper(nextRoot));
      const freshCodec = new EncryptedRowCodec(new EncryptedStore(freshKeys));
      for (const [index, userId] of users.entries()) {
        const row = rows.find((candidate) => candidate.user_id === userId)!;
        expect((await freshCodec.decode(row, contexts[index], {
          actorId: userId, reason: "migration_verification",
        })).content).toBe(`Private restore fixture ${index}`);
        freshKeys.invalidate(contexts[index].scope);
      }
      const staleKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      await expect(new EncryptedRowCodec(new EncryptedStore(staleKeys)).decode(
        rows.find((row) => row.user_id === users[0])!, contexts[0],
        { actorId: users[0], reason: "migration_verification" },
      )).rejects.toThrow();
    } finally {
      root.fill(0);
      nextRoot.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores activity, page snapshots and comments across project key rotation", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_history_${suffix}`;
    const restored = `minddy_min591_history_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), issue = randomUUID(), page = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(template, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${template};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id, owner_id, name, key) VALUES(${quote(project)},${quote(actor)},'Source fixture','HISTORY');
        INSERT INTO public.issues(id, project_id, number, title) VALUES(${quote(issue)},${quote(project)},1,'Source fixture');
        INSERT INTO public.pages(id, project_id, position, title, created_by) VALUES(${quote(page)},${quote(project)},'0','Source fixture',${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const event = await codec.encode({ id: randomUUID(), project_id: project,
          from_value: `Protected prior title ${number}`, to_value: `Protected next title ${number}`,
          encryption_version: 0, encrypted_content: null }, { table: "issue_events", scope });
        const snapshot = await codec.encode({ id: randomUUID(), project_id: project,
          title: `Protected wiki title ${number}`, icon: null, content: { type: "doc", text: `Protected wiki body ${number}` },
          encryption_version: 0, encrypted_content: null }, { table: "page_versions", scope });
        const comment = await codec.encode({ id: randomUUID(), project_id: project, body: `Protected comment ${number}`,
          encryption_version: 0, encrypted_content: null }, { table: "comments", scope });
        const pageComment = await codec.encode({ id: randomUUID(), project_id: project, body: `Protected comment ${number}`,
          quote: `Protected quote ${number}`, encryption_version: 0, encrypted_content: null }, { table: "page_comments", scope });
        sql(source, `INSERT INTO public.comments(id,issue_id,project_id,author_id,body,encryption_version,encrypted_content)
          VALUES(${quote(String(comment.id))},${quote(issue)},${quote(project)},${quote(actor)},NULL,${number},${quote(comment.encrypted_content!)});
          INSERT INTO public.page_comments(id,page_id,project_id,author_id,body,quote,encryption_version,encrypted_content)
          VALUES(${quote(String(pageComment.id))},${quote(page)},${quote(project)},${quote(actor)},NULL,NULL,${number},${quote(pageComment.encrypted_content!)});`);
        sql(source, `INSERT INTO public.issue_events(id, issue_id, project_id, actor_id, type, encryption_version, encrypted_content)
          VALUES(${quote(String(event.id))},${quote(issue)},${quote(project)},${quote(actor)},'updated',${event.encryption_version},${quote(event.encrypted_content!)});
          INSERT INTO public.page_versions(id, page_id, project_id, version, title, content, author_kind, encryption_version, encrypted_content)
          VALUES(${quote(String(snapshot.id))},${quote(page)},${quote(project)},${number},NULL,NULL,'human',${snapshot.encryption_version},${quote(snapshot.encrypted_content!)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", ...["auth.users", "public.envelope_data_keys", "public.projects",
          "public.issues", "public.pages", "public.issue_events", "public.page_versions", "public.comments", "public.page_comments"].map((table) => `--table=${table}`)], {
        encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      });
      expect(dump).not.toContain("Protected");
      expect(dump).not.toContain(root.toString("base64"));
      sql(restored, dump);
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const table of ["issue_events", "page_versions", "comments", "page_comments"] as const) {
        const stored: StoredRow[] = JSON.parse(sql(restored, `SELECT json_agg(r) FROM public.${table} r;`));
        expect(stored.map((row) => row.encryption_version).sort()).toEqual([1, 2]);
        for (const row of stored) {
          restoredKeys.invalidate(scope);
          const plain = await restoredCodec.decode(row, { table, scope }, { actorId: actor, reason: "migration_verification" });
          if (table === "comments" || table === "page_comments") {
            expect(plain.body).toBe(`Protected comment ${row.encryption_version}`);
            if (table === "page_comments") expect(plain.quote).toBe(`Protected quote ${row.encryption_version}`);
          } else {
            expect(plain[table === "issue_events" ? "to_value" : "title"])
              .toBe(`Protected ${table === "issue_events" ? "next" : "wiki"} title ${row.encryption_version}`);
          }
        }
      }
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted objective sources across project key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_objective_source_${suffix}`;
    const restored = `minddy_min591_objective_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(objectiveTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${objectiveTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key) VALUES(${quote(project)},${quote(actor)},'Source','OBJ');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const row = await codec.encode({ id: randomUUID(), project_id: project,
          name: `Private objective ${number}`, description: `Private description ${number}`,
          encryption_version: 0, encrypted_content: null }, { table: "objectives", scope });
        sql(source, `INSERT INTO public.objectives(id,project_id,name,description,encryption_version,encrypted_content)
          VALUES(${quote(String(row.id))},${quote(project)},NULL,NULL,${row.encryption_version},${quote(row.encrypted_content!)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", ...["auth.users", "public.envelope_data_keys",
          "public.projects", "public.objectives"].map((table) => `--table=${table}`)], {
        encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      });
      expect(dump).not.toContain("Private objective");
      expect(dump).not.toContain("Private description");
      expect(dump).not.toContain(root.toString("base64"));
      sql(restored, dump);
      const rows: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(o) FROM public.objectives o;"));
      expect(rows.map((row) => row.encryption_version).sort()).toEqual([1, 2]);
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const row of rows) {
        restoredKeys.invalidate(scope);
        const plain = await restoredCodec.decode(row, { table: "objectives", scope },
          { actorId: actor, reason: "migration_verification" });
        expect(plain).toMatchObject({ name: `Private objective ${row.encryption_version}`,
          description: `Private description ${row.encryption_version}` });
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      await expect(wrong.decode(rows[0], { table: "objectives", scope },
        { actorId: actor, reason: "migration_verification" })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted category names across project key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_category_source_${suffix}`;
    const restored = `minddy_min591_category_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(categoryTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${categoryTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key) VALUES(${quote(project)},${quote(actor)},'Source','CAT');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const row = await codec.encode({ id: randomUUID(), project_id: project,
          name: `Private category ${number}`, color: "#aabbcc",
          encryption_version: 0, encrypted_content: null }, { table: "categories", scope });
        sql(source, `INSERT INTO public.categories(id,project_id,name,color,encryption_version,encrypted_content)
          VALUES(${quote(String(row.id))},${quote(project)},NULL,'#aabbcc',${row.encryption_version},${quote(row.encrypted_content!)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", ...["auth.users", "public.envelope_data_keys",
          "public.projects", "public.categories"].map((table) => `--table=${table}`)], {
        encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      });
      expect(dump).not.toContain("Private category");
      expect(dump).not.toContain(root.toString("base64"));
      sql(restored, dump);
      const rows: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(c) FROM public.categories c;"));
      expect(rows.map((row) => row.encryption_version).sort()).toEqual([1, 2]);
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const row of rows) {
        restoredKeys.invalidate(scope);
        const plain = await restoredCodec.decode(row, { table: "categories", scope },
          { actorId: actor, reason: "migration_verification" });
        expect(plain.name).toBe(`Private category ${row.encryption_version}`);
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      await expect(wrong.decode(rows[0], { table: "categories", scope },
        { actorId: actor, reason: "migration_verification" })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores owner-scoped project drafts and their complete wizard state", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_draft_source_${suffix}`;
    const restored = `minddy_min591_draft_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID();
    const scope: EncryptionScope = { kind: "user", id: actor };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(draftTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${draftTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const row = await codec.encode({ id: randomUUID(), user_id: actor,
          name: `Private draft ${number}`, data: { seed: { text: `Private brief ${number}` } },
          encryption_version: 0, encrypted_content: null }, { table: "project_drafts", scope });
        sql(source, `INSERT INTO public.project_drafts(id,user_id,name,step,data,encryption_version,encrypted_content)
          VALUES(${quote(String(row.id))},${quote(actor)},NULL,'seed',NULL,${row.encryption_version},${quote(row.encrypted_content!)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", ...["auth.users", "public.envelope_data_keys",
          "public.project_drafts"].map((table) => `--table=${table}`)], {
        encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      });
      expect(dump).not.toContain("Private draft");
      expect(dump).not.toContain("Private brief");
      expect(dump).not.toContain(root.toString("base64"));
      sql(restored, dump);
      const rows: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(d) FROM public.project_drafts d;"));
      expect(rows.map((row) => row.encryption_version).sort()).toEqual([1, 2]);
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const row of rows) {
        restoredKeys.invalidate(scope);
        const plain = await restoredCodec.decode(row, { table: "project_drafts", scope },
          { actorId: actor, reason: "migration_verification" });
        expect(plain).toMatchObject({ name: `Private draft ${row.encryption_version}`,
          data: { seed: { text: `Private brief ${row.encryption_version}` } } });
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      await expect(wrong.decode(rows[0], { table: "project_drafts", scope },
        { actorId: actor, reason: "migration_verification" })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores feedback source content and embeddings across project key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_feedback_source_${suffix}`;
    const restored = `minddy_min591_feedback_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(feedbackTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${feedbackTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','FDB');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const row = await codec.encode({ id: randomUUID(), project_id: project,
          title: `Private feedback ${number}`, body: `Private body ${number}`,
          submitted_title: `Submitted title ${number}`, submitted_body: `Submitted body ${number}`,
          translated_title: `Translation ${number}`, translated_body: null,
          moderation_reason: `Moderation reason ${number}`, embedding: "[0.1,0.2,0.3]",
          encryption_version: 0, encrypted_content: null }, { table: "feedback_posts", scope });
        sql(source, `INSERT INTO public.feedback_posts(id,project_id,title,body,submitted_title,
          submitted_body,translated_title,translated_body,moderation_reason,embedding,source,
          encryption_version,encrypted_content) VALUES(${quote(String(row.id))},${quote(project)},
          NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'internal',${row.encryption_version},
          ${quote(row.encrypted_content!)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", ...["auth.users", "public.projects",
          "public.envelope_data_keys", "public.feedback_posts"].map((table) => `--table=${table}`)], {
        encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      });
      for (const secret of ["Private feedback", "Private body", "Submitted title", "Submitted body",
        "Translation", "Moderation reason", "[0.1,0.2,0.3]"]) {
        expect(dump).not.toContain(secret);
      }
      expect(dump).not.toContain(root.toString("base64"));
      sql(restored, dump);
      const rows: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(p) FROM public.feedback_posts p;"));
      expect(rows.map((row) => row.encryption_version).sort()).toEqual([1, 2]);
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const row of rows) {
        restoredKeys.invalidate(scope);
        const plain = await restoredCodec.decode(row, { table: "feedback_posts", scope },
          { actorId: actor, reason: "migration_verification" });
        expect(plain).toMatchObject({ title: `Private feedback ${row.encryption_version}`,
          body: `Private body ${row.encryption_version}`, embedding: "[0.1,0.2,0.3]" });
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      await expect(wrong.decode(rows[0], { table: "feedback_posts", scope },
        { actorId: actor, reason: "migration_verification" })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores an encrypted parent and child issue across project key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_issue_source_${suffix}`;
    const restored = `minddy_min591_issue_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), parent = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(issueTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${issueTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','ISS');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const id = number === 1 ? parent : randomUUID();
        const row = await codec.encode({ id, project_id: project,
          title: `Private issue ${number}`, description: `Private description ${number}`,
          plan: `Private plan ${number}`, remote_url: `https://example.test/private/${number}`,
          automation_override: { prompt: `Private prompt ${number}` },
          encryption_version: 0, encrypted_content: null }, { table: "issues", scope });
        sql(source, `INSERT INTO public.issues(id,project_id,number,parent_id,title,description,
          plan,remote_url,automation_override,encryption_version,encrypted_content)
          VALUES(${quote(id)},${quote(project)},${number},${number === 1 ? "NULL" : quote(parent)},
            NULL,NULL,NULL,NULL,NULL,${row.encryption_version},${quote(row.encrypted_content!)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", ...["auth.users", "public.projects",
          "public.envelope_data_keys", "public.issue_encryption_scopes", "public.issues"]
          .map((table) => `--table=${table}`)], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["Private issue", "Private description", "Private plan",
        "Private prompt", "example.test/private"]) expect(dump).not.toContain(secret);
      sql(restored, dump);
      const rows: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(i ORDER BY number) FROM public.issues i;"));
      expect(rows.map((row) => row.encryption_version)).toEqual([1, 2]);
      expect(rows[1].parent_id).toBe(parent);
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const row of rows) {
        restoredKeys.invalidate(scope);
        const plain = await restoredCodec.decode(row, { table: "issues", scope },
          { actorId: actor, reason: "migration_verification" });
        expect(plain.title).toBe(`Private issue ${row.encryption_version}`);
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      await expect(wrong.decode(rows[0], { table: "issues", scope },
        { actorId: actor, reason: "migration_verification" })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);
});
