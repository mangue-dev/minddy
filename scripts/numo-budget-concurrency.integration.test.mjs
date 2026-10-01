import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

const enabled = process.env.MINDDY_BUDGET_DB_TEST === "true";
const container = process.env.MINDDY_BUDGET_DB_CONTAINER ?? "minddy-min629-db";
const database = `numo_budget_${randomUUID().replaceAll("-", "")}`;
const migrationPath = "supabase/migrations/20270109200022_concurrent_numo_budget.sql";
const read = (name) => readFileSync(`supabase/migrations/${name}`, "utf8");
function sql(input) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-At", "-U", "postgres",
    "-d", database, "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function parallelSql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-At", "-U", "postgres",
      "-d", database, "-v", "ON_ERROR_STOP=1"]);
    let output = "", errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    child.stdin.end(input);
  });
}
function functionDefinition(source, name) {
  const start = source.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`));
  assert.ok(start >= 0, name);
  const match = source.slice(start).match(/AS (\$[a-z_]*\$)[\s\S]*?\1;/i);
  assert.ok(match, name);
  return source.slice(start, start + match.index + match[0].length);
}
// Install real budget function bodies on a reduced PostgreSQL schema. Access
// helpers are stubs: this suite checks allocation/locking, not tenant access or
// encryption triggers. The regular application suites cover those boundaries.
function fixture() {
  const baseline = read("20270106090000_baseline.sql");
  const tables = ["conversations", "assistant_messages", "agent_runs", "agent_conversations", "agent_run_messages", "ai_usage"];
  let setup = "CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);";
  for (const table of tables) {
    const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`);
    assert.ok(start >= 0, table);
    const end = baseline.indexOf("\n);", start) + 3;
    setup += baseline.slice(start, end);
    setup += `ALTER TABLE public.${table} ADD PRIMARY KEY(id);`;
  }
  const durable = read("20270106680000_durable_numo_turns.sql");
  const start = durable.indexOf("CREATE TABLE public.numo_assistant_turns (");
  setup += durable.slice(start, durable.indexOf("\n);", start) + 3);
  setup += `
    ALTER TABLE public.numo_assistant_turns ADD managed_budget_usd numeric(12,6);
    ALTER TABLE public.assistant_messages ADD turn_id uuid, ADD user_payload_version integer DEFAULT 0;
    ALTER TABLE public.ai_usage ADD numo_turn_id uuid;
    ALTER TABLE public.agent_runs
      ADD managed_budget_usd numeric(12,6), ADD parent_numo_turn_id uuid,
      ADD parent_numo_conversation_id uuid, ADD parent_numo_tool_call_id text,
      ADD continued_from_run_id uuid, ADD delegation_brief jsonb,
      ADD delegation_attachments jsonb, ADD encrypted_delegation_input text,
      ADD delegation_encryption_version integer DEFAULT 0, ADD title_ciphertext text,
      ADD title_encryption_version integer DEFAULT 0, ADD worker_model_source text,
      ADD worker_model_provider text, ADD repo_provider text, ADD repo_external_id text,
      ADD local_issue_context_confirmed boolean DEFAULT false,
      ADD encrypted_launch_content text, ADD launch_encryption_version integer DEFAULT 0,
      ADD has_launch_prompt boolean DEFAULT false, ADD checkpoint_ciphertext text,
      ADD sandbox_reap_claim uuid;
    CREATE FUNCTION public.lock_live_agent_run_project_access(uuid,uuid,uuid) RETURNS text
      LANGUAGE sql AS $$ SELECT 'ok'::text $$;
    CREATE FUNCTION public.agent_run_repository_binding_is_current(uuid,uuid,uuid,text,text) RETURNS boolean
      LANGUAGE sql AS $$ SELECT true $$;
  `;
  const operations = read("20270106740000_numo_usage_operation_budget.sql");
  setup += functionDefinition(operations, "get_numo_operation_platform_spend");
  setup += functionDefinition(read("20270107620000_numo_user_message_encryption.sql"), "begin_numo_turn_with_budget");
  setup += functionDefinition(read("20270109200018_agent_launch_json_nulls.sql"), "create_agent_run_with_budget");
  const checkpoint = read("20270107180000_agent_checkpoint_encryption.sql");
  setup += functionDefinition(checkpoint, "resume_agent_run_with_budget");
  const queue = read("20270107210000_agent_queue_encryption.sql");
  setup += "ALTER TABLE public.agent_run_messages ADD content_encryption_version integer DEFAULT 0;";
  setup += functionDefinition(queue, "agent_queue_content_version");
  setup += functionDefinition(queue, "resume_latest_agent_run_with_message");
  setup += "CREATE TABLE public.agent_run_input_requests(run_id uuid,parent_numo_turn_id uuid,status text);";
  setup += functionDefinition(read("20270109200021_numo_durable_worker_stop.sql"), "request_numo_worker_stop");
  return setup;
}
const owner = "62900000-0000-4000-8000-000000000001";
const project = "62900000-0000-4000-8000-000000000002";
function admit(conversation, requested = 15, since = "2026-10-01", cap = 15, request = randomUUID()) {
  return `SELECT public.begin_numo_turn_with_budget('${conversation}', '${owner}', '${request}',
    gen_random_uuid(), '{}'::jsonb, 'model', 'low', gen_random_uuid(), 0, 'Hello', NULL, '{}'::jsonb,
    '${since}', ${cap}, ${requested});`;
}
function values(conversation, extra = {}) {
  return JSON.stringify({ id: randomUUID(), conversation_id: conversation, project_id: project,
    created_by: owner, status: "queued", triggered_by: "chat", key_mode: "platform",
    worker_model_source: "account", worker_model_provider: "openrouter", run_id: randomUUID(),
    model_forced: false, reasoning_level: "low", loop_in_vm: false, agent_engine: "loop", local_exec: false,
    local_issue_context_confirmed: false, local_worktree: false, ...extra });
}
function launch(conversation, extra = {}) {
  return `SELECT public.create_agent_run_with_budget('${owner}', '2026-10-01', 15, 15, '${values(conversation, extra)}'::jsonb);`;
}
function conversation() {
  const id = randomUUID();
  sql(`INSERT INTO public.conversations(id,user_id,status) VALUES('${id}','${owner}','idle');`);
  return id;
}
function workerConversation() {
  const id = randomUUID();
  sql(`INSERT INTO public.agent_conversations(id,project_id,owner_id,visibility)
    VALUES('${id}','${project}','${owner}','project');`);
  return id;
}
function clear() {
  sql("TRUNCATE public.numo_assistant_turns,public.agent_runs,public.conversations,public.ai_usage,public.assistant_messages,public.agent_conversations,public.agent_run_messages CASCADE;");
}
function usage(cost, extra = {}) {
  const row = { run_id: randomUUID(), numo_turn_id: null, key_mode: "platform", created_at: "2026-10-01T00:01:00Z", ...extra };
  sql(`INSERT INTO public.ai_usage(run_id,user_id,feature,cost,key_mode,created_at,numo_turn_id)
    VALUES('${row.run_id}','${owner}','numo_chat',${cost},'${row.key_mode}','${row.created_at}',${row.numo_turn_id ? `'${row.numo_turn_id}'` : "NULL"});`);
}

describe("concurrent Numo budget RPCs on PostgreSQL", { skip: !enabled }, () => {
  before(() => {
    execFileSync("docker", ["exec", container, "createdb", "-U", "postgres", database]);
    sql("DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
    sql(fixture());
    const reviewed = JSON.parse(readFileSync("docs/security/encryption/sql-consumers.json", "utf8"));
    for (const [signature, definition] of Object.entries(reviewed.functions)) {
      if (/^(begin_numo_turn_with_budget|create_agent_run_with_budget|resume_agent_run_with_budget|resume_latest_agent_run_with_message)\(/.test(signature)) {
        sql(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`);
        if (definition.acl?.includes("service_role=")) sql(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
      }
    }
    sql(`INSERT INTO auth.users(id) VALUES('${owner}');`);
  });
  after(() => execFileSync("docker", ["exec", container, "dropdb", "-U", "postgres", "--force", database]));

  it("reproduces the historical 99% rejection, then admits parallel messages beside a delegated worker", async () => {
    clear(); usage(0.15);
    const parentConversation = conversation();
    const before = JSON.parse(sql(admit(parentConversation)));
    assert.equal(Number(before.granted_budget_usd), 14.85);
    assert.equal(JSON.parse(sql(admit(conversation()))).turn, null);
    clear();
    sql(readFileSync(migrationPath, "utf8"));
    if (process.env.MINDDY_BUDGET_AUDIT_FILE) {
      writeFileSync(process.env.MINDDY_BUDGET_AUDIT_FILE, sql(`SELECT jsonb_object_agg(p.oid::regprocedure::text,
        jsonb_build_object('definition',pg_get_functiondef(p.oid),'securityDefiner',p.prosecdef,'configuration',p.proconfig,'acl',p.proacl::text))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('begin_numo_turn_with_budget','create_agent_run_with_budget',
          'resume_agent_run_with_budget','resume_latest_agent_run_with_message','concurrent_managed_budget_grant');`));
    }
    usage(0.15);
    const source = conversation();
    const parent = JSON.parse(sql(admit(source))).turn;
    assert.equal(Number(parent.managed_budget_usd), 13.85);
    sql(`UPDATE public.numo_assistant_turns SET status='running',claim_token=gen_random_uuid(),claimed_at=now() WHERE id='${parent.id}';`);
    const worker = JSON.parse(sql(launch(workerConversation(), {parent_numo_turn_id: parent.id, parent_numo_conversation_id: source}))).run;
    sql(`UPDATE public.agent_runs SET status='running' WHERE id='${worker.id}';
      UPDATE public.numo_assistant_turns SET status='waiting_work',claim_token=NULL,claimed_at=NULL,active_run_id='${worker.id}' WHERE id='${parent.id}';`);
    const targets = Array.from({length: 4}, conversation);
    const replies = await Promise.all(targets.map((id) => parallelSql(admit(id))));
    const grants = replies.map((text) => JSON.parse(text)).map((r) => Number(r.granted_budget_usd));
    assert.ok(grants.every((n) => n > 0));
    assert.ok(grants.reduce((s,n) => s+n, 0) <= 1);
    assert.equal(Number(sql(`SELECT sum(managed_budget_usd) FROM public.numo_assistant_turns;`)), 14.8499);
    const retry = JSON.parse(sql(admit(source,15,"2026-10-01",15,parent.request_id)));
    assert.equal(retry.turn.id, parent.id);
    assert.equal(Number(sql("SELECT count(*) FROM public.assistant_messages;")), 5);
  });

  it("keeps stopped parents reserved until the real child settles, then releases unused capacity", () => {
    clear(); usage(0.15);
    const source=conversation(); const parent=JSON.parse(sql(admit(source))).turn;
    sql(`UPDATE public.numo_assistant_turns SET status='running',claim_token=gen_random_uuid(),claimed_at=now() WHERE id='${parent.id}';`);
    const worker=JSON.parse(sql(launch(workerConversation(),{parent_numo_turn_id:parent.id,parent_numo_conversation_id:source}))).run;
    usage(0.2,{numo_turn_id:parent.id,run_id:worker.run_id});
    sql(`SELECT public.request_numo_worker_stop('${worker.id}');`);
    assert.equal(sql(`SELECT interrupt_requested FROM public.agent_runs WHERE id='${worker.id}';`),"t");
    const during=JSON.parse(sql(admit(conversation())));
    assert.equal(Number(during.reserved_usd),13.65);
    sql(`UPDATE public.agent_runs SET status='canceled' WHERE id='${worker.id}';
      UPDATE public.numo_assistant_turns SET status='completed' WHERE id='${during.turn.id}';`);
    const after=JSON.parse(sql(admit(conversation())));
    assert.equal(Number(after.reserved_usd),0);
    assert.equal(Number(after.spent_usd),0.35);
    assert.equal(Number(after.granted_budget_usd),13.65);
  });

  it("admits messages beside a standalone worker and releases completed, failed and canceled allocations", () => {
    for (const terminal of ["completed","failed","canceled"]) {
      clear(); usage(0.15);
      const worker=JSON.parse(sql(launch(workerConversation()))).run;
      assert.equal(Number(worker.managed_budget_usd),13.85);
      const during=JSON.parse(sql(admit(conversation())));
      assert.equal(Number(during.granted_budget_usd),0.9);
      sql(`UPDATE public.agent_runs SET status='${terminal}' WHERE id='${worker.id}';
        UPDATE public.numo_assistant_turns SET status='completed' WHERE id='${during.turn.id}';`);
      assert.equal(Number(JSON.parse(sql(admit(conversation()))).reserved_usd),0);
    }
  });

  it("uses the supplied billing/reset window and excludes BYOK without losing real exhaustion", () => {
    clear(); usage(20,{key_mode:"byok"}); usage(20,{created_at:"2026-09-30T23:59:59Z"});
    usage(0.15); usage(0.1,{created_at:"2026-10-01T00:02:00Z"});
    assert.equal(Number(JSON.parse(sql(admit(conversation(),15,"2026-10-01T00:02:00Z"))).spent_usd),0.1);
    clear(); usage(15);
    const refusal=JSON.parse(sql(admit(conversation())));
    assert.equal(refusal.turn,null); assert.equal(Number(refusal.spent_usd),15);
    assert.equal(sql("SELECT count(*) FROM public.assistant_messages;"),"0");
    assert.equal(sql("SELECT public.concurrent_managed_budget_grant(0.2,14.85);"),"0.200000");
  });

  it("reacquires only uncommitted capacity and includes prior platform spend once on standalone resumes", () => {
    clear();
    const worker=JSON.parse(sql(launch(workerConversation()))).run;
    usage(0.2,{run_id:worker.run_id}); usage(0.4,{run_id:worker.run_id,key_mode:"byok"});
    sql(`UPDATE public.agent_runs SET status='completed' WHERE id='${worker.id}';`);
    const resumed=JSON.parse(sql(`SELECT public.resume_agent_run_with_budget('${worker.id}','${owner}','2026-10-01',15,15,now());`));
    assert.equal(Number(resumed.granted_budget_usd),14);
    const during=JSON.parse(sql(admit(conversation())));
    assert.equal(Number(during.reserved_usd),13.8);
    assert.equal(Number(during.granted_budget_usd),0.9);
  });

  it("reconciles mixed-key parent spend on warm resume without reserving the child twice", () => {
    clear();
    const source=conversation(), parent=JSON.parse(sql(admit(source))).turn;
    sql(`UPDATE public.numo_assistant_turns SET status='running',claim_token=gen_random_uuid(),claimed_at=now() WHERE id='${parent.id}';`);
    const worker=JSON.parse(sql(launch(workerConversation(),{parent_numo_turn_id:parent.id,parent_numo_conversation_id:source,budget_usd:2}))).run;
    usage(0.2,{run_id:worker.run_id,numo_turn_id:parent.id});
    usage(0.4,{run_id:worker.run_id,numo_turn_id:parent.id,key_mode:"byok"});
    sql(`UPDATE public.agent_runs SET status='completed' WHERE id='${worker.id}';
      UPDATE public.numo_assistant_turns SET status='waiting_input',claim_token=NULL,claimed_at=NULL WHERE id='${parent.id}';`);
    const resumed=JSON.parse(sql(`SELECT public.resume_agent_run_with_budget('${worker.id}','${owner}','2026-10-01',15,15,now());`));
    assert.equal(Number(resumed.granted_budget_usd),1.6);
    const during=JSON.parse(sql(admit(conversation())));
    assert.equal(Number(during.reserved_usd),1.4);
    assert.equal(Number(during.granted_budget_usd),12.4);
  });

  it("preserves message-resume allowance and idempotency on standalone work", () => {
    clear();
    const worker=JSON.parse(sql(launch(workerConversation()))).run;
    usage(0.2,{run_id:worker.run_id});
    sql(`UPDATE public.agent_runs SET status='completed' WHERE id='${worker.id}';`);
    const message=randomUUID();
    const resume=`SELECT public.resume_latest_agent_run_with_message('${worker.id}','${owner}','${owner}',
      '${message}','Continue',NULL,now(),'2026-10-01',15,15);`;
    assert.equal(sql(resume),"queued");
    assert.equal(Number(sql(`SELECT managed_budget_usd FROM public.agent_runs WHERE id='${worker.id}';`)),14);
    assert.equal(sql(resume),"conflict");
    assert.equal(sql("SELECT count(*) FROM public.agent_run_messages;"),"1");
    assert.equal(Number(JSON.parse(sql(admit(conversation()))).reserved_usd),13.8);
  });

  it("does not round tiny reservations above capacity or admit after a stopped request receipt", () => {
    clear();
    assert.equal(sql("SELECT public.concurrent_managed_budget_grant(15,0.000001);"),"0.000000");
    const source=conversation(), request=randomUUID(), id=randomUUID();
    sql(`INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,status)
      VALUES('${id}','${source}','${owner}','${request}',gen_random_uuid(),'stopped');`);
    usage(15);
    const receipt=JSON.parse(sql(admit(source,15,"2026-10-01",15,request)));
    assert.equal(receipt.turn.id,id); assert.equal(receipt.turn.status,"stopped");
    assert.equal(sql("SELECT count(*) FROM public.assistant_messages;"),"0");
  });
});
