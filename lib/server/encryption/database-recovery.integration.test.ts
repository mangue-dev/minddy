import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManagedDataKeys, type KeyRegistry, type WrappedDataKey } from "./keys";
import { LocalKeyWrapper } from "./local-key-wrapper";
import { EncryptedStore, blindIndex, type EncryptionScope } from "./store";
import { EncryptedObjectCodec } from "./object-codec";
import { EncryptedRowCodec, type StoredRow } from "./row-codec";
import { buildRootSwapSql, parseRegistryOutput, planRootRewrap } from "@/scripts/rewrap-data-root.mjs";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const schemaOverride = process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE;
const template = schemaOverride ?? "minddy_min591_full_audit";
const objectiveTemplate = schemaOverride ?? "minddy_min591_objective_audit";
const categoryTemplate = schemaOverride ?? "minddy_min591_category_audit";
const draftTemplate = schemaOverride ?? "minddy_min591_draft_audit";
const feedbackTemplate = schemaOverride ?? "minddy_min591_feedback_audit";
const issueTemplate = schemaOverride ?? "minddy_min591_issue_audit";
const contextTemplate = schemaOverride ?? "minddy_min591_context_audit";
const sharedPrUrlTemplate = schemaOverride ?? "minddy_min591_relay_audit_audit";
const attachmentTemplate = schemaOverride ?? "minddy_min591_attachment_metadata_audit";
const conversationTemplate = schemaOverride ?? "minddy_min591_conversation_audit";
const userMessageTemplate = schemaOverride ?? "minddy_min591_user_message_audit";
const finalTemplate = schemaOverride ?? "minddy_min591_final_audit";
const errorTemplate = schemaOverride ?? "minddy_min591_error_audit";
const toolTemplate = schemaOverride ?? "minddy_min591_tool_audit";
const repositoryTemplate = schemaOverride ?? "minddy_min591_repo_audit";
const defaultBranchTemplate = schemaOverride ?? "minddy_min591_branch_audit";
const projectIconTemplate = schemaOverride ?? "minddy_min591_icon_audit";
const viewContentTemplate = schemaOverride ?? "minddy_min591_view_audit";
const bookmarkTemplate = schemaOverride ?? "minddy_min591_bookmark_audit";
const routineContentTemplate = schemaOverride ?? "minddy_min591_routine_audit";
const projectContentTemplate = schemaOverride ?? "minddy_min591_project_audit";
const pageContentTemplate = schemaOverride ?? "minddy_min591_page_audit";
const userAiKeyTemplate = schemaOverride ?? "minddy_min591_byok_audit";
const relayInstanceTemplate = schemaOverride ?? "minddy_min591_relay_audit";
const projectWebhookTemplate = schemaOverride ?? "minddy_min591_repo_hook_audit";
const relayProvisioningTemplate = schemaOverride ?? "minddy_min591_provisioning_audit";
const relayUserDeliveryTemplate = schemaOverride ?? "minddy_min591_user_delivery_audit";
const forgeOAuthTemplate = schemaOverride ?? "minddy_min591_forge_oauth_audit";
const mcpContentTemplate = schemaOverride ?? "minddy_min591_mcp_audit";
const appTabTemplate = schemaOverride ?? "minddy_min591_app_tab_audit";
const aiEvaluationTemplate = schemaOverride ?? "minddy_min591_ai_eval_audit";
const stripePayloadTemplate = schemaOverride ?? "minddy_min591_stripe_audit";
const billingIdentityTemplate = schemaOverride ?? "minddy_min591_billing_audit";
const oauthClientTemplate = schemaOverride ?? "minddy_min591_oauth_client_work";
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
  it("restores shared forge URLs in independent batches", async () => {
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
            VALUES(${quote(relayInstance)},'webhook_secret_registered','{}'::jsonb);`);
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
          "public.pull_requests"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const url of urls) expect(dump).not.toContain(url);
      for (const secret of ["Private PR title", "private/head-", "private/base",
        "Private prior comment", "Private relay issue", "Private relay error"])
        expect(dump).not.toContain(secret);
      expect(dump).not.toContain("private.example");
      let dependencies = dump;
      const batches = new Map<string, { header: string; lines: string[];
        footer: string }>();
      for (const table of ["forge_relay_audit", "forge_relay_deliveries", "pr_comment_edits",
        "pull_requests"]) {
        const match = dependencies.match(new RegExp(
          `(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table, { header: match![1],
          lines: match![2].trimEnd().split("\n").reverse(), footer: match![3] });
        dependencies = dependencies.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dependencies}\nCOMMIT;`);
      for (const table of ["forge_relay_audit", "forge_relay_deliveries", "pr_comment_edits",
        "pull_requests"]) {
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
        expect(Number(forge.split(":")[1])).toBe(index + 1);
        const forgeCipher = cold.fromDatabase<string>(Buffer.from(forge.split(":")[2],
          "base64url").toString("utf8"));
        expect(await cold.decrypt(forgeCipher, { scope: system,
          table: "pull_requests", column: "url", rowId: prId })).toBe(urls[index]);
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
      // The final schema already creates shared buckets, which the dump restores.
      sql(restored, "BEGIN; SET LOCAL storage.allow_delete_query='true'; DELETE FROM storage.buckets; COMMIT;");
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

  it("restores integration destinations before parents with two cold key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_integration_${suffix}`;
    const restored = `minddy_min591_integration_restored_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const owner = randomUUID(), project = randomUUID();
    const ids = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(oauthClientTemplate,
        "SELECT count(*) FROM public.integrations;")).toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${oauthClientTemplate};`);
        created.push(database);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(owner)});
        INSERT INTO public.projects(id,owner_id,name,key)
        VALUES(${quote(project)},${quote(owner)},'Integration restore','IR');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, id] of ids.entries()) {
        if (index) await keys.rotate(scope, 1);
        const value = async (field: "name" | "webhook_url", clear: string) =>
          `mdye3:${await store.encrypt(clear, { scope, table: "integrations",
            column: field, rowId: id })}`;
        const name = await value("name", `Private integration ${index}`);
        const url = await value("webhook_url",
          `https://private-${index}.example/hook`);
        sql(source, `INSERT INTO public.integrations(id,project_id,name,
          webhook_url,kind,key_hash,key_prefix) VALUES(${quote(id)},
          ${quote(project)},${quote(name)},${quote(url)},'issues',
          ${quote(String(index).repeat(64))},'mdy');`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects",
          "public.integrations", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("Private integration");
      expect(dump).not.toContain("private-0.example");
      expect(dump).not.toContain("private-1.example");
      const match = dump.match(/(COPY public\.integrations[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      for (const line of match![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(match![0], "")}\nCOMMIT;`);
      sql(restored, `ALTER TABLE public.integrations
        DROP CONSTRAINT integrations_project_id_fkey;
        ALTER TABLE public.integrations ADD CONSTRAINT
        integrations_project_id_fkey FOREIGN KEY(project_id)
        REFERENCES public.projects(id) NOT VALID;
        ALTER TABLE public.integrations VALIDATE CONSTRAINT
        integrations_project_id_fkey;`);
      const cold = new EncryptedStore(new ManagedDataKeys(
        registry(restored), wrapper(root)));
      for (const [index, id] of ids.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(i) FROM
          public.integrations i WHERE id=${quote(id)};`));
        for (const [field, expected] of [["name", `Private integration ${index}`],
          ["webhook_url", `https://private-${index}.example/hook`]] as const) {
          const cipher = cold.fromDatabase(row[field].slice(6));
          expect(cold.versionOf(cipher)).toBe(index + 1);
          expect(await cold.decrypt(cipher, { scope, table: "integrations",
            column: field, rowId: id })).toBe(expected);
        }
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(
        registry(restored), wrapper(randomBytes(32))));
      const ciphertext = sql(restored, `SELECT name FROM public.integrations
        WHERE id=${quote(ids[0])};`).slice(6);
      await expect(wrong.decrypt(wrong.fromDatabase(ciphertext), {
        scope, table: "integrations", column: "name", rowId: ids[0],
      })).rejects.toThrow();
    } finally {
      root.fill(0); vi.unstubAllEnvs(); log.mockRestore();
      for (const database of created.reverse())
        sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
    }
  }, 60_000);

  it("restores push subscriptions before owners with rotated cold keys", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_push_${suffix}`;
    const restored = `minddy_min591_push_restored_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const owner = randomUUID(), ids = [randomUUID(), randomUUID()];
    const digests = ["a".repeat(64), "b".repeat(64)];
    const scope: EncryptionScope = { kind: "user", id: owner };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(oauthClientTemplate,
        "SELECT count(*) FROM public.push_subscriptions;")).toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${oauthClientTemplate};`);
        created.push(database);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(owner)});`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, id] of ids.entries()) {
        if (index) await keys.rotate(scope, 1);
        const content = { endpoint: `https://private-${index}.example/push`,
          p256dh: `private-key-${index}`, auth: `private-auth-${index}`,
          native_installation_id: null, device_label: `Private device ${index}`,
          user_agent: `Private browser ${index}` };
        const cipher = await store.encrypt(content, { scope,
          table: "push_subscriptions", column: "content",
          rowId: digests[index] });
        sql(source, `INSERT INTO public.push_subscriptions(id,user_id,
          endpoint_digest,encrypted_content,transport) VALUES(${quote(id)},
          ${quote(owner)},${quote(digests[index])},
          ${quote(`mdye3:${cipher}`)},'web');`);
        expect(await store.decrypt(cipher, { scope,
          table: "push_subscriptions", column: "content",
          rowId: digests[index] })).toMatchObject(content);
        const revision = sql(source, `SELECT content_revision FROM
          public.push_subscriptions WHERE id=${quote(id)};`);
        expect(sql(source, `SELECT public.confirm_encrypted_content(
          'push',${quote(id)},${revision},${quote(`mdye3:${cipher}`)},NULL);`))
          .toBe("t");
      }
      expect(sql(source, "SELECT public.activate_push_content();")).toBe("t");
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.push_subscriptions",
          "public.push_content_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-0.example");
      expect(dump).not.toContain("private-1.example");
      expect(dump).not.toContain("private-auth");
      const match = dump.match(/(COPY public\.push_subscriptions[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(match).not.toBeNull();
      for (const line of match![2].trimEnd().split("\n").reverse())
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(match![0], "")}\nCOMMIT;`);
      sql(restored, `ALTER TABLE public.push_subscriptions
        DROP CONSTRAINT push_subscriptions_user_id_fkey;
        ALTER TABLE public.push_subscriptions ADD CONSTRAINT
        push_subscriptions_user_id_fkey FOREIGN KEY(user_id)
        REFERENCES auth.users(id) NOT VALID;
        ALTER TABLE public.push_subscriptions VALIDATE CONSTRAINT
        push_subscriptions_user_id_fkey;`);
      const cold = new EncryptedStore(new ManagedDataKeys(
        registry(restored), wrapper(root)));
      for (const [index, id] of ids.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(p) FROM
          public.push_subscriptions p WHERE id=${quote(id)};`));
        expect(row.endpoint).toBeNull();
        expect(row.p256dh).toBeNull();
        const cipher = cold.fromDatabase(row.encrypted_content.slice(6));
        expect(cold.versionOf(cipher)).toBe(index + 1);
        expect(await cold.decrypt(cipher, { scope,
          table: "push_subscriptions", column: "content",
          rowId: digests[index] })).toMatchObject({
          endpoint: `https://private-${index}.example/push`,
          auth: `private-auth-${index}` });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(
        registry(restored), wrapper(randomBytes(32))));
      const value = sql(restored, `SELECT encrypted_content FROM
        public.push_subscriptions WHERE id=${quote(ids[0])};`).slice(6);
      await expect(wrong.decrypt(wrong.fromDatabase(value), {
        scope, table: "push_subscriptions", column: "content",
        rowId: digests[0],
      })).rejects.toThrow();
    } finally {
      root.fill(0); vi.unstubAllEnvs(); log.mockRestore();
      for (const database of created.reverse())
        sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
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

  it("restores Numo user messages before turns and conversations with cold mixed keys", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_user_message_${suffix}`;
    const restored = `minddy_min591_user_message_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const users = [randomUUID(), randomUUID()];
    const conversations = [randomUUID(), randomUUID()];
    const turns = [randomUUID(), randomUUID()];
    const messages = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(userMessageTemplate, "SELECT count(*) FROM public.assistant_messages;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${userMessageTemplate};`);
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
        const payload = { content: `private-prompt-${index}`,
          context: { title: `private-issue-${index}` },
          metadata: { file: `private-file-${index}` },
          tool_calls: null, tool_call_id: null, tool_name: null };
        const cipher = await store.encrypt(payload, { scope,
          table: "assistant_messages", column: "user_payload", rowId: messages[index] });
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(userId)});
          INSERT INTO public.conversations(id,user_id)
            VALUES(${quote(conversations[index])},${quote(userId)});
          INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
            request_id,run_id) VALUES(${quote(turns[index])},
            ${quote(conversations[index])},${quote(userId)},
            ${quote(randomUUID())},${quote(randomUUID())});
          INSERT INTO public.assistant_messages(id,conversation_id,turn_id,
            role,content,user_payload_version) VALUES(${quote(messages[index])},
            ${quote(conversations[index])},${quote(turns[index])},'user',
            ${quote(cipher)},${store.versionOf(cipher)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.conversations",
          "public.numo_assistant_turns", "public.assistant_messages",
          "public.numo_user_message_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
      expect(dump).not.toContain("private-prompt-");
      expect(dump).not.toContain("private-issue-");
      expect(dump).not.toContain("private-file-");
      let remaining = dump;
      for (const table of ["assistant_messages", "numo_assistant_turns"]) {
        const pattern = new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`);
        const match = remaining.match(pattern);
        expect(match).not.toBeNull();
        for (const line of match![2].trimEnd().split("\n").reverse()) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
        }
        remaining = remaining.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${remaining}\nCOMMIT;`);
      for (const [table, constraint, column, parent] of [
        ["assistant_messages", "assistant_messages_conversation_id_fkey", "conversation_id", "conversations"],
        ["assistant_messages", "assistant_messages_turn_id_fkey", "turn_id", "numo_assistant_turns"],
        ["numo_assistant_turns", "numo_assistant_turns_conversation_id_fkey", "conversation_id", "conversations"],
      ]) {
        sql(restored, `ALTER TABLE public.${table} DROP CONSTRAINT ${constraint};
          ALTER TABLE public.${table} ADD CONSTRAINT ${constraint}
          FOREIGN KEY(${column}) REFERENCES public.${parent}(id) NOT VALID;
          ALTER TABLE public.${table} VALIDATE CONSTRAINT ${constraint};`);
      }
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, messageId] of messages.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(m) FROM
          public.assistant_messages m WHERE id=${quote(messageId)};`));
        expect(row.user_payload_version).toBe(index + 1);
        expect(await cold.decrypt(cold.fromDatabase(row.content), {
          scope: { kind: "user", id: users[index] }, table: "assistant_messages",
          column: "user_payload", rowId: messageId }))
          .toEqual({ content: `private-prompt-${index}`,
            context: { title: `private-issue-${index}` },
            metadata: { file: `private-file-${index}` },
            tool_calls: null, tool_call_id: null, tool_name: null });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const cipher = sql(restored, `SELECT content FROM public.assistant_messages
        WHERE id=${quote(messages[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(cipher), {
        scope: { kind: "user", id: users[0] }, table: "assistant_messages",
        column: "user_payload", rowId: messages[0] })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.assistant_messages(
        conversation_id,role,content) VALUES(${quote(conversations[0])},
        'user','private obsolete writer');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores Numo final messages and outcome copies before their parents", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_final_${suffix}`;
    const restored = `minddy_min591_final_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const users = [randomUUID(), randomUUID()];
    const conversations = [randomUUID(), randomUUID()];
    const turns = [randomUUID(), randomUUID()];
    const messages = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(finalTemplate, "SELECT count(*) FROM public.assistant_messages;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${finalTemplate};`);
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
        const answer = `private-final-${index}`;
        const content = await store.encrypt({ content: answer, context: null,
          metadata: { reasoning: `private-reasoning-${index}` },
          tool_call_id: null, tool_name: null },
        { scope, table: "assistant_messages", column: "final_payload",
          rowId: messages[index] });
        const sealedOutcome = await store.encrypt(answer, {
          scope, table: "numo_assistant_turns", column: "outcome",
          rowId: turns[index],
        });
        const outcome = `mdyf3:${store.versionOf(sealedOutcome)}:${Buffer.from(sealedOutcome).toString("base64url")}`;
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(userId)});
          INSERT INTO public.conversations(id,user_id)
            VALUES(${quote(conversations[index])},${quote(userId)});
          INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
            request_id,run_id,outcome) VALUES(${quote(turns[index])},
            ${quote(conversations[index])},${quote(userId)},
            ${quote(randomUUID())},${quote(randomUUID())},${quote(outcome)});
          INSERT INTO public.assistant_messages(id,conversation_id,turn_id,
            role,content,final_payload_version) VALUES(${quote(messages[index])},
            ${quote(conversations[index])},${quote(turns[index])},'assistant',
            ${quote(content)},${store.versionOf(content)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.conversations",
          "public.numo_assistant_turns", "public.assistant_messages",
          "public.numo_final_content_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
      expect(dump).not.toContain("private-final-");
      expect(dump).not.toContain("private-reasoning-");
      let remaining = dump;
      for (const table of ["assistant_messages", "numo_assistant_turns"]) {
        const pattern = new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`);
        const match = remaining.match(pattern);
        expect(match).not.toBeNull();
        for (const line of match![2].trimEnd().split("\n").reverse()) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
        }
        remaining = remaining.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${remaining}\nCOMMIT;`);
      for (const [table, constraint, column, parent] of [
        ["assistant_messages", "assistant_messages_conversation_id_fkey", "conversation_id", "conversations"],
        ["assistant_messages", "assistant_messages_turn_id_fkey", "turn_id", "numo_assistant_turns"],
        ["numo_assistant_turns", "numo_assistant_turns_conversation_id_fkey", "conversation_id", "conversations"],
      ]) {
        sql(restored, `ALTER TABLE public.${table} DROP CONSTRAINT ${constraint};
          ALTER TABLE public.${table} ADD CONSTRAINT ${constraint}
          FOREIGN KEY(${column}) REFERENCES public.${parent}(id) NOT VALID;
          ALTER TABLE public.${table} VALIDATE CONSTRAINT ${constraint};`);
      }
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, turnId] of turns.entries()) {
        const turn = JSON.parse(sql(restored, `SELECT row_to_json(t) FROM
          public.numo_assistant_turns t WHERE id=${quote(turnId)};`));
        const message = JSON.parse(sql(restored, `SELECT row_to_json(m) FROM
          public.assistant_messages m WHERE id=${quote(messages[index])};`));
        expect(message.final_payload_version).toBe(index + 1);
        expect(await cold.decrypt(cold.fromDatabase(message.content), {
          scope: { kind: "user", id: users[index] }, table: "assistant_messages",
          column: "final_payload", rowId: messages[index] }))
          .toEqual({ content: `private-final-${index}`, context: null,
            metadata: { reasoning: `private-reasoning-${index}` },
            tool_call_id: null, tool_name: null });
        const encoded = Buffer.from(turn.outcome.split(":")[2], "base64url")
          .toString("utf8");
        expect(await cold.decrypt(cold.fromDatabase(encoded), {
          scope: { kind: "user", id: users[index] },
          table: "numo_assistant_turns", column: "outcome", rowId: turnId }))
          .toBe(`private-final-${index}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const ciphertext = sql(restored, `SELECT content FROM public.assistant_messages
        WHERE id=${quote(messages[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(ciphertext), {
        scope: { kind: "user", id: users[0] }, table: "assistant_messages",
        column: "final_payload", rowId: messages[0] })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.assistant_messages(
        conversation_id,role,content) VALUES(${quote(conversations[0])},
        'assistant','private obsolete writer');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores Numo error sources and copies before independent parents", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_err_${suffix}`;
    const restored = `minddy_min591_err_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const users = [randomUUID(), randomUUID()];
    const projects = [randomUUID(), randomUUID()];
    const routines = [randomUUID(), randomUUID()];
    const conversations = [randomUUID(), randomUUID()];
    const turns = [randomUUID(), randomUUID()];
    const occurrences = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(errorTemplate,
        "SELECT count(*) FROM public.numo_routine_occurrences;")).toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${errorTemplate};`);
        created.push(name);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index, userId] of users.entries()) {
        const scope: EncryptionScope = { kind: "user", id: userId };
        const first = await keys.current(scope);
        first.bytes.fill(0);
        if (index) await keys.rotate(scope, 1);
        const error = `private-numo-error-${index}`;
        const encrypted = await Promise.all([
          ["conversations", conversations[index]],
          ["numo_assistant_turns", turns[index]],
          ["numo_routine_occurrences", occurrences[index]],
        ].map(async ([table, rowId]) => {
          const cipher = await store.encrypt(error, { scope,
            table: table!, column: "error_message", rowId: rowId! });
          return `mdye3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        }));
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(userId)});
          INSERT INTO public.projects(id,owner_id,name,key)
            VALUES(${quote(projects[index])},${quote(userId)},
              ${quote(`Fixture ${index}`)},${quote(`ER${index}`)});
          INSERT INTO public.agent_routines(id,project_id,owner_id,
            title,prompt,frequency) VALUES(${quote(routines[index])},
            ${quote(projects[index])},${quote(userId)},'Fixture','Fixture','daily');
          INSERT INTO public.conversations(id,user_id,status,error_message)
            VALUES(${quote(conversations[index])},${quote(userId)},'error',
              ${quote(encrypted[0])});
          INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
            request_id,run_id,status,error_message)
            VALUES(${quote(turns[index])},${quote(conversations[index])},
              ${quote(userId)},${quote(randomUUID())},${quote(randomUUID())},
              'failed',${quote(encrypted[1])});
          INSERT INTO public.numo_routine_occurrences(id,routine_id,origin,
            conversation_id,request_id,error_code,error_message)
            VALUES(${quote(occurrences[index])},${quote(routines[index])},
              'manual',${quote(conversations[index])},${quote(randomUUID())},
              'numo_unavailable',${quote(encrypted[2])});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects",
          "public.agent_routines", "public.conversations",
          "public.numo_assistant_turns", "public.numo_routine_occurrences",
          "public.numo_error_encryption_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
      expect(dump).not.toContain("private-numo-error-");
      let remaining = dump;
      for (const table of ["numo_routine_occurrences", "numo_assistant_turns",
        "agent_routines", "conversations", "projects"]) {
        const pattern = new RegExp(`(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`);
        const match = remaining.match(pattern);
        expect(match).not.toBeNull();
        for (const line of match![2].trimEnd().split("\n").reverse()) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
        }
        remaining = remaining.replace(match![0], "");
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${remaining}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, userId] of users.entries()) {
        for (const [table, rowId] of [
          ["conversations", conversations[index]],
          ["numo_assistant_turns", turns[index]],
          ["numo_routine_occurrences", occurrences[index]],
        ]) {
          const cipher = sql(restored, `SELECT error_message FROM public.${table}
            WHERE id=${quote(rowId)};`);
          expect(cipher.startsWith(`mdye3:${index + 1}:`)).toBe(true);
          const serialized = Buffer.from(cipher.split(":")[2], "base64url")
            .toString("utf8");
          expect(await cold.decrypt(cold.fromDatabase(serialized), {
            scope: { kind: "user", id: userId }, table,
            column: "error_message", rowId }))
            .toBe(`private-numo-error-${index}`);
        }
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const cipher = sql(restored, `SELECT error_message FROM public.conversations
        WHERE id=${quote(conversations[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(Buffer.from(
        cipher.split(":")[2], "base64url").toString("utf8")), {
        scope: { kind: "user", id: users[0] }, table: "conversations",
        column: "error_message", rowId: conversations[0],
      })).rejects.toThrow();
      expect(() => sql(restored, `UPDATE public.conversations
        SET error_message='private obsolete writer'
        WHERE id=${quote(conversations[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores assistant conversation titles before owners with cold mixed keys", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_chat_${suffix}`;
    const restored = `minddy_min591_chat_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const owner = randomUUID();
    const conversations = [randomUUID(), randomUUID()];
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(conversationTemplate, "SELECT count(*) FROM public.conversations;"))
        .toBe("0");
      for (const name of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${name} TEMPLATE ${conversationTemplate};`);
        created.push(name);
      }
      const scope: EncryptionScope = { kind: "user", id: owner };
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(owner)});`);
      for (const [index, conversation] of conversations.entries()) {
        if (index) {
          const first = await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope, 1);
        }
        const cipher = await store.encrypt(`private-chat-title-${index}`, {
          scope, table: "conversations", column: "title", rowId: conversation,
        });
        const title = `mdyn3:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
        sql(source, `INSERT INTO public.conversations(id,user_id,title)
          VALUES(${quote(conversation)},${quote(owner)},${quote(title)});`);
      }
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.conversations",
          "public.numo_conversation_ids", "public.numo_conversation_title_scope",
          "public.envelope_data_keys"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-chat-title-");
      const conversationCopy = dump.match(/(COPY public\.conversations[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      const identityCopy = dump.match(/(COPY public\.numo_conversation_ids[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(conversationCopy).not.toBeNull();
      expect(identityCopy).not.toBeNull();
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${identityCopy![0]}COMMIT;`);
      for (const line of conversationCopy![2].trimEnd().split("\n").reverse()) {
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${conversationCopy![1]}${line}\n${conversationCopy![3]}COMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(identityCopy![0], "").replace(conversationCopy![0], "")}\nCOMMIT;`);
      sql(restored, `ALTER TABLE public.conversations
        DROP CONSTRAINT conversations_user_id_fkey;
        ALTER TABLE public.conversations ADD CONSTRAINT
        conversations_user_id_fkey FOREIGN KEY(user_id)
        REFERENCES auth.users(id) NOT VALID;
        ALTER TABLE public.conversations VALIDATE CONSTRAINT
        conversations_user_id_fkey;`);
      sql(restored, `ALTER TABLE public.numo_conversation_ids
        DROP CONSTRAINT numo_conversation_ids_assistant_id_fkey;
        ALTER TABLE public.numo_conversation_ids ADD CONSTRAINT
        numo_conversation_ids_assistant_id_fkey FOREIGN KEY(assistant_id)
        REFERENCES public.conversations(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE public.numo_conversation_ids VALIDATE CONSTRAINT
        numo_conversation_ids_assistant_id_fkey;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index, conversation] of conversations.entries()) {
        const title = sql(restored, `SELECT title FROM public.conversations
          WHERE id=${quote(conversation)};`);
        const cipher = cold.fromDatabase(Buffer.from(title.split(":")[2],
          "base64url").toString("utf8"));
        expect(title.split(":")[1]).toBe(String(index + 1));
        expect(await cold.decrypt(cipher, { scope, table: "conversations",
          column: "title", rowId: conversation }))
          .toBe(`private-chat-title-${index}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const first = sql(restored, `SELECT title FROM public.conversations
        WHERE id=${quote(conversations[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(Buffer.from(first.split(":")[2],
        "base64url").toString("utf8")), { scope, table: "conversations",
          column: "title", rowId: conversations[0] })).rejects.toThrow();
      expect(() => sql(restored, `INSERT INTO public.conversations(user_id,title)
        VALUES(${quote(owner)},'private obsolete writer');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const name of created.reverse()) {
        sql("postgres", `DROP DATABASE ${name} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores Numo tool messages, checkpoints and ledgers child first across key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_tool_source_${suffix}`;
    const restored = `minddy_min591_tool_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const actor = randomUUID(), conversation = randomUUID();
    const turns = [randomUUID(), randomUUID()];
    const messages = [randomUUID(), randomUUID()];
    const results = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "user", id: actor };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(toolTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${toolTemplate};`);
        created.push(database);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.conversations(id,user_id,status)
          VALUES(${quote(conversation)},${quote(actor)},'generating');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const indexKeys = new ManagedDataKeys(registry(source, "blind_index"),
        wrapper(root, "blind_index"));
      const store = new EncryptedStore(keys);
      for (const [index, turn] of turns.entries()) {
        if (index) await keys.rotate(scope, 1);
        const callId = `opaque-call-${index}`;
        const checkpointClear = { phase: "tools", assistantContent:
          `Private tool thought ${index}`, assistantMessageId: messages[index],
          pendingToolCalls: [{ id: callId, args: `Private arguments ${index}` }],
          completedToolCallIds: [], roundCount: 1 };
        const checkpointCipher = await store.encrypt(checkpointClear, {
          scope,table:"numo_assistant_turns",column:"checkpoint",rowId:turn });
        const checkpoint = { phase:"tools",encrypted_payload:checkpointCipher,
          encryption_version:store.versionOf(checkpointCipher) };
        sql(source, `INSERT INTO public.numo_assistant_turns(id,conversation_id,
          user_id,request_id,run_id,status,checkpoint)
          VALUES(${quote(turn)},${quote(conversation)},${quote(actor)},
            ${quote(randomUUID())},${quote(randomUUID())},'completed',
            ${quote(JSON.stringify(checkpoint))}::jsonb);`);
        const round = await store.encrypt({ role:"assistant",
          content:`Private tool thought ${index}`,
          tool_calls:[{ id:callId,args:`Private arguments ${index}` }],
          context:null,metadata:{ reasoning:`Private reasoning ${index}` } },
        { scope,table:"assistant_messages",column:"tool_payload",
          rowId:messages[index] });
        const result = await store.encrypt({ role:"tool",
          content:`Private result ${index}`,tool_calls:null,context:null,
          metadata:{} }, { scope,table:"assistant_messages",
          column:"tool_payload",rowId:results[index] });
        sql(source, `INSERT INTO public.assistant_messages(id,conversation_id,
          turn_id,role,content,tool_payload_version,context,metadata)
          VALUES(${quote(messages[index])},${quote(conversation)},
            ${quote(turn)},'assistant',${quote(round)},
            ${store.versionOf(round)},NULL,'{}'::jsonb);
          INSERT INTO public.assistant_messages(id,conversation_id,
            turn_id,role,content,tool_call_id,tool_name,
            tool_payload_version,context,metadata)
          VALUES(${quote(results[index])},${quote(conversation)},
            ${quote(turn)},'tool',${quote(result)},${quote(callId)},'ask_user',
            ${store.versionOf(result)},NULL,'{}'::jsonb);`);
        const argumentsCipher = await store.encrypt({ text:
          `Private arguments ${index}` }, { scope,
          table:"numo_tool_operations",column:"arguments",
          rowId:`${turn}:${callId}` });
        const resultCipher = await store.encrypt({ text:
          `Private result ${index}` }, { scope,
          table:"numo_tool_operations",column:"result",
          rowId:`${turn}:${callId}` });
        const modelCipher = await store.encrypt({ text:
          `Private model result ${index}` }, { scope,
          table:"numo_tool_operations",column:"model_result",
          rowId:`${turn}:${callId}` });
        const stable = await indexKeys.current(scope);
        stable.bytes.fill(0);
        const first = await indexKeys.byVersion(scope,1);
        const digest = blindIndex(JSON.stringify({ text:
          `Private arguments ${index}` }), { scope,
          table:"numo_tool_operations",column:"arguments_digest" },
        first.bytes);
        first.bytes.fill(0);
        sql(source, `INSERT INTO public.numo_tool_operations(turn_id,tool_call_id,
          tool_name,arguments,arguments_version,arguments_digest,
          replay_policy,status,claim_token,success,result,result_version,
          model_result,model_result_version,completed_at)
          VALUES(${quote(turn)},${quote(callId)},'ask_user',
            ${quote(argumentsCipher)}::jsonb,${store.versionOf(argumentsCipher)},
            ${quote(digest)},'retry','completed',${quote(randomUUID())},true,
            ${quote(resultCipher)}::jsonb,${store.versionOf(resultCipher)},
            ${quote(modelCipher)}::jsonb,${store.versionOf(modelCipher)},now());`);
      }
      const dump = execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.conversations",
          "public.numo_conversation_ids","public.numo_assistant_turns",
          "public.assistant_messages","public.numo_tool_operations",
          "public.envelope_data_keys","public.numo_tool_content_scope"]
          .map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      expect(dump).not.toContain("Private ");
      let remainder = dump;
      const batches = new Map<string,{ header:string;lines:string[];footer:string }>();
      for (const table of ["numo_tool_operations","assistant_messages",
        "numo_assistant_turns","numo_conversation_ids","conversations","users"]) {
        const schema = table==="users" ? "auth" : "public";
        const match = remainder.match(new RegExp(
          `(COPY ${schema}\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        batches.set(table,{ header:match![1],
          lines:match![2].trimEnd().split("\n").reverse(),footer:match![3] });
        remainder = remainder.replace(match![0],"");
      }
      for (const table of ["numo_tool_operations","assistant_messages",
        "numo_assistant_turns","numo_conversation_ids","conversations","users"]) {
        const batch = batches.get(table)!;
        for (const line of batch.lines) {
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${batch.header}${line}\n${batch.footer}COMMIT;`);
        }
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${remainder}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index,turn] of turns.entries()) {
        const row = JSON.parse(sql(restored,`SELECT row_to_json(t) FROM
          public.numo_assistant_turns t JOIN public.conversations c
            ON c.id=t.conversation_id AND c.user_id=t.user_id
          WHERE t.id=${quote(turn)};`));
        expect(row.checkpoint.encryption_version).toBe(index+1);
        expect((await cold.decrypt(cold.fromDatabase<{ assistantContent: string }>(
          row.checkpoint.encrypted_payload),{ scope,
          table:"numo_assistant_turns",column:"checkpoint",rowId:turn }))
          .assistantContent).toBe(`Private tool thought ${index}`);
        const message = JSON.parse(sql(restored,`SELECT row_to_json(m) FROM
          public.assistant_messages m WHERE m.id=${quote(messages[index])}
          AND m.turn_id=${quote(turn)};`));
        expect(message.tool_calls).toBeNull();
        expect((await cold.decrypt(cold.fromDatabase<{ content: string }>(message.content),{ scope,
          table:"assistant_messages",column:"tool_payload",
          rowId:messages[index] })).content)
          .toBe(`Private tool thought ${index}`);
        const operation = JSON.parse(sql(restored,`SELECT row_to_json(o) FROM
          public.numo_tool_operations o WHERE o.turn_id=${quote(turn)};`));
        expect((await cold.decrypt(cold.fromDatabase<{ text: string }>(JSON.stringify(
          operation.result)),{ scope,table:"numo_tool_operations",
          column:"result",rowId:`${turn}:opaque-call-${index}` })).text)
          .toBe(`Private result ${index}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const first = JSON.parse(sql(restored,`SELECT row_to_json(t) FROM
        public.numo_assistant_turns t WHERE id=${quote(turns[0])};`));
      await expect(wrong.decrypt(wrong.fromDatabase(
        first.checkpoint.encrypted_payload),{ scope,
        table:"numo_assistant_turns",column:"checkpoint",rowId:turns[0] }))
        .rejects.toThrow();
      expect(() => sql(restored,`INSERT INTO public.assistant_messages(
        conversation_id,role,content,tool_calls) VALUES(${quote(conversation)},
        'assistant','Private obsolete writer','[{"id":"old"}]'::jsonb);`))
        .toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores opaque forge identities and PR copies child first across key versions", async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,20);
    const source=`minddy_min591_repo_source_${suffix}`;
    const restored=`minddy_min591_repo_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const actor=randomUUID(),project=randomUUID(),connection=randomUUID();
    const link=randomUUID(),pr=randomUUID(),edit=randomUUID();
    const scope:EncryptionScope={ kind:"system",
      id:"00000000-0000-0000-0000-000000000000" };
    const names=["Private/Former","Private/Repository"];
    const log=vi.spyOn(console,"info").mockImplementation(() => {});
    try {
      expect(sql(repositoryTemplate,"SELECT count(*) FROM auth.users;")).toBe("0");
      for (const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${repositoryTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Forge restore fixture','FRR');
        INSERT INTO public.git_connections(id,user_id,provider)
          VALUES(${quote(connection)},${quote(actor)},'github');`);
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const blindKeys=new ManagedDataKeys(registry(source,"blind_index"),
        wrapper(root,"blind_index"));
      const store=new EncryptedStore(keys);
      const tokens:string[]=[];
      for (const [index,name] of names.entries()) {
        if (index) await keys.rotate(scope,1);
        const current=await blindKeys.current(scope);
        current.bytes.fill(0);
        const stable=await blindKeys.byVersion(scope,1);
        const token=`mdyr1:${blindIndex(`github:${name.toLowerCase()}`,{
          scope,table:"forge_repository_names",column:"full_name_digest"
        },stable.bytes)}`;
        stable.bytes.fill(0);
        const cipher=await store.encrypt(name,{ scope,
          table:"forge_repository_names",column:"full_name",
          rowId:`github:${token}` });
        tokens.push(token);
        sql(source,`INSERT INTO public.forge_repository_names(provider,token,
          full_name_ciphertext,encryption_version,encryption_checked_at)
          VALUES('github',${quote(token)},${quote(cipher)},
            ${store.versionOf(cipher)},now());`);
      }
      sql(source,`INSERT INTO public.pr_comment_edits(id,provider,repo_full_name,
          pr_number,comment_id,body)
          VALUES(${quote(edit)},'github',${quote(tokens[1])},17,1,'opaque');
        INSERT INTO public.pull_requests(id,provider,repo_full_name,number)
          VALUES(${quote(pr)},'github',${quote(tokens[1])},17);
        INSERT INTO public.pull_request_syncs(provider,repo_full_name)
          VALUES('github',${quote(tokens[1])});
        INSERT INTO public.project_git_links(id,project_id,connection_id,
          provider,external_repo_id,repo_full_name,repo_previous_names)
          VALUES(${quote(link)},${quote(project)},${quote(connection)},
            'github','1717',${quote(tokens[1])},ARRAY[${quote(tokens[0])}]);
        SELECT public.activate_forge_repository_names();`);
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.projects",
          "public.git_connections","public.forge_repository_names",
          "public.forge_repository_name_scope","public.project_git_links",
          "public.pull_requests","public.pull_request_syncs",
          "public.pr_comment_edits","public.envelope_data_keys"]
          .map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      expect(dump).not.toContain("Private/");
      let remainder=dump;
      for (const table of ["pr_comment_edits","pull_requests",
        "pull_request_syncs","project_git_links","forge_repository_names"]) {
        const match=remainder.match(new RegExp(
          `(COPY public\\.${table}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`));
        expect(match).not.toBeNull();
        remainder=remainder.replace(match![0],"");
        for (const line of match![2].trimEnd().split("\n").reverse()) {
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${match![1]}${line}\n${match![3]}COMMIT;`);
        }
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${remainder}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.pull_requests p
        JOIN public.project_git_links l ON l.provider=p.provider AND
          l.repo_full_name=p.repo_full_name
        WHERE p.id=${quote(pr)} AND l.id=${quote(link)};`)).toBe("1");
      const cold=new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index,token] of tokens.entries()) {
        const record=JSON.parse(sql(restored,`SELECT row_to_json(n) FROM
          public.forge_repository_names n WHERE token=${quote(token)};`));
        expect(record.encryption_version).toBe(index+1);
        expect(await cold.decrypt(cold.fromDatabase(record.full_name_ciphertext),
          { scope,table:"forge_repository_names",column:"full_name",
            rowId:`github:${token}` })).toBe(names[index]);
      }
      const wrong=new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const first=JSON.parse(sql(restored,`SELECT row_to_json(n) FROM
        public.forge_repository_names n WHERE token=${quote(tokens[0])};`));
      await expect(wrong.decrypt(wrong.fromDatabase(first.full_name_ciphertext),
        { scope,table:"forge_repository_names",column:"full_name",
          rowId:`github:${tokens[0]}` })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.pull_requests SET
        repo_full_name='Private/Repository' WHERE id=${quote(pr)};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores project-bound forge default branches before their parent rows",async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,20);
    const source=`minddy_min591_branch_source_${suffix}`;
    const restored=`minddy_min591_branch_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const actor=randomUUID(),connection=randomUUID();
    const projects=[randomUUID(),randomUUID()];
    const links=[randomUUID(),randomUUID()];
    const branches=["private/default-one","private/default-two"];
    const log=vi.spyOn(console,"info").mockImplementation(() => {});
    try {
      expect(sql(defaultBranchTemplate,"SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for (const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${defaultBranchTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(projects[0])},${quote(actor)},'First fixture','FDB1'),
            (${quote(projects[1])},${quote(actor)},'Second fixture','FDB2');
        INSERT INTO public.git_connections(id,user_id,provider)
          VALUES(${quote(connection)},${quote(actor)},'github');`);
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const store=new EncryptedStore(keys);
      for (const [index,project] of projects.entries()) {
        const scope:EncryptionScope={ kind:"project",id:project };
        if (index) {
          const first=await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const cipher=await store.encrypt(branches[index],{
          scope,table:"project_git_links",column:"default_branch",
          rowId:project });
        const sealed=`mdyg3:${store.versionOf(cipher)}:${Buffer.from(cipher)
          .toString("base64url")}`;
        sql(source,`INSERT INTO public.project_git_links(id,project_id,
          connection_id,provider,external_repo_id,default_branch)
          VALUES(${quote(links[index])},${quote(project)},${quote(connection)},
            'github',${quote(String(index+1))},${quote(sealed)});`);
      }
      expect(sql(source,"SELECT public.activate_forge_default_branches();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.projects",
          "public.git_connections","public.project_git_links",
          "public.forge_default_branch_scope","public.envelope_data_keys"]
          .map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      expect(dump).not.toContain("private/default-");
      const copy=dump.match(/(COPY public\.project_git_links[^\n]*\n)([\s\S]*?)(\\\.\n)/);
      expect(copy).not.toBeNull();
      for (const line of copy![2].trimEnd().split("\n").reverse()) {
        sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${copy![1]}${line}\n${copy![3]}COMMIT;`);
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(copy![0],"")}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.project_git_links l
        JOIN public.projects p ON p.id=l.project_id;`)).toBe("2");
      const cold=new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(root)));
      for (const [index,project] of projects.entries()) {
        const sealed=sql(restored,`SELECT default_branch FROM
          public.project_git_links WHERE project_id=${quote(project)};`);
        const parts=sealed.split(":");
        expect(Number(parts[1])).toBe(index+1);
        expect(await cold.decrypt(cold.fromDatabase(Buffer.from(parts[2],
          "base64url").toString("utf8")),{
            scope:{ kind:"project",id:project },table:"project_git_links",
            column:"default_branch",rowId:project })).toBe(branches[index]);
      }
      const wrong=new EncryptedStore(new ManagedDataKeys(registry(restored),
        wrapper(randomBytes(32))));
      const sealed=sql(restored,`SELECT default_branch FROM public.project_git_links
        WHERE project_id=${quote(projects[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(Buffer.from(
        sealed.split(":")[2],"base64url").toString("utf8")),{
          scope:{ kind:"project",id:projects[0] },
          table:"project_git_links",column:"default_branch",
          rowId:projects[0] })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.project_git_links SET
        default_branch='private/obsolete' WHERE project_id=${quote(projects[0])};`))
        .toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores private project icon references and ciphertext objects in independent child batches",async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,20);
    const source=`minddy_min591_icon_source_${suffix}`;
    const restored=`minddy_min591_icon_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const actor=randomUUID();
    const projects=[randomUUID(),randomUUID()];
    const paths=projects.map((id)=>`${id}/${randomUUID()}.enc`);
    const pictures=[Buffer.from("private-icon-one"),
      Buffer.from("private-icon-two")];
    const log=vi.spyOn(console,"info").mockImplementation(() => {});
    try {
      expect(sql(projectIconTemplate,"SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for (const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${projectIconTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO storage.buckets(id,name,public)
          VALUES('project-icons','project-icons',true) ON CONFLICT DO NOTHING;
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(projects[0])},${quote(actor)},'First icon','ICN1'),
            (${quote(projects[1])},${quote(actor)},'Second icon','ICN2');`);
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const store=new EncryptedStore(keys);
      const codec=new EncryptedObjectCodec(store);
      for (const [index,project] of projects.entries()) {
        const scope:EncryptionScope={ kind:"project",id:project };
        if (index) {
          const first=await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const sealed=await codec.encode(pictures[index],{
          scope,bucket:"project-icons",path:paths[index] },{
          fileName:"project-icon",mimeType:"image/webp" });
        sql(source,`INSERT INTO storage.objects(bucket_id,name,metadata,
          user_metadata) VALUES('project-icons',${quote(paths[index])},
          '{"size":120}'::jsonb,${quote(JSON.stringify({
            fixture_ciphertext:sealed.toString("base64") }))}::jsonb);
          INSERT INTO public.project_icon_encrypted_objects(path,project_id)
            VALUES(${quote(paths[index])},${quote(project)});
          UPDATE public.projects SET icon_url=${quote(`/api/projects/${project}/icon/content?v=${index+1}`)},
            icon_storage_path=${quote(paths[index])} WHERE id=${quote(project)};`);
      }
      expect(sql(source,"SELECT public.activate_private_project_icons();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.projects",
          "storage.buckets","storage.objects",
          "public.project_icon_encrypted_objects",
          "public.project_icon_encryption_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      expect(dump).not.toContain("private-icon-");
      sql(restored,"BEGIN; SET LOCAL storage.allow_delete_query='true'; DELETE FROM storage.buckets; COMMIT;");
      let parents=dump;
      for (const table of ["storage.objects",
        "public.project_icon_encrypted_objects"]) {
        const pattern=new RegExp(`(COPY ${table.replace(".","\\.")}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`);
        const copy=pattern.exec(parents);
        expect(copy).not.toBeNull();
        for (const line of copy![2].trimEnd().split("\n").reverse()) {
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${copy![1]}${line}\n${copy![3]}COMMIT;`);
        }
        parents=parents.replace(copy![0],"");
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${parents}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.projects p
        JOIN public.project_icon_encrypted_objects e ON e.project_id=p.id
        JOIN storage.objects o ON o.name=e.path
        WHERE o.bucket_id='project-icons';`)).toBe("2");
      expect(sql(restored,`SELECT public FROM storage.buckets
        WHERE id='project-icons';`)).toBe("f");
      const cold=new EncryptedObjectCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(root))));
      for (const [index,project] of projects.entries()) {
        const raw=sql(restored,`SELECT user_metadata->>'fixture_ciphertext'
          FROM storage.objects WHERE name=${quote(paths[index])};`);
        const decoded=await cold.decode(cold.fromStorage(Buffer.from(raw,
          "base64")),{ scope:{ kind:"project",id:project },
          bucket:"project-icons",path:paths[index] },{
          actorId:null,reason:"migration_verification" });
        expect(decoded.bytes).toEqual(pictures[index]);
      }
      const wrong=new EncryptedObjectCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(randomBytes(32)))));
      const raw=sql(restored,`SELECT user_metadata->>'fixture_ciphertext'
        FROM storage.objects WHERE name=${quote(paths[0])};`);
      await expect(wrong.decode(wrong.fromStorage(Buffer.from(raw,"base64")),{
        scope:{ kind:"project",id:projects[0] },
        bucket:"project-icons",path:paths[0] },{
        actorId:null,reason:"migration_verification" })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.projects SET
        icon_url='https://clear.example/icon.png',icon_storage_path=NULL
        WHERE id=${quote(projects[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores encrypted project and personal views with shares before parents",async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,20);
    const source=`minddy_min591_view_source_${suffix}`;
    const restored=`minddy_min591_view_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const actor=randomUUID(),project=randomUUID();
    const views=[randomUUID(),randomUUID()];
    const share=randomUUID();
    const names=["private project view","private personal view"];
    const log=vi.spyOn(console,"info").mockImplementation(() => {});
    try {
      expect(sql(viewContentTemplate,"SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for (const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${viewContentTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'View parent','VREC');`);
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const store=new EncryptedStore(keys);
      const codec=new EncryptedRowCodec(store);
      for (const [index,id] of views.entries()) {
        const scope:EncryptionScope=index===0
          ? { kind:"project",id:project } : { kind:"user",id:actor };
        if (index) {
          const first=await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const sealed=await codec.encode({ id,
          project_id:index===0?project:null,
          user_id:index===0?null:actor,
          kind:"custom",sort:"smart",name:names[index],
          filters:{ category:[`private-${index}`] },
          display:{ hideDone:index===0 },
          encryption_version:0,encrypted_content:null },{
          table:"views",scope });
        sql(source,`INSERT INTO public.views(id,project_id,user_id,kind,
          name,filters,display,sort,encrypted_content,encryption_version)
          VALUES(${quote(id)},${index===0?quote(project):"NULL"},
            ${index===0?"NULL":quote(actor)},'custom',NULL,NULL,NULL,'smart',
            ${quote(sealed.encrypted_content as string)},
            ${sealed.encryption_version});`);
      }
      sql(source,`INSERT INTO public.view_shares(id,view_id,token,level)
        VALUES(${quote(share)},${quote(views[0])},'public-view','public');`);
      expect(sql(source,"SELECT public.activate_view_content();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.projects",
          "public.views","public.view_shares",
          "public.view_content_encryption_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      for (const name of names) expect(dump).not.toContain(name);
      let parents=dump;
      for (const table of ["public.view_shares","public.views"]) {
        const pattern=new RegExp(`(COPY ${table.replace(".","\\.")}[^\\n]*\\n)([\\s\\S]*?)(\\\\\\.\\n)`);
        const copy=pattern.exec(parents);
        expect(copy).not.toBeNull();
        for (const line of copy![2].trimEnd().split("\n").reverse()) {
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${copy![1]}${line}\n${copy![3]}COMMIT;`);
        }
        parents=parents.replace(copy![0],"");
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${parents}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.view_shares s
        JOIN public.views v ON v.id=s.view_id
        JOIN public.projects p ON p.id=v.project_id;`)).toBe("1");
      const cold=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(root))));
      for (const [index,id] of views.entries()) {
        const row=JSON.parse(sql(restored,`SELECT row_to_json(v)
          FROM public.views v WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index+1);
        const scope:EncryptionScope=index===0
          ? { kind:"project",id:project } : { kind:"user",id:actor };
        const decoded=await cold.decode(row,{ table:"views",scope },{
          actorId:null,reason:"migration_verification" });
        expect(decoded.name).toBe(names[index]);
      }
      const wrong=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(randomBytes(32)))));
      const row=JSON.parse(sql(restored,`SELECT row_to_json(v)
        FROM public.views v WHERE id=${quote(views[0])};`));
      await expect(wrong.decode(row,{ table:"views",
        scope:{ kind:"project",id:project } },{
        actorId:null,reason:"migration_verification" })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.views SET name='old writer'
        WHERE id=${quote(views[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores personal bookmarks before their owner with stable equality",async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,20);
    const source=`minddy_min591_bookmark_source_${suffix}`;
    const restored=`minddy_min591_bookmark_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32),actor=randomUUID();
    const ids=[randomUUID(),randomUUID()];
    const names=["private sprint","private roadmap"];
    const urls=["/issues?q=secret-one","/projects/private?tab=plan"];
    const scope:EncryptionScope={ kind:"user",id:actor };
    const log=vi.spyOn(console,"info").mockImplementation(() => {});
    try {
      expect(sql(bookmarkTemplate,"SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for(const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${bookmarkTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO auth.users(id) VALUES(${quote(actor)});`);
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const indexKeys=new ManagedDataKeys(registry(source,"blind_index"),
        wrapper(root,"blind_index"));
      const indexKey=await indexKeys.current(scope);
      const codec=new EncryptedRowCodec(new EncryptedStore(keys));
      for(const [index,id] of ids.entries()) {
        if(index) {
          const first=await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const sealed=await codec.encode({ id,user_id:actor,
          name:names[index],href:urls[index],encrypted_content:null,
          encryption_version:0 },{ table:"saved_views",scope });
        const nameIndex=blindIndex(names[index],{ scope,
          table:"saved_views",column:"name" },indexKey.bytes);
        sql(source,`INSERT INTO public.saved_views(id,user_id,name,href,
          name_index,encrypted_content,encryption_version)
          VALUES(${quote(id)},${quote(actor)},NULL,NULL,
            ${quote(nameIndex)},${quote(sealed.encrypted_content as string)},
            ${sealed.encryption_version});`);
      }
      indexKey.bytes.fill(0);
      expect(sql(source,"SELECT public.activate_saved_view_bookmarks();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.saved_views",
          "public.saved_view_bookmark_encryption_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      for(const secret of [...names,...urls]) expect(dump).not.toContain(secret);
      const pattern=/(COPY public\.saved_views[^\n]*\n)([\s\S]*?)(\\\.\n)/;
      const copy=pattern.exec(dump);
      expect(copy).not.toBeNull();
      for(const line of copy![2].trimEnd().split("\n").reverse()) {
        sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${copy![1]}${line}\n${copy![3]}COMMIT;`);
      }
      const parents=dump.replace(copy![0],"");
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${parents}\nCOMMIT;`);
      const cold=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(root))));
      const coldIndex=new ManagedDataKeys(registry(restored,"blind_index"),
        wrapper(root,"blind_index"));
      const lookupKey=await coldIndex.byVersion(scope,1);
      for(const [index,id] of ids.entries()) {
        const row=JSON.parse(sql(restored,`SELECT row_to_json(v)
          FROM public.saved_views v WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index+1);
        expect(row.name).toBeNull();
        expect(row.href).toBeNull();
        expect(row.name_index).toBe(blindIndex(names[index],{ scope,
          table:"saved_views",column:"name" },lookupKey.bytes));
        const plain=await cold.decode(row,{ table:"saved_views",scope },{
          actorId:actor,reason:"migration_verification" });
        expect(plain.name).toBe(names[index]);
        expect(plain.href).toBe(urls[index]);
      }
      lookupKey.bytes.fill(0);
      const wrong=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(randomBytes(32)))));
      const row=JSON.parse(sql(restored,`SELECT row_to_json(v)
        FROM public.saved_views v WHERE id=${quote(ids[0])};`));
      await expect(wrong.decode(row,{ table:"saved_views",scope },{
        actorId:actor,reason:"migration_verification" })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.saved_views SET name='old writer'
        WHERE id=${quote(ids[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for(const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores routine instructions before projects and owners",async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,20);
    const source=`minddy_min591_routine_source_${suffix}`;
    const restored=`minddy_min591_routine_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32),actor=randomUUID(),project=randomUUID();
    const ids=[randomUUID(),randomUUID()];
    const prompts=["private routine prompt one","private routine prompt two"];
    const scope:EncryptionScope={ kind:"project",id:project };
    const log=vi.spyOn(console,"info").mockImplementation(() => {});
    try {
      expect(sql(routineContentTemplate,"SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for(const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${routineContentTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
          VALUES(${quote(project)},${quote(actor)},'Routine parent','RREC');`);
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const codec=new EncryptedRowCodec(new EncryptedStore(keys));
      for(const [index,id] of ids.entries()) {
        if(index) {
          const first=await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const sealed=await codec.encode({ id,project_id:project,owner_id:actor,
          title:`private routine title ${index}`,prompt:prompts[index],
          prompt_mentions:[{ label:`private mention ${index}` }],
          base_branch:`private-branch-${index}`,
          encrypted_content:null,encryption_version:0 },{
            table:"agent_routines",scope });
        sql(source,`INSERT INTO public.agent_routines(id,project_id,owner_id,
          title,prompt,prompt_mentions,base_branch,frequency,hour,timezone,
          encrypted_content,encryption_version)
          VALUES(${quote(id)},${quote(project)},${quote(actor)},
            NULL,NULL,NULL,NULL,'weekly',9,'UTC',
            ${quote(sealed.encrypted_content as string)},
            ${sealed.encryption_version});`);
      }
      expect(sql(source,"SELECT public.activate_agent_routine_content();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.projects",
          "public.agent_routines",
          "public.agent_routine_content_encryption_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      for(const secret of prompts) expect(dump).not.toContain(secret);
      const pattern=/(COPY public\.agent_routines[^\n]*\n)([\s\S]*?)(\\\.\n)/;
      const copy=pattern.exec(dump);
      expect(copy).not.toBeNull();
      for(const line of copy![2].trimEnd().split("\n").reverse()) {
        sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${copy![1]}${line}\n${copy![3]}COMMIT;`);
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${dump.replace(copy![0],"")}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.agent_routines r
        JOIN public.projects p ON p.id=r.project_id
        JOIN auth.users u ON u.id=r.owner_id;`)).toBe("2");
      const cold=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(root))));
      for(const [index,id] of ids.entries()) {
        const row=JSON.parse(sql(restored,`SELECT row_to_json(r)
          FROM public.agent_routines r WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index+1);
        expect(row.title).toBeNull();
        expect(row.prompt).toBeNull();
        expect(row.prompt_mentions).toBeNull();
        const plain=await cold.decode(row,{ table:"agent_routines",scope },{
          actorId:actor,reason:"migration_verification" });
        expect(plain.prompt).toBe(prompts[index]);
      }
      const wrong=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(randomBytes(32)))));
      const row=JSON.parse(sql(restored,`SELECT row_to_json(r)
        FROM public.agent_routines r WHERE id=${quote(ids[0])};`));
      await expect(wrong.decode(row,{ table:"agent_routines",scope },{
        actorId:actor,reason:"migration_verification" })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.agent_routines
        SET prompt='old writer' WHERE id=${quote(ids[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for(const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores sealed projects after their member rows with independent key versions",async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,20);
    const source=`minddy_min591_project_source_${suffix}`;
    const restored=`minddy_min591_project_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32),actor=randomUUID(),member=randomUUID();
    const ids=[randomUUID(),randomUUID()];
    const names=["Private project alpha","Private project beta"];
    const scopes=ids.map((id):EncryptionScope=>({ kind:"project",id }));
    const log=vi.spyOn(console,"info").mockImplementation(() => {});
    try {
      expect(sql(projectContentTemplate,"SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for(const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${projectContentTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO auth.users(id) VALUES(${quote(actor)}),(${quote(member)});`);
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const codec=new EncryptedRowCodec(new EncryptedStore(keys));
      const current=await keys.current(scopes[1]);
      current.bytes.fill(0);
      await keys.rotate(scopes[1],1);
      for(const [index,id] of ids.entries()) {
        const sealed=await codec.encode({ id,owner_id:actor,
          name:names[index],automations:[{ prompt:`private rule ${index}` }],
          smart_assign_rules:{ [member]:`private skill ${index}` },
          encrypted_content:null,encryption_version:0 },{
            table:"projects",scope:scopes[index] });
        sql(source,`INSERT INTO public.projects(id,owner_id,name,key,
          automations,smart_assign_rules,encrypted_content,encryption_version)
          VALUES(${quote(id)},${quote(actor)},NULL,'P${index}',NULL,NULL,
            ${quote(sealed.encrypted_content as string)},${sealed.encryption_version});
          INSERT INTO public.project_members(project_id,user_id)
            VALUES(${quote(id)},${quote(member)});`);
      }
      expect(sql(source,"SELECT public.activate_project_content();")).toBe("f");
      sql(source,"INSERT INTO public.project_icon_encryption_scope(id) VALUES(true);");
      expect(sql(source,"SELECT public.activate_project_content();")).toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.projects",
          "public.project_members","public.project_icon_encryption_scope",
          "public.project_content_encryption_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      for(const secret of [...names,"private rule","private skill"]) {
        expect(dump).not.toContain(secret);
      }
      let remainder=dump;
      const copies=new Map<string,{ header:string; lines:string[]; end:string }>();
      for(const table of ["project_members","projects"]) {
        const start=remainder.indexOf(`COPY public.${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart=remainder.indexOf("\n",start)+1;
        const bodyEnd=remainder.indexOf("\\.\n",bodyStart);
        expect(bodyEnd).toBeGreaterThan(bodyStart);
        copies.set(table,{ header:remainder.slice(start,bodyStart),
          lines:remainder.slice(bodyStart,bodyEnd).trimEnd().split("\n"),
          end:"\\.\n" });
        remainder=remainder.slice(0,start)+remainder.slice(bodyEnd+3);
      }
      for(const table of ["project_members","projects"]) {
        const copy=copies.get(table)!;
        for(const line of copy.lines.reverse()) {
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${copy.header}${line}\n${copy.end}COMMIT;`);
        }
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;\n${remainder}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.project_members m
        JOIN public.projects p ON p.id=m.project_id
        JOIN auth.users u ON u.id=m.user_id;`)).toBe("2");
      const cold=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(root))));
      for(const [index,id] of ids.entries()) {
        const row=JSON.parse(sql(restored,`SELECT row_to_json(p)
          FROM public.projects p WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index+1);
        expect(row.name).toBeNull();
        expect(row.automations).toBeNull();
        expect(row.smart_assign_rules).toBeNull();
        const plain=await cold.decode(row,{ table:"projects",scope:scopes[index] },{
          actorId:actor,reason:"migration_verification" });
        expect(plain.name).toBe(names[index]);
        expect(plain.automations).toEqual([{ prompt:`private rule ${index}` }]);
      }
      const wrong=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(randomBytes(32)))));
      const row=JSON.parse(sql(restored,`SELECT row_to_json(p)
        FROM public.projects p WHERE id=${quote(ids[0])};`));
      await expect(wrong.decode(row,{ table:"projects",scope:scopes[0] },{
        actorId:actor,reason:"migration_verification" })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.projects SET name='old writer'
        WHERE id=${quote(ids[0])};`)).toThrow();
      expect(() => sql(restored,`INSERT INTO public.projects(id,owner_id,name,key)
        VALUES(${quote(randomUUID())},${quote(actor)},'old writer','OLD');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for(const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores sealed page trees from independent child-first batches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_page_source_${suffix}`;
    const restored = `minddy_min591_page_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32), actor = randomUUID(), project = randomUUID();
    const parents = [randomUUID(), randomUUID()];
    const children = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "project", id: project };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(pageContentTemplate, "SELECT count(*) FROM auth.users;")).toBe("0");
      expect(sql(pageContentTemplate, "SELECT count(*) FROM public.pages;")).toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${pageContentTemplate};`);
        created.push(database);
      }
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,key)
        VALUES(${quote(project)},${quote(actor)},'Project','PGRE');`);
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const index of [0, 1]) {
        if (index === 1) await keys.rotate(scope, 1);
        const propertyId = randomUUID();
        for (const [isParent, id] of [[true, parents[index]],
          [false, children[index]]] as const) {
          const title = `Private page ${index} ${isParent ? "parent" : "child"}`;
          const plain: StoredRow = {
            id, project_id: project, title, icon: "private-icon",
            content: { type: "doc", content: [{ type: "paragraph",
              content: [{ type: "text", text: `Private body ${index}` }] }] },
            database_schema: isParent
              ? [{ id: propertyId, name: `Private property ${index}`, type: "text" }]
              : null,
            database_title_name: isParent ? `Private title ${index}` : null,
            property_values: isParent ? {} : { [propertyId]: `Private cell ${index}` },
            encrypted_content: null, encryption_version: 0,
          };
          const sealed = await codec.encode(plain, { table: "pages", scope });
          sql(source, `INSERT INTO public.pages(id,project_id,parent_id,
              position,created_by,title,icon,content,database_schema,
              database_title_name,property_values,search_text,
              encrypted_content,encryption_version,page_is_database,
              page_has_values,page_is_blank)
            VALUES(${quote(id)},${quote(project)},
              ${isParent ? "NULL" : quote(parents[index])},'a',${quote(actor)},
              NULL,NULL,NULL,NULL,NULL,NULL,NULL,
              ${quote(sealed.encrypted_content as string)},
              ${sealed.encryption_version},${isParent},${!isParent},false);`);
        }
        keys.invalidate(scope);
      }
      expect(sql(source, "SELECT public.activate_page_content();")).toBe("t");
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects", "public.pages",
          "public.page_content_encryption_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["Private page", "Private body", "Private cell",
        "Private property", "Private title", "private-icon"]) {
        expect(dump).not.toContain(secret);
      }
      let remainder = dump;
      const start = remainder.indexOf("COPY public.pages ");
      expect(start).toBeGreaterThanOrEqual(0);
      const bodyStart = remainder.indexOf("\n", start) + 1;
      const bodyEnd = remainder.indexOf("\\.\n", bodyStart);
      const header = remainder.slice(start, bodyStart);
      const lines = remainder.slice(bodyStart, bodyEnd).trimEnd().split("\n");
      remainder = remainder.slice(0, start) + remainder.slice(bodyEnd + 3);
      expect(lines).toHaveLength(4);
      for (const id of [...children, ...parents]) {
        const line = lines.find((item) => item.startsWith(`${id}\t`));
        expect(line).toBeDefined();
        sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
          ${header}${line}\n\\.\nCOMMIT;`);
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored, `SELECT count(*) FROM public.pages child
        JOIN public.pages parent ON parent.id=child.parent_id
        JOIN public.projects project ON project.id=child.project_id
        JOIN auth.users actor ON actor.id=child.created_by;`)).toBe("2");
      const cold = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(root))));
      for (const [index, id] of [...parents, ...children].entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(p)
          FROM public.pages p WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index % 2 + 1);
        for (const field of ["title", "icon", "content", "database_schema",
          "database_title_name", "property_values", "search_text"]) {
          expect(row[field]).toBeNull();
        }
        const plain = await cold.decode(row, { table: "pages", scope },
          { actorId: actor, reason: "migration_verification" });
        expect(plain.title).toBe(`Private page ${index % 2} ${index < 2 ? "parent" : "child"}`);
        if (index >= 2) {
          expect(Object.values(plain.property_values as object))
            .toEqual([`Private cell ${index % 2}`]);
        }
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      const row = JSON.parse(sql(restored, `SELECT row_to_json(p)
        FROM public.pages p WHERE id=${quote(parents[0])};`));
      await expect(wrong.decode(row, { table: "pages", scope },
        { actorId: actor, reason: "migration_verification" })).rejects.toThrow();
      expect(() => sql(restored, `UPDATE public.pages SET title='Old writer'
        WHERE id=${quote(children[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores sealed BYOK assignments before credentials and users", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_byok_source_${suffix}`;
    const restored = `minddy_min591_byok_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32), users = [randomUUID(), randomUUID()];
    const ids = [randomUUID(), randomUUID()];
    const scopes = users.map((id): EncryptionScope => ({ kind: "user", id }));
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(userAiKeyTemplate, "SELECT count(*) FROM auth.users;"))
        .toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${userAiKeyTemplate};`);
        created.push(database);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const [index, user] of users.entries()) {
        sql(source, `INSERT INTO auth.users(id) VALUES(${quote(user)});`);
        if (index === 1) {
          const first = await keys.current(scopes[index]);
          first.bytes.fill(0);
          await keys.rotate(scopes[index], 1);
        }
        const sealed = await codec.encode({ id: ids[index], user_id: user,
          provider: "openrouter", key_encrypted: `private-byok-${index}`,
          base_url: `https://private-endpoint-${index}.example/v1`,
          feature_models: { assistant: `private-model-${index}` },
          encrypted_content: null, encryption_version: 0 },
        { table: "user_ai_keys", scope: scopes[index] });
        sql(source, `INSERT INTO public.user_ai_keys(id,user_id,provider,
            key_encrypted,base_url,feature_models,encrypted_content,
            encryption_version)
          VALUES(${quote(ids[index])},${quote(user)},'openrouter',NULL,NULL,
            NULL,${quote(sealed.encrypted_content as string)},
            ${sealed.encryption_version});
          INSERT INTO public.user_ai_capability_assignments(
            user_id,capability,ai_key_id)
          VALUES(${quote(user)},'text',${quote(ids[index])});`);
        keys.invalidate(scopes[index]);
      }
      expect(sql(source, "SELECT public.activate_user_ai_key_content();"))
        .toBe("t");
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.user_ai_keys",
          "public.user_ai_capability_assignments",
          "public.user_ai_key_content_scope", "public.envelope_data_keys"]
          .map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["private-byok", "private-endpoint",
        "private-model"]) expect(dump).not.toContain(secret);
      let remainder = dump;
      const copies = new Map<string, { header: string; lines: string[] }>();
      for (const table of ["user_ai_capability_assignments", "user_ai_keys"]) {
        const start = remainder.indexOf(`COPY public.${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart = remainder.indexOf("\n", start) + 1;
        const bodyEnd = remainder.indexOf("\\.\n", bodyStart);
        copies.set(table, { header: remainder.slice(start, bodyStart),
          lines: remainder.slice(bodyStart, bodyEnd).trimEnd().split("\n") });
        remainder = remainder.slice(0, start) + remainder.slice(bodyEnd + 3);
      }
      for (const table of ["user_ai_capability_assignments", "user_ai_keys"]) {
        const copy = copies.get(table)!;
        for (const line of copy.lines.reverse()) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
            ${copy.header}${line}\n\\.\nCOMMIT;`);
        }
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored, `SELECT count(*)
        FROM public.user_ai_capability_assignments assignment
        JOIN public.user_ai_keys credential
          ON credential.id=assignment.ai_key_id
        JOIN auth.users owner ON owner.id=credential.user_id;`)).toBe("2");
      const cold = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(root))));
      for (const [index, id] of ids.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(k)
          FROM public.user_ai_keys k WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index + 1);
        expect(row.key_encrypted).toBeNull();
        expect(row.base_url).toBeNull();
        expect(row.feature_models).toBeNull();
        const plain = await cold.decode(row,
          { table: "user_ai_keys", scope: scopes[index] },
          { actorId: users[index], reason: "migration_verification" });
        expect(plain.key_encrypted).toBe(`private-byok-${index}`);
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      const row = JSON.parse(sql(restored, `SELECT row_to_json(k)
        FROM public.user_ai_keys k WHERE id=${quote(ids[0])};`));
      await expect(wrong.decode(row,
        { table: "user_ai_keys", scope: scopes[0] },
        { actorId: users[0], reason: "migration_verification" }))
        .rejects.toThrow();
      expect(() => sql(restored, `UPDATE public.user_ai_keys
        SET key_encrypted='old writer' WHERE id=${quote(ids[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores sealed relay claims before their instances across key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_relay_source_${suffix}`;
    const restored = `minddy_min591_relay_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32), ids = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(relayInstanceTemplate,
        "SELECT count(*) FROM public.forge_relay_instances;"))
        .toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${relayInstanceTemplate};`);
        created.push(database);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const [index, id] of ids.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const sealed = await codec.encode({ id,
          name: `private-relay-name-${index}`,
          webhook_url: `https://private-relay-${index}.example/webhook`,
          webhook_secret_encrypted: `private-relay-secret-${index}`,
          encrypted_content: null, encryption_version: 0 },
        { table: "forge_relay_instances", scope });
        sql(source, `INSERT INTO public.forge_relay_instances(
            id,name,public_key,webhook_url,webhook_secret_encrypted,
            encrypted_content,encryption_version)
          VALUES(${quote(id)},NULL,${quote(`public-key-${index}`)},
            NULL,NULL,${quote(sealed.encrypted_content as string)},
            ${sealed.encryption_version});
          INSERT INTO public.forge_relay_installations(
            instance_id,installation_id,account_login)
          VALUES(${quote(id)},${4100 + index},'public-account');`);
        keys.invalidate(scope);
      }
      expect(sql(source,
        "SELECT public.activate_forge_relay_instance_content();"))
        .toBe("t");
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["public.forge_relay_instances",
          "public.forge_relay_installations",
          "public.forge_relay_instance_content_scope",
          "public.envelope_data_keys"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const secret of ["private-relay-name", "private-relay-secret",
        "private-relay-0.example"]) expect(dump).not.toContain(secret);
      let remainder = dump;
      const copies = new Map<string, { header: string; lines: string[] }>();
      for (const table of ["forge_relay_installations", "forge_relay_instances"]) {
        const start = remainder.indexOf(`COPY public.${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart = remainder.indexOf("\n", start) + 1;
        const bodyEnd = remainder.indexOf("\\.\n", bodyStart);
        copies.set(table, { header: remainder.slice(start, bodyStart),
          lines: remainder.slice(bodyStart, bodyEnd).trimEnd().split("\n") });
        remainder = remainder.slice(0, start) + remainder.slice(bodyEnd + 3);
      }
      for (const table of ["forge_relay_installations", "forge_relay_instances"]) {
        for (const line of copies.get(table)!.lines.reverse()) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
            ${copies.get(table)!.header}${line}\n\\.\nCOMMIT;`);
        }
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored, `SELECT count(*)
        FROM public.forge_relay_installations claim
        JOIN public.forge_relay_instances instance
          ON instance.id=claim.instance_id;`)).toBe("2");
      const cold = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(root))));
      for (const [index, id] of ids.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(i)
          FROM public.forge_relay_instances i WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index + 1);
        expect(row.name).toBeNull();
        expect(row.webhook_url).toBeNull();
        expect(row.webhook_secret_encrypted).toBeNull();
        const plain = await cold.decode(row,
          { table: "forge_relay_instances", scope },
          { actorId: null, reason: "migration_verification" });
        expect(plain.name).toBe(`private-relay-name-${index}`);
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored), wrapper(randomBytes(32)))));
      const row = JSON.parse(sql(restored, `SELECT row_to_json(i)
        FROM public.forge_relay_instances i WHERE id=${quote(ids[0])};`));
      await expect(wrong.decode(row,
        { table: "forge_relay_instances", scope },
        { actorId: null, reason: "migration_verification" }))
        .rejects.toThrow();
      expect(() => sql(restored, `UPDATE public.forge_relay_instances
        SET name='old writer' WHERE id=${quote(ids[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores repository hook secrets before links, projects and owners", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_hook_source_${suffix}`;
    const restored = `minddy_min591_hook_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32), owner = randomUUID();
    const projects = [randomUUID(), randomUUID()];
    const connection = randomUUID();
    const ids = [randomUUID(), randomUUID()];
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(projectWebhookTemplate,
        "SELECT count(*) FROM public.project_git_links;"))
        .toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${projectWebhookTemplate};`);
        created.push(database);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      sql(source, `INSERT INTO auth.users(id) VALUES(${quote(owner)});
        INSERT INTO public.projects(id,key,owner_id,name)
          VALUES(${quote(projects[0])},'HKAA','${owner}','Fixture'),
            (${quote(projects[1])},'HKBB','${owner}','Fixture');
        INSERT INTO public.git_connections(id,user_id,provider)
          VALUES(${quote(connection)},${quote(owner)},'gitlab');`);
      for (const [index, id] of ids.entries()) {
        if (index === 1) await keys.rotate(scope, 1);
        const repoId = String(4200 + index);
        const cipher = await store.encrypt(`private-hook-secret-${index}`, {
          scope, table: "project_git_links",
          column: "webhook_secret_encrypted",
          rowId: JSON.stringify(["gitlab",repoId]),
        });
        sql(source, `INSERT INTO public.project_git_links(id,project_id,
            connection_id,provider,external_repo_id,
            webhook_secret_encrypted)
          VALUES(${quote(id)},${quote(projects[index])},${quote(connection)},
            'gitlab',${quote(repoId)},${quote(cipher)});`);
        keys.invalidate(scope);
      }
      expect(sql(source,
        "SELECT public.activate_project_git_webhook_secrets();"))
        .toBe("t");
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["auth.users", "public.projects",
          "public.git_connections", "public.project_git_links",
          "public.project_git_webhook_secret_scope",
          "public.envelope_data_keys"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      expect(dump).not.toContain("private-hook-secret");
      let remainder = dump;
      const copies = new Map<string, { header: string; lines: string[] }>();
      for (const table of ["public.project_git_links","public.git_connections",
        "public.projects","auth.users"]) {
        const start = remainder.indexOf(`COPY ${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart = remainder.indexOf("\n", start) + 1;
        const bodyEnd = remainder.indexOf("\\.\n", bodyStart);
        copies.set(table, { header: remainder.slice(start, bodyStart),
          lines: remainder.slice(bodyStart, bodyEnd).trimEnd().split("\n") });
        remainder = remainder.slice(0, start) + remainder.slice(bodyEnd + 3);
      }
      for (const table of ["public.project_git_links","public.git_connections",
        "public.projects","auth.users"]) {
        for (const line of copies.get(table)!.lines.reverse()) {
          sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
            ${copies.get(table)!.header}${line}\n\\.\nCOMMIT;`);
        }
      }
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored, `SELECT count(*) FROM public.project_git_links link
        JOIN public.git_connections connection ON connection.id=link.connection_id
        JOIN public.projects project ON project.id=link.project_id
        JOIN auth.users owner ON owner.id=project.owner_id;`)).toBe("2");
      const cold = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      for (const [index, id] of ids.entries()) {
        const row = JSON.parse(sql(restored, `SELECT row_to_json(link)
          FROM public.project_git_links link WHERE id=${quote(id)};`));
        expect(row.webhook_secret_checked_at).not.toBeNull();
        const plain = await cold.decrypt<string>(
          cold.fromDatabase(row.webhook_secret_encrypted), {
            scope, table: "project_git_links",
            column: "webhook_secret_encrypted",
            rowId: JSON.stringify(["gitlab",String(4200 + index)]),
          });
        expect(plain).toBe(`private-hook-secret-${index}`);
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      const cipher = sql(restored, `SELECT webhook_secret_encrypted
        FROM public.project_git_links WHERE id=${quote(ids[0])};`);
      await expect(wrong.decrypt<string>(wrong.fromDatabase(cipher), {
        scope, table: "project_git_links",
        column: "webhook_secret_encrypted",
        rowId: JSON.stringify(["gitlab","4200"]),
      })).rejects.toThrow();
      expect(() => sql(restored, `UPDATE public.project_git_links
        SET webhook_secret_encrypted='{"__encrypted":true}'
        WHERE id=${quote(ids[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores the sealed relay identity with historical keys and rejects a wrong root", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_provision_source_${suffix}`;
    const restored = `minddy_min591_provision_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32), instance = randomUUID();
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const context = { scope, table: "forge_relay_provisioning",
      column: "encrypted_content", rowId: "singleton" };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(relayProvisioningTemplate,
        "SELECT count(*) FROM public.forge_relay_provisioning;"))
        .toBe("0");
      for (const database of [source, restored]) {
        sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${relayProvisioningTemplate};`);
        created.push(database);
      }
      const keys = new ManagedDataKeys(registry(source), wrapper(root));
      const store = new EncryptedStore(keys);
      const legacyCipher = await store.encrypt({ relay_url: "https://old-relay.example",
        signing_key: "historical-private-key",
        webhook_secret: "historical-webhook-secret" },context);
      await keys.rotate(scope, 1);
      keys.invalidate(scope);
      const current = { relay_url: "https://private-relay.example",
        signing_key: "current-private-key",
        webhook_secret: "current-webhook-secret" };
      const cipher = await store.encrypt(current,context);
      sql(source, `INSERT INTO public.forge_relay_provisioning(id,instance_id,
        encrypted_content,encryption_version)
        VALUES(true,${quote(instance)},${quote(cipher)},2);`);
      expect(sql(source,
        "SELECT public.activate_forge_relay_provisioning_content();"))
        .toBe("t");
      const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U",
        "supabase_admin", "-d", source, "--data-only", "--no-owner",
        "--no-privileges", ...["public.forge_relay_provisioning",
          "public.forge_relay_provisioning_scope",
          "public.envelope_data_keys"].map((table) => `--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      for (const value of Object.values(current)) expect(dump).not.toContain(value);
      sql(restored, `BEGIN; SET LOCAL session_replication_role=replica;
        ${dump}\nCOMMIT;`);
      const cold = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      const row = JSON.parse(sql(restored,
        "SELECT row_to_json(p) FROM public.forge_relay_provisioning p;"));
      expect(row.relay_url).toBeNull();
      expect(row.signing_key_encrypted).toBeNull();
      expect(row.webhook_secret_encrypted).toBeNull();
      expect(await cold.decrypt(cold.fromDatabase(row.encrypted_content),context))
        .toEqual(current);
      expect(await cold.decrypt(cold.fromDatabase(legacyCipher),context))
        .toMatchObject({ signing_key: "historical-private-key" });
      const wrong = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      await expect(wrong.decrypt(
        wrong.fromDatabase(row.encrypted_content),context)).rejects.toThrow();
      expect(() => sql(restored, `UPDATE public.forge_relay_provisioning
        SET relay_url='https://old-writer.example',
          signing_key_encrypted='old',webhook_secret_encrypted='old',
          encrypted_content=NULL,encryption_version=0;`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  }, 60_000);

  it("restores brokered OAuth deliveries before relay parents with mixed keys", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const source = `minddy_min591_delivery_source_${suffix}`;
    const restored = `minddy_min591_delivery_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32), instance = randomUUID();
    const ids = [randomUUID(),randomUUID()];
    const scope: EncryptionScope = { kind: "system",
      id: "00000000-0000-0000-0000-000000000000" };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(sql(relayUserDeliveryTemplate,
        "SELECT count(*) FROM public.forge_relay_user_deliveries;"))
        .toBe("0");
      for (const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${relayUserDeliveryTemplate};`);
        created.push(database);
      }
      const keys = new ManagedDataKeys(registry(source),wrapper(root));
      const store = new EncryptedStore(keys);
      sql(source,`INSERT INTO public.forge_relay_instances(id,name,public_key)
        VALUES(${quote(instance)},'Fixture relay','public-key');`);
      for (const [index,id] of ids.entries()) {
        if (index === 1) await keys.rotate(scope,1);
        const ciphertext = await store.encrypt({
          accessToken: `private-access-${index}`,
          refreshToken: `private-refresh-${index}` },{
          scope, table: "forge_relay_user_deliveries",
          column: "encrypted_content", rowId: JSON.stringify([id,instance]),
        });
        sql(source,`INSERT INTO public.forge_relay_user_deliveries(
          id,instance_id,user_id,provider_account_id,
          encrypted_content,encryption_version)
          VALUES(${quote(id)},${quote(instance)},'user','42',
            ${quote(ciphertext)},${index+1});`);
        keys.invalidate(scope);
      }
      expect(sql(source,
        "SELECT public.activate_forge_relay_user_deliveries();"))
        .toBe("t");
      const dump = execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges", ...["public.forge_relay_instances",
          "public.forge_relay_user_deliveries",
          "public.forge_relay_user_delivery_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      { encoding: "utf8", maxBuffer: 4*1024*1024 });
      expect(dump).not.toContain("private-access-");
      expect(dump).not.toContain("private-refresh-");
      let remainder = dump;
      const copies = new Map<string,{header:string;lines:string[]}>();
      for (const table of ["public.forge_relay_user_deliveries",
        "public.forge_relay_instances"]) {
        const start = remainder.indexOf(`COPY ${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart = remainder.indexOf("\n",start)+1;
        const bodyEnd = remainder.indexOf("\\.\n",bodyStart);
        copies.set(table,{ header: remainder.slice(start,bodyStart),
          lines: remainder.slice(bodyStart,bodyEnd).trimEnd().split("\n") });
        remainder = remainder.slice(0,start)+remainder.slice(bodyEnd+3);
      }
      for (const table of ["public.forge_relay_user_deliveries",
        "public.forge_relay_instances"]) {
        for (const line of copies.get(table)!.lines.reverse()) {
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
            ${copies.get(table)!.header}${line}\n\\.\nCOMMIT;`);
        }
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.forge_relay_user_deliveries d
        JOIN public.forge_relay_instances i ON i.id=d.instance_id;`))
        .toBe("2");
      const cold = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      for (const [index,id] of ids.entries()) {
        const row = JSON.parse(sql(restored,`SELECT row_to_json(d)
          FROM public.forge_relay_user_deliveries d WHERE id=${quote(id)};`));
        expect(row.access_token_encrypted).toBeNull();
        expect(row.refresh_token_encrypted).toBeNull();
        expect(row.encryption_checked_at).not.toBeNull();
        expect(await cold.decrypt(cold.fromDatabase(row.encrypted_content),{
          scope, table: "forge_relay_user_deliveries",
          column: "encrypted_content", rowId: JSON.stringify([id,instance]),
        })).toEqual({ accessToken: `private-access-${index}`,
          refreshToken: `private-refresh-${index}` });
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      const cipher = sql(restored,`SELECT encrypted_content
        FROM public.forge_relay_user_deliveries WHERE id=${quote(ids[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(cipher),{
        scope, table: "forge_relay_user_deliveries",
        column: "encrypted_content", rowId: JSON.stringify([ids[0],instance]),
      })).rejects.toThrow();
      expect(() => sql(restored,`INSERT INTO public.forge_relay_user_deliveries(
        instance_id,user_id,provider_account_id,access_token_encrypted)
        VALUES(${quote(instance)},'user','43','old-access');`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);

  it("restores persistent forge grants before users with two key versions", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0,20);
    const source = `minddy_min591_oauth_source_${suffix}`;
    const restored = `minddy_min591_oauth_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32), users = [randomUUID(),randomUUID()];
    const connectionIds = [randomUUID(),randomUUID()];
    const identityIds = [randomUUID(),randomUUID()];
    const log = vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      expect(sql(forgeOAuthTemplate,
        "SELECT count(*) FROM public.git_connections;"))
        .toBe("0");
      for (const database of [source,restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${forgeOAuthTemplate};`);
        created.push(database);
      }
      const keys = new ManagedDataKeys(registry(source),wrapper(root));
      const store = new EncryptedStore(keys);
      for (const [index,user] of users.entries()) {
        const scope: EncryptionScope = { kind: "user",id:user };
        sql(source,`INSERT INTO auth.users(id) VALUES(${quote(user)});`);
        if (index === 1) {
          const first = await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const connection = await store.encrypt({
          accessToken: `private-gitlab-access-${index}`,
          refreshToken: `private-gitlab-refresh-${index}` },{
          scope,table:"git_connections",column:"encrypted_content",
          rowId:JSON.stringify([user,"gitlab",String(4200+index)]),
        });
        const identity = await store.encrypt({
          accessToken: `private-github-access-${index}`,
          refreshToken: `private-github-refresh-${index}` },{
          scope,table:"git_user_identities",column:"encrypted_content",
          rowId:JSON.stringify([user,"github"]),
        });
        sql(source,`INSERT INTO public.git_connections(id,user_id,provider,
          provider_account_id,encrypted_content,encryption_version)
          VALUES(${quote(connectionIds[index])},${quote(user)},'gitlab',
            ${quote(String(4200+index))},${quote(connection)},${index+1});
          INSERT INTO public.git_user_identities(id,user_id,provider,
            provider_account_id,encrypted_content,encryption_version)
          VALUES(${quote(identityIds[index])},${quote(user)},'github',
            ${quote(String(7200+index))},${quote(identity)},${index+1});`);
        keys.invalidate(scope);
      }
      expect(sql(source,"SELECT public.activate_forge_oauth_tokens();"))
        .toBe("t");
      const dump = execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges", ...["auth.users","public.git_connections",
          "public.git_user_identities","public.forge_oauth_token_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      { encoding:"utf8",maxBuffer:4*1024*1024 });
      for (const marker of ["private-gitlab-access","private-gitlab-refresh",
        "private-github-access","private-github-refresh"]) {
        expect(dump).not.toContain(marker);
      }
      let remainder = dump;
      const copies = new Map<string,{header:string;lines:string[]}>();
      for (const table of ["public.git_connections",
        "public.git_user_identities","auth.users"]) {
        const start = remainder.indexOf(`COPY ${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart = remainder.indexOf("\n",start)+1;
        const bodyEnd = remainder.indexOf("\\.\n",bodyStart);
        copies.set(table,{ header:remainder.slice(start,bodyStart),
          lines:remainder.slice(bodyStart,bodyEnd).trimEnd().split("\n") });
        remainder = remainder.slice(0,start)+remainder.slice(bodyEnd+3);
      }
      for (const table of ["public.git_connections",
        "public.git_user_identities","auth.users"]) {
        for (const line of copies.get(table)!.lines.reverse()) {
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
            ${copies.get(table)!.header}${line}\n\\.\nCOMMIT;`);
        }
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.git_connections c
        JOIN auth.users u ON u.id=c.user_id;`)).toBe("2");
      const cold = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      for (const [index,user] of users.entries()) {
        const scope: EncryptionScope = { kind:"user",id:user };
        for (const [table,id,provider,account,expected] of [
          ["git_connections",connectionIds[index],"gitlab",
            String(4200+index),`private-gitlab-access-${index}`],
          ["git_user_identities",identityIds[index],"github",
            null,`private-github-access-${index}`],
        ] as const) {
          const row = JSON.parse(sql(restored,`SELECT row_to_json(t)
            FROM public.${table} t WHERE id=${quote(id)};`));
          expect(row.access_token_encrypted).toBeNull();
          expect(row.refresh_token_encrypted).toBeNull();
          expect(row.encryption_checked_at).not.toBeNull();
          const plain = await cold.decrypt<{accessToken:string}>(
            cold.fromDatabase(row.encrypted_content),{
              scope,table,column:"encrypted_content",
              rowId:JSON.stringify(account === null
                ? [user,provider] : [user,provider,account]),
            });
          expect(plain.accessToken).toBe(expected);
        }
      }
      const wrong = new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      const cipher = sql(restored,`SELECT encrypted_content FROM
        public.git_connections WHERE id=${quote(connectionIds[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(cipher),{
        scope:{kind:"user",id:users[0]},table:"git_connections",
        column:"encrypted_content",
        rowId:JSON.stringify([users[0],"gitlab","4200"]),
      })).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.git_connections SET
        access_token_encrypted='old',encrypted_content=NULL,
        encryption_version=0 WHERE id=${quote(connectionIds[0])};`))
        .toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse()) {
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
      }
    }
  },60_000);
});

describe.skipIf(!enabled)("personal MCP content PostgreSQL recovery", () => {
  it("restores OAuth children before connections with two keys and rejects a wrong root", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const source = `minddy_min591_mcp_source_${suffix}`;
    const restored = `minddy_min591_mcp_restore_${suffix}`;
    const created: string[] = [];
    const root = randomBytes(32);
    const users = [randomUUID(), randomUUID()];
    const ids = [randomUUID(), randomUUID()];
    const states = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
    const log = vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      expect(sql(mcpContentTemplate,
        "SELECT count(*) FROM public.user_mcp_connections;"))
        .toBe("0");
      for (const database of [source, restored]) {
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${mcpContentTemplate};`);
        created.push(database);
      }
      const keys = new ManagedDataKeys(registry(source),wrapper(root));
      const codec = new EncryptedRowCodec(new EncryptedStore(keys));
      for (const [index,user] of users.entries()) {
        const scope: EncryptionScope = { kind:"user",id:user };
        sql(source,`INSERT INTO auth.users(id) VALUES(${quote(user)});`);
        if (index === 1) {
          const first = await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const endpoint = `https://private-mcp-${index}.example/mcp`;
        const connection = await codec.encode({
          id: ids[index],user_id:user,name:`Private MCP ${index}`,
          url:endpoint,token_encrypted:`private-token-${index}`,
          headers_encrypted:`{"X-Key":"private-header-${index}"}`,
          oauth_encrypted:`{"tokens":{"access_token":"private-oauth-${index}"}}`,
          encryption_version:0,encrypted_content:null,
        },{table:"user_mcp_connections",scope});
        const attempt = await codec.encode({
          state:states[index],user_id:user,connection_id:ids[index],
          endpoint,payload_encrypted:`{"verifier":"private-verifier-${index}"}`,
          encryption_version:0,encrypted_content:null,
        },{table:"user_mcp_oauth_attempts",scope});
        sql(source,`INSERT INTO public.user_mcp_connections(id,user_id,
          encrypted_content,encryption_version) VALUES(
          ${quote(ids[index])},${quote(user)},
          ${quote(connection.encrypted_content!)},${index+1});
          INSERT INTO public.user_mcp_oauth_attempts(state,user_id,
          connection_id,encrypted_content,encryption_version) VALUES(
          ${quote(states[index])},${quote(user)},${quote(ids[index])},
          ${quote(attempt.encrypted_content!)},${index+1});`);
        keys.invalidate(scope);
      }
      expect(sql(source,"SELECT public.activate_mcp_content();")).toBe("t");
      const dump = execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges", ...["auth.users","public.user_mcp_connections",
          "public.user_mcp_oauth_attempts","public.mcp_content_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      {encoding:"utf8",maxBuffer:4*1024*1024});
      for (const marker of ["Private MCP","private-mcp-","private-token",
        "private-header","private-oauth","private-verifier"])
        expect(dump).not.toContain(marker);
      let remainder = dump;
      const copies = new Map<string,{header:string;lines:string[]}>();
      for (const table of ["public.user_mcp_oauth_attempts",
        "public.user_mcp_connections","auth.users"]) {
        const start = remainder.indexOf(`COPY ${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart = remainder.indexOf("\n",start)+1;
        const bodyEnd = remainder.indexOf("\\.\n",bodyStart);
        copies.set(table,{header:remainder.slice(start,bodyStart),
          lines:remainder.slice(bodyStart,bodyEnd).trimEnd().split("\n")});
        remainder = remainder.slice(0,start)+remainder.slice(bodyEnd+3);
      }
      for (const table of ["public.user_mcp_oauth_attempts",
        "public.user_mcp_connections","auth.users"]) {
        for (const line of copies.get(table)!.lines.reverse())
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
            ${copies.get(table)!.header}${line}\n\\.\nCOMMIT;`);
      }
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.user_mcp_oauth_attempts a
        JOIN public.user_mcp_connections c ON c.id=a.connection_id
        JOIN auth.users u ON u.id=c.user_id;`)).toBe("2");
      const cold = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(root))));
      for (const [index,user] of users.entries()) {
        const scope: EncryptionScope = {kind:"user",id:user};
        const connection = JSON.parse(sql(restored,`SELECT row_to_json(c)
          FROM public.user_mcp_connections c WHERE id=${quote(ids[index])};`));
        const attempt = JSON.parse(sql(restored,`SELECT row_to_json(a)
          FROM public.user_mcp_oauth_attempts a WHERE state=${quote(states[index])};`));
        for (const column of ["name","url","token_encrypted",
          "headers_encrypted","oauth_encrypted"])
          expect(connection[column]).toBeNull();
        expect(attempt.endpoint).toBeNull();
        expect(attempt.payload_encrypted).toBeNull();
        const openedConnection = await cold.decode(connection,
          {table:"user_mcp_connections",scope},
          {actorId:null,reason:"migration_verification"});
        const openedAttempt = await cold.decode(attempt,
          {table:"user_mcp_oauth_attempts",scope},
          {actorId:null,reason:"migration_verification"});
        expect(openedConnection.token_encrypted).toBe(`private-token-${index}`);
        expect(openedAttempt.payload_encrypted)
          .toBe(`{"verifier":"private-verifier-${index}"}`);
      }
      const wrong = new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(randomBytes(32)))));
      const row = JSON.parse(sql(restored,`SELECT row_to_json(c)
        FROM public.user_mcp_connections c WHERE id=${quote(ids[0])};`));
      await expect(wrong.decode(row,{table:"user_mcp_connections",
        scope:{kind:"user",id:users[0]}},
      {actorId:null,reason:"migration_verification"})).rejects.toThrow();
      expect(() => sql(restored,`UPDATE public.user_mcp_connections SET
        name='old',encrypted_content=NULL,encryption_version=0
        WHERE id=${quote(ids[0])};`)).toThrow();
    } finally {
      root.fill(0);
      vi.unstubAllEnvs();
      log.mockRestore();
      for (const database of created.reverse())
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
    }
  },60_000);
});

describe.skipIf(!enabled)("application tab PostgreSQL recovery", () => {
  it("restores tabs before users and keys with two versions and rejects a wrong root", async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,12);
    const source=`minddy_min591_tab_source_${suffix}`;
    const restored=`minddy_min591_tab_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const users=[randomUUID(),randomUUID()];
    const tabs=[randomUUID(),randomUUID()];
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      expect(sql(appTabTemplate,"SELECT count(*) FROM public.app_tabs;"))
        .toBe("0");
      for(const database of [source,restored]){
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${appTabTemplate};`);
        created.push(database);
      }
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const store=new EncryptedStore(keys);
      for(const [index,user] of users.entries()){
        const scope:EncryptionScope={kind:"user",id:user};
        sql(source,`INSERT INTO auth.users(id) VALUES(${quote(user)});`);
        if(index===1){
          const first=await keys.current(scope);
          first.bytes.fill(0);
          await keys.rotate(scope,1);
        }
        const href=await store.encrypt(
          `/all?private=issue-${index}`,{
            scope,table:"app_tabs",column:"href",rowId:tabs[index],
          });
        const name=await store.encrypt(`Private tab ${index}`,{
          scope,table:"app_tabs",column:"custom_name",rowId:tabs[index],
        });
        sql(source,`INSERT INTO public.app_tabs(id,user_id,href,
          custom_name,position) VALUES(${quote(tabs[index])},
          ${quote(user)},${quote(`mdye3:${href}`)},
          ${quote(`mdye3:${name}`)},0);`);
        keys.invalidate(scope);
      }
      expect(sql(source,"SELECT public.activate_app_tab_content();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["auth.users","public.app_tabs",
          "public.app_tab_content_scope","public.envelope_data_keys"]
          .map((table)=>`--table=${table}`)],
      {encoding:"utf8",maxBuffer:4*1024*1024});
      for(const marker of ["private=issue-0","private=issue-1",
        "Private tab 0","Private tab 1"])
        expect(dump).not.toContain(marker);
      let remainder=dump;
      const copies=new Map<string,{header:string;lines:string[]}>();
      for(const table of ["public.app_tabs","auth.users"]){
        const start=remainder.indexOf(`COPY ${table} `);
        expect(start).toBeGreaterThanOrEqual(0);
        const bodyStart=remainder.indexOf("\n",start)+1;
        const bodyEnd=remainder.indexOf("\\.\n",bodyStart);
        copies.set(table,{header:remainder.slice(start,bodyStart),
          lines:remainder.slice(bodyStart,bodyEnd).trimEnd().split("\n")});
        remainder=remainder.slice(0,start)+remainder.slice(bodyEnd+3);
      }
      for(const table of ["public.app_tabs","auth.users"])
        for(const line of copies.get(table)!.lines.reverse())
          sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
            ${copies.get(table)!.header}${line}\n\\.\nCOMMIT;`);
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      expect(sql(restored,`SELECT count(*) FROM public.app_tabs t
        JOIN auth.users u ON u.id=t.user_id;`)).toBe("2");
      const cold=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      for(const [index,user] of users.entries()){
        const row=JSON.parse(sql(restored,`SELECT row_to_json(t) FROM
          public.app_tabs t WHERE id=${quote(tabs[index])};`));
        expect(row.href_encryption_checked_at).not.toBeNull();
        expect(row.custom_name_encryption_checked_at).not.toBeNull();
        expect(cold.versionOf(cold.fromDatabase(row.href.slice(6))))
          .toBe(index+1);
        for(const [column,expected] of [
          ["href",`/all?private=issue-${index}`],
          ["custom_name",`Private tab ${index}`],
        ]){
          expect(await cold.decrypt(cold.fromDatabase(row[column].slice(6)),{
            scope:{kind:"user",id:user},table:"app_tabs",column,
            rowId:tabs[index],
          })).toBe(expected);
        }
      }
      const wrong=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      const cipher=sql(restored,`SELECT href FROM public.app_tabs
        WHERE id=${quote(tabs[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(cipher.slice(6)),{
        scope:{kind:"user",id:users[0]},table:"app_tabs",column:"href",
        rowId:tabs[0],
      })).rejects.toThrow();
      expect(()=>sql(restored,`UPDATE public.app_tabs SET href='/home'
        WHERE id=${quote(tabs[0])};`)).toThrow();
    }finally{
      root.fill(0);vi.unstubAllEnvs();log.mockRestore();
      for(const database of created.reverse())
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
    }
  },60_000);
});

describe.skipIf(!enabled)("decision evaluation PostgreSQL recovery", () => {
  it("restores protected answers before historical keys and rejects a wrong root", async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,12);
    const source=`minddy_min591_eval_source_${suffix}`;
    const restored=`minddy_min591_eval_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const scope:EncryptionScope={kind:"system",
      id:"00000000-0000-0000-0000-000000000000"};
    const context={table:"ai_decision_evaluations" as const,scope};
    const ids=[randomUUID(),randomUUID()];
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      expect(sql(aiEvaluationTemplate,
        "SELECT count(*) FROM public.ai_decision_evaluations;"))
        .toBe("0");
      for(const database of [source,restored]){
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${aiEvaluationTemplate};`);
        created.push(database);
      }
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const codec=new EncryptedRowCodec(new EncryptedStore(keys));
      for(const [index,id] of ids.entries()){
        if(index===1) await keys.rotate(scope,1);
        const protectedRow=await codec.encode({id,use_case:"smart_fill",
          subject_id:`private-issue-${index}`,
          jev_answers:{answer:`Private Jev ${index}`},
          llm_answers:index===0?{answer:`Private LLM ${index}`}:null,
          encryption_version:0,encrypted_content:null},context);
        sql(source,`INSERT INTO public.ai_decision_evaluations(id,use_case,
          subject_id,jev_answers,llm_answers,encrypted_content,
          encryption_version,replay_succeeded) VALUES(${quote(id)},
          'smart_fill',NULL,NULL,NULL,
          ${quote(protectedRow.encrypted_content as string)},
          ${protectedRow.encryption_version},${index===0?'true':'false'});`);
        keys.invalidate(scope);
      }
      expect(sql(source,
        "SELECT public.activate_ai_decision_evaluation_content();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["public.ai_decision_evaluations",
          "public.ai_decision_evaluation_scope","public.envelope_data_keys"]
          .map((table)=>`--table=${table}`)],
      {encoding:"utf8",maxBuffer:4*1024*1024});
      for(const marker of ["private-issue-0","private-issue-1",
        "Private Jev 0","Private LLM 0","Private Jev 1"])
        expect(dump).not.toContain(marker);
      const table="public.ai_decision_evaluations";
      const start=dump.indexOf(`COPY ${table} `);
      expect(start).toBeGreaterThanOrEqual(0);
      const bodyStart=dump.indexOf("\n",start)+1;
      const bodyEnd=dump.indexOf("\\.\n",bodyStart);
      const header=dump.slice(start,bodyStart);
      const lines=dump.slice(bodyStart,bodyEnd).trimEnd().split("\n");
      const remainder=dump.slice(0,start)+dump.slice(bodyEnd+3);
      for(const line of lines.reverse())
        sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
          ${header}${line}\n\\.\nCOMMIT;`);
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      const cold=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(root))));
      for(const [index,id] of ids.entries()){
        const row=JSON.parse(sql(restored,`SELECT row_to_json(e) FROM
          public.ai_decision_evaluations e WHERE id=${quote(id)};`));
        expect(row.encryption_version).toBe(index+1);
        expect(row.encryption_checked_at).not.toBeNull();
        expect(row.subject_id).toBeNull();
        expect(row.jev_answers).toBeNull();
        expect(row.llm_answers).toBeNull();
        expect(await cold.decode(row,context,
          {actorId:null,reason:"migration_verification"}))
          .toMatchObject({subject_id:`private-issue-${index}`,
            jev_answers:{answer:`Private Jev ${index}`}});
      }
      const wrong=new EncryptedRowCodec(new EncryptedStore(
        new ManagedDataKeys(registry(restored),wrapper(randomBytes(32)))));
      const row=JSON.parse(sql(restored,`SELECT row_to_json(e) FROM
        public.ai_decision_evaluations e WHERE id=${quote(ids[0])};`));
      await expect(wrong.decode(row,context,
        {actorId:null,reason:"migration_verification"})).rejects.toThrow();
      expect(()=>sql(restored,`UPDATE public.ai_decision_evaluations SET
        jev_answers='{"answer":"old"}'::jsonb
        WHERE id=${quote(ids[0])};`)).toThrow();
    }finally{
      root.fill(0);vi.unstubAllEnvs();log.mockRestore();
      for(const database of created.reverse())
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
    }
  },60_000);
});

describe.skipIf(!enabled)("Stripe webhook payload scrub PostgreSQL recovery", () => {
  it("restores idempotence metadata without the former event body", () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,12);
    const source=`minddy_min591_stripe_source_${suffix}`;
    const restored=`minddy_min591_stripe_restore_${suffix}`;
    const created:string[]=[];
    try {
      for(const database of [source,restored]){
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${stripePayloadTemplate};`);
        created.push(database);
      }
      sql(source,`INSERT INTO public.stripe_webhook_events(
        stripe_event_id,type,payload) VALUES('evt_private',
        'checkout.session.completed',
        '{"email":"private@example.test"}'::jsonb);
        UPDATE public.stripe_webhook_events SET payload=NULL,
          processed_at=now() WHERE stripe_event_id='evt_private';`);
      expect(sql(source,
        "SELECT public.activate_stripe_webhook_payload_scrub();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...[
          "public.stripe_webhook_events","public.stripe_webhook_payload_scope",
        ].map((table)=>`--table=${table}`)],
      {encoding:"utf8",maxBuffer:4*1024*1024});
      expect(dump).not.toContain("private@example.test");
      sql(restored,dump);
      expect(sql(restored,`SELECT count(*) FROM public.stripe_webhook_events
        WHERE stripe_event_id='evt_private' AND payload IS NULL AND
          processed_at IS NOT NULL;`)).toBe("1");
      expect(()=>sql(restored,`INSERT INTO public.stripe_webhook_events(
        stripe_event_id,type,payload) VALUES('evt_old','other',
        '{"email":"old@example.test"}'::jsonb);`)).toThrow();
    }finally{
      for(const database of created.reverse())
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
    }
  },60_000);
});

describe.skipIf(!enabled)("billing identity PostgreSQL recovery", () => {
  it("restores billing rows before users and historical keys in separate batches", async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,12);
    const source=`minddy_min591_billing_source_${suffix}`;
    const restored=`minddy_min591_billing_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const ids=[randomUUID(),randomUUID()];
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      expect(sql(billingIdentityTemplate,
        "SELECT count(*) FROM public.billing_accounts;"))
        .toBe("0");
      for(const database of [source,restored]){
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${billingIdentityTemplate};`);
        created.push(database);
      }
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const store=new EncryptedStore(keys);
      for(const [index,id] of ids.entries()){
        const scope:EncryptionScope={kind:"user",id};
        if(index===1) {
          await keys.current(scope);
          await keys.rotate(scope,1);
        }
        const email=await store.encrypt(`private-${index}@example.test`,{
          scope,table:"billing_accounts",column:"email",rowId:id});
        const note=await store.encrypt(`Private billing note ${index}`,{
          scope,table:"billing_accounts",column:"admin_override_note",
          rowId:id});
        sql(source,`INSERT INTO auth.users(id) VALUES(${quote(id)});
          INSERT INTO public.billing_accounts(user_id,email,
            admin_override_note) VALUES(${quote(id)},
            ${quote(`mdye3:${email}`)},${quote(`mdye3:${note}`)});`);
        expect(await store.decrypt(email,{scope,table:"billing_accounts",
          column:"email",rowId:id})).toBe(`private-${index}@example.test`);
        expect(await store.decrypt(note,{scope,table:"billing_accounts",
          column:"admin_override_note",rowId:id}))
          .toBe(`Private billing note ${index}`);
        const revision=sql(source,`SELECT content_revision FROM
          public.billing_accounts WHERE user_id=${quote(id)};`);
        expect(sql(source,`SELECT public.confirm_encrypted_content(
          'billing_identity',${quote(id)},${revision},
          ${quote(`mdye3:${email}`)},${quote(`mdye3:${note}`)});`)).toBe("t");
        keys.invalidate(scope);
      }
      expect(sql(source,"SELECT public.activate_billing_identity();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...["public.billing_accounts","auth.users",
          "public.billing_identity_scope","public.envelope_data_keys"]
          .map((table)=>`--table=${table}`)],
      {encoding:"utf8",maxBuffer:4*1024*1024});
      for(const marker of ["private-0@example.test",
        "private-1@example.test","Private billing note"])
        expect(dump).not.toContain(marker);
      const table="public.billing_accounts";
      const start=dump.indexOf(`COPY ${table} `);
      expect(start).toBeGreaterThanOrEqual(0);
      const bodyStart=dump.indexOf("\n",start)+1;
      const bodyEnd=dump.indexOf("\\.\n",bodyStart);
      const header=dump.slice(start,bodyStart);
      const lines=dump.slice(bodyStart,bodyEnd).trimEnd().split("\n");
      const remainder=dump.slice(0,start)+dump.slice(bodyEnd+3);
      for(const line of lines.reverse())
        sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
          ${header}${line}\n\\.\nCOMMIT;`);
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      const cold=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      for(const [index,id] of ids.entries()){
        const scope:EncryptionScope={kind:"user",id};
        const row=JSON.parse(sql(restored,`SELECT row_to_json(b) FROM
          public.billing_accounts b WHERE user_id=${quote(id)};`));
        expect(row.email_encryption_checked_at).not.toBeNull();
        expect(row.admin_override_note_encryption_checked_at).not.toBeNull();
        for(const [field,expected] of [
          ["email",`private-${index}@example.test`],
          ["admin_override_note",`Private billing note ${index}`],
        ] as const){
          const cipher=cold.fromDatabase<string>(row[field].slice(6));
          expect(cold.versionOf(cipher)).toBe(index+1);
          expect(await cold.decrypt(cipher,{scope,table:"billing_accounts",
            column:field,rowId:id})).toBe(expected);
        }
      }
      const wrong=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      const value=sql(restored,`SELECT email FROM public.billing_accounts
        WHERE user_id=${quote(ids[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(value.slice(6)),{
        scope:{kind:"user",id:ids[0]},table:"billing_accounts",
        column:"email",rowId:ids[0]})).rejects.toThrow();
      expect(()=>sql(restored,`UPDATE public.billing_accounts SET
        email='old@example.test' WHERE user_id=${quote(ids[0])};`)).toThrow();
    }finally{
      root.fill(0);vi.unstubAllEnvs();log.mockRestore();
      for(const database of created.reverse())
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
    }
  },60_000);
});

describe.skipIf(!enabled)("OAuth client PostgreSQL recovery", () => {
  it("restores sealed registrations across system key versions and rejects a wrong root", async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,12);
    const source=`minddy_min591_oauth_source_${suffix}`;
    const restored=`minddy_min591_oauth_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const scope:EncryptionScope={kind:"system",
      id:"00000000-0000-0000-0000-000000000000"};
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      for(const database of [source,restored]){
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${oauthClientTemplate};`);
        created.push(database);
      }
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const store=new EncryptedStore(keys);
      const clients=["oauth-private-one","oauth-private-two"];
      for(const [index,id] of clients.entries()){
        if(index===1) await keys.rotate(scope,1);
        const content={client_name:`Private client ${index}`,
          redirect_uris:[`cursor://private-${index}.example/callback`],
          logo_uri:null,client_uri:null};
        const cipher=await store.encrypt(content,{scope,table:"oauth_clients",
          column:"content",rowId:id});
        sql(source,`INSERT INTO public.oauth_clients(client_id,client_name,
          redirect_uris,encrypted_content,encryption_version) VALUES(
          ${quote(id)},NULL,NULL,${quote(cipher)},${index+1});`);
        expect(await store.decrypt(cipher,{scope,table:"oauth_clients",
          column:"content",rowId:id})).toMatchObject(content);
        const revision=sql(source,`SELECT content_revision FROM
          public.oauth_clients WHERE client_id=${quote(id)};`);
        expect(sql(source,`SELECT public.confirm_encrypted_content(
          'oauth_client',${quote(id)},${revision},${quote(cipher)},NULL);`))
          .toBe("t");
        keys.invalidate(scope);
      }
      expect(sql(source,"SELECT public.activate_oauth_client_content();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges","--table=public.oauth_clients",
        "--table=public.oauth_client_content_scope",
        "--table=public.envelope_data_keys"],
      {encoding:"utf8",maxBuffer:4*1024*1024});
      for(const marker of ["Private client","private-0.example",
        "private-1.example"]) expect(dump).not.toContain(marker);
      const start=dump.indexOf("COPY public.oauth_clients ");
      expect(start).toBeGreaterThanOrEqual(0);
      const bodyStart=dump.indexOf("\n",start)+1;
      const bodyEnd=dump.indexOf("\\.\n",bodyStart);
      const header=dump.slice(start,bodyStart);
      const lines=dump.slice(bodyStart,bodyEnd).trimEnd().split("\n");
      const remainder=dump.slice(0,start)+dump.slice(bodyEnd+3);
      for(const line of lines.reverse())
        sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
          ${header}${line}\n\\.\nCOMMIT;`);
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      const cold=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      for(const [index,id] of clients.entries()){
        const row=JSON.parse(sql(restored,`SELECT row_to_json(c) FROM
          public.oauth_clients c WHERE client_id=${quote(id)};`));
        expect(row.client_name).toBeNull();
        expect(row.redirect_uris).toBeNull();
        const cipher=cold.fromDatabase(row.encrypted_content);
        expect(cold.versionOf(cipher)).toBe(index+1);
        expect(await cold.decrypt(cipher,{scope,table:"oauth_clients",
          column:"content",rowId:id})).toMatchObject({
          client_name:`Private client ${index}`,
          redirect_uris:[`cursor://private-${index}.example/callback`],
        });
      }
      const wrong=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      const value=sql(restored,`SELECT encrypted_content FROM
        public.oauth_clients WHERE client_id=${quote(clients[0])};`);
      await expect(wrong.decrypt(wrong.fromDatabase(value),{
        scope,table:"oauth_clients",column:"content",rowId:clients[0]}))
        .rejects.toThrow();
      expect(()=>sql(restored,`INSERT INTO public.oauth_clients(
        client_id,client_name,redirect_uris) VALUES('oauth-old-writer',
        'Private old writer',ARRAY['https://private.example']);`)).toThrow();
    }finally{
      root.fill(0);vi.unstubAllEnvs();log.mockRestore();
      for(const database of created.reverse())
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
    }
  },60_000);
});

describe.skipIf(!enabled)("OAuth code PostgreSQL recovery", () => {
  it("restores code children before grants and owners with mixed keys", async () => {
    const suffix=randomUUID().replaceAll("-","").slice(0,12);
    const source=`minddy_min591_codes_source_${suffix}`;
    const restored=`minddy_min591_codes_restore_${suffix}`;
    const created:string[]=[];
    const root=randomBytes(32);
    const ids=[randomUUID(),randomUUID()];
    const actorKeys:string[]=[];
    const clientId="oauth-private-client";
    const system:EncryptionScope={kind:"system",
      id:"00000000-0000-0000-0000-000000000000"};
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    try {
      for(const database of [source,restored]){
        sql("postgres",`CREATE DATABASE ${database} TEMPLATE ${oauthClientTemplate};`);
        created.push(database);
      }
      const keys=new ManagedDataKeys(registry(source),wrapper(root));
      const store=new EncryptedStore(keys);
      const clientCipher=await store.encrypt({client_name:"Private OAuth client",
        redirect_uris:["cursor://private.example/callback"],
        logo_uri:null,client_uri:null},{scope:system,table:"oauth_clients",
        column:"content",rowId:clientId});
      sql(source,`INSERT INTO public.oauth_clients(client_id,client_name,
        redirect_uris,encrypted_content,encryption_version) VALUES(
        ${quote(clientId)},NULL,NULL,${quote(clientCipher)},1);`);
      expect(await store.decrypt(clientCipher,{scope:system,table:"oauth_clients",
        column:"content",rowId:clientId})).toMatchObject({
        client_name:"Private OAuth client" });
      const clientRevision=sql(source,`SELECT content_revision FROM
        public.oauth_clients WHERE client_id=${quote(clientId)};`);
      expect(sql(source,`SELECT public.confirm_encrypted_content(
        'oauth_client',${quote(clientId)},${clientRevision},
        ${quote(clientCipher)},NULL);`)).toBe("t");
      for(const [index,id] of ids.entries()){
        const scope:EncryptionScope={kind:"user",id};
        const actorKey=randomUUID();
        actorKeys.push(actorKey);
        const grant=randomUUID();
        const hash=(index===0 ? "a" : "b").repeat(64);
        if(index===1){await keys.current(scope);await keys.rotate(scope,1);}
        const cipher=await store.encrypt({
          redirect_uri:`cursor://private-${index}.example/callback`,
          resource:`https://private-${index}.example/resource`},{
          scope,table:"oauth_authorization_codes",column:"content",rowId:hash});
        const actorCipher=await store.encrypt({name:`Private actor ${index}`,
          agent:`private-agent-${index}`},{scope,table:"api_keys",
          column:"content",rowId:actorKey});
        sql(source,`INSERT INTO auth.users(id) VALUES(${quote(id)});
          INSERT INTO public.api_keys(id,user_id,name,agent,key_hash,key_prefix,
            encrypted_content,encryption_version)
            VALUES(${quote(actorKey)},${quote(id)},NULL,NULL,
              ${quote((index===0 ? "c" : "d").repeat(64))},'oauth',
              ${quote(actorCipher)},${index+1});
          INSERT INTO public.oauth_grants(id,user_id,client_id,api_key_id)
            VALUES(${quote(grant)},${quote(id)},${quote(clientId)},
              ${quote(actorKey)});
          INSERT INTO public.oauth_authorization_codes(code_hash,client_id,
            user_id,grant_id,redirect_uri,resource,code_challenge,
            expires_at,encrypted_content,encryption_version) VALUES(
            ${quote(hash)},${quote(clientId)},${quote(id)},${quote(grant)},
            NULL,NULL,${quote("e".repeat(43))},now()+interval '10 minutes',
            ${quote(cipher)},${index+1});`);
        expect(await store.decrypt(actorCipher,{scope,table:"api_keys",
          column:"content",rowId:actorKey}))
          .toMatchObject({name:`Private actor ${index}`});
        expect(await store.decrypt(cipher,{scope,table:"oauth_authorization_codes",
          column:"content",rowId:hash}))
          .toMatchObject({redirect_uri:`cursor://private-${index}.example/callback`});
        const actorRevision=sql(source,`SELECT content_revision FROM
          public.api_keys WHERE id=${quote(actorKey)};`);
        expect(sql(source,`SELECT public.confirm_encrypted_content(
          'api_key',${quote(actorKey)},${actorRevision},
          ${quote(actorCipher)},NULL);`)).toBe("t");
        const codeRevision=sql(source,`SELECT content_revision FROM
          public.oauth_authorization_codes WHERE code_hash=${quote(hash)};`);
        expect(sql(source,`SELECT public.confirm_encrypted_content(
          'oauth_code',${quote(hash)},${codeRevision},
          ${quote(cipher)},NULL);`)).toBe("t");
        keys.invalidate(scope);
      }
      expect(sql(source,"SELECT public.activate_oauth_client_content();"))
        .toBe("t");
      expect(sql(source,"SELECT public.activate_oauth_code_content();"))
        .toBe("t");
      expect(sql(source,"SELECT public.activate_api_key_content();"))
        .toBe("t");
      const dump=execFileSync("docker",["exec",container,"pg_dump","-U",
        "supabase_admin","-d",source,"--data-only","--no-owner",
        "--no-privileges",...[
          "public.oauth_authorization_codes","public.oauth_grants",
          "public.oauth_clients","public.api_keys","auth.users",
          "public.oauth_client_content_scope","public.oauth_code_content_scope",
          "public.api_key_content_scope",
          "public.envelope_data_keys"].map((table)=>`--table=${table}`)],
      {encoding:"utf8",maxBuffer:4*1024*1024});
      for(const marker of ["private-0.example","private-1.example",
        "Private OAuth client","Private actor","private-agent-"])
        expect(dump).not.toContain(marker);
      const start=dump.indexOf("COPY public.oauth_authorization_codes ");
      expect(start).toBeGreaterThanOrEqual(0);
      const bodyStart=dump.indexOf("\n",start)+1;
      const bodyEnd=dump.indexOf("\\.\n",bodyStart);
      const codeCopy=dump.slice(start,bodyEnd+3);
      const remainder=dump.slice(0,start)+dump.slice(bodyEnd+3);
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${codeCopy}\nCOMMIT;`);
      sql(restored,`BEGIN; SET LOCAL session_replication_role=replica;
        ${remainder}\nCOMMIT;`);
      for(const [column,parent,target] of [
        ["client_id","oauth_clients","client_id"],
        ["grant_id","oauth_grants","id"],
        ["user_id","auth.users","id"],
      ]){
        const name=`oauth_authorization_codes_${column}_fkey`;
        const relation=parent.includes(".")?parent:`public.${parent}`;
        sql(restored,`ALTER TABLE public.oauth_authorization_codes
          DROP CONSTRAINT ${name};
          ALTER TABLE public.oauth_authorization_codes ADD CONSTRAINT ${name}
          FOREIGN KEY(${column}) REFERENCES ${relation}(${target}) NOT VALID;
          ALTER TABLE public.oauth_authorization_codes
          VALIDATE CONSTRAINT ${name};`);
      }
      const cold=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(root)));
      for(const [index,id] of ids.entries()){
        const hash=(index===0 ? "a" : "b").repeat(64);
        const row=JSON.parse(sql(restored,`SELECT row_to_json(c) FROM
          public.oauth_authorization_codes c WHERE code_hash=${quote(hash)};`));
        expect(row.redirect_uri).toBeNull();
        expect(row.resource).toBeNull();
        const cipher=cold.fromDatabase(row.encrypted_content);
        expect(cold.versionOf(cipher)).toBe(index+1);
        expect(await cold.decrypt(cipher,{scope:{kind:"user",id},
          table:"oauth_authorization_codes",column:"content",rowId:hash}))
          .toMatchObject({redirect_uri:`cursor://private-${index}.example/callback`});
        const actor=JSON.parse(sql(restored,`SELECT row_to_json(k) FROM
          public.api_keys k WHERE id=${quote(actorKeys[index])};`));
        expect(actor.name).toBeNull();
        expect(actor.agent).toBeNull();
        const actorCipher=cold.fromDatabase(actor.encrypted_content);
        expect(cold.versionOf(actorCipher)).toBe(index+1);
        expect(await cold.decrypt(actorCipher,{scope:{kind:"user",id},
          table:"api_keys",column:"content",rowId:actorKeys[index]}))
          .toMatchObject({name:`Private actor ${index}`});
      }
      const wrong=new EncryptedStore(new ManagedDataKeys(
        registry(restored),wrapper(randomBytes(32))));
      const hash="a".repeat(64);
      const value=sql(restored,`SELECT encrypted_content FROM
        public.oauth_authorization_codes WHERE code_hash=${quote(hash)};`);
      await expect(wrong.decrypt(wrong.fromDatabase(value),{
        scope:{kind:"user",id:ids[0]},table:"oauth_authorization_codes",
        column:"content",rowId:hash})).rejects.toThrow();
    }finally{
      root.fill(0);vi.unstubAllEnvs();log.mockRestore();
      for(const database of created.reverse())
        sql("postgres",`DROP DATABASE ${database} WITH (FORCE);`);
    }
  },60_000);
});
