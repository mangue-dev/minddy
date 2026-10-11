import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";

// Opt in to a disposable PostgreSQL probe. No application database URL is read.
const enabled = process.env.MINDDY_WORKER_HANDOFF_POSTGRES === "1";
const execute = promisify(execFile);
const container = `minddy-worker-handoff-${process.pid}`;
const runId = "00000000-0000-4000-8000-000000000001";
const turnId = "00000000-0000-4000-8000-000000000002";
const eventId = "00000000-0000-4000-8000-000000000003";
const sql = async (source: string) => (await execute("docker", ["exec", container, "psql",
  "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", source])).stdout.trim();
const call = (type = "worker_completed", expected = "NULL") =>
  `SELECT public.resume_numo_turn_from_worker('${runId}','${eventId}','${type}','{}',${expected});`;
const reset = async () => sql(`TRUNCATE public.numo_turn_events, public.numo_assistant_turns, public.agent_runs;
  INSERT INTO public.agent_runs(id,status,awaiting_input,started_at,rest_claimed_at,parent_numo_turn_id) VALUES ('${runId}','completed',false,'2026-10-11T01:00:00Z',NULL,'${turnId}');
  INSERT INTO public.numo_assistant_turns(id,active_run_id,status,created_at)
    VALUES ('${turnId}','${runId}','waiting_work',now());`);

beforeAll(async () => {
  if (!enabled) return;
  await execute("docker", ["run", "-d", "--name", container, "--network", "none",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16"]);
  const until = Date.now() + 30_000;
  for (;;) {
    try { await sql("SELECT 1"); break; }
    catch (error) { if (Date.now() >= until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.agent_runs(id uuid PRIMARY KEY,status text,awaiting_input boolean,
      started_at timestamptz,rest_claimed_at timestamptz,parent_numo_turn_id uuid,
      parent_numo_conversation_id uuid,interrupt_requested boolean DEFAULT false,project_id uuid,
      created_by uuid,parent_numo_tool_call_id text,encrypted_delegation_input text,
      delegation_encryption_version integer);
    CREATE TABLE public.numo_assistant_turns(id uuid PRIMARY KEY,active_run_id uuid,status text,
      created_at timestamptz,claim_token uuid,claimed_at timestamptz,not_before timestamptz,
      checkpoint jsonb,updated_at timestamptz,conversation_id uuid,user_id uuid,
      completed_at timestamptz,error_message text,request_id uuid,run_id uuid);
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.projects(id uuid PRIMARY KEY,owner_id uuid,name text,key text);
    CREATE TABLE public.conversations(id uuid PRIMARY KEY,status text,error_message text,updated_at timestamptz,
      user_id uuid,project_id uuid);
    CREATE TABLE public.agent_run_messages(run_id uuid,consumed_at timestamptz,created_by uuid,content text);
    CREATE TABLE public.agent_run_input_requests(run_id uuid,parent_numo_turn_id uuid,status text DEFAULT 'pending',
      question_id text,call_id text,questions jsonb);
    CREATE TABLE public.numo_turn_events(id uuid PRIMARY KEY);
    CREATE FUNCTION public.append_numo_turn_event(uuid,uuid,text,jsonb) RETURNS void
      LANGUAGE sql AS 'INSERT INTO public.numo_turn_events VALUES ($2)';
    CREATE FUNCTION public.resume_numo_turn_from_worker(uuid,uuid,text,jsonb DEFAULT '{}')
      RETURNS text LANGUAGE sql AS 'SELECT ''legacy''::text';`);
  await sql(readFileSync("supabase/migrations/20270109200021_numo_durable_worker_stop.sql", "utf8"));
  await sql(readFileSync("supabase/migrations/20270109200042_numo_stop_preserves_workers.sql", "utf8"));
  await sql(readFileSync("supabase/migrations/20270109200041_numo_worker_completion_authority.sql", "utf8"));
}, 60_000);
afterAll(async () => { if (enabled) await execute("docker", ["rm", "-f", container]); });

it.skipIf(!enabled)("rejects active and superseded workers, validates result type and delivers once", async () => {
  await reset();
  for (const status of ["queued", "running"]) {
    await sql(`UPDATE public.agent_runs SET status='${status}'`);
    expect(await sql(call())).toBe("ignored");
  }
  await sql("UPDATE public.agent_runs SET status='completed'");
  expect(await sql(call("worker_failed"))).toBe("ignored");
  expect(await sql(call("worker_input"))).toBe("ignored");
  expect(await sql(call("worker_completed", `'${JSON.stringify({ status: "completed", started_at: "2026-10-11T00:00:00Z", rest_claimed_at: null })}'`))).toBe("ignored");
  expect(await sql(call("worker_completed", `'${JSON.stringify({ status: "completed", started_at: "2026-10-11T01:00:00Z", rest_claimed_at: "2026-10-11T01:01:00Z" })}'`))).toBe("ignored");
  await sql("UPDATE public.agent_runs SET parent_numo_turn_id=NULL");
  expect(await sql(call())).toBe("ignored");
  await sql(`UPDATE public.agent_runs SET parent_numo_turn_id='${turnId}'`);
  expect(await sql("SELECT count(*) FROM public.numo_turn_events")).toBe("0");
  // Earlier application versions still use the four-argument call during rollout.
  expect(await sql(call().replace(",NULL)", ")"))).toBe("queued");
  expect(await sql(call())).toBe("duplicate");
  expect(await sql("SELECT count(*) FROM public.numo_turn_events")).toBe("1");
  await reset(); await sql("UPDATE public.agent_runs SET awaiting_input=true");
  expect(await sql(call())).toBe("ignored");
  expect(await sql(call("worker_input"))).toBe("queued");
  await reset(); await sql("UPDATE public.agent_runs SET status='failed'");
  expect(await sql(call("worker_failed"))).toBe("queued");
});

it.skipIf(!enabled)("rechecks completion under the worker lock when resumption races delivery", async () => {
  await reset();
  const args = ["exec", container, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At",
    "-c", "BEGIN", "-c", "UPDATE public.agent_runs SET status='running'",
    "-c", "SELECT 'worker_locked'", "-c", "SELECT pg_sleep(1)", "-c", "COMMIT"];
  const child = execFile("docker", args);
  const exited = new Promise<void>((resolve, reject) => {
    child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Resume transaction failed")));
  });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject); child.stdout!.on("data", (chunk) => {
      if (String(chunk).includes("worker_locked")) resolve();
    });
  });
  expect(await sql(call())).toBe("ignored");
  await exited;
  expect(await sql("SELECT status FROM public.numo_assistant_turns")).toBe("waiting_work");
  expect(await sql("SELECT count(*) FROM public.numo_turn_events")).toBe("0");
});

const conversationId = "00000000-0000-4000-8000-000000000004";
const userId = "00000000-0000-4000-8000-000000000005";
const siblingId = "00000000-0000-4000-8000-000000000006";
const resetStop = async (status: string) => {
  await reset();
  await sql(`TRUNCATE public.conversations, public.agent_run_messages, public.agent_run_input_requests;
    INSERT INTO public.conversations(id,status,error_message,updated_at) VALUES ('${conversationId}','generating',NULL,now());
    UPDATE public.numo_assistant_turns SET status='${status}',conversation_id='${conversationId}',
      user_id='${userId}',claim_token='${eventId}',claimed_at=now()-interval '7 minutes';
    UPDATE public.agent_runs SET status='running',parent_numo_conversation_id='${conversationId}';
    INSERT INTO public.agent_runs(id,status,parent_numo_turn_id,parent_numo_conversation_id)
      VALUES ('${siblingId}','queued','${turnId}','${conversationId}');
    INSERT INTO public.agent_run_messages(run_id,consumed_at) VALUES ('${runId}',NULL),('${siblingId}',NULL);
    INSERT INTO public.agent_run_input_requests(run_id,parent_numo_turn_id,status) VALUES ('${runId}','${turnId}','pending');`);
};
const workersUnchanged = async () => {
  expect(await sql("SELECT string_agg(status,',' ORDER BY id) FROM public.agent_runs")).toBe("running,queued");
  expect(await sql("SELECT count(*) FROM public.agent_runs WHERE interrupt_requested")).toBe("0");
  expect(await sql("SELECT count(*) FROM public.agent_run_messages WHERE consumed_at IS NULL")).toBe("2");
  expect(await sql("SELECT status FROM public.agent_run_input_requests")).toBe("pending");
};

it.skipIf(!enabled)("stops only Numo, preserves owner isolation and suppresses late worker wake-up", async () => {
  for (const status of ["queued", "running", "waiting_work", "waiting_input", "retryable", "reconciling", "stopping"]) {
    await resetStop(status);
    expect(await sql(`SELECT count(*) FROM public.request_numo_turn_stop('${conversationId}','${eventId}')`)).toBe("0");
    const nextStatus = ["running", "stopping"].includes(status) ? "stopping" : "stopped";
    expect(await sql(`SELECT status FROM public.request_numo_turn_stop('${conversationId}','${userId}')`)).toBe(nextStatus);
    await sql(`SELECT public.request_numo_turn_stop('${conversationId}','${userId}')`);
    await workersUnchanged();
    await sql("UPDATE public.agent_runs SET status='completed'");
    expect(await sql(call())).toBe("ignored");
    expect(await sql("SELECT count(*) FROM public.numo_turn_events")).toBe("0");
    expect(await sql("SELECT status FROM public.numo_assistant_turns")).toBe(nextStatus);
  }
}, 30_000);

it.skipIf(!enabled)("recovers a stale Numo stop without touching workers and keeps individual Stop scoped", async () => {
  await resetStop("stopping");
  expect(await sql("SELECT public.recover_stale_numo_turns()")).toBe("1");
  expect(await sql("SELECT status FROM public.numo_assistant_turns")).toBe("stopped");
  expect(await sql("SELECT claim_token IS NULL AND claimed_at IS NULL FROM public.numo_assistant_turns")).toBe("t");
  expect(await sql("SELECT status FROM public.conversations")).toBe("idle");
  await workersUnchanged();
  expect(await sql("SELECT public.recover_stale_numo_turns()")).toBe("0");
  expect(await sql(`SELECT public.request_numo_worker_stop('${runId}')`)).toBe(turnId);
  expect(await sql("SELECT string_agg(interrupt_requested::text,',' ORDER BY id) FROM public.agent_runs")).toBe("true,false");
  expect(await sql("SELECT status FROM public.agent_run_input_requests")).toBe("canceled");
  expect(await sql(`SELECT consumed_at IS NULL FROM public.agent_run_messages WHERE run_id='${siblingId}'`)).toBe("t");
});


it.skipIf(!enabled)("preserves independent workers in the encrypted stale-stop regression", async () => {
  await reset();
  // Only synthetic rows and the actual functions are exercised, not a full schema replay.
  await sql(readFileSync("scripts/encryption-numo-stop-cascade-regression.sql", "utf8"));
});
