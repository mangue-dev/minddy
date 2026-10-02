/** Emit a disposable schema for the Numo completion checkpoint regression.
 * Turn and message definitions and the original RPC come from real migrations.
 * Unrelated relations are stubs; this is not a complete Supabase bootstrap.
 * Pipe into psql, apply the completion migration, then run its SQL test.
 */
import { readFileSync } from "node:fs";
const directory = new URL("../supabase/migrations/", import.meta.url);
const read = (name) => readFileSync(new URL(name, directory), "utf8");
function section(sql, start, end) {
  const from = sql.indexOf(start), to = sql.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing schema section: ${start}`);
  return sql.slice(from, to);
}
const baseline = read("20270106090000_baseline.sql");
const durable = read("20270106680000_durable_numo_turns.sql");
process.stdout.write(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE TABLE public.conversations(id uuid PRIMARY KEY,user_id uuid,title text);
CREATE TABLE public.agent_runs(id uuid PRIMARY KEY);
${section(durable, "CREATE TABLE public.numo_assistant_turns (", "CREATE INDEX numo_assistant_turns_queue_idx")}
${section(baseline, 'CREATE TABLE IF NOT EXISTS "public"."assistant_messages" (', 'ALTER TABLE "public"."assistant_messages" OWNER')}
ALTER TABLE public.assistant_messages ADD PRIMARY KEY(id),
  ADD COLUMN turn_id uuid REFERENCES public.numo_assistant_turns(id);
${section(durable, "CREATE OR REPLACE FUNCTION public.checkpoint_numo_tool_round(", "CREATE OR REPLACE FUNCTION public.request_numo_turn_stop(")}
`);
