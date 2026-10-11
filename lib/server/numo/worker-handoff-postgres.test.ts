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
  INSERT INTO public.agent_runs VALUES ('${runId}','completed',false,'2026-10-11T01:00:00Z',NULL,'${turnId}');
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
      started_at timestamptz,rest_claimed_at timestamptz,parent_numo_turn_id uuid);
    CREATE TABLE public.numo_assistant_turns(id uuid PRIMARY KEY,active_run_id uuid,status text,
      created_at timestamptz,claim_token uuid,claimed_at timestamptz,not_before timestamptz,
      checkpoint jsonb,updated_at timestamptz);
    CREATE TABLE public.numo_turn_events(id uuid PRIMARY KEY);
    CREATE FUNCTION public.append_numo_turn_event(uuid,uuid,text,jsonb) RETURNS void
      LANGUAGE sql AS 'INSERT INTO public.numo_turn_events VALUES ($2)';
    CREATE FUNCTION public.resume_numo_turn_from_worker(uuid,uuid,text,jsonb DEFAULT '{}')
      RETURNS text LANGUAGE sql AS 'SELECT ''legacy''::text';`);
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
