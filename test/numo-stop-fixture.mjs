/** Emit a disposable Stop schema using the real run/turn definitions and RPCs.
 * Unrelated application relations are stubs; this is not a Supabase bootstrap.
 */
import { readFileSync, readdirSync } from "node:fs";
const directory = new URL("../supabase/migrations/", import.meta.url);
const read = name => readFileSync(new URL(name, directory), "utf8");
function section(sql, start, end) {
  const from = sql.indexOf(start), to = sql.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing schema section: ${start}`);
  return sql.slice(from, to);
}
function latestFunction(name) {
  let result;
  for (const file of readdirSync(directory).filter(x => x.endsWith(".sql")).sort()) {
    const sql = read(file);
    const match = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`, "i").exec(sql);
    if (match) {
      const definition = sql.slice(match.index);
      const opening = /\bAS\s+(\$[A-Za-z_]*\$)/i.exec(definition);
      if (!opening) throw new Error(`Missing RPC body delimiter: ${name}`);
      const end = definition.indexOf(opening[1], opening.index + opening[0].length);
      result = definition.slice(0, end + opening[1].length + 1);
    }
  }
  if (!result) throw new Error(`Missing RPC: ${name}`);
  return result;
}
const durable = read("20270106680000_durable_numo_turns.sql");
process.stdout.write(`
SET check_function_bodies = false;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.conversations(id uuid PRIMARY KEY,user_id uuid,status text,error_message text,updated_at timestamptz);
${section(read("20270106090000_baseline.sql"), 'CREATE TABLE IF NOT EXISTS "public"."agent_runs" (', 'ALTER TABLE "public"."agent_runs" OWNER')}
ALTER TABLE public.agent_runs ADD PRIMARY KEY(id);
${section(durable, 'CREATE TABLE public.numo_assistant_turns (', 'CREATE INDEX numo_assistant_turns_queue_idx')}
ALTER TABLE public.numo_assistant_turns ADD COLUMN managed_budget_usd numeric;
ALTER TABLE public.numo_assistant_turns ADD UNIQUE(id,conversation_id);
ALTER TABLE public.agent_runs ADD COLUMN parent_numo_turn_id uuid,
  ADD COLUMN parent_numo_conversation_id uuid,
  ADD CONSTRAINT parent_numo_fk FOREIGN KEY(parent_numo_turn_id,parent_numo_conversation_id)
  REFERENCES public.numo_assistant_turns(id,conversation_id);
CREATE TABLE public.agent_run_messages(run_id uuid,consumed_at timestamptz);
CREATE TABLE public.agent_run_input_requests(run_id uuid,parent_numo_turn_id uuid,status text);
CREATE TABLE public.numo_turn_events(id uuid PRIMARY KEY,turn_id uuid,seq bigint,type text,payload jsonb);
CREATE TABLE public.assistant_messages(id uuid PRIMARY KEY,conversation_id uuid,turn_id uuid,
  role text,content text,context jsonb,metadata jsonb,user_payload_version integer);
${latestFunction("begin_numo_turn")}
${latestFunction("begin_numo_turn_with_budget")}
${latestFunction("claim_numo_turn")}
${latestFunction("resume_numo_turn_from_worker")}
${latestFunction("append_numo_turn_event")}
`);
