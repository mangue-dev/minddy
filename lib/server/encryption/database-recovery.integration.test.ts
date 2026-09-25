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
const contextTemplate = "minddy_min591_context_audit";
const verdictTemplate = "minddy_min591_verdict_audit";
const deploymentTemplate = "minddy_min591_deployment_audit";
const baseBranchTemplate = "minddy_min591_base_branch_audit";
const workBranchTemplate = "minddy_min591_work_branch_audit";
const resultTemplate = "minddy_min591_result_audit";
const summaryTemplate = "minddy_min591_summary_audit";
const prUrlTemplate = "minddy_min591_pr_url_audit";
const sharedPrUrlTemplate = "minddy_min591_relay_audit_audit";
const attachmentTemplate = "minddy_min591_attachment_metadata_audit";
const operationTemplate = "minddy_min591_operation_audit";
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

  it("restores agent context snapshots before their conversation across key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_context_source_${suffix}`;
    const restored = `minddy_min591_context_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const resources = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(contextTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${contextTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','CTX');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, resource] of resources.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const rowId = `${conversation}:issue:${resource}`;
        const cipher = await store.encrypt({ title: `Private context ${index + 1}` }, {
          scope, table: "agent_conversation_contexts", column: "snapshot", rowId,
        });
        sql(source, `INSERT INTO public.agent_conversation_contexts(
          conversation_id,kind,resource_id,snapshot,snapshot_ciphertext,
          snapshot_encryption_version) VALUES(${quote(conversation)},'issue',
          ${quote(resource)},'{}',${quote(cipher)},${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_conversations", "public.agent_conversation_contexts",
          "public.agent_context_encryption_scopes"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private context");
      expect(dump).not.toContain(root.toString("base64"));
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_conversation_contexts", "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_conversation_contexts", "agent_conversations"]) {
        const copy = batches.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_conversation_contexts
          DROP CONSTRAINT agent_conversation_contexts_conversation_id_fkey;
        ALTER TABLE public.agent_conversation_contexts
          ADD CONSTRAINT agent_conversation_contexts_conversation_id_fkey
          FOREIGN KEY (conversation_id) REFERENCES public.agent_conversations(id) ON DELETE CASCADE;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(x ORDER BY x.resource_id) FROM public.agent_conversation_contexts x;")) as Array<{
          conversation_id: string; kind: string; resource_id: string;
          snapshot: Record<string, unknown>; snapshot_ciphertext: string;
          snapshot_encryption_version: number;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.snapshot_encryption_version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, resource] of resources.entries()) {
        const row = rows.find((item) => item.resource_id === resource)!;
        expect(row.snapshot).toEqual({});
        const clear = await cold.decrypt(cold.fromDatabase<{ title: string }>(
          row.snapshot_ciphertext), { scope, table: "agent_conversation_contexts",
          column: "snapshot", rowId: `${conversation}:issue:${resource}` });
        expect(clear.title).toBe(`Private context ${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].snapshot_ciphertext), {
        scope, table: "agent_conversation_contexts", column: "snapshot",
        rowId: `${conversation}:issue:${rows[0].resource_id}`,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted verdicts with run and turn references in separate batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_verdict_source_${suffix}`;
    const restored = `minddy_min591_verdict_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(verdictTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${verdictTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','AVD');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, runId] of runs.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt({ ok: false,
          summary: `Private verdict ${index + 1}`, blockers: ["Private blocker"] },
        { scope, table: "agent_runs", column: "verdict", rowId: runId });
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,
          verdict_ciphertext,verdict_encryption_version)
          VALUES(${quote(runId)},${quote(project)},${quote(actor)},
            ${quote(cipher)},${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_conversations", "public.agent_runs", "public.agent_turns",
          "public.agent_verdict_encryption_scopes"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private verdict");
      expect(dump).not.toContain("Private blocker");
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_turns", "agent_runs", "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_turns", "agent_runs", "agent_conversations"]) {
        const copy = batches.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      const rows = JSON.parse(sql(restored, `SELECT json_agg(json_build_object(
        'id',r.id,'verdict',r.verdict,'cipher',r.verdict_ciphertext,
        'version',r.verdict_encryption_version) ORDER BY r.id)
        FROM public.agent_runs r JOIN public.agent_conversations c
          ON c.id=r.conversation_id AND c.project_id=r.project_id
        JOIN public.agent_turns t ON t.run_id=r.id;`)) as Array<{
          id: string; verdict: null; cipher: string; version: number;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, runId] of runs.entries()) {
        const row = rows.find((item) => item.id === runId)!;
        expect(row.verdict).toBeNull();
        const clear = await cold.decrypt(cold.fromDatabase<{ summary: string }>(row.cipher),
          { scope, table: "agent_runs", column: "verdict", rowId: runId });
        expect(clear.summary).toBe(`Private verdict ${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].cipher),
        { scope, table: "agent_runs", column: "verdict", rowId: rows[0].id }))
        .rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted deployment affinity and its equality key across run batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_deployment_source_${suffix}`;
    const restored = `minddy_min591_deployment_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const url = "private-preview.vercel.app";
    const scope: EncryptionScope = { kind: "project", id: project };
    const indexScope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const indexContext = { scope: indexScope, table: "agent_runs", column: "deployment_url" };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(deploymentTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${deploymentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','ADE');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const indexKeys = new ManagedDataKeys(registry(source, "blind_index"),
        wrapper(root, "blind_index"));
      const store = new EncryptedStore(keys);
      const indexKey = await indexKeys.current(indexScope);
      const index = blindIndex(url, indexContext, indexKey.bytes);
      indexKey.bytes.fill(0);
      for (const [position, runId] of runs.entries()) {
        if (position === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt(url, {
          scope, table: "agent_runs", column: "deployment_url", rowId: runId,
        });
        const encoded = `mdye3:${index}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,deployment_url)
          VALUES(${quote(runId)},${quote(project)},${quote(actor)},${quote(encoded)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_conversations", "public.agent_runs", "public.agent_turns",
          "public.agent_deployment_encryption_scopes"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain(url);
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_turns", "agent_runs", "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_turns", "agent_runs", "agent_conversations"]) {
        const copy = batches.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      const rows = JSON.parse(sql(restored, `SELECT json_agg(json_build_object(
        'id',r.id,'encoded',r.deployment_url) ORDER BY r.id)
        FROM public.agent_runs r JOIN public.agent_conversations c
          ON c.id=r.conversation_id AND c.project_id=r.project_id
        JOIN public.agent_turns t ON t.run_id=r.id;`)) as Array<{
          id: string; encoded: string;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => Number(row.encoded.split(":")[2])).sort()).toEqual([1, 2]);
      const coldIndexKeys = new ManagedDataKeys(registry(restored, "blind_index"),
        wrapper(root, "blind_index"));
      const coldIndexKey = await coldIndexKeys.current(indexScope);
      const coldIndex = blindIndex(url, indexContext, coldIndexKey.bytes);
      coldIndexKey.bytes.fill(0);
      expect(coldIndex).toBe(index);
      expect(sql(restored, `SELECT count(*) FROM public.agent_runs
        WHERE deployment_url LIKE ${quote(`mdye3:${coldIndex}:%`)};`)).toBe("2");
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const row of rows) {
        const serialized = Buffer.from(row.encoded.split(":")[3], "base64url").toString("utf8");
        const clear = await cold.decrypt(cold.fromDatabase<string>(serialized),
          { scope, table: "agent_runs", column: "deployment_url", rowId: row.id });
        expect(clear).toBe(url);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase<string>(
        Buffer.from(rows[0].encoded.split(":")[3], "base64url").toString("utf8")),
      { scope, table: "agent_runs", column: "deployment_url", rowId: rows[0].id }))
        .rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores run and runtime base branches after independent child-first batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_base_source_${suffix}`;
    const restored = `minddy_min591_base_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const branch = "private/issue-591";
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(baseBranchTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${baseBranchTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','ABB');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [position, runId] of runs.entries()) {
        if (position === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt(branch, {
          scope, table: "agent_runs", column: "base_branch", rowId: runId,
        });
        const encoded = `mdyb3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,base_branch)
          VALUES(${quote(runId)},${quote(project)},${quote(actor)},${quote(encoded)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_conversations", "public.agent_runs", "public.agent_turns",
          "public.agent_runtime_sessions", "public.agent_base_branch_encryption_scopes"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain(branch);
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_turns", "agent_runtime_sessions", "agent_runs",
        "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_turns", "agent_runtime_sessions", "agent_runs",
        "agent_conversations"]) {
        const copy = batches.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_runtime_sessions
        DROP CONSTRAINT agent_runtime_sessions_current_run_id_fkey;
        ALTER TABLE public.agent_runtime_sessions ADD CONSTRAINT agent_runtime_sessions_current_run_id_fkey
          FOREIGN KEY(current_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;
        ALTER TABLE public.agent_runtime_sessions
        DROP CONSTRAINT agent_runtime_sessions_conversation_id_fkey;
        ALTER TABLE public.agent_runtime_sessions ADD CONSTRAINT agent_runtime_sessions_conversation_id_fkey
          FOREIGN KEY(conversation_id) REFERENCES public.agent_conversations(id) ON DELETE CASCADE;`);
      const rows = JSON.parse(sql(restored, `SELECT json_agg(json_build_object(
        'id',r.id,'encoded',r.base_branch,'copy',s.base_branch) ORDER BY r.id)
        FROM public.agent_runs r JOIN public.agent_runtime_sessions s
          ON s.current_run_id=r.id AND s.conversation_id=r.conversation_id
        JOIN public.agent_turns t ON t.run_id=r.id;`)) as Array<{
          id: string; encoded: string; copy: string;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => Number(row.encoded.split(":")[1])).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const row of rows) {
        expect(row.copy).toBe(row.encoded);
        const serialized = Buffer.from(row.encoded.split(":")[2], "base64url").toString("utf8");
        expect(await cold.decrypt(cold.fromDatabase<string>(serialized),
          { scope, table: "agent_runs", column: "base_branch", rowId: row.id }))
          .toBe(branch);
      }
      const detachedRunId = randomUUID();
      const detachedCiphertext = await cold.encrypt(branch, {
        scope, table: "agent_runs", column: "base_branch", rowId: detachedRunId,
      });
      const detachedEncoded = `mdyb3:${cold.versionOf(detachedCiphertext)}:${Buffer.from(detachedCiphertext).toString("base64url")}`;
      const retainedConversation = sql(restored, `SELECT conversation_id FROM public.agent_runs
        WHERE id=${quote(rows[0].id)};`);
      sql(restored, `INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,base_branch)
        VALUES(${quote(detachedRunId)},${quote(project)},${quote(retainedConversation)},
          ${quote(actor)},${quote(detachedEncoded)});`);
      sql(restored, `DELETE FROM public.agent_runs WHERE id=${quote(detachedRunId)};`);
      const detached = JSON.parse(sql(restored, `SELECT row_to_json(s)
        FROM public.agent_runtime_sessions s WHERE base_branch_bound_run_id=${quote(detachedRunId)};`)) as {
          current_run_id: null; base_branch_bound_run_id: string; base_branch: string;
        };
      expect(detached.current_run_id).toBeNull();
      expect(detached.base_branch).toBe(detachedEncoded);
      const detachedCipher = Buffer.from(detached.base_branch.split(":")[2],
        "base64url").toString("utf8");
      expect(await cold.decrypt(cold.fromDatabase<string>(detachedCipher),
        { scope, table: "agent_runs", column: "base_branch", rowId: detached.base_branch_bound_run_id }))
        .toBe(branch);
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        rows[0].encoded.split(":")[2], "base64url").toString("utf8")),
      { scope, table: "agent_runs", column: "base_branch", rowId: rows[0].id }))
        .rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted run, runtime and artifact work branches across key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_work_source_${suffix}`;
    const restored = `minddy_min591_work_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const branches = ["private/issue-591-first", "private/issue-591-second"];
    const scope: EncryptionScope = { kind: "project", id: project };
    const system: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(workBranchTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${workBranchTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','AWB');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const indexKeys = new ManagedDataKeys(registry(source, "blind_index"),
        wrapper(root, "blind_index"));
      const store = new EncryptedStore(keys);
      const index = await indexKeys.current(system);
      for (const [position, runId] of runs.entries()) {
        if (position === 1) await keys.rotate(scope, 1);
        const branch = branches[position];
        const digest = blindIndex(branch, { scope: system,
          table: "agent_runs", column: "branch_name" }, index.bytes);
        const cipher = await store.encrypt(branch, {
          scope, table: "agent_runs", column: "branch_name", rowId: runId,
        });
        const encoded = `mdyw3:${digest}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,branch_name)
          VALUES(${quote(runId)},${quote(project)},${quote(actor)},${quote(encoded)});`);
      }
      index.bytes.fill(0);
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_conversations", "public.agent_runs", "public.agent_turns",
          "public.agent_runtime_sessions", "public.agent_artifacts",
          "public.agent_work_branch_encryption_scopes"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const branch of branches) expect(dump).not.toContain(branch);
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_artifacts", "agent_runtime_sessions", "agent_turns",
        "agent_runs", "agent_conversations"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["agent_artifacts", "agent_runtime_sessions", "agent_turns",
        "agent_runs", "agent_conversations"]) {
        const copy = batches.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_artifacts
        DROP CONSTRAINT agent_artifacts_run_id_fkey;
        ALTER TABLE public.agent_artifacts ADD CONSTRAINT agent_artifacts_run_id_fkey
          FOREIGN KEY(run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;
        ALTER TABLE public.agent_runtime_sessions
        DROP CONSTRAINT agent_runtime_sessions_current_run_id_fkey;
        ALTER TABLE public.agent_runtime_sessions ADD CONSTRAINT agent_runtime_sessions_current_run_id_fkey
          FOREIGN KEY(current_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;`);
      const rows = JSON.parse(sql(restored, `SELECT json_agg(json_build_object(
        'id',r.id,'encoded',r.branch_name,'runtime',s.work_branch,
        'artifact_ref',a.ref,'artifact_cipher',a.ref_ciphertext) ORDER BY r.id)
        FROM public.agent_runs r JOIN public.agent_runtime_sessions s
          ON s.current_run_id=r.id AND s.conversation_id=r.conversation_id
        JOIN public.agent_artifacts a ON a.run_id=r.id AND a.kind='branch';`)) as Array<{
          id: string; encoded: string; runtime: string; artifact_ref: string;
          artifact_cipher: string;
        }>;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => Number(row.encoded.split(":")[2])).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      const recoveredIndex = new ManagedDataKeys(registry(restored, "blind_index"),
        wrapper(root, "blind_index"));
      const indexKey = await recoveredIndex.current(system);
      for (const row of rows) {
        expect(row.runtime).toBe(row.encoded);
        expect(row.artifact_cipher).toBe(row.encoded);
        expect(row.artifact_ref).toBe(row.encoded.split(":").slice(0, 2).join(":"));
        const serialized = Buffer.from(row.encoded.split(":")[3], "base64url").toString("utf8");
        const clear = await cold.decrypt(cold.fromDatabase<string>(serialized),
          { scope, table: "agent_runs", column: "branch_name", rowId: row.id });
        expect(branches).toContain(clear);
        expect(blindIndex(clear, { scope: system, table: "agent_runs",
          column: "branch_name" }, indexKey.bytes)).toBe(row.encoded.split(":")[1]);
      }
      indexKey.bytes.fill(0);
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        rows[0].encoded.split(":")[3], "base64url").toString("utf8")),
      { scope, table: "agent_runs", column: "branch_name", rowId: rows[0].id }))
        .rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted agent results and Numo event/checkpoint copies loaded child first", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_result_source_${suffix}`;
    const restored = `minddy_min591_result_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(resultTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${resultTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','ARS');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      const identifiers: Array<{ run: string; turn: string; event: string; conversation: string }> = [];
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const run = randomUUID(), turn = randomUUID(), event = randomUUID(), conversation = randomUUID();
        identifiers.push({ run, turn, event, conversation });
        const result = { version: 1, status: "completed", summary: `Private result ${number}`,
          changedFiles: [], verificationPerformed: [], artifacts: [], unresolvedDecisions: [] };
        const resultCipher = await store.encrypt(result, {
          scope, table: "agent_runs", column: "delegation_result", rowId: run,
        });
        sql(source, `INSERT INTO public.agent_runs(id,project_id,created_by,
          delegation_result_ciphertext,delegation_result_encryption_version)
          VALUES(${quote(run)},${quote(project)},${quote(actor)},
            ${quote(resultCipher)},${store.versionOf(resultCipher)});
          INSERT INTO public.conversations(id,user_id,project_id)
          VALUES(${quote(conversation)},${quote(actor)},${quote(project)});
          INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
            request_id,run_id,status,active_run_id)
          VALUES(${quote(turn)},${quote(conversation)},${quote(actor)},
            ${quote(randomUUID())},${quote(randomUUID())},'waiting_work',${quote(run)});`);
        const worker = { run_id: run, status: "completed", result };
        const eventCipher = await store.encrypt(worker, {
          scope, table: "numo_turn_events", column: "payload", rowId: event,
        });
        const payload = { encrypted_worker_payload: eventCipher,
          encryption_version: store.versionOf(eventCipher), project_id: project,
          event_id: event, run_id: run };
        sql(source, `INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
          VALUES(${quote(event)},${quote(turn)},1,'worker_completed',${quote(JSON.stringify(payload))}::jsonb);
          UPDATE public.numo_assistant_turns SET checkpoint=${quote(JSON.stringify({
            phase: "worker_result", worker_event: { type: "worker_completed", payload },
          }))}::jsonb WHERE id=${quote(turn)};`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_runs", "public.conversations", "public.numo_assistant_turns",
          "public.numo_turn_events", "public.agent_result_encryption_scopes"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private result");
      expect(dump).not.toContain(root.toString("base64"));
      let remainder = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["numo_turn_events", "numo_assistant_turns", "agent_runs",
        "conversations", "projects", "users"]) {
        const schema = table === "users" ? "auth" : "public";
        const match = remainder.match(new RegExp(`(COPY ${schema}\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        remainder = remainder.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${remainder}\nCOMMIT;`);
      for (const table of ["numo_turn_events", "numo_assistant_turns", "agent_runs",
        "conversations", "projects", "users"]) {
        const batch = batches.get(table)!;
        for (const line of batch.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${batch.header}${line}\n${batch.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.numo_turn_events
        DROP CONSTRAINT numo_turn_events_turn_id_fkey;
        ALTER TABLE public.numo_turn_events ADD CONSTRAINT numo_turn_events_turn_id_fkey
          FOREIGN KEY(turn_id) REFERENCES public.numo_assistant_turns(id) ON DELETE CASCADE;
        ALTER TABLE public.numo_assistant_turns
        DROP CONSTRAINT numo_assistant_turns_active_run_id_fkey;
        ALTER TABLE public.numo_assistant_turns ADD CONSTRAINT numo_assistant_turns_active_run_id_fkey
          FOREIGN KEY(active_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, ids] of identifiers.entries()) {
        const run = JSON.parse(sql(restored, `SELECT row_to_json(r) FROM public.agent_runs r
          WHERE id=${quote(ids.run)};`));
        const event = JSON.parse(sql(restored, `SELECT row_to_json(e) FROM public.numo_turn_events e
          WHERE id=${quote(ids.event)};`));
        const turn = JSON.parse(sql(restored, `SELECT row_to_json(t) FROM public.numo_assistant_turns t
          WHERE id=${quote(ids.turn)};`));
        expect(run.delegation_result).toBeNull();
        expect(run.delegation_result_encryption_version).toBe(index + 1);
        expect(event.payload).toEqual(turn.checkpoint.worker_event.payload);
        keys.invalidate(scope);
        expect((await cold.decrypt(cold.fromDatabase<typeof event.payload>(
          run.delegation_result_ciphertext), { scope, table: "agent_runs",
          column: "delegation_result", rowId: ids.run })).summary)
          .toBe(`Private result ${index + 1}`);
        expect((await cold.decrypt(cold.fromDatabase<typeof event.payload>(
          event.payload.encrypted_worker_payload), { scope, table: "numo_turn_events",
          column: "payload", rowId: ids.event })).result.summary)
          .toBe(`Private result ${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const first = identifiers[0];
      const cipher = sql(restored, `SELECT delegation_result_ciphertext FROM public.agent_runs
        WHERE id=${quote(first.run)};`);
      await expect(wrong.decrypt(wrong.fromDatabase(cipher), { scope,
        table: "agent_runs", column: "delegation_result", rowId: first.run }))
        .rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted run and turn summaries including archived imported turns", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_summary_source_${suffix}`;
    const restored = `minddy_min591_summary_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const runs: string[] = [];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(summaryTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${summaryTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','SUM');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      const encoded = async (table: string, rowId: string, field: string, value: string) => {
        const cipher = await store.encrypt(value, { scope, table, column: field, rowId });
        return `mdys3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
      };
      for (const number of [1, 2]) {
        if (number === 2) await keys.rotate(scope, 1);
        const run = randomUUID();
        runs.push(run);
        const outcome = await encoded("agent_runs", run, "outcome", `Private outcome ${number}`);
        const error = await encoded("agent_runs", run, "error_message", `Private error ${number}`);
        sql(source, `INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
          outcome,error_message) VALUES(${quote(run)},${quote(project)},${quote(conversation)},
          ${quote(actor)},${quote(outcome)},${quote(error)});`);
      }
      const archived = randomUUID();
      const archivedOutcome = await encoded("agent_turns", archived, "outcome",
        "Private archived outcome");
      sql(source, `INSERT INTO public.agent_turns(id,conversation_id,run_id,status,outcome)
        VALUES(${quote(archived)},${quote(conversation)},NULL,'completed',
          ${quote(archivedOutcome)});`);
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_conversations", "public.agent_runs", "public.agent_turns",
          "public.agent_summary_encryption_scopes"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private outcome");
      expect(dump).not.toContain("Private error");
      expect(dump).not.toContain("Private archived outcome");
      expect(dump).not.toContain(root.toString("base64"));
      let remainder = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_turns", "agent_runs", "agent_conversations", "projects", "users"]) {
        const schema = table === "users" ? "auth" : "public";
        const match = remainder.match(new RegExp(`(COPY ${schema}\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        remainder = remainder.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${remainder}\nCOMMIT;`);
      for (const table of ["agent_turns", "agent_runs", "agent_conversations", "projects", "users"]) {
        const batch = batches.get(table)!;
        for (const line of batch.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${batch.header}${line}\n${batch.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_run_id_fkey;
        ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_run_id_fkey
          FOREIGN KEY(run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;
        ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_conversation_project_fkey;
        ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_conversation_project_fkey
          FOREIGN KEY(conversation_id,project_id)
          REFERENCES public.agent_conversations(id,project_id);`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, run] of runs.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(r) FROM public.agent_runs r
          WHERE id=${quote(run)};`));
        const turn = JSON.parse(sql(restored, `SELECT row_to_json(t) FROM public.agent_turns t
          WHERE run_id=${quote(run)};`));
        expect(turn.outcome).toBe(row.outcome);
        expect(turn.error_message).toBe(row.error_message);
        const cipher = cold.fromDatabase<string>(Buffer.from(row.outcome.split(":")[2],
          "base64url").toString("utf8"));
        expect(await cold.decrypt(cipher, { scope, table: "agent_runs", column: "outcome",
          rowId: run })).toBe(`Private outcome ${index + 1}`);
        expect(Number(row.outcome.split(":")[1])).toBe(index + 1);
      }
      const archivedRow = JSON.parse(sql(restored, `SELECT row_to_json(t) FROM public.agent_turns t
        WHERE id=${quote(archived)};`));
      expect(archivedRow.run_id).toBeNull();
      expect(await cold.decrypt(cold.fromDatabase<string>(Buffer.from(
        archivedRow.outcome.split(":")[2], "base64url").toString("utf8")),
      { scope, table: "agent_turns", column: "outcome", rowId: archived }))
        .toBe("Private archived outcome");
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const first = sql(restored, `SELECT outcome FROM public.agent_runs WHERE id=${quote(runs[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(first.split(":")[2],
        "base64url").toString("utf8")),
      { scope, table: "agent_runs", column: "outcome", rowId: runs[0] }))
        .rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores encrypted PR URLs and artifact copies across run deletion", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_prurl_source_${suffix}`;
    const restored = `minddy_min591_prurl_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), conversation = randomUUID();
    const runs = [randomUUID(), randomUUID()];
    const urls = ["https://example.invalid/private/repo/pull/11",
      "https://example.invalid/private/repo/pull/12"];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(prUrlTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${prUrlTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','PURL');
        INSERT INTO public.agent_conversations(id,project_id,owner_id)
          VALUES(${quote(conversation)},${quote(project)},${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, run] of runs.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const cipher = await store.encrypt(urls[index], {
          scope, table: "agent_runs", column: "pr_url", rowId: run,
        });
        const stored = `mdyp3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        sql(source, `INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
          pr_number,pr_url) VALUES(${quote(run)},${quote(project)},${quote(conversation)},
          ${quote(actor)},${index + 11},${quote(stored)});`);
      }
      const orphan = randomUUID();
      const orphanCipher = await store.encrypt("https://example.invalid/private/orphan", {
        scope, table: "agent_artifacts", column: "url", rowId: orphan,
      });
      const orphanUrl = `mdyp3:${store.versionOf(orphanCipher)}:${Buffer.from(orphanCipher).toString("base64url")}`;
      sql(source, `INSERT INTO public.agent_artifacts(id,conversation_id,kind,ref,url)
        VALUES(${quote(orphan)},${quote(conversation)},'pull_request','99',
          ${quote(orphanUrl)});`);
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.agent_conversations", "public.agent_runs", "public.agent_turns",
          "public.agent_runtime_sessions", "public.agent_artifacts",
          "public.agent_pr_url_encryption_scopes"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private/repo");
      expect(dump).not.toContain("private/orphan");
      expect(dump).not.toContain(root.toString("base64"));
      let remainder = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["agent_artifacts", "agent_runtime_sessions", "agent_turns",
        "agent_runs", "agent_conversations", "projects", "users"]) {
        const schema = table === "users" ? "auth" : "public";
        const match = remainder.match(new RegExp(`(COPY ${schema}\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        remainder = remainder.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${remainder}\nCOMMIT;`);
      for (const table of ["agent_artifacts", "agent_runtime_sessions", "agent_turns",
        "agent_runs", "agent_conversations", "projects", "users"]) {
        const batch = batches.get(table)!;
        for (const line of batch.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${batch.header}${line}\n${batch.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.agent_artifacts
        DROP CONSTRAINT agent_artifacts_run_id_fkey;
        ALTER TABLE public.agent_artifacts ADD CONSTRAINT agent_artifacts_run_id_fkey
          FOREIGN KEY(run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, run] of runs.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(r) FROM public.agent_runs r
          WHERE id=${quote(run)};`));
        const artifact = JSON.parse(sql(restored, `SELECT row_to_json(a) FROM public.agent_artifacts a
          WHERE run_id=${quote(run)} AND kind='pull_request';`));
        expect(artifact.url).toBe(row.pr_url);
        expect(artifact.url_bound_run_id).toBe(run);
        expect(Number(row.pr_url.split(":")[1])).toBe(index + 1);
        const cipher = cold.fromDatabase<string>(Buffer.from(row.pr_url.split(":")[2],
          "base64url").toString("utf8"));
        expect(await cold.decrypt(cipher, { scope, table: "agent_runs", column: "pr_url",
          rowId: run })).toBe(urls[index]);
      }
      const orphanRow = JSON.parse(sql(restored, `SELECT row_to_json(a) FROM public.agent_artifacts a
        WHERE id=${quote(orphan)};`));
      expect(orphanRow.url_bound_run_id).toBeNull();
      expect(await cold.decrypt(cold.fromDatabase<string>(Buffer.from(
        orphanRow.url.split(":")[2], "base64url").toString("utf8")),
      { scope, table: "agent_artifacts", column: "url", rowId: orphan }))
        .toBe("https://example.invalid/private/orphan");
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const first = sql(restored, `SELECT pr_url FROM public.agent_runs WHERE id=${quote(runs[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(first.split(":")[2],
        "base64url").toString("utf8")),
      { scope, table: "agent_runs", column: "pr_url", rowId: runs[0] }))
        .rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores GitHub issue sidecars before encrypted issue parents in independent batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_sidecar_source_${suffix}`;
    const restored = `minddy_min591_sidecar_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const issues = [randomUUID(), randomUUID()];
    const comments = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(contextTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${contextTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','GHS');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      const codec = new EncryptedRowCodec(store);
      for (const [index, issueId] of issues.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const issue = await codec.encode({ id: issueId, project_id: project,
          title: `Private issue ${index + 1}`, description: null, plan: null,
          remote_url: null, automation_override: null, encryption_version: 0,
          encrypted_content: null }, { table: "issues", scope });
        sql(source, `INSERT INTO public.issues(id,project_id,number,title,description,
          plan,remote_url,automation_override,encryption_version,encrypted_content)
          VALUES(${quote(issueId)},${quote(project)},${index + 1},NULL,NULL,NULL,NULL,NULL,
            ${issue.encryption_version},${quote(issue.encrypted_content!)});`);
        const sidecar = await store.encrypt({ metadata: { issue_type: `Private type ${index + 1}` },
          milestone: { title: `Private milestone ${index + 1}` } }, {
          scope, table: "github_issue_sync_metadata", column: "content", rowId: issueId,
        });
        sql(source, `INSERT INTO public.github_issue_sync_metadata(issue_id,metadata,milestone,
          content_ciphertext,content_encryption_version)
          VALUES(${quote(issueId)},'{}',NULL,${quote(sidecar)},${store.versionOf(sidecar)});`);
        const comment = await codec.encode({ id: comments[index], project_id: project,
          body: `Private comment ${index + 1}`, encryption_version: 0,
          encrypted_content: null }, { table: "comments", scope });
        sql(source, `INSERT INTO public.comments(id,issue_id,project_id,author_id,body,
          encryption_version,encrypted_content) VALUES(${quote(comments[index])},
          ${quote(issueId)},${quote(project)},${quote(actor)},NULL,
          ${comment.encryption_version},${quote(comment.encrypted_content!)});`);
        const remoteId = `remote-${index + 1}`;
        const url = await store.encrypt(`https://github.test/Private/repo/${index + 1}`, {
          scope, table: "github_issue_comment_syncs", column: "html_url",
          rowId: `${issueId}:${remoteId}`,
        });
        sql(source, `INSERT INTO public.github_issue_comment_syncs(
          remote_comment_id,issue_id,comment_id,html_url,html_url_encryption_version)
          VALUES(${quote(remoteId)},${quote(issueId)},${quote(comments[index])},
            ${quote(url)},${store.versionOf(url)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin",
        "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.issue_encryption_scopes", "public.github_issue_metadata_encryption_scopes",
          "public.issues", "public.github_issue_sync_metadata",
          "public.comment_encryption_scopes", "public.comments",
          "public.github_issue_comment_url_encryption_scopes",
          "public.github_issue_comment_syncs"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["Private issue", "Private type", "Private milestone",
        "Private comment", "github.test/Private"])
        expect(dump).not.toContain(secret);
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["github_issue_comment_syncs", "github_issue_sync_metadata",
        "comments", "issues"]) {
        const match = dependencies.match(new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1], lines: match![2].trimEnd().split("\n").reverse(),
          footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["github_issue_comment_syncs", "github_issue_sync_metadata",
        "comments", "issues"]) {
        const copy = batches.get(table)!;
        for (const line of copy.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role = replica;\n${copy.header}${line}\n${copy.footer}COMMIT;`);
        }
      }
      sql(restored, `ALTER TABLE public.github_issue_sync_metadata
          DROP CONSTRAINT github_issue_sync_metadata_issue_id_fkey;
        ALTER TABLE public.github_issue_sync_metadata
          ADD CONSTRAINT github_issue_sync_metadata_issue_id_fkey
          FOREIGN KEY (issue_id) REFERENCES public.issues(id) ON DELETE CASCADE;`);
      sql(restored, `ALTER TABLE public.github_issue_comment_syncs
          DROP CONSTRAINT github_issue_comment_syncs_comment_id_fkey;
        ALTER TABLE public.github_issue_comment_syncs
          ADD CONSTRAINT github_issue_comment_syncs_comment_id_fkey
          FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;
        ALTER TABLE public.github_issue_comment_syncs
          DROP CONSTRAINT github_issue_comment_syncs_issue_id_fkey;
        ALTER TABLE public.github_issue_comment_syncs
          ADD CONSTRAINT github_issue_comment_syncs_issue_id_fkey
          FOREIGN KEY (issue_id) REFERENCES public.issues(id) ON DELETE CASCADE;`);
      const rows = JSON.parse(sql(restored,
        "SELECT json_agg(m ORDER BY issue_id) FROM public.github_issue_sync_metadata m;")) as Array<{
          issue_id: string; metadata: Record<string, unknown>; milestone: unknown;
          content_ciphertext: string; content_encryption_version: number;
        }>;
      expect(rows.map((row) => row.content_encryption_version).sort()).toEqual([1, 2]);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored), wrapper(root)));
      for (const [index, issueId] of issues.entries()) {
        const row = rows.find((item) => item.issue_id === issueId)!;
        expect(row.metadata).toEqual({});
        expect(row.milestone).toBeNull();
        const clear = await cold.decrypt(cold.fromDatabase<{
          metadata: { issue_type: string }; milestone: { title: string }
        }>(row.content_ciphertext), {
          scope, table: "github_issue_sync_metadata", column: "content", rowId: issueId,
        });
        expect(clear.metadata.issue_type).toBe(`Private type ${index + 1}`);
        expect(clear.milestone.title).toBe(`Private milestone ${index + 1}`);
      }
      const urlRows = JSON.parse(sql(restored,
        "SELECT json_agg(s ORDER BY remote_comment_id) FROM public.github_issue_comment_syncs s;")) as Array<{
          issue_id: string; remote_comment_id: string; html_url: string;
          html_url_encryption_version: number;
        }>;
      expect(urlRows.map((row) => row.html_url_encryption_version)).toEqual([1, 2]);
      for (const [index, issueId] of issues.entries()) {
        const row = urlRows.find((item) => item.issue_id === issueId)!;
        const clear = await cold.decrypt(cold.fromDatabase<string>(row.html_url), {
          scope, table: "github_issue_comment_syncs", column: "html_url",
          rowId: `${issueId}:${row.remote_comment_id}`,
        });
        expect(clear).toBe(`https://github.test/Private/repo/${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      await expect(wrong.decrypt(wrong.fromDatabase(rows[0].content_ciphertext), {
        scope, table: "github_issue_sync_metadata", column: "content",
        rowId: rows[0].issue_id,
      })).rejects.toThrow();
      await expect(wrong.decrypt(wrong.fromDatabase(urlRows[0].html_url), {
        scope, table: "github_issue_comment_syncs", column: "html_url",
        rowId: `${urlRows[0].issue_id}:${urlRows[0].remote_comment_id}`,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
    }
  }, 60_000);
  it("restores shared forge URLs and project run copies in independent batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_sharedpr_source_${suffix}`;
    const restored = `minddy_min591_sharedpr_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), connection = randomUUID();
    const link = randomUUID();
    const prs = [randomUUID(), randomUUID()];
    const edits = [randomUUID(), randomUUID()];
    const relayInstance = randomUUID();
    const deliveryIds = [randomUUID(), randomUUID()];
    const runs = [randomUUID(), randomUUID()];
    const conversations = [randomUUID(), randomUUID()];
    const urls = ["https://example.invalid/private/repo/pull/1",
      "https://example.invalid/private/repo/pull/2"];
    const system: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const projectScope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(sharedPrUrlTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${sharedPrUrlTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.forge_relay_instances(id,name,public_key)
          VALUES(${quote(relayInstance)},'Restore relay','test-public-key');
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Fixture project','SHPR');
        INSERT INTO public.git_connections(id,user_id,provider)
          VALUES(${quote(connection)},${quote(actor)},'github');
        INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
          external_repo_id,repo_full_name) VALUES(${quote(link)},${quote(project)},
            ${quote(connection)},'github','shared-pr-restore','private/repo');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, prId] of prs.entries()) {
        if (index === 1) {
          await keys.rotate(system, 1);
          await keys.rotate(projectScope, 1);
        }
        const forge = await store.encrypt(urls[index], {
          scope: system, table: "pull_requests", column: "url", rowId: prId,
        });
        const run = await store.encrypt(urls[index], {
          scope: projectScope, table: "agent_runs", column: "pr_url",
          rowId: runs[index],
        });
        const title = await store.encrypt(`Private PR title ${index + 1}`, {
          scope: system, table: "pull_requests", column: "title", rowId: prId,
        });
        const head = await store.encrypt(`private/head-${index + 1}`, {
          scope: system, table: "pull_requests", column: "head_branch", rowId: prId,
        });
        const base = await store.encrypt("private/base", {
          scope: system, table: "pull_requests", column: "base_branch", rowId: prId,
        });
        const edit = await store.encrypt(`Private prior comment ${index + 1}`, {
          scope: system, table: "pr_comment_edits", column: "body",
          rowId: edits[index],
        });
        const deliveryIdentity = `${relayInstance}:github:delivery-${index + 1}`;
        const payload = await store.encrypt(`Private relay issue ${index + 1}`, {
          scope: system, table: "forge_relay_deliveries", column: "payload",
          rowId: deliveryIdentity,
        });
        const diagnostic = await store.encrypt(`Private relay error ${index + 1}`, {
          scope: system, table: "forge_relay_deliveries", column: "last_error",
          rowId: deliveryIdentity,
        });
        const forgeValue = `mdyq3:${store.versionOf(forge)}:${Buffer.from(forge).toString("base64url")}`;
        const runValue = `mdyp3:${store.versionOf(run)}:${Buffer.from(run).toString("base64url")}`;
        const contentValue = (cipher: typeof title) =>
          `mdym3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        sql(source, `INSERT INTO public.pull_requests(id,provider,repo_full_name,
            number,url,title,head_branch,base_branch)
            VALUES(${quote(prId)},'github','private/repo',${index + 1},
              ${quote(forgeValue)},${quote(contentValue(title))},
              ${quote(contentValue(head))},${quote(contentValue(base))});
          INSERT INTO public.pr_comment_edits(id,provider,repo_full_name,
            pr_number,comment_id,body) VALUES(${quote(edits[index])},
              'github','private/repo',${index + 1},${index + 1},
              ${quote(`mdye3:${store.versionOf(edit)}:${Buffer.from(edit).toString("base64url")}`)});
          INSERT INTO public.forge_relay_deliveries(id,instance_id,provider,
            delivery_guid,payload,last_error) VALUES(${quote(deliveryIds[index])},
              ${quote(relayInstance)},'github',${quote(`delivery-${index + 1}`)},
              ${quote(`mdyd3:${store.versionOf(payload)}:${Buffer.from(payload).toString("base64url")}`)},
              ${quote(`mdyd3:${store.versionOf(diagnostic)}:${Buffer.from(diagnostic).toString("base64url")}`)});
          INSERT INTO public.forge_relay_audit(instance_id,action,detail)
            VALUES(${quote(relayInstance)},'webhook_secret_registered','{}'::jsonb);
          INSERT INTO public.agent_conversations(id,project_id,owner_id)
            VALUES(${quote(conversations[index])},${quote(project)},${quote(actor)});
          INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
            repo_link_id,connection_id,repo_provider,repo_external_id,
            pr_number,pr_url) VALUES(${quote(runs[index])},${quote(project)},
              ${quote(conversations[index])},${quote(actor)},${quote(link)},
              ${quote(connection)},'github','shared-pr-restore',${index + 1},
              ${quote(runValue)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.envelope_data_keys",
          "public.git_connections", "public.project_git_links",
          "public.pull_request_url_encryption_scope",
          "public.pull_request_content_encryption_scope",
          "public.pr_comment_edit_encryption_scope", "public.pr_comment_edits",
          "public.forge_relay_delivery_encryption_scope",
          "public.forge_relay_instances", "public.forge_relay_deliveries",
          "public.forge_relay_audit",
          "public.agent_pr_url_encryption_scopes", "public.agent_conversations",
          "public.pull_requests", "public.agent_runs", "public.agent_artifacts",
          "public.agent_runtime_sessions"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const url of urls) expect(dump).not.toContain(url);
      for (const secret of ["Private PR title", "private/head-", "private/base",
        "Private prior comment", "Private relay issue", "Private relay error"])
        expect(dump).not.toContain(secret);
      expect(dump).not.toContain("private.example");
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[];
        footer: string }>();
      for (const table of ["forge_relay_audit", "forge_relay_deliveries", "pr_comment_edits", "agent_artifacts",
        "agent_runtime_sessions", "agent_runs", "pull_requests"]) {
        const match = dependencies.match(new RegExp(
          `(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1],
          lines: match![2].trimEnd().split("\n").reverse(), footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["forge_relay_audit", "forge_relay_deliveries", "pr_comment_edits", "agent_artifacts",
        "agent_runtime_sessions", "agent_runs", "pull_requests"]) {
        const batch = batches.get(table)!;
        for (const line of batch.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${batch.header}${line}\n${batch.footer}COMMIT;`);
        }
      }
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, prId] of prs.entries()) {
        const forge = sql(restored, `SELECT url FROM public.pull_requests
          WHERE id=${quote(prId)};`);
        const content = JSON.parse(sql(restored, `SELECT row_to_json(p)
          FROM public.pull_requests p WHERE id=${quote(prId)};`));
        const run = sql(restored, `SELECT pr_url FROM public.agent_runs
          WHERE id=${quote(runs[index])};`);
        const artifact = JSON.parse(sql(restored, `SELECT row_to_json(a)
          FROM public.agent_artifacts a WHERE run_id=${quote(runs[index])}
            AND kind='pull_request';`));
        expect(artifact.url).toBe(run);
        expect(artifact.url_bound_run_id).toBe(runs[index]);
        expect(Number(forge.split(":")[1])).toBe(index + 1);
        expect(Number(run.split(":")[1])).toBe(index + 1);
        for (const [value, context] of [[forge, { scope: system,
          table: "pull_requests", column: "url", rowId: prId }],
        [run, { scope: projectScope, table: "agent_runs", column: "pr_url",
          rowId: runs[index] }]] as const) {
          const cipher = cold.fromDatabase<string>(Buffer.from(value.split(":")[2],
            "base64url").toString("utf8"));
          expect(await cold.decrypt(cipher, context)).toBe(urls[index]);
        }
        for (const [column, expected] of [["title", `Private PR title ${index + 1}`],
          ["head_branch", `private/head-${index + 1}`],
          ["base_branch", "private/base"]] as const) {
          const value = content[column] as string;
          expect(Number(value.split(":")[1])).toBe(index + 1);
          const cipher = cold.fromDatabase<string>(Buffer.from(value.split(":")[2],
            "base64url").toString("utf8"));
          expect(await cold.decrypt(cipher, { scope: system, table: "pull_requests",
            column, rowId: prId })).toBe(expected);
        }
        const editValue = sql(restored, `SELECT body FROM public.pr_comment_edits
          WHERE id=${quote(edits[index])};`);
        expect(Number(editValue.split(":")[1])).toBe(index + 1);
        const editCipher = cold.fromDatabase<string>(Buffer.from(
          editValue.split(":")[2], "base64url").toString("utf8"));
        expect(await cold.decrypt(editCipher, { scope: system,
          table: "pr_comment_edits", column: "body", rowId: edits[index] }))
          .toBe(`Private prior comment ${index + 1}`);
        const delivery = JSON.parse(sql(restored, `SELECT row_to_json(d)
          FROM public.forge_relay_deliveries d
          WHERE id=${quote(deliveryIds[index])};`));
        for (const [column, expected] of [["payload", `Private relay issue ${index + 1}`],
          ["last_error", `Private relay error ${index + 1}`]] as const) {
          const value = delivery[column] as string;
          expect(Number(value.split(":")[1])).toBe(index + 1);
          const cipher = cold.fromDatabase<string>(Buffer.from(value.split(":")[2],
            "base64url").toString("utf8"));
          expect(await cold.decrypt(cipher, { scope: system,
            table: "forge_relay_deliveries", column,
            rowId: `${relayInstance}:github:delivery-${index + 1}` })).toBe(expected);
        }
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const forge = sql(restored, `SELECT url FROM public.pull_requests
        WHERE id=${quote(prs[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        forge.split(":")[2], "base64url").toString("utf8")), {
        scope: system, table: "pull_requests", column: "url", rowId: prs[0],
      })).rejects.toThrow();
      const delivery = sql(restored, `SELECT payload FROM public.forge_relay_deliveries
        WHERE id=${quote(deliveryIds[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        delivery.split(":")[2], "base64url").toString("utf8")), {
        scope: system, table: "forge_relay_deliveries", column: "payload",
        rowId: `${relayInstance}:github:delivery-1`,
      })).rejects.toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);
  it("restores attachment objects and encrypted metadata from independent child-first batches", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_attachment_${suffix}`;
    const restored = `minddy_min591_attachment_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), issue = randomUUID();
    const scope: EncryptionScope = { kind: "project", id: project };
    const ids = [randomUUID(), randomUUID()];
    const paths = ids.map(() => `projects/${project}/${randomUUID()}`);
    const payloads: string[] = [];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Restore project','ATRC');
        INSERT INTO public.issues(id,project_id,number,title)
          VALUES(${quote(issue)},${quote(project)},1,'Restore issue');
        INSERT INTO storage.buckets(id,name) VALUES('attachments','attachments')
          ON CONFLICT DO NOTHING;
        INSERT INTO public.attachment_object_encryption_scope(id) VALUES(true);`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, id] of ids.entries()) {
        if (index) await keys.rotate(scope, 1);
        const name = `Private attachment name ${index + 1}`;
        const bytes = Buffer.from(`Private attachment bytes ${index + 1}`);
        const wrap = async (column: "file_name", value: string) => {
          const cipher = await store.encrypt(value, { scope, table: "attachments",
            column, rowId: id });
          return `mdya3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        };
        const object = await store.encryptBytes(bytes, { scope,
          table: "attachment_objects", column: "bytes", rowId: `${paths[index]}:0` });
        payloads.push(`minddy-attachment-object-v3\n${JSON.stringify({
          length: bytes.byteLength, chunks: [object],
        })}`);
        sql(source, `INSERT INTO public.attachment_object_encrypted(path)
            VALUES(${quote(paths[index])});
          INSERT INTO storage.objects(bucket_id,name,metadata,user_metadata)
            VALUES('attachments',${quote(paths[index])},'{}'::jsonb,
              '{"minddy_logical_size":${bytes.byteLength}}'::jsonb);
          INSERT INTO public.attachments(id,project_id,issue_id,kind,
            storage_path,file_name,mime_type,size_bytes)
            VALUES(${quote(id)},${quote(project)},${quote(issue)},'file',
              ${quote(paths[index])},${quote(await wrap("file_name",name))},
              'text/plain',${bytes.byteLength});`);
      }
      sql(source, `INSERT INTO public.attachment_object_aliases(
          old_path_digest,new_path) VALUES(${quote("a".repeat(64))},
          ${quote(paths[0])});`);
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.issues",
          "public.envelope_data_keys", "storage.buckets", "storage.objects",
          "public.attachment_object_encryption_scope",
          "public.attachment_metadata_encryption_scope",
          "public.attachment_object_encrypted",
          "public.attachment_object_aliases", "public.attachments"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["Private attachment name", "Private attachment bytes"]) {
        expect(dump).not.toContain(secret);
        for (const payload of payloads) expect(payload).not.toContain(secret);
      }
      let dependencies = dump;
      const children = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["attachments", "attachment_object_aliases",
        "attachment_object_encrypted", "objects"]) {
        const schema = table === "objects" ? "storage" : "public";
        const match = dependencies.match(new RegExp(
          `(COPY ${schema}\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        children.set(table, { header: match![1],
          lines: match![2].trimEnd().split("\n").reverse(), footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      for (const table of ["attachments", "attachment_object_aliases",
        "attachment_object_encrypted", "objects"]) {
        const batch = children.get(table)!;
        for (const line of batch.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${batch.header}${line}\n${batch.footer}COMMIT;`);
        }
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, id] of ids.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(a) FROM
          public.attachments a WHERE id=${quote(id)};`));
        expect(row.storage_path).toBe(paths[index]);
        expect(Number(row.file_name.split(":")[1])).toBe(index + 1);
        for (const [column, expected] of [["file_name",
          `Private attachment name ${index + 1}`]] as const) {
          const value = row[column] as string;
          const cipher = cold.fromDatabase<string>(Buffer.from(value.split(":")[2],
            "base64url").toString("utf8"));
          expect(await cold.decrypt(cipher, { scope, table: "attachments",
            column, rowId: id })).toBe(expected);
        }
        const serialized = JSON.parse(payloads[index].split("\n").slice(1).join("\n"));
        const object = cold.fromDatabase<Uint8Array>(serialized.chunks[0]);
        expect(Buffer.from(await cold.decryptBytes(object, { scope,
          table: "attachment_objects", column: "bytes", rowId: `${paths[index]}:0` }))
          .toString()).toBe(`Private attachment bytes ${index + 1}`);
      }
      expect(sql(restored, `SELECT new_path FROM public.attachment_object_aliases
        WHERE old_path_digest=${quote("a".repeat(64))};`)).toBe(paths[0]);
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const value = sql(restored, `SELECT file_name FROM public.attachments
        WHERE id=${quote(ids[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        value.split(":")[2], "base64url").toString("utf8")), {
        scope, table: "attachments", column: "file_name", rowId: ids[0],
      })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.attachments(project_id,
        issue_id,kind,file_name,mime_type,size_bytes)
        VALUES(${quote(project)},${quote(issue)},'link','Old plaintext',
          'text/uri-list',0);`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores private feedback identities and pending OTP emails across key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_fbid_${suffix}`;
    const restored = `minddy_min591_fbid_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID(), board = randomUUID();
    const projectScope: EncryptionScope = { kind: "project", id: project };
    const systemScope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const users = [randomUUID(), randomUUID()];
    const codes = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Feedback restore','FBRI');
        INSERT INTO public.feedback_boards(id,project_id,token)
          VALUES(${quote(board)},${quote(project)},'fixture-token');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const systemKeys = new ManagedDataKeys(registry(source, "content"), wrapper(root));
      const store = new EncryptedStore(keys);
      const systemStore = new EncryptedStore(systemKeys);
      for (const [index, user] of users.entries()) {
        if (index) {
          await keys.rotate(projectScope, 1);
          await systemKeys.rotate(systemScope, 1);
        }
        const email = `private-visitor-${index + 1}@example.test`;
        const name = `Private visitor name ${index + 1}`;
        const wrap = async (table: string, column: string, rowId: string,
          value: string, scope: EncryptionScope, currentStore: EncryptedStore) => {
          const cipher = await currentStore.encrypt(value, { scope, table,
            column, rowId });
          return `mdyf3:${currentStore.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        };
        sql(source, `INSERT INTO public.feedback_users(id,project_id,email,name,
            email_lookup,pseudonym,verified_via)
            VALUES(${quote(user)},${quote(project)},
              ${quote(await wrap("feedback_users","email",user,email,projectScope,store))},
              ${quote(await wrap("feedback_users","name",user,name,projectScope,store))},
              ${quote(index ? "b".repeat(64) : "a".repeat(64))},
              'Quiet Bird','email');
          INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,
            code_hash,expires_at)
            VALUES(${quote(codes[index])},${quote(board)},
              ${quote(await wrap("feedback_otp_codes","email",codes[index],
                email,systemScope,systemStore))},
              ${quote(index ? "d".repeat(64) : "c".repeat(64))},
              'fixture-code',now()+interval '10 minutes');`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner", "--no-privileges",
        ...["auth.users", "public.projects", "public.feedback_boards",
          "public.envelope_data_keys", "public.feedback_identity_encryption_scope",
          "public.feedback_users", "public.feedback_otp_codes"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-visitor-");
      expect(dump).not.toContain("Private visitor name");
      let dependencies = dump;
      const children = new Map<string, { header: string; lines: string[]; footer: string }>();
      for (const table of ["feedback_users", "feedback_otp_codes"]) {
        const match = dependencies.match(new RegExp(
          `(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        children.set(table, { header: match![1],
          lines: match![2].trimEnd().split("\n").reverse(), footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      for (const table of ["feedback_otp_codes", "feedback_users"]) {
        const batch = children.get(table)!;
        for (const line of batch.lines) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${batch.header}${line}\n${batch.footer}COMMIT;`);
        }
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, user] of users.entries()) {
        const identity = JSON.parse(sql(restored, `SELECT row_to_json(u) FROM
          public.feedback_users u WHERE id=${quote(user)};`));
        const otp = JSON.parse(sql(restored, `SELECT row_to_json(c) FROM
          public.feedback_otp_codes c WHERE id=${quote(codes[index])};`));
        expect(Number(identity.email.split(":")[1])).toBe(index + 1);
        expect(Number(otp.email.split(":")[1])).toBe(index + 1);
        for (const [value, scope, table, column, rowId, expected] of [
          [identity.email, projectScope, "feedback_users", "email", user,
            `private-visitor-${index + 1}@example.test`],
          [identity.name, projectScope, "feedback_users", "name", user,
            `Private visitor name ${index + 1}`],
          [otp.email, systemScope, "feedback_otp_codes", "email", codes[index],
            `private-visitor-${index + 1}@example.test`],
        ] as const) {
          const cipher = cold.fromDatabase<string>(Buffer.from(value.split(":")[2],
            "base64url").toString("utf8"));
          expect(await cold.decrypt(cipher, { scope, table, column,
            rowId })).toBe(expected);
        }
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const value = sql(restored, `SELECT email FROM public.feedback_users
        WHERE id=${quote(users[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        value.split(":")[2], "base64url").toString("utf8")), {
        scope: projectScope, table: "feedback_users", column: "email",
        rowId: users[0],
      })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.feedback_users(project_id,
        email,pseudonym,verified_via) VALUES(${quote(project)},
          'old@example.test','Old Writer','email');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores encrypted share tokens after child-first batches with cold keys", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_share_${suffix}`;
    const restored = `minddy_min591_share_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const actor = randomUUID(), project = randomUUID();
    const views = [randomUUID(), randomUUID()];
    const shares = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Share restore','SHRS');
        INSERT INTO public.views(id,project_id,name) VALUES
          (${quote(views[0])},${quote(project)},'First'),
          (${quote(views[1])},${quote(project)},'Second');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, id] of shares.entries()) {
        if (index) await keys.rotate(scope, 1);
        const clear = `private-share-${index + 1}`;
        const cipher = await store.encrypt(clear, { scope,
          table: "view_shares", column: "token", rowId: id });
        const stored = `mdys3:${store.versionOf(cipher)}:${Buffer.from(cipher)
          .toString("base64url")}`;
        sql(source, `INSERT INTO public.view_shares(id,view_id,level,token,
          token_lookup) VALUES(${quote(id)},${quote(views[index])},'public',
          ${quote(stored)},${quote(index ? "b".repeat(64) : "a".repeat(64))});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects", "public.views",
          "public.envelope_data_keys", "public.view_share_token_encryption_scope",
          "public.view_shares"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-share-");
      const match = dump.match(/(COPY public\.view_shares[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      const dependencies = dump.replace(match![0], "");
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, id] of shares.entries()) {
        const value = sql(restored, `SELECT token FROM public.view_shares
          WHERE id=${quote(id)};`);
        expect(value).toMatch(new RegExp(`^mdys3:${index + 1}:`));
        const cipher = cold.fromDatabase<string>(Buffer.from(value.split(":")[2],
          "base64url").toString("utf8"));
        expect(await cold.decrypt(cipher, { scope, table: "view_shares",
          column: "token", rowId: id })).toBe(`private-share-${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const value = sql(restored, `SELECT token FROM public.view_shares
        WHERE id=${quote(shares[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        value.split(":")[2], "base64url").toString("utf8")), { scope,
        table: "view_shares", column: "token", rowId: shares[0] }))
        .rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.view_shares(view_id,level,
        token) VALUES(${quote(views[0])},'public','old-plaintext');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores Numo surface destinations before their thread and conversation", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_surface_${suffix}`;
    const restored = `minddy_min591_surface_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), project = randomUUID();
    const conversation = randomUUID(), thread = randomUUID();
    const events = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "user", id: actor };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Surface restore','SFRS');
        INSERT INTO public.conversations(id,user_id,title)
          VALUES(${quote(conversation)},${quote(actor)},'Fixture');
        INSERT INTO public.numo_surface_threads(id,surface,source_thread_id,
          actor_id,project_id,conversation_id) VALUES(${quote(thread)},
          'issue_comment','fixture-source',${quote(actor)},${quote(project)},
          ${quote(conversation)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, eventId] of events.entries()) {
        if (index) await keys.rotate(scope, 1);
        const destination = { kind: "pull_request",
          pullRequestId: `private-pr-${index + 1}` };
        const cipher = await store.encrypt(destination, { scope,
          table: "numo_surface_events", column: "destination", rowId: eventId });
        const stored = { ciphertext: `mdyn3:${store.versionOf(cipher)}:${Buffer
          .from(cipher).toString("base64url")}` };
        sql(source, `INSERT INTO public.numo_surface_events(id,thread_id,
          source_event_id,actor_id,destination) VALUES(${quote(eventId)},
          ${quote(thread)},${quote(`source-${index}`)},${quote(actor)},
          ${quote(JSON.stringify(stored))}::jsonb);`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects",
          "public.conversations", "public.numo_surface_threads",
          "public.envelope_data_keys",
          "public.numo_surface_destination_encryption_scope",
          "public.numo_surface_events"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-pr-");
      const match = dump.match(/(COPY public\.numo_surface_events[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      const dependencies = dump.replace(match![0], "");
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, eventId] of events.entries()) {
        const row = JSON.parse(sql(restored, `SELECT destination FROM
          public.numo_surface_events WHERE id=${quote(eventId)};`));
        expect(row.ciphertext).toMatch(new RegExp(`^mdyn3:${index + 1}:`));
        const cipher = cold.fromDatabase<Record<string, string>>(Buffer.from(
          row.ciphertext.split(":")[2], "base64url").toString("utf8"));
        expect(await cold.decrypt(cipher, { scope, table: "numo_surface_events",
          column: "destination", rowId: eventId })).toEqual({
          kind: "pull_request", pullRequestId: `private-pr-${index + 1}`,
        });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const row = JSON.parse(sql(restored, `SELECT destination FROM
        public.numo_surface_events WHERE id=${quote(events[0])};`));
      await expect(wrong.decrypt(wrong.fromDatabase(Buffer.from(
        row.ciphertext.split(":")[2], "base64url").toString("utf8")),
      { scope, table: "numo_surface_events", column: "destination",
        rowId: events[0] })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.numo_surface_events(
        thread_id,source_event_id,actor_id,destination) VALUES(
        ${quote(thread)},'old-writer',${quote(actor)},'{}'::jsonb);`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores project-bound feedback SSO secrets across key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_sso_${suffix}`;
    const restored = `minddy_min591_sso_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID();
    const projects = [randomUUID(), randomUUID()];
    const boards = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key) VALUES
          (${quote(projects[0])},${quote(actor)},'SSO One','SSO1'),
          (${quote(projects[1])},${quote(actor)},'SSO Two','SSO2');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, boardId] of boards.entries()) {
        const scope: EncryptionScope = { kind: "project", id: projects[index] };
        if (index) {
          const key = await keys.current(scope);
          key.bytes.fill(0);
          await keys.rotate(scope, 1);
        }
        const secret = `fbsso_private_secret_${index + 1}`;
        const cipher = await store.encrypt(secret, { scope,
          table: "feedback_boards", column: "sso_secret", rowId: boardId });
        const stored = `mdyb3:${store.versionOf(cipher)}:${Buffer.from(cipher)
          .toString("base64url")}`;
        sql(source, `INSERT INTO public.feedback_boards(id,project_id,token,
          sso_secret) VALUES(${quote(boardId)},${quote(projects[index])},
          ${quote(`board-token-${index}`)},${quote(stored)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects",
          "public.envelope_data_keys", "public.feedback_sso_encryption_scope",
          "public.feedback_boards"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("fbsso_private_secret_");
      const match = dump.match(/(COPY public\.feedback_boards[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      const dependencies = dump.replace(match![0], "");
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, boardId] of boards.entries()) {
        const value = sql(restored, `SELECT sso_secret FROM public.feedback_boards
          WHERE id=${quote(boardId)};`);
        expect(value).toMatch(new RegExp(`^mdyb3:${index + 1}:`));
        const scope: EncryptionScope = { kind: "project", id: projects[index] };
        const cipher = cold.fromDatabase<string>(Buffer.from(value.split(":")[2],
          "base64url").toString("utf8"));
        expect(await cold.decrypt(cipher, { scope, table: "feedback_boards",
          column: "sso_secret", rowId: boardId }))
          .toBe(`fbsso_private_secret_${index + 1}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const value = sql(restored, `SELECT sso_secret FROM public.feedback_boards
        WHERE id=${quote(boards[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase<string>(Buffer.from(
        value.split(":")[2], "base64url").toString("utf8")), {
        scope: { kind: "project", id: projects[0] }, table: "feedback_boards",
        column: "sso_secret", rowId: boards[0],
      })).rejects.toThrow();
      expect(() => sql(restored, `SELECT public.write_feedback_sso_secret(
        ${quote(projects[0])},'old-writer-secret',false);`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores indexed forge mention counters without private repository names", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const source = `minddy_min591_forge_key_${suffix}`;
    const restored = `minddy_min591_forge_key_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const clear = ["mention:github:private-org/repo:alice",
      "denied:github:private-org/repo:bob"];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate,
        "SELECT count(*) FROM public.forge_mention_throttle;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      const keys = new ManagedDataKeys(registry(source, "blind_index"),
        wrapper(root, "blind_index"));
      const first = await keys.current(scope);
      const indexed = clear.map((value) => `mdyf1:${blindIndex(value, {
        scope, table: "forge_mention_throttle", column: "key",
      }, first.bytes)}`);
      first.bytes.fill(0);
      await keys.rotate(scope, 1);
      sql(source, `INSERT INTO public.forge_mention_throttle(key,window_start,count)
        VALUES(${quote(indexed[0])},now(),4),(${quote(indexed[1])},now(),2);`);
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["public.forge_mention_throttle",
          "public.forge_mention_key_encryption_scope",
          "public.envelope_data_keys"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-org/repo");
      const match = dump.match(/(COPY public\.forge_mention_throttle[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      const dependencies = dump.replace(match![0], "");
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new ManagedDataKeys(registry(restored, "blind_index"),
        wrapper(root, "blind_index"));
      const historical = await cold.byVersion(scope, 1);
      for (const [index, value] of clear.entries()) {
        const digest = `mdyf1:${blindIndex(value, {
          scope, table: "forge_mention_throttle", column: "key",
        }, historical.bytes)}`;
        expect(digest).toBe(indexed[index]);
        expect(sql(restored, `SELECT count FROM public.forge_mention_throttle
          WHERE key=${quote(digest)};`)).toBe(String([4, 2][index]));
      }
      historical.bytes.fill(0);
      const wrong = new ManagedDataKeys(registry(restored, "blind_index"),
        wrapper(randomBytes(32), "blind_index"));
      await expect(wrong.byVersion(scope, 1)).rejects.toThrow();
      expect(() => sql(restored, `SELECT public.claim_forge_mention(
        ${quote(clear[0])},3600);`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores user-bound Numo activity before its turns with cold key caches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_numo_activity_${suffix}`;
    const restored = `minddy_min591_numo_activity_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const users = [randomUUID(), randomUUID()];
    const turns = [randomUUID(), randomUUID()];
    const events = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, userId] of users.entries()) {
        const scope: EncryptionScope = { kind: "user", id: userId };
        if (index) {
          const initial = await keys.current(scope);
          initial.bytes.fill(0);
          await keys.rotate(scope, 1);
        }
        const conversation = randomUUID();
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(userId)});
          INSERT INTO public.conversations(id,user_id)
            VALUES(${quote(conversation)},${quote(userId)});
          INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
            request_id,run_id) VALUES(${quote(turns[index])},
            ${quote(conversation)},${quote(userId)},${quote(randomUUID())},
            ${quote(randomUUID())});`);
        const cipher = await store.encrypt({ delta: `private-activity-${index}` },
          { scope, table: "numo_turn_events", column: "payload",
            rowId: events[index] });
        const payload = { encrypted_turn_payload: cipher,
          encryption_version: store.versionOf(cipher), user_id: userId,
          turn_id: turns[index], event_id: events[index] };
        sql(source, `INSERT INTO public.numo_turn_events(id,turn_id,seq,type,
          payload) VALUES(${quote(events[index])},${quote(turns[index])},
          1,'content_delta',${quote(JSON.stringify(payload))}::jsonb);`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.conversations",
          "public.numo_assistant_turns", "public.numo_turn_events",
          "public.numo_event_content_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-activity-");
      const match = dump.match(/(COPY public\.numo_turn_events[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      const dependencies = dump.replace(match![0], "");
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, eventId] of events.entries()) {
        const payload = JSON.parse(sql(restored, `SELECT payload FROM
          public.numo_turn_events WHERE id=${quote(eventId)};`));
        expect(payload.encryption_version).toBe(index + 1);
        const cipher = cold.fromDatabase<Record<string, string>>(
          payload.encrypted_turn_payload);
        expect(await cold.decrypt(cipher, { scope: { kind: "user",
          id: users[index] }, table: "numo_turn_events", column: "payload",
          rowId: eventId })).toEqual({ delta: `private-activity-${index}` });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const payload = JSON.parse(sql(restored, `SELECT payload FROM
        public.numo_turn_events WHERE id=${quote(events[0])};`));
      await expect(wrong.decrypt(wrong.fromDatabase(
        payload.encrypted_turn_payload), { scope: { kind: "user",
          id: users[0] }, table: "numo_turn_events", column: "payload",
          rowId: events[0] })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.numo_turn_events(id,
        turn_id,seq,type,payload) VALUES(${quote(randomUUID())},
        ${quote(turns[0])},2,'content_delta',
        '{"delta":"obsolete writer"}'::jsonb);`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores provider lease identities before their owner and index keys", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_provider_resource_${suffix}`;
    const restored = `minddy_min591_provider_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID();
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const clear = ["github:private-org/private-repo:issue-591",
      "gitlab:private-org/private-repo:pr-3"];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});`);
      const keys = new ManagedDataKeys(registry(source, "blind_index"),
        wrapper(root, "blind_index"));
      const historical = await keys.current(scope);
      const indexed = clear.map((value) => `mdyp1:${blindIndex(value, {
        scope, table: "provider_operation_reservations", column: "resource_key",
      }, historical.bytes)}`);
      historical.bytes.fill(0);
      await keys.rotate(scope, 1);
      for (const [index, resource] of indexed.entries()) {
        sql(source, `INSERT INTO public.provider_operation_reservations(
          id,actor_id,provider,operation,resource_key,lease_expires_at)
          VALUES(${index + 1},${quote(actor)},'github','review',
          ${quote(resource)},now()+interval '1 minute');`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.envelope_data_keys",
          "public.provider_operation_resource_encryption_scope",
          "public.provider_operation_reservations"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-repo");
      const match = dump.match(/(COPY public\.provider_operation_reservations[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      const dependencies = dump.replace(match![0], "");
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new ManagedDataKeys(registry(restored, "blind_index"),
        wrapper(root, "blind_index"));
      const first = await cold.byVersion(scope, 1);
      for (const [index, value] of clear.entries()) {
        const digest = `mdyp1:${blindIndex(value, { scope,
          table: "provider_operation_reservations", column: "resource_key",
        }, first.bytes)}`;
        expect(digest).toBe(indexed[index]);
        expect(sql(restored, `SELECT count(*) FROM
          public.provider_operation_reservations
          WHERE resource_key=${quote(digest)};`)).toBe("1");
      }
      first.bytes.fill(0);
      const wrong = new ManagedDataKeys(registry(restored, "blind_index"),
        wrapper(randomBytes(32), "blind_index"));
      await expect(wrong.byVersion(scope, 1)).rejects.toThrow();
      expect(() => sql(restored, `SELECT public.reserve_provider_operation(
        ${quote(actor)},'github','review',${quote(clear[0])},10,3600,60);`))
        .toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores configuration ciphertext before two system key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_config_${suffix}`;
    const restored = `minddy_min591_config_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const values = ["private-config-first", "private-config-second"];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM public.app_config;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const [index, value] of values.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const row = await codec.encode({ key: `private_key_${index}`, value,
          encryption_version: 0, encrypted_content: null },
        { table: "app_config", scope });
        sql(source, `INSERT INTO public.app_config(key,value,encryption_version,
          encrypted_content) VALUES(${quote(String(row.key))},NULL,
          ${row.encryption_version},${quote(String(row.encrypted_content))});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["public.app_config",
          "public.app_config_encryption_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-config-");
      const match = dump.match(/(COPY public\.app_config[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      const dependencies = dump.replace(match![0], "");
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      const cold = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(root))));
      for (const [index, value] of values.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(c) FROM
          public.app_config c WHERE key=${quote(`private_key_${index}`)};`));
        expect(row.value).toBeNull();
        expect(row.encryption_version).toBe(index + 1);
        expect((await cold.decode(row, { table: "app_config", scope },
          { actorId: null, reason: "migration_verification" })).value)
          .toBe(value);
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      const first = JSON.parse(sql(restored, `SELECT row_to_json(c) FROM
        public.app_config c WHERE key='private_key_0';`));
      await expect(wrong.decode(first, { table: "app_config", scope },
        { actorId: null, reason: "migration_verification" })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.app_config(key,value)
        VALUES('obsolete_writer','clear');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores feedback merge undo links before their event and post parents", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_merge_${suffix}`;
    const restored = `minddy_min591_merge_restore_${suffix}`;
    const created: string[] = [];
    const owner = randomUUID();
    const project = randomUUID();
    const duplicate = randomUUID();
    const canonical = randomUUID();
    const event = randomUUID();
    const linked = randomUUID();
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM public.feedback_merge_events;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(owner)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(owner)},'Merge restore','MR');
        INSERT INTO public.feedback_posts(id,project_id,title,
          submitted_title,source) VALUES
          (${quote(duplicate)},${quote(project)},'Duplicate','Duplicate','internal'),
          (${quote(canonical)},${quote(project)},'Canonical','Canonical','internal');
        INSERT INTO public.feedback_merge_events(id,project_id,kind,
          dup_id,canonical_id,performed_by,payload) VALUES
          (${quote(event)},${quote(project)},'post',${quote(duplicate)},
           ${quote(canonical)},'team','{}'::jsonb);
        INSERT INTO public.feedback_merge_event_links(event_id,link_kind,target_id)
          VALUES(${quote(event)},'repointed_chain',${quote(linked)});`);
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects",
          "public.feedback_posts", "public.feedback_merge_events",
          "public.feedback_merge_event_links"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private legacy content");
      const match = dump.match(/(COPY public\.feedback_merge_event_links[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![0]}COMMIT;`);
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(match![0], "")}\nCOMMIT;`);
      sql(restored, `ALTER TABLE public.feedback_merge_event_links
        DROP CONSTRAINT feedback_merge_event_links_event_id_fkey;
        ALTER TABLE public.feedback_merge_event_links ADD CONSTRAINT
        feedback_merge_event_links_event_id_fkey FOREIGN KEY(event_id)
        REFERENCES public.feedback_merge_events(id) ON DELETE CASCADE
        NOT VALID;
        ALTER TABLE public.feedback_merge_event_links VALIDATE CONSTRAINT
        feedback_merge_event_links_event_id_fkey;`);
      expect(sql(restored, `SELECT count(*) FROM public.feedback_merge_event_links
        WHERE event_id=${quote(event)} AND target_id=${quote(linked)};`))
        .toBe("1");
      expect(() => sql(restored, `INSERT INTO public.feedback_merge_events(
        project_id,kind,dup_id,canonical_id,performed_by,payload)
        VALUES(${quote(project)},'post',${quote(duplicate)},
          ${quote(canonical)},'team','{"secret":"obsolete"}'::jsonb);`))
        .toThrow();
    } finally {
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores bounded agent chain codes before issue and project parents", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_chain_${suffix}`;
    const restored = `minddy_min591_chain_restore_${suffix}`;
    const created: string[] = [];
    const owner = randomUUID();
    const project = randomUUID();
    const issue = randomUUID();
    const chain = randomUUID();
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM public.agent_chains;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(owner)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(owner)},'Chain restore','CR');
        INSERT INTO public.issues(id,project_id,number,title)
          VALUES(${quote(issue)},${quote(project)},1,'Chain issue');
        INSERT INTO public.agent_chains(id,project_id,issue_id,owner_id,
          status,pending_event,stop_reason) VALUES
          (${quote(chain)},${quote(project)},${quote(issue)},${quote(owner)},
           'pending','{"to":"todo","source":"web"}'::jsonb,'interrupted');`);
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects",
          "public.issues", "public.agent_chains"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      const match = dump.match(/(COPY public\.agent_chains[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![0]}COMMIT;`);
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(match![0], "")}\nCOMMIT;`);
      for (const [column, parent] of [["issue_id", "issues"],
        ["project_id", "projects"], ["owner_id", "auth.users"]] as const) {
        const target = parent === "auth.users" ? "auth.users" : `public.${parent}`;
        const constraint = `agent_chains_${column}_fkey`;
        sql(restored, `ALTER TABLE public.agent_chains DROP CONSTRAINT ${constraint};
          ALTER TABLE public.agent_chains ADD CONSTRAINT ${constraint}
          FOREIGN KEY(${column}) REFERENCES ${target}(id) NOT VALID;
          ALTER TABLE public.agent_chains VALIDATE CONSTRAINT ${constraint};`);
      }
      expect(sql(restored, `SELECT pending_event->>'source'||':'||stop_reason
        FROM public.agent_chains WHERE id=${quote(chain)};`)).toBe("web:interrupted");
      expect(() => sql(restored, `UPDATE public.agent_chains
        SET stop_reason='private issue text' WHERE id=${quote(chain)};`)).toThrow();
    } finally {
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores Numo admission snapshots before owners with mixed cold keys", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_intent_${suffix}`;
    const restored = `minddy_min591_intent_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const users = [randomUUID(), randomUUID()];
    const turns = [randomUUID(), randomUUID()];
    const conversations = [randomUUID(), randomUUID()];
    const requests = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(attachmentTemplate, "SELECT count(*) FROM public.numo_assistant_turns;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${attachmentTemplate};`);
        created.push(name);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, userId] of users.entries()) {
        const scope: EncryptionScope = { kind: "user", id: userId };
        if (index) {
          const first = await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope, 1);
        }
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(userId)});
          INSERT INTO public.conversations(id,user_id)
            VALUES(${quote(conversations[index])},${quote(userId)});`);
        const rowId = JSON.stringify([conversations[index], requests[index]]);
        const cipher = await store.encrypt({ automation: { issue: {
          title: `private-intent-${index}`, plan: `private-plan-${index}` } } },
        { scope, table: "numo_assistant_turns", column: "intent", rowId });
        const intent = { encrypted_intent: cipher,
          encryption_version: store.versionOf(cipher), user_id: userId,
          conversation_id: conversations[index], request_id: requests[index] };
        sql(source, `INSERT INTO public.numo_assistant_turns(id,conversation_id,
          user_id,request_id,run_id,intent) VALUES(${quote(turns[index])},
          ${quote(conversations[index])},${quote(userId)},
          ${quote(requests[index])},${quote(randomUUID())},
          ${quote(JSON.stringify(intent))}::jsonb);`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.conversations",
          "public.numo_assistant_turns", "public.numo_turn_intent_scope",
          "public.envelope_data_keys"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-intent-");
      expect(dump).not.toContain("private-plan-");
      const match = dump.match(/(COPY public\.numo_assistant_turns[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(match![0], "")}\nCOMMIT;`);
      sql(restored, `ALTER TABLE public.numo_assistant_turns
        DROP CONSTRAINT numo_assistant_turns_conversation_id_fkey;
        ALTER TABLE public.numo_assistant_turns ADD CONSTRAINT
        numo_assistant_turns_conversation_id_fkey FOREIGN KEY(conversation_id)
        REFERENCES public.conversations(id) NOT VALID;
        ALTER TABLE public.numo_assistant_turns VALIDATE CONSTRAINT
        numo_assistant_turns_conversation_id_fkey;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, turnId] of turns.entries()) {
        const intent = JSON.parse(sql(restored, `SELECT intent FROM
          public.numo_assistant_turns WHERE id=${quote(turnId)};`));
        expect(intent.encryption_version).toBe(index + 1);
        const cipher = cold.fromDatabase<Record<string, unknown>>(
          intent.encrypted_intent);
        expect(await cold.decrypt(cipher, { scope: { kind: "user",
          id: users[index] }, table: "numo_assistant_turns", column: "intent",
          rowId: JSON.stringify([conversations[index], requests[index]]) }))
          .toEqual({ automation: { issue: { title: `private-intent-${index}`,
            plan: `private-plan-${index}` } } });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const intent = JSON.parse(sql(restored, `SELECT intent FROM
        public.numo_assistant_turns WHERE id=${quote(turns[0])};`));
      await expect(wrong.decrypt(wrong.fromDatabase(intent.encrypted_intent),
        { scope: { kind: "user", id: users[0] },
          table: "numo_assistant_turns", column: "intent",
          rowId: JSON.stringify([conversations[0], requests[0]]) }))
        .rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.numo_assistant_turns(
        conversation_id,user_id,request_id,run_id,intent)
        VALUES(${quote(conversations[0])},${quote(users[0])},
          ${quote(randomUUID())},${quote(randomUUID())},
          '{"automation":{"issue":{"title":"obsolete"}}}'::jsonb);`))
        .toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores encrypted Numo operations before their independent parents", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_op_${suffix}`;
    const restored = `minddy_min591_op_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const owner = randomUUID(), project = randomUUID(), issue = randomUUID();
    const chain = randomUUID(), conversation = randomUUID();
    const operations = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(operationTemplate, "SELECT count(*) FROM public.numo_automation_operations;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${operationTemplate};`);
        created.push(name);
      }
      const scope: EncryptionScope = { kind: "project", id: project };
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(owner)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(owner)},'Generic project','OP');
        INSERT INTO public.issues(id,project_id,number,title)
          VALUES(${quote(issue)},${quote(project)},1,'Generic issue');
        INSERT INTO public.agent_chains(id,project_id,issue_id,owner_id,status)
          VALUES(${quote(chain)},${quote(project)},${quote(issue)},
            ${quote(owner)},'stopped');
        INSERT INTO public.conversations(id,user_id,title)
          VALUES(${quote(conversation)},${quote(owner)},'Generic conversation');`);
      for (const [index, operation] of operations.entries()) {
        if (index) {
          const first = await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope, 1);
        }
        const step = index + 1;
        const bind = (column: string) => ({ scope,
          table: "numo_automation_operations", column,
          rowId: JSON.stringify([chain, step]) });
        const sealText = async (column: string, value: string) => {
          const cipher = await store.encrypt(value, bind(column));
          return `mdyo3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        };
        const sealJson = async (column: string,
          value: Record<string, unknown> | string[]) => {
          const cipher = await store.encrypt(value, bind(column));
          return { encrypted_operation_value: cipher,
            encryption_version: store.versionOf(cipher), project_id: project,
            chain_id: chain, step, field: column };
        };
        const prompt = await sealText("prompt", `private-operation-prompt-${index}`);
        const context = await sealJson("context",
          { issue: { title: `private-operation-issue-${index}` } });
        const summary = await sealText("outcome_summary",
          `private-operation-summary-${index}`);
        const blockers = await sealJson("outcome_blockers",
          [`private-operation-blocker-${index}`]);
        sql(source, `INSERT INTO public.numo_automation_operations(id,chain_id,
          step,rule_id,mode,conversation_id,request_id,prompt,locale,context,
          outcome,outcome_summary,outcome_blockers) VALUES(${quote(operation)},
          ${quote(chain)},${step},'rule','verify',${quote(conversation)},
          ${quote(randomUUID())},${quote(prompt)},'en',
          ${quote(JSON.stringify(context))}::jsonb,'failed',${quote(summary)},
          ${quote(JSON.stringify(blockers))}::jsonb);`);
      }
      const tables = ["auth.users", "public.projects", "public.issues",
        "public.agent_chains", "public.conversations",
        "public.numo_automation_operations",
        "public.numo_automation_content_scope", "public.envelope_data_keys"];
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...tables.map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["private-operation-prompt-", "private-operation-issue-",
        "private-operation-summary-", "private-operation-blocker-"]) {
        expect(dump).not.toContain(secret);
      }
      const match = dump.match(/(COPY public\.numo_automation_operations[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(match![0], "")}\nCOMMIT;`);
      for (const [column, parent] of [["chain_id", "agent_chains"],
        ["conversation_id", "conversations"]] as const) {
        const constraint = `numo_automation_operations_${column}_fkey`;
        sql(restored, `ALTER TABLE public.numo_automation_operations DROP CONSTRAINT ${constraint};
          ALTER TABLE public.numo_automation_operations ADD CONSTRAINT ${constraint}
          FOREIGN KEY(${column}) REFERENCES public.${parent}(id) NOT VALID;
          ALTER TABLE public.numo_automation_operations VALIDATE CONSTRAINT ${constraint};`);
      }
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, operation] of operations.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(o) FROM
          public.numo_automation_operations o WHERE id=${quote(operation)};`));
        const step = index + 1;
        const bind = (column: string) => ({ scope,
          table: "numo_automation_operations", column,
          rowId: JSON.stringify([chain, step]) });
        const readText = async (value: string, column: string) => cold.decrypt(
          cold.fromDatabase(Buffer.from(value.split(":")[2], "base64url")
            .toString("utf8")), bind(column));
        const readJson = async (value: { encrypted_operation_value: string },
          column: string) => cold.decrypt(cold.fromDatabase(
            value.encrypted_operation_value), bind(column));
        expect(await readText(row.prompt, "prompt"))
          .toBe(`private-operation-prompt-${index}`);
        expect(await readJson(row.context, "context"))
          .toEqual({ issue: { title: `private-operation-issue-${index}` } });
        expect(await readText(row.outcome_summary, "outcome_summary"))
          .toBe(`private-operation-summary-${index}`);
        expect(await readJson(row.outcome_blockers, "outcome_blockers"))
          .toEqual([`private-operation-blocker-${index}`]);
        expect(row.context.encryption_version).toBe(step);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const row = JSON.parse(sql(restored, `SELECT row_to_json(o) FROM
        public.numo_automation_operations o WHERE id=${quote(operations[0])};`));
      await expect(wrong.decrypt(wrong.fromDatabase(
        row.context.encrypted_operation_value), { scope,
          table: "numo_automation_operations", column: "context",
          rowId: JSON.stringify([chain, 1]) })).rejects.toThrow();
      expect(() => sql(restored, `UPDATE public.numo_automation_operations
        SET prompt='private obsolete writer' WHERE id=${quote(operations[0])};`))
        .toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);
});
