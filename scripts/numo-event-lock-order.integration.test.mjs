import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const container = process.env.MINDDY_NUMO_LOCK_TEST_CONTAINER;
const read = (file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
const durable = read("20270106680000_durable_numo_turns.sql");
const protectedSql = read("20270107650000_numo_tool_content_encryption.sql");
const fences = read("20270108090000_encryption_snapshot_write_fences.sql");
const migration = read("20270109200031_numo_event_lock_order.sql");
function definition(source, name) {
  const start = source.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`));
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf("$$;", start) + 3);
}
function args(database) {
  return ["exec", "-i", container, "psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1",
    "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", database];
}
function sql(database, input) {
  return execFileSync("docker", args(database), {
    input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function concurrent(database, name, input) {
  const child = spawn("docker", args(database));
  let output = "";
  let errors = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { errors += data; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output: output.trim(), errors }));
  });
  child.stdin.end(`SET application_name='${name}'; SET deadlock_timeout='100ms';
    SET statement_timeout='8s'; ${input}`);
  return done;
}
async function paused(database, name) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (sql(database, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='${name}' AND wait_event='PgSleep');`) === "t") return;
    await delay(25);
  }
  throw new Error("Concurrent append did not reach the pause trigger");
}

test("Numo lock upgrade eliminates message and tool deadlocks without weakening durable claims", { skip: !container }, async (context) => {
  const database = `numo_locks_${randomUUID().replaceAll("-", "")}`;
  const turn = randomUUID();
  const claim = randomUUID();
  const worker = randomUUID();
  sql("postgres", `CREATE DATABASE ${database};`);
  try {
    sql(database, `DO $$ BEGIN
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE TABLE public.numo_assistant_turns(id uuid PRIMARY KEY, last_event_seq integer NOT NULL DEFAULT -1,
      updated_at timestamptz, status text, claim_token uuid, active_run_id uuid);
    CREATE TABLE public.numo_turn_events(id uuid PRIMARY KEY, turn_id uuid REFERENCES public.numo_assistant_turns,
      seq integer, type text, payload jsonb, UNIQUE(turn_id,seq));
    CREATE TABLE public.assistant_messages(id uuid PRIMARY KEY, turn_id uuid REFERENCES public.numo_assistant_turns);
    CREATE TABLE public.agent_runs(id uuid PRIMARY KEY);
    CREATE TABLE public.numo_tool_operations(turn_id uuid REFERENCES public.numo_assistant_turns,
      tool_call_id text, status text, claim_token uuid, success boolean, pause boolean, result jsonb,
      result_version integer, model_result jsonb, model_result_version integer, result_run_id uuid,
      completed_at timestamptz, tool_name text, PRIMARY KEY(turn_id,tool_call_id));
    INSERT INTO public.numo_assistant_turns(id,status,claim_token) VALUES('${turn}','running','${claim}');
    INSERT INTO public.agent_runs VALUES('${worker}');
    INSERT INTO public.numo_tool_operations(turn_id,tool_call_id,status,claim_token,tool_name,result_run_id)
      VALUES('${turn}','launch','started','${claim}','launch_code_agent','${worker}');
    ${definition(fences, "require_encryption_read_committed")}
    ${definition(fences, "guard_encryption_snapshot_write")}
    CREATE TRIGGER final_fence BEFORE INSERT OR UPDATE ON public.numo_assistant_turns
      FOR EACH ROW EXECUTE FUNCTION public.guard_encryption_snapshot_write('numo_final_content_scope','global');
    CREATE TRIGGER tool_fence BEFORE INSERT OR UPDATE ON public.numo_assistant_turns
      FOR EACH ROW EXECUTE FUNCTION public.guard_encryption_snapshot_write('numo_tool_content_scope','global');
    CREATE TRIGGER final_fence BEFORE INSERT OR UPDATE ON public.assistant_messages
      FOR EACH ROW EXECUTE FUNCTION public.guard_encryption_snapshot_write('numo_final_content_scope','global');
    CREATE TRIGGER tool_fence BEFORE INSERT OR UPDATE ON public.numo_tool_operations
      FOR EACH ROW EXECUTE FUNCTION public.guard_encryption_snapshot_write('numo_tool_content_scope','global');
    CREATE FUNCTION public.pause_test_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.type='pause_fixture' THEN PERFORM pg_sleep(1); END IF; RETURN NEW;
    END $$;
    CREATE TRIGGER pause_test_event BEFORE INSERT ON public.numo_turn_events
      FOR EACH ROW EXECUTE FUNCTION public.pause_test_event();
    ${definition(durable, "append_numo_turn_event")}
    ${definition(durable, "complete_numo_tool_operation")}
    ${definition(protectedSql, "complete_numo_tool_operation_protected")}
    REVOKE ALL ON FUNCTION public.append_numo_turn_event(uuid,uuid,text,jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.complete_numo_tool_operation(uuid,uuid,text,boolean,jsonb,jsonb,boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.complete_numo_tool_operation_protected(uuid,uuid,text,boolean,jsonb,integer,jsonb,integer,uuid,boolean) FROM PUBLIC;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;`);

    const append = (event = randomUUID()) => `SELECT seq FROM public.append_numo_turn_event('${turn}','${event}','pause_fixture','{}');`;
    const complete = (protectedCall, token = claim) => protectedCall
      ? `SELECT public.complete_numo_tool_operation_protected('${turn}','${token}','launch',true,'{}',1,'{}',1,'${worker}',false);`
      : `SELECT public.complete_numo_tool_operation('${turn}','${token}','launch',true,'{"run_id":"${worker}"}','{}',false);`;
    const reset = () => sql(database, `UPDATE public.numo_tool_operations SET status='started';
      UPDATE public.numo_assistant_turns SET status='running',claim_token='${claim}',active_run_id=NULL;`);
    const pair = async (other) => {
      const name = `append_${randomUUID().replaceAll("-", "")}`;
      const first = concurrent(database, name, append());
      await paused(database, name);
      return Promise.all([first, concurrent(database, `other_${name}`, other)]);
    };
    const message = () => `INSERT INTO public.assistant_messages VALUES('${randomUUID()}','${turn}');`;
    for (const other of [message(), complete(true), complete(false)]) {
      reset();
      const before = await pair(other);
      assert.ok(before.some((result) => /40P01/.test(result.errors)), JSON.stringify(before));
    }
    context.diagnostic("Both completion RPCs and message FK checks reproduce SQLSTATE 40P01 before the upgrade.");
    sql(database, migration);
    for (const other of [message(), complete(true), complete(false)]) {
      reset();
      const after = await pair(other);
      assert.ok(after.every((result) => result.code === 0), JSON.stringify(after));
    }
    assert.equal(sql(database, `SELECT active_run_id='${worker}' FROM public.numo_assistant_turns WHERE id='${turn}';`), "t");

    reset();
    const event = randomUUID();
    const name = `retry_${randomUUID().replaceAll("-", "")}`;
    const first = concurrent(database, name, append(event));
    await paused(database, name);
    const duplicates = await Promise.all([first, concurrent(database, `second_${name}`, append(event))]);
    assert.ok(duplicates.every((result) => result.code === 0), JSON.stringify(duplicates));
    assert.equal(duplicates[0].output, duplicates[1].output);
    assert.equal(sql(database, `SELECT count(*) FROM public.numo_turn_events WHERE id='${event}';`), "1");
    assert.equal(sql(database, `SELECT last_event_seq=(SELECT max(seq) FROM public.numo_turn_events WHERE turn_id='${turn}')
      FROM public.numo_assistant_turns WHERE id='${turn}';`), "t");

    const appends = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      concurrent(database, `parallel_${index}`, `SELECT seq FROM public.append_numo_turn_event(
        '${turn}','${randomUUID()}','tool_result','{}');`)));
    assert.ok(appends.every((result) => result.code === 0), JSON.stringify(appends));
    assert.equal(new Set(appends.map((result) => result.output)).size, 12);
    const otherTurn = randomUUID();
    sql(database, `INSERT INTO public.numo_assistant_turns(id) VALUES('${otherTurn}');`);
    assert.throws(() => sql(database, `SELECT public.append_numo_turn_event('${otherTurn}','${event}','tool_result','{}');`), /23505.*event_id_conflict/);
    assert.throws(() => sql(database, `SELECT public.append_numo_turn_event('${randomUUID()}','${randomUUID()}','tool_result','{}');`), /P0002.*turn_not_found/);
    sql(database, "ALTER TABLE public.numo_turn_events ADD CHECK(type <> 'invalid_fixture');");
    const sequenceBeforeFailure = sql(database, `SELECT last_event_seq FROM public.numo_assistant_turns WHERE id='${turn}';`);
    assert.throws(() => sql(database, `SELECT public.append_numo_turn_event('${turn}','${randomUUID()}','invalid_fixture','{}');`), /23514/);
    assert.equal(sql(database, `SELECT last_event_seq FROM public.numo_assistant_turns WHERE id='${turn}';`), sequenceBeforeFailure);

    for (const protectedCall of [true, false]) {
      reset();
      assert.equal(sql(database, complete(protectedCall, randomUUID())), "f");
      assert.equal(sql(database, `SELECT status FROM public.numo_tool_operations WHERE turn_id='${turn}';`), "started");
      sql(database, `UPDATE public.numo_assistant_turns SET status='completed' WHERE id='${turn}';`);
      assert.equal(sql(database, complete(protectedCall)), "f");
      sql(database, `UPDATE public.numo_assistant_turns SET status='stopping' WHERE id='${turn}';`);
      assert.equal(sql(database, complete(protectedCall)), "t");
    }
    for (const signature of ["append_numo_turn_event(uuid,uuid,text,jsonb)",
      "complete_numo_tool_operation(uuid,uuid,text,boolean,jsonb,jsonb,boolean)",
      "complete_numo_tool_operation_protected(uuid,uuid,text,boolean,jsonb,integer,jsonb,integer,uuid,boolean)"]) {
      assert.equal(sql(database, `SELECT has_function_privilege('service_role','public.${signature}','EXECUTE')
        AND NOT has_function_privilege('authenticated','public.${signature}','EXECUTE')
        AND NOT has_function_privilege('anon','public.${signature}','EXECUTE');`), "t");
    }
  } finally {
    sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
  }
});
