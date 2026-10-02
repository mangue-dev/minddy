import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const template = process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE ?? "minddy_min591_full_audit";
const correction = readFileSync("supabase/migrations/20270107015000_reconcile_numo_history_projection.sql", "utf8");
const legacyColumns = `SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
  AND table_name IN ('numo_work','numo_conversation_history','numo_user_conversation_history')
  AND column_name='detail_href';`;
const snapshot = `SELECT jsonb_agg(jsonb_build_object('oid',oid,'name',relname,'options',reloptions,
  'definition',pg_get_viewdef(oid,true)) ORDER BY relname) FROM pg_class
  WHERE oid IN ('public.numo_work'::regclass,'public.numo_conversation_history'::regclass,
    'public.numo_user_conversation_history'::regclass);`;
function sql(database: string, input: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-At",
    "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
  { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function clone(run: (database: string) => void) {
  const database = `min591_projection_${randomBytes(6).toString("hex")}`;
  execFileSync("docker", ["exec", container, "createdb", "-U", "supabase_admin", "-O", "postgres", "-T", template, database]);
  try { run(database); }
  finally { execFileSync("docker", ["exec", container, "dropdb", "-U", "supabase_admin", "--force", database]); }
}

describe.skipIf(!enabled)("historical Numo projection reconciliation", () => {
  it("leaves current encrypted projections unchanged", () => clone((database) => {
    expect(sql(database, legacyColumns)).toBe("0");
    const before = sql(database, snapshot);
    sql(database, correction);
    expect(sql(database, snapshot)).toBe(before);
  }), 20000);

  it("repairs legacy columns atomically, preserves access, and refuses unexpected dependencies", () => clone((database) => {
    const legacy = readFileSync("supabase/migrations/20270106910000_numo_history_drop_detail_href.sql", "utf8")
      .replace("pin.created_at AS pinned_at, rd.last_read_at", "pin.created_at AS pinned_at, rd.last_read_at, NULL::text AS detail_href")
      .replace("w.id AS latest_work_id", "NULL::text AS detail_href, w.id AS latest_work_id")
      .replace("jsonb_build_object('name', p.name), r.id", "jsonb_build_object('name', p.name), NULL::text, r.id");
    sql(database, legacy);
    expect(sql(database, legacyColumns)).toBe("3");
    sql(database, "CREATE VIEW public.projection_blocker AS SELECT detail_href FROM public.numo_conversation_history;");
    const beforeFailure = sql(database, snapshot);
    expect(() => sql(database, correction)).toThrow();
    expect(sql(database, snapshot)).toBe(beforeFailure);
    sql(database, "DROP VIEW public.projection_blocker;");
    sql(database, correction);
    expect(sql(database, legacyColumns)).toBe("0");
    expect(sql(database, `SELECT count(*) FROM pg_class WHERE oid IN
      ('public.numo_work'::regclass,'public.numo_conversation_history'::regclass,
       'public.numo_user_conversation_history'::regclass) AND reloptions @> ARRAY['security_invoker=true'];`)).toBe("3");
    expect(sql(database, `SELECT has_table_privilege('authenticated','public.numo_conversation_history','SELECT'),
      has_table_privilege('service_role','public.numo_conversation_history','SELECT'),
      has_table_privilege('anon','public.numo_conversation_history','SELECT');`)).toBe("t|t|f");
    expect(sql(database, `SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='assistant_active_conversation' AND policyname IN
      ('assistant_active_conversation_insert','assistant_active_conversation_update');`)).toBe("2");
    const after = sql(database, snapshot);
    sql(database, correction);
    expect(sql(database, snapshot)).toBe(after);
  }), 20000);
});
