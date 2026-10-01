/** Emit an isolated admission schema for the PostgreSQL regression test.
 * This is not a complete Supabase bootstrap. Admission, encryption guards and
 * constraints come from the real migrations; unrelated relations are stubs.
 * Pipe into psql on a disposable database, apply the migration under test,
 * then run supabase/tests/agent_launch_json_nulls.test.sql.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../supabase/migrations/", import.meta.url);
const migration = (name) => readFileSync(fileURLToPath(new URL(name, root)), "utf8");
function between(sql, start, end) {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing migration section: ${start}`);
  return sql.slice(from, to);
}
const baseline = migration("20270106090000_baseline.sql");
const delegation = migration("20270106720000_numo_code_delegation_contract.sql");
const launch = migration("20270107160000_agent_launch_encryption.sql");
const encryptedDelegation = migration("20270107190000_agent_delegation_input_encryption.sql");
const source = migration("20270106700000_account_worker_model_source.sql");
const title = migration("20270107170000_agent_title_encryption.sql");

process.stdout.write(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.projects(id uuid PRIMARY KEY,owner_id uuid,name text,key text);
CREATE TABLE public.conversations(id uuid PRIMARY KEY,user_id uuid,title text);
CREATE TABLE public.agent_conversations(id uuid PRIMARY KEY,owner_id uuid,project_id uuid,visibility text,title text);
CREATE TABLE public.numo_assistant_turns(id uuid PRIMARY KEY,conversation_id uuid,
  user_id uuid,request_id uuid,run_id uuid,status text,managed_budget_usd numeric);
CREATE TABLE public.ai_usage(run_id uuid,numo_turn_id uuid,user_id uuid,key_mode text,cost numeric,created_at timestamptz);
${between(baseline, 'CREATE TABLE IF NOT EXISTS "public"."agent_runs" (', 'ALTER TABLE "public"."agent_runs" OWNER')}
ALTER TABLE public.agent_runs ADD PRIMARY KEY(id),
  ADD COLUMN repo_provider text, ADD COLUMN repo_external_id text,
  ADD COLUMN managed_budget_usd numeric, ADD COLUMN local_issue_context_confirmed boolean;
${between(source, 'alter table public.agent_runs', '-- Managed runs')}
${between(delegation, 'ALTER TABLE public.numo_assistant_turns', '-- Keep managed-budget')}
${between(launch, 'ALTER TABLE public.agent_runs', 'CREATE INDEX agent_runs_launch_encryption_queue')}
${between(launch, 'CREATE TABLE public.agent_launch_encryption_scopes', 'CREATE OR REPLACE FUNCTION public.create_agent_turn_for_run()')}
${between(title, 'ALTER TABLE public.agent_runs', 'ALTER TABLE public.agent_conversations')}
${between(encryptedDelegation, 'ALTER TABLE public.agent_runs', 'CREATE FUNCTION public.migrate_agent_delegation_input(')}
${between(encryptedDelegation, 'CREATE OR REPLACE FUNCTION public.create_agent_run_with_budget(', 'COMMIT;')}
`);
