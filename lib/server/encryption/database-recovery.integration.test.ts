import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManagedDataKeys, type KeyRegistry, type WrappedDataKey } from "./keys";
import { LocalKeyWrapper } from "./local-key-wrapper";
import { EncryptedStore, blindIndex, type EncryptionScope } from "./store";
import { EncryptedRowCodec, type StoredRow } from "./row-codec";
import { decodeRunJournalRow, encodeRunJournal } from "@/lib/server/agent/run-journal-codec";
import { buildRootSwapSql, parseRegistryOutput, planRootRewrap } from "@/scripts/rewrap-data-root.mjs";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const template = "minddy_min591_full_audit";
const objectiveTemplate = "minddy_min591_objective_audit";
const categoryTemplate = "minddy_min591_category_audit";
const draftTemplate = "minddy_min591_draft_audit";
const feedbackTemplate = "minddy_min591_feedback_audit";
const issueTemplate = "minddy_min591_issue_audit";
const journalTemplate = "minddy_min591_journal_audit";
const eventTemplate = "minddy_min591_event_audit";
const launchTemplate = "minddy_min591_launch_audit";
const titleTemplate = "minddy_min591_title_audit";
const checkpointTemplate = "minddy_min591_checkpoint_audit";
const delegationTemplate = "minddy_min591_delegation_audit";
const standaloneMessageTemplate = "minddy_min591_standalone_audit";
const queueTemplate = "minddy_min591_queue_audit";
const answerTemplate = "minddy_min591_answer_audit";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(database: string, statement: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database], {
    input: statement, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

function wrapper(root: Buffer, purpose: "content" | "blind_index" = "content"): LocalKeyWrapper {
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", root.toString("hex"));
  return new LocalKeyWrapper(purpose);
}

function registry(database: string, purpose: "content" | "blind_index" = "content"): KeyRegistry {
  const predicate = (scope: EncryptionScope) => `scope_kind=${quote(scope.kind)} AND scope_id=${quote(scope.id)} AND purpose=${quote(purpose)}`;
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
      return record(sql(database, `SELECT row_to_json(k) FROM public.create_envelope_data_key_if_absent(${quote(key.scope.kind)},${quote(key.scope.id)},${quote(purpose)},${quote(Buffer.from(key.wrappedKey).toString("base64"))}) k;`), key.scope)!;
    },
    async rotate(key, expected) {
      return sql(database, `SELECT public.rotate_envelope_data_key(${quote(key.scope.kind)},${quote(key.scope.id)},${quote(purpose)},${expected},${quote(Buffer.from(key.wrappedKey).toString("base64"))});`) === "t";
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

  it("restores encrypted issue roots and children across project key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_issue_source_${suffix}`;
    const restored = `minddy_min591_issue_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const firstRoot = randomUUID(), secondRoot = randomUUID();
    const children = Array.from({ length: 5 }, () => randomUUID());
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
      const tree = [
        { number: 1, id: firstRoot, parent: null, keyVersion: 1 },
        { number: 2, id: children[0], parent: firstRoot, keyVersion: 1 },
        { number: 3, id: children[1], parent: firstRoot, keyVersion: 1 },
        { number: 4, id: secondRoot, parent: null, keyVersion: 2 },
        { number: 5, id: children[2], parent: firstRoot, keyVersion: 2 },
        { number: 6, id: children[3], parent: secondRoot, keyVersion: 2 },
        { number: 7, id: children[4], parent: secondRoot, keyVersion: 2 },
      ];
      for (const { number, id, parent, keyVersion } of tree) {
        if (number === 4) await keys.rotate(scope, 1);
        const row = await codec.encode({ id, project_id: project,
          title: `Private issue ${number}`, description: `Private description ${number}`,
          plan: `Private plan ${number}`, remote_url: `https://example.test/private/${number}`,
          automation_override: { prompt: `Private prompt ${number}` },
          encryption_version: 0, encrypted_content: null }, { table: "issues", scope });
        sql(source, `INSERT INTO public.issues(id,project_id,number,parent_id,title,description,
          plan,remote_url,automation_override,encryption_version,encrypted_content)
          VALUES(${quote(id)},${quote(project)},${number},${parent ? quote(parent) : "NULL"},
            NULL,NULL,NULL,NULL,NULL,${row.encryption_version},${quote(row.encrypted_content!)});`);
        expect(row.encryption_version).toBe(keyVersion);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", source,
        "--data-only", "--no-owner", "--no-privileges", ...["auth.users", "public.projects",
          "public.envelope_data_keys", "public.issue_encryption_scopes", "public.issues"]
          .map((table) => `--table=${table}`)], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["Private issue", "Private description", "Private plan",
        "Private prompt", "example.test/private"]) expect(dump).not.toContain(secret);
      // Restore descendants and ancestors in separate COPY statements, in
      // reverse dependency order. A full restore adds FKs after data; the
      // schema-only template already has them, so use the data-only restore's
      // trigger suppression and then recreate the parent FK to validate it.
      const issueCopy = dump.match(/(COPY public\.issues[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(issueCopy).not.toBeNull();
      const [copyStatement, header, body, footer] = issueCopy!;
      const lines = body.trimEnd().split("\n").reverse();
      const dependencies = dump.replace(copyStatement, "");
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      // Each child or parent arrives in its own committed restore batch. This
      // models independent backup streams, rather than one transaction whose
      // deferred references happen to be present by commit time.
      for (const line of lines) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${header}${line}\n${footer}COMMIT;`);
      }
      sql(restored, `ALTER TABLE public.issues DROP CONSTRAINT issues_parent_id_fkey;
        ALTER TABLE public.issues ADD CONSTRAINT issues_parent_id_fkey
          FOREIGN KEY (parent_id) REFERENCES public.issues(id) ON DELETE SET NULL;`);
      const rows: StoredRow[] = JSON.parse(sql(restored, "SELECT json_agg(i ORDER BY number) FROM public.issues i;"));
      expect(rows.map((row) => row.encryption_version)).toEqual(tree.map((node) => node.keyVersion));
      expect(rows.map((row) => row.parent_id)).toEqual(tree.map((node) => node.parent));
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredCodec = new EncryptedRowCodec(new EncryptedStore(restoredKeys));
      for (const row of rows) {
        restoredKeys.invalidate(scope);
        const plain = await restoredCodec.decode(row, { table: "issues", scope },
          { actorId: actor, reason: "migration_verification" });
        expect(plain.title).toBe(`Private issue ${row.number}`);
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

  it("restores encrypted agent journals with their content and index keys", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_journal_source_${suffix}`;
    const restored = `minddy_min591_journal_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const conversation = randomUUID(), run = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(journalTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${journalTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','JRN');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});
        INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
          VALUES(${quote(run)},${quote(project)},${quote(conversation)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const indexKeys = new ManagedDataKeys(registry(source, "blind_index"),
        wrapper(root, "blind_index"));
      const store = new EncryptedStore(keys);
      for (let index = 1; index <= 2; index++) {
        if (index === 2) await keys.rotate(scope, 1);
        const encoded = encodeRunJournal([{ seq: index, output: `Private journal ${index}` }]);
        const searchKey = await indexKeys.current(scope);
        const digest = blindIndex(encoded.sha256,
          { scope, table: "agent_run_journal", column: "payload_sha256" }, searchKey.bytes);
        searchKey.bytes.fill(0);
        const context = { scope, table: "agent_run_journal", column: "payload",
          rowId: JSON.stringify([run, "session", digest]) };
        const ciphertext = await store.encrypt({
          events: null, payload: encoded.payload, payload_sha256: encoded.sha256,
        }, context);
        sql(source, `INSERT INTO public.agent_run_journal(run_id,session_id,events,
          payload,payload_encoding,payload_sha256,event_count,payload_bytes,
          stored_bytes,encryption_version) VALUES(
          ${quote(run)},'session',NULL,${quote(ciphertext)},'encrypted-gzip-json-v1',
          ${quote(digest)},${encoded.eventCount},${encoded.payloadBytes},
          ${encoded.storedBytes},${store.versionOf(ciphertext)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.agent_conversations",
          "public.agent_runs", "public.envelope_data_keys",
          "public.agent_journal_encryption_scopes", "public.agent_run_journal"]
          .map((table) => `--table=${table}`)], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private journal");
      expect(dump).not.toContain(root.toString("base64"));
      sql(restored, dump);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(j ORDER BY id) FROM public.agent_run_journal j;")) as Array<{
        run_id: string; session_id: string; payload: string; payload_sha256: string;
        encryption_version: number; payload_bytes: number; event_count: number;
      }>;
      expect(rows.map((row) => row.encryption_version)).toEqual([1, 2]);
      const restoredKeys = new ManagedDataKeys(registry(restored), wrapper(root));
      const restoredIndexKeys = new ManagedDataKeys(registry(restored, "blind_index"),
        wrapper(root, "blind_index"));
      const restoredStore = new EncryptedStore(restoredKeys);
      for (const [index, row] of rows.entries()) {
        const clear = await restoredStore.decrypt(
          restoredStore.fromDatabase<{ events: null; payload: string; payload_sha256: string }>(row.payload),
          { scope, table: "agent_run_journal", column: "payload",
            rowId: JSON.stringify([row.run_id, row.session_id, row.payload_sha256]) });
        const searchKey = await restoredIndexKeys.current(scope);
        expect(blindIndex(clear.payload_sha256,
          { scope, table: "agent_run_journal", column: "payload_sha256" }, searchKey.bytes))
          .toBe(row.payload_sha256);
        searchKey.bytes.fill(0);
        expect(decodeRunJournalRow({
          payload: clear.payload, payload_encoding: "gzip-json-v1",
          payload_sha256: clear.payload_sha256, payload_bytes: row.payload_bytes,
        }).events).toEqual([{ seq: index + 1, output: `Private journal ${index + 1}` }]);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].payload),
        { scope, table: "agent_run_journal", column: "payload",
          rowId: JSON.stringify([run, "session", rows[0].payload_sha256]) })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted run events and their SQL-created summary and input copies", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_event_source_${suffix}`;
    const restored = `minddy_min591_event_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const conversation = randomUUID(), run = randomUUID();
    const eventIds = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(eventTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${eventTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','EVT');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});
        INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
          VALUES(${quote(run)},${quote(project)},${quote(conversation)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      const payloads = [
        { text: "Private summary from the agent" },
        { question_id: "q1", call_id: "c1",
          questions: [{ question: "Private question from the agent" }] },
      ];
      for (const [index, payload] of payloads.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const encrypted = await store.encrypt(payload, {
          scope, table: "agent_run_events", column: "payload",
          rowId: JSON.stringify([run, eventIds[index]]),
        });
        sql(source, `INSERT INTO public.agent_run_events(
          id,run_id,seq,type,payload,encrypted_content,encryption_version,
          has_summary_text,question_id,call_id,has_questions
        ) VALUES (
          ${quote(eventIds[index])},${quote(run)},${index},
          ${quote(index === 0 ? "summary" : "needs_input")},NULL,
          ${quote(encrypted)},${store.versionOf(encrypted)},${index === 0},
          ${index === 1 ? "'q1'" : "NULL"},${index === 1 ? "'c1'" : "NULL"},
          ${index === 1}
        );`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.agent_conversations",
          "public.agent_runs", "public.agent_turns", "public.envelope_data_keys",
          "public.agent_event_encryption_scopes", "public.agent_run_events",
          "public.agent_messages", "public.agent_run_input_requests"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private summary from the agent");
      expect(dump).not.toContain("Private question from the agent");
      expect(dump).not.toContain(root.toString("base64"));
      // A full schema restore creates triggers after COPY. The schema-only
      // template already has them, so suppress derived-copy triggers during COPY.
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dump}\nCOMMIT;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(e ORDER BY seq) FROM public.agent_run_events e;")) as Array<{
          id: string; encrypted_content: string; encryption_version: number; payload: unknown;
        }>;
      expect(rows.map((row) => row.encryption_version)).toEqual([1, 2]);
      expect(rows.every((row) => row.payload === null)).toBe(true);
      const copies = JSON.parse(sql(restored, `SELECT json_build_object(
        'summary', (SELECT row_to_json(m) FROM public.agent_messages m
          WHERE legacy_event_id=${quote(eventIds[0])}),
        'input', (SELECT row_to_json(i) FROM public.agent_run_input_requests i
          WHERE source_event_id=${quote(eventIds[1])}));`)) as {
        summary: { content: string; content_encryption_version: number };
        input: { questions: unknown; encrypted_questions: string; questions_encryption_version: number };
      };
      expect(copies.summary.content).toBe(rows[0].encrypted_content);
      expect(copies.input.questions).toBeNull();
      expect(copies.input.encrypted_questions).toBe(rows[1].encrypted_content);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, row] of rows.entries()) {
        const clear = await cold.decrypt(cold.fromDatabase(row.encrypted_content), {
          scope, table: "agent_run_events", column: "payload",
          rowId: JSON.stringify([run, row.id]),
        });
        expect(clear).toEqual(payloads[index]);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].encrypted_content), {
        scope, table: "agent_run_events", column: "payload",
        rowId: JSON.stringify([run, rows[0].id]),
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted launch prompts and SQL-created initial messages across key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_launch_source_${suffix}`;
    const restored = `minddy_min591_launch_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(launchTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${launchTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','LCH');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      const contents = runs.map((_, index) => ({
        prompt: `Private launch prompt ${index + 1}`,
        prompt_mentions: [{ id: `issue-${index + 1}`, label: `Private mention ${index + 1}` }],
      }));
      for (const [index, run] of runs.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const encrypted = await store.encrypt(contents[index], {
          scope, table: "agent_runs", column: "launch_content", rowId: run,
        });
        sql(source, `INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
          prompt,prompt_mentions,encrypted_launch_content,launch_encryption_version,has_launch_prompt)
          VALUES(${quote(run)},${quote(project)},${quote(conversation)},${quote(actor)},
            NULL,NULL,${quote(encrypted)},${store.versionOf(encrypted)},true);`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.agent_conversations",
          "public.agent_runs", "public.agent_turns", "public.envelope_data_keys",
          "public.agent_launch_encryption_scopes", "public.agent_messages"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private launch prompt");
      expect(dump).not.toContain("Private mention");
      expect(dump).not.toContain(root.toString("base64"));
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dump}\nCOMMIT;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(r ORDER BY r.created_at, r.id) FROM public.agent_runs r;")) as Array<{
          id: string; prompt: string | null; prompt_mentions: unknown;
          encrypted_launch_content: string; launch_encryption_version: number;
        }>;
      expect(rows.map((row) => row.launch_encryption_version).sort()).toEqual([1, 2]);
      expect(rows.every((row) => row.prompt === null && row.prompt_mentions === null)).toBe(true);
      const copies = JSON.parse(sql(restored,
        "SELECT json_agg(m) FROM public.agent_messages m WHERE source='initial_prompt';")) as Array<{
          run_id: string; content: string; content_encryption_version: number;
        }>;
      expect(copies).toHaveLength(2);
      for (const copy of copies) {
        const run = rows.find((row) => row.id === copy.run_id)!;
        expect(copy.content).toBe(run.encrypted_launch_content);
        expect(copy.content_encryption_version).toBe(run.launch_encryption_version);
      }
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, run] of runs.entries()) {
        const row = rows.find((item) => item.id === run)!;
        const plain = await cold.decrypt(cold.fromDatabase(row.encrypted_launch_content), {
          scope, table: "agent_runs", column: "launch_content", rowId: run,
        });
        expect(plain).toEqual(contents[index]);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].encrypted_launch_content), {
        scope, table: "agent_runs", column: "launch_content", rowId: rows[0].id,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores standalone transcript messages before their parent conversation in independent batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_message_source_${suffix}`;
    const restored = `minddy_min591_message_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const messages = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(standaloneMessageTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${standaloneMessageTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','MSG');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, message] of messages.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt(`Private transcript ${index + 1}`, {
          scope, table: "agent_messages", column: "content", rowId: message,
        });
        sql(source, `INSERT INTO public.agent_messages(id,conversation_id,role,source,
          content,content_encryption_version) VALUES(${quote(message)},
          ${quote(conversation)},${quote(index ? "user" : "system")},
          ${quote(index ? "steering" : "system")},${quote(cipher)},${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_launch_encryption_scopes", "public.agent_conversations",
          "public.agent_messages"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private transcript");
      expect(dump).not.toContain(root.toString("base64"));
      let dependencies = dump;
      const copies = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_messages", "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        copies.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_messages", "agent_conversations"]) {
        const copy = copies.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_messages DROP CONSTRAINT agent_messages_conversation_id_fkey;
        ALTER TABLE public.agent_messages ADD CONSTRAINT agent_messages_conversation_id_fkey
          FOREIGN KEY (conversation_id) REFERENCES public.agent_conversations(id) ON DELETE CASCADE;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(m) FROM public.agent_messages m;")) as Array<{
          id: string; conversation_id: string; content: string; content_encryption_version: number;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.conversation_id === conversation)).toBe(true);
      expect(rows.map((row) => row.content_encryption_version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, message] of messages.entries()) {
        const row = rows.find((item) => item.id === message)!;
        expect(await cold.decrypt(cold.fromDatabase(row.content), {
          scope, table: "agent_messages", column: "content", rowId: message,
        })).toBe(`Private transcript ${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].content), {
        scope, table: "agent_messages", column: "content", rowId: rows[0].id,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores queued steering and SQL copies before parent runs in independent batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_queue_source_${suffix}`;
    const restored = `minddy_min591_queue_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const run = randomUUID(), messages = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(queueTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${queueTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','QRM');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});
        INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
          VALUES(${quote(run)},${quote(project)},${quote(conversation)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, message] of messages.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt({ content: `Private queue ${index + 1}`,
          mentions: [{ label: `Private mention ${index + 1}` }] }, {
          scope, table: "agent_run_messages", column: "content", rowId: message,
        });
        sql(source, `INSERT INTO public.agent_run_messages(id,run_id,created_by,
          content,content_encryption_version) VALUES(${quote(message)},
          ${quote(run)},${quote(actor)},${quote(cipher)},${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_launch_encryption_scopes", "public.agent_conversations",
          "public.agent_runs", "public.agent_turns", "public.agent_run_messages",
          "public.agent_messages"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private queue");
      expect(dump).not.toContain("Private mention");
      expect(dump).not.toContain(root.toString("base64"));
      let dependencies = dump;
      const children = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_messages", "agent_run_messages", "agent_turns",
        "agent_runs", "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        children.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const copy of children.values()) {
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_run_messages
          DROP CONSTRAINT agent_run_messages_run_id_fkey;
        ALTER TABLE public.agent_run_messages
          ADD CONSTRAINT agent_run_messages_run_id_fkey FOREIGN KEY (run_id)
            REFERENCES public.agent_runs(id) ON DELETE CASCADE;
        ALTER TABLE public.agent_messages
          DROP CONSTRAINT agent_messages_legacy_queue_message_id_fkey;
        ALTER TABLE public.agent_messages
          ADD CONSTRAINT agent_messages_legacy_queue_message_id_fkey
            FOREIGN KEY (legacy_queue_message_id)
            REFERENCES public.agent_run_messages(id) ON DELETE CASCADE;
        ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_conversation_project_fkey;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_conversation_project_fkey
          FOREIGN KEY (conversation_id,project_id)
            REFERENCES public.agent_conversations(id,project_id);`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(q) FROM public.agent_run_messages q;")) as Array<{
          id: string; content: string; content_encryption_version: number;
        }>;
      const copies = JSON.parse(sql(restored,
        "SELECT json_agg(m) FROM public.agent_messages m WHERE legacy_queue_message_id IS NOT NULL;")) as Array<{
          legacy_queue_message_id: string; content: string; content_encryption_version: number;
        }>;
      expect(rows.map((row) => row.content_encryption_version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, message] of messages.entries()) {
        const row = rows.find((item) => item.id === message)!;
        const copy = copies.find((item) => item.legacy_queue_message_id === message)!;
        expect(copy.content).toBe(row.content);
        expect(copy.content_encryption_version).toBe(row.content_encryption_version);
        expect(await cold.decrypt(cold.fromDatabase(row.content), {
          scope, table: "agent_run_messages", column: "content", rowId: message,
        })).toEqual({ content: `Private queue ${index + 1}`,
          mentions: [{ label: `Private mention ${index + 1}` }] });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].content), {
        scope, table: "agent_run_messages", column: "content", rowId: rows[0].id,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted worker answers and parent copies across independent child-first batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_answer_source_${suffix}`;
    const restored = `minddy_min591_answer_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const parent = randomUUID(), parentTurn = randomUUID(), run = randomUUID();
    const messages = [randomUUID(), randomUUID()];
    const requests = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(answerTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${answerTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','ANS');
        INSERT INTO public.conversations(id,user_id) VALUES(${quote(parent)},${quote(actor)});
        INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,
          run_id,status) VALUES(${quote(parentTurn)},${quote(parent)},${quote(actor)},
          gen_random_uuid(),gen_random_uuid(),'queued');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});
        INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
          parent_numo_conversation_id,parent_numo_turn_id,parent_numo_tool_call_id,
          delegation_brief) VALUES(${quote(run)},${quote(project)},${quote(conversation)},
          ${quote(actor)},${quote(parent)},${quote(parentTurn)},'fixture-call',
          jsonb_build_object('version',1,'correlation',jsonb_build_object(
            'parentConversationId',${quote(parent)},'parentTurnId',${quote(parentTurn)},
            'toolCallId','fixture-call'),'targetRepository',jsonb_build_object(
            'projectId',${quote(project)}),'objective','Fixture answer',
            'sourceReferences','[]'::jsonb,'constraints','[]'::jsonb,
            'authorizedWork','["fixture"]'::jsonb,'expectedOutput','["fixture"]'::jsonb));`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, message] of messages.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const queue = await store.encrypt({ content: `Private worker answer ${index + 1}`,
          mentions: null }, { scope, table: "agent_run_messages", column: "content",
          rowId: message });
        const answer = await store.encrypt(`Private worker answer ${index + 1}`, {
          scope, table: "agent_run_input_requests", column: "answer", rowId: requests[index],
        });
        const parentContent = await store.encrypt({
          content: `Private parent answer ${index + 1}`,
          context: { page: `Private context ${index + 1}` },
          metadata: { attachment: `Private metadata ${index + 1}` },
        }, { scope, table: "assistant_messages", column: "content", rowId: message });
        sql(source, `INSERT INTO public.agent_run_messages(id,run_id,created_by,content,
            content_encryption_version) VALUES(${quote(message)},${quote(run)},
            ${quote(actor)},${quote(queue)},${store.versionOf(queue)});
          INSERT INTO public.agent_run_input_requests(id,run_id,question_id,call_id,
            questions,status,answer,answer_encryption_version,answer_message_id,answered_at)
            VALUES(${quote(requests[index])},${quote(run)},${quote(`question-${index}`)},
              ${quote(`call-${index}`)},'["Fixture question"]'::jsonb,'answered',
              ${quote(answer)},${store.versionOf(answer)},${quote(message)},now());
          INSERT INTO public.assistant_messages(id,conversation_id,role,content,metadata,
            worker_content_encryption_version) VALUES(${quote(message)},${quote(parent)},
              'user',${quote(parentContent)},jsonb_build_object('worker_input',
                jsonb_build_object('run_id',${quote(run)})),${store.versionOf(parentContent)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_launch_encryption_scopes", "public.conversations",
          "public.numo_assistant_turns", "public.agent_conversations", "public.agent_runs",
          "public.agent_turns", "public.agent_run_messages", "public.agent_messages",
          "public.agent_run_input_requests", "public.assistant_messages"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 6 * 1024 * 1024 });
      for (const secret of ["Private worker answer", "Private parent answer",
        "Private context", "Private metadata"]) expect(dump).not.toContain(secret);
      expect(dump).not.toContain(root.toString("base64"));
      let dependencies = dump;
      const children = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["assistant_messages", "agent_run_input_requests",
        "agent_messages", "agent_run_messages", "agent_turns", "agent_runs",
        "agent_conversations", "numo_assistant_turns", "conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        children.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const copy of children.values()) {
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      for (const [table, constraint, columns, reference] of [
        ["agent_run_input_requests", "agent_run_input_requests_run_id_fkey", "run_id", "agent_runs(id)"],
        ["agent_run_input_requests", "agent_run_input_requests_parent_numo_turn_id_fkey",
          "parent_numo_turn_id", "numo_assistant_turns(id)"],
        ["assistant_messages", "assistant_messages_conversation_id_fkey",
          "conversation_id", "conversations(id)"],
        ["agent_messages", "agent_messages_legacy_queue_message_id_fkey",
          "legacy_queue_message_id", "agent_run_messages(id)"],
      ]) {
        sql(restored, `ALTER TABLE public.${table} DROP CONSTRAINT ${constraint};
          ALTER TABLE public.${table} ADD CONSTRAINT ${constraint}
            FOREIGN KEY (${columns}) REFERENCES public.${reference};`);
      }
      const queueRows = JSON.parse(sql(restored,
        "SELECT json_agg(q) FROM public.agent_run_messages q;")) as Array<{
          id: string; content: string; content_encryption_version: number;
        }>;
      const answerRows = JSON.parse(sql(restored,
        "SELECT json_agg(i) FROM public.agent_run_input_requests i;")) as Array<{
          id: string; answer: string; answer_encryption_version: number;
        }>;
      const parentRows = JSON.parse(sql(restored,
        "SELECT json_agg(m) FROM public.assistant_messages m;")) as Array<{
          id: string; content: string; worker_content_encryption_version: number;
        }>;
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, message] of messages.entries()) {
        const q = queueRows.find((row) => row.id === message)!;
        const a = answerRows.find((row) => row.id === requests[index])!;
        const p = parentRows.find((row) => row.id === message)!;
        expect([q.content_encryption_version, a.answer_encryption_version,
          p.worker_content_encryption_version]).toEqual([index + 1, index + 1, index + 1]);
        expect(await cold.decrypt(cold.fromDatabase(q.content), {
          scope, table: "agent_run_messages", column: "content", rowId: message,
        })).toMatchObject({ content: `Private worker answer ${index + 1}` });
        expect(await cold.decrypt(cold.fromDatabase(a.answer), {
          scope, table: "agent_run_input_requests", column: "answer", rowId: requests[index],
        })).toBe(`Private worker answer ${index + 1}`);
        expect(await cold.decrypt(cold.fromDatabase(p.content), {
          scope, table: "assistant_messages", column: "content", rowId: message,
        })).toMatchObject({ content: `Private parent answer ${index + 1}` });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(answerRows[0].answer), {
        scope, table: "agent_run_input_requests", column: "answer", rowId: requests[0],
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted run and conversation titles with children before parents in committed batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_title_source_${suffix}`;
    const restored = `minddy_min591_title_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(titleTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${titleTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','TTL');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, run] of runs.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt(`Private title ${index + 1}`, {
          scope, table: "agent_conversations", column: "title", rowId: run,
        });
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,
          continued_from_run_id,title,title_ciphertext,title_encryption_version)
          VALUES(${quote(run)},${quote(project)},${quote(actor)},
            ${index ? quote(runs[0]) : "NULL"},NULL,${quote(cipher)},
            ${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_title_encryption_scopes", "public.agent_conversations",
          "public.agent_runs", "public.agent_turns"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private title");
      expect(dump).not.toContain(root.toString("base64"));
      let dependencies = dump;
      const copies = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_turns", "agent_runs", "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        copies.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_turns", "agent_runs", "agent_conversations"]) {
        const copy = copies.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_conversation_project_fkey;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_conversation_project_fkey
          FOREIGN KEY (conversation_id,project_id)
          REFERENCES public.agent_conversations(id,project_id) ON DELETE CASCADE;
        ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_continued_from_run_id_fkey;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_continued_from_run_id_fkey
          FOREIGN KEY (continued_from_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;
        ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_run_id_fkey;
        ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_run_id_fkey
          FOREIGN KEY (run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;
        ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_conversation_id_fkey;
        ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_conversation_id_fkey
          FOREIGN KEY (conversation_id) REFERENCES public.agent_conversations(id) ON DELETE CASCADE;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(r ORDER BY r.created_at,r.id) FROM public.agent_runs r;")) as Array<{
          id: string; conversation_id: string; title: string | null;
          title_ciphertext: string; title_encryption_version: number;
          continued_from_run_id: string | null;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === runs[1])?.continued_from_run_id).toBe(runs[0]);
      expect(rows.map((row) => row.title_encryption_version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, run] of runs.entries()) {
        const row = rows.find((item) => item.id === run)!;
        expect(row.title).toBeNull();
        const conversation = JSON.parse(sql(restored,
          `SELECT row_to_json(c) FROM public.agent_conversations c WHERE id=${quote(row.conversation_id)};`));
        expect(conversation.title).toBeNull();
        expect(conversation.title_ciphertext).toBe(row.title_ciphertext);
        for (const cipher of [row.title_ciphertext, conversation.title_ciphertext]) {
          expect(await cold.decrypt(cold.fromDatabase(cipher), {
            scope, table: "agent_conversations", column: "title", rowId: row.conversation_id,
          })).toBe(`Private title ${index + 1}`);
        }
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].title_ciphertext), {
        scope, table: "agent_conversations", column: "title", rowId: rows[0].conversation_id,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted checkpoints and runtime copies across independent child-first batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_checkpoint_source_${suffix}`;
    const restored = `minddy_min591_checkpoint_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(checkpointTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${checkpointTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','CPR');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, run] of runs.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt({ messages: [{ role: "user",
          content: `Private checkpoint ${index + 1}` }] }, {
          scope, table: "agent_runs", column: "checkpoint", rowId: run,
        });
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,
          continued_from_run_id,checkpoint,checkpoint_ciphertext,checkpoint_encryption_version)
          VALUES(${quote(run)},${quote(project)},${quote(actor)},
            ${index ? quote(runs[0]) : "NULL"},NULL,${quote(cipher)},
            ${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_checkpoint_encryption_scopes", "public.agent_conversations",
          "public.agent_runs", "public.agent_turns", "public.agent_runtime_sessions"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private checkpoint");
      expect(dump).not.toContain(root.toString("base64"));
      let dependencies = dump;
      const copies = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_runtime_sessions", "agent_turns", "agent_runs",
        "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        copies.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_runtime_sessions", "agent_turns", "agent_runs",
        "agent_conversations"]) {
        const copy = copies.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_conversation_project_fkey;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_conversation_project_fkey
          FOREIGN KEY (conversation_id,project_id)
          REFERENCES public.agent_conversations(id,project_id) ON DELETE CASCADE;
        ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_continued_from_run_id_fkey;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_continued_from_run_id_fkey
          FOREIGN KEY (continued_from_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;
        ALTER TABLE public.agent_runtime_sessions DROP CONSTRAINT agent_runtime_sessions_current_run_id_fkey;
        ALTER TABLE public.agent_runtime_sessions ADD CONSTRAINT agent_runtime_sessions_current_run_id_fkey
          FOREIGN KEY (current_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;
        ALTER TABLE public.agent_runtime_sessions DROP CONSTRAINT agent_runtime_sessions_conversation_id_fkey;
        ALTER TABLE public.agent_runtime_sessions ADD CONSTRAINT agent_runtime_sessions_conversation_id_fkey
          FOREIGN KEY (conversation_id) REFERENCES public.agent_conversations(id) ON DELETE CASCADE;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(r ORDER BY r.created_at,r.id) FROM public.agent_runs r;")) as Array<{
          id: string; conversation_id: string; continued_from_run_id: string | null;
          checkpoint: unknown; checkpoint_ciphertext: string;
          checkpoint_encryption_version: number;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === runs[1])?.continued_from_run_id).toBe(runs[0]);
      expect(rows.map((row) => row.checkpoint_encryption_version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, run] of runs.entries()) {
        const row = rows.find((item) => item.id === run)!;
        const runtime = JSON.parse(sql(restored,
          `SELECT row_to_json(s) FROM public.agent_runtime_sessions s WHERE conversation_id=${quote(row.conversation_id)};`));
        expect(row.checkpoint).toBeNull();
        expect(runtime.checkpoint).toBeNull();
        expect(runtime.current_run_id).toBe(run);
        expect(runtime.checkpoint_ciphertext).toBe(row.checkpoint_ciphertext);
        for (const cipher of [row.checkpoint_ciphertext, runtime.checkpoint_ciphertext]) {
          expect(await cold.decrypt(cold.fromDatabase(cipher), {
            scope, table: "agent_runs", column: "checkpoint", rowId: run,
          })).toEqual({ messages: [{ role: "user", content: `Private checkpoint ${index + 1}` }] });
        }
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].checkpoint_ciphertext), {
        scope, table: "agent_runs", column: "checkpoint", rowId: rows[0].id,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted delegation inputs with parent turns loaded after child runs", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_delegation_source_${suffix}`;
    const restored = `minddy_min591_delegation_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const parent = randomUUID(), runs = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(delegationTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${delegationTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','DLG');
        INSERT INTO public.conversations(id,project_id,user_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});
        INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,
          status,claim_token,claimed_at) VALUES(${quote(parent)},${quote(conversation)},
          ${quote(actor)},gen_random_uuid(),gen_random_uuid(),'running',gen_random_uuid(),now());`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, run] of runs.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt({ delegation_brief: {
          version: 1, objective: `Private delegation ${index + 1}`,
          correlation: { parentConversationId: conversation, parentTurnId: parent,
            toolCallId: `tool-${index}` },
          targetRepository: { projectId: project }, sourceReferences: [],
          constraints: [], authorizedWork: ["read_repository"], expectedOutput: ["summary"],
        }, delegation_attachments: [{ name: `Private attachment ${index + 1}` }] }, {
          scope, table: "agent_runs", column: "delegation_input", rowId: run,
        });
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,
          parent_numo_conversation_id,parent_numo_turn_id,parent_numo_tool_call_id,
          continued_from_run_id,encrypted_delegation_input,delegation_encryption_version)
          VALUES(${quote(run)},${quote(project)},${quote(actor)},${quote(conversation)},
            ${quote(parent)},${quote(`tool-${index}`)},
            ${index ? quote(runs[0]) : "NULL"},${quote(cipher)},${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.conversations",
          "public.numo_assistant_turns", "public.envelope_data_keys",
          "public.agent_delegation_encryption_scopes", "public.agent_conversations",
          "public.agent_runs", "public.agent_turns", "public.agent_runtime_sessions"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private delegation");
      expect(dump).not.toContain("Private attachment");
      expect(dump).not.toContain(root.toString("base64"));
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_runtime_sessions", "agent_turns", "agent_runs",
        "agent_conversations", "numo_assistant_turns", "conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_runtime_sessions", "agent_turns", "agent_runs",
        "agent_conversations", "numo_assistant_turns", "conversations"]) {
        const copy = batches.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_parent_numo_turn_fk;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_parent_numo_turn_fk
          FOREIGN KEY (parent_numo_turn_id,parent_numo_conversation_id)
          REFERENCES public.numo_assistant_turns(id,conversation_id) ON DELETE CASCADE;
        ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_continued_from_run_id_fkey;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_continued_from_run_id_fkey
          FOREIGN KEY (continued_from_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;
        ALTER TABLE public.numo_assistant_turns DROP CONSTRAINT numo_assistant_turns_conversation_id_fkey;
        ALTER TABLE public.numo_assistant_turns ADD CONSTRAINT numo_assistant_turns_conversation_id_fkey
          FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(r ORDER BY r.created_at,r.id) FROM public.agent_runs r;")) as Array<{
          id: string; continued_from_run_id: string | null; delegation_brief: unknown;
          delegation_attachments: unknown[]; encrypted_delegation_input: string;
          delegation_encryption_version: number;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === runs[1])?.continued_from_run_id).toBe(runs[0]);
      expect(rows.map((row) => row.delegation_encryption_version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, run] of runs.entries()) {
        const row = rows.find((item) => item.id === run)!;
        expect(row.delegation_brief).toBeNull();
        expect(row.delegation_attachments).toEqual([]);
        const clear = await cold.decrypt(cold.fromDatabase<{ delegation_brief: { objective: string };
          delegation_attachments: Array<{ name: string }> }>(row.encrypted_delegation_input), {
          scope, table: "agent_runs", column: "delegation_input", rowId: run,
        });
        expect(clear.delegation_brief.objective).toBe(`Private delegation ${index + 1}`);
        expect(clear.delegation_attachments[0].name).toBe(`Private attachment ${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].encrypted_delegation_input), {
        scope, table: "agent_runs", column: "delegation_input", rowId: rows[0].id,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);
});
