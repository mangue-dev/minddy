import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { BASELINE_MIGRATION, canonicalSql } from "@/test/sql-migrations";

/**
 * The safeguard of the diagram: what has once been hardened must remain so.
 *
 * MIN-118 had closed four doors; MIN-338 found them open — not
 * out of malice, out of ignorance. Each of the faulty migrations (`pages` and
 * its DELETE, `ai_usage_run_spend` and its definer, the `*_select` of the tables
 * of agent without TO clause) was fair, taken alone. The rule only existed
 * in the comment of a file that no one had any reason to open.
 *
 * This test gets her out of there. It does NOT reread the base — it reads the migrations, where
 * the fault is written, and only inspects files after the last sweep
 * ({@link SWEEP}): the above was caught up by the LOOPS of this broom,
 * not by the text of its own file, and rereading it would give mistakes
 * already corrected. The real state of production is controlled with
 * `node scripts/security-probe.mjs`, which exercises the same invariants against
 * PostgREST with the real anon key and a real JWT.
 *
 * When this test fails, the fix is ​​almost never to modify the old
 * migration (it is already applied in prod): it is to add a migration
 * which copies the loops of {@link SWEEP}, written to be replayed — and of
 * advance {@link SWEEP} to her.
 */

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

/** The baseline includes the last broom. Any file AFTER it is subject to the rules. */
const SWEEP = BASELINE_MIGRATION.split("_")[0];

/**
 * The only `security definer` that `authenticated` must be able to execute:
 * those that a POLICY expression calls. Same reason as in
 * `20260926093000_definer_grants_sweep.sql` — a family, not a list, because
 * that a list does not know the functions written after it.
 */
const POLICY_HELPERS =
  /^(can_access_.*|is_project_member|is_project_owner|can_watch_.*|.*_quota_ok)$/;

/** The roles that a policy has the right to target. `public` and `anon`: never. */
const ALLOWED_POLICY_ROLES = new Set(["authenticated", "service_role"]);

type Migration = { version: string; file: string; sql: string; statements: string[] };

/**
 * Breaks a SQL file into statements, comments removed.
 *
 * The only delicate point is the dollar-quoting: a body `$$ … ; -- … $$`
 * contains `;` and `--` which are neither instruction purposes nor
 * comments. We therefore advance character by character rather than with a
 * `split(";")`, and the body is copied as is — it is he who wears the
 * broom loops, which the rules below can recognize.
 */
function statementsOf(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const tag = /^\$[A-Za-z_]*\$/.exec(rest);
    if (tag) {
      const end = sql.indexOf(tag[0], i + tag[0].length);
      const stop = end === -1 ? sql.length : end + tag[0].length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (rest.startsWith("'")) {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql[i] === ";") {
      out.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean).map((s) => s.replace(/\s+/g, " "));
}

function parse(file: string, sql: string): Migration {
  const canonical = canonicalSql(sql);
  return { version: file.split("_")[0], file, sql: canonical, statements: statementsOf(canonical) };
}

const migrations: Migration[] = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => parse(file, readFileSync(join(MIGRATIONS, file), "utf8")));

/** Files subject to the rules: those written after the last sweep. */
const after = migrations.filter((m) => m.version > SWEEP);

/**
 * Tables bearing `project_id`, accumulated over ALL migrations — one
 * column can arrive well after its table has been created.
 */
function projectScopedTables(all: Migration[], upTo: string): Set<string> {
  const tables = new Set<string>();
  for (const m of all) {
    if (m.version > upTo) break;
    // The baseline is a pg_dump: its CREATE TABLE contains
    // rich expressions that the little instruction slicer doesn't have to
    // to understand. The `);` terminal, however, remains stable.
    const creates =
      /create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\);/gi;
    for (const create of m.sql.matchAll(creates)) {
      if (/\bproject_id\b/i.test(create[2])) tables.add(create[1]);
    }
    for (const st of m.statements) {
      const alter = /^alter table (?:public\.)?(\w+)\b/i.exec(st);
      if (alter && /\badd column\b[\s\S]*\bproject_id\b/i.test(st)) tables.add(alter[1]);
    }
  }
  return tables;
}

// ── The rules ─────────────────────────────── ────────────────────────────────
// Each returns the list of faults, `file : what is wrong`. They are
// applied twice lower: to real migrations, and to files
// synthetics who bear the blame - otherwise, as long as no migration
// follows the broom, this file would turn green without having looked at anything.

/** Without a `TO` clause, a policy falls on the `public` role — therefore `anon`. */
function policiesTargetARole(files: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    for (const st of m.statements) {
      const policy = /^create policy (\w+) on (?:public\.)?(\w+)\b/i.exec(st);
      if (!policy) continue;
      const to = /\bto ([\w\s,]+?)\s+(?:using|with check)\b/i.exec(st);
      if (!to) {
        offenders.push(`${m.file} : ${policy[1]} n'a pas de clause TO`);
        continue;
      }
      for (const role of to[1].split(",").map((r) => r.trim().toLowerCase())) {
        if (!ALLOWED_POLICY_ROLES.has(role)) {
          offenders.push(`${m.file} : ${policy[1]} vise \`${role}\``);
        }
      }
    }
  }
  return offenders;
}

/** A table without RLS is readable and writable by any anon key. */
function newTablesEnableRls(files: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    for (const st of m.statements) {
      const create = /^create table (?:if not exists )?(?:public\.)?(\w+)\s*\(/i.exec(st);
      if (!create) continue;
      const rls = new RegExp(
        `^alter table (?:public\\.)?${create[1]}\\b.*enable row level security`,
        "i"
      );
      if (!m.statements.some((s) => rls.test(s))) {
        offenders.push(`${m.file} : ${create[1]} sans \`enable row level security\``);
      }
    }
  }
  return offenders;
}

/**
 * The Supabase bootstrap sets an `alter default privileges … grant all on
 * functions to anon, authenticated`: every function created in `public` is born
 * executable by the public anon key. `revoke … from public` IS NOT ENOUGH —
 * this is exactly the form that left `get_ai_run_spend` open.
 */
function definersAreClosed(files: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    for (const st of m.statements) {
      if (!/\bsecurity definer\b/i.test(st)) continue;
      const fn = /^create (?:or replace )?function (?:public\.)?(\w+)\s*\(/i.exec(st);
      if (!fn) continue;
      const name = fn[1];
      const bodyAt = st.search(/\$[A-Za-z_]*\$/);
      const header = bodyAt === -1 ? st : st.slice(0, bodyAt);
      if (!/\bset search_path\b/i.test(header)) {
        offenders.push(`${m.file} : ${name} n'a pas de \`set search_path\``);
      }
      // A trigger function cannot be called by PostgREST, and the helpers of
      // policy MUST remain executable by `authenticated` (revoke them
      // RAISES the branch, which causes the entire policy to fall).
      if (/returns trigger\b/i.test(header) || POLICY_HELPERS.test(name)) continue;
      const closed = m.statements.some(
        (s) =>
          (new RegExp(`^revoke .*\\bon function (?:public\\.)?${name}\\b`, "i").test(s) &&
            /\banon\b/i.test(s) &&
            /\bauthenticated\b/i.test(s)) ||
          // Or the broom itself, copied: it closes them all at once.
          (/^do /i.test(s) && /revoke all on function/i.test(s) && /prosecdef/i.test(s))
      );
      if (!closed) {
        offenders.push(
          `${m.file} : ${name} garde son EXECUTE pour anon/authenticated ` +
            `(revoke … from public, anon, authenticated — « from public » seul ne suffit pas)`
        );
      }
    }
  }
  return offenders;
}

/**
 * A `with check` only sees the NEW line: it cannot pin
 * `project_id`. Open the UPDATE of a partitioned table without replaying the trigger
 * to freeze is to let a member move the line in their own project.
 */
function updatePoliciesFreezeProjectId(files: Migration[], all: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    const scoped = projectScopedTables(all, m.version);
    for (const st of m.statements) {
      const policy = /^create policy (\w+) on (?:public\.)?(\w+) for (update|all)\b/i.exec(st);
      if (!policy || !scoped.has(policy[2])) continue;
      if (!/freeze_project_id/i.test(m.sql)) {
        offenders.push(
          `${m.file} : ${policy[1]} ouvre l'UPDATE de ${policy[2]} sans rejouer ` +
            `la boucle \`freeze_project_id\` de ${SWEEP}`
        );
      }
    }
  }
  return offenders;
}

// ── The deposit ──────────────────────────────── ─────────────────────────────────

describe("schema guardrail", () => {
  it("has no duplicate migration versions", () => {
    // The recurring pitfall: the version is the primary key of the remote registry.
    // Two files that share it, and the second remains “pending” FOR
    // ALWAYS, silently jumped by `db push` (happened twice).
    const seen = new Map<string, string[]>();
    for (const m of migrations) seen.set(m.version, [...(seen.get(m.version) ?? []), m.file]);
    expect([...seen.values()].filter((files) => files.length > 1)).toEqual([]);
  });

  it("has the reference sweep", () => {
    // If the constant no longer denotes anything, everything else would turn green
    // not inspecting any files.
    expect(migrations.some((m) => m.version === SWEEP)).toBe(true);
  });

  it("la baseline permet d'identifier les tables cloisonnées par projet", () => {
    expect(projectScopedTables(migrations, SWEEP)).toContain("issues");
  });

  it("every policy explicitly targets a role, never `public` or `anon`", () => {
    expect(policiesTargetARole(after)).toEqual([]);
  });

  it("every created table enables RLS in the same file", () => {
    expect(newTablesEnableRls(after)).toEqual([]);
  });

  it("toute `security definer` fige son search_path et se referme sur anon/authenticated", () => {
    expect(definersAreClosed(after)).toEqual([]);
  });

  it("every UPDATE policy on a table with `project_id` includes the freeze", () => {
    expect(updatePoliciesFreezeProjectId(after, migrations)).toEqual([]);
  });
});

// ── The rules themselves ───────────────────────── ──────────────────────────
// The four mistakes of MIN-338, rewritten as they were committed, and
// their correct form next to it. It is this block which proves that the previous block
// regarde quelque chose.

const later = (sql: string) => [parse("29990101000000_probe.sql", sql)];

describe("schema guardrail — the mistakes it catches", () => {
  it("catches a policy without a TO clause and allows `to authenticated`", () => {
    // As written in 20261126090000 et seq.
    expect(
      policiesTargetARole(
        later("create policy agent_runs_select on public.agent_runs for select using (true);")
      )
    ).toHaveLength(1);
    expect(policiesTargetARole(later("create policy p on public.t for select to anon using (true);")))
      .toHaveLength(1);
    expect(
      policiesTargetARole(
        later("create policy p on public.t for select to authenticated using (true);")
      )
    ).toEqual([]);
  });

  it("catches a table created without RLS", () => {
    expect(newTablesEnableRls(later("create table public.t (id uuid primary key);"))).toHaveLength(1);
    expect(
      newTablesEnableRls(
        later(
          "create table if not exists public.t (id uuid primary key);\n" +
            "alter table public.t enable row level security;"
        )
      )
    ).toEqual([]);
  });

  it("catches a definer that revokes only `from public`", () => {
    // The exact form of get_ai_run_spend (20261118090000).
    const leaky =
      "create function public.get_ai_run_spend(p uuid) returns numeric language sql " +
      "security definer set search_path = public as $$ select 1 $$;\n" +
      "revoke all on function public.get_ai_run_spend(uuid) from public;";
    expect(definersAreClosed(later(leaky))).toHaveLength(1);

    const closed = leaky.replace("from public;", "from public, anon, authenticated;");
    expect(definersAreClosed(later(closed))).toEqual([]);
  });

  it("attrape un definer dont le search_path flotte", () => {
    const floating =
      "create function public.f() returns numeric language sql security definer as $$ select 1 $$;\n" +
      "revoke all on function public.f() from public, anon, authenticated;";
    expect(definersAreClosed(later(floating))).toHaveLength(1);
  });

  it("allows a trigger function and a policy helper through", () => {
    expect(
      definersAreClosed(
        later(
          "create function public.notify() returns trigger language plpgsql security definer " +
            "set search_path = public as $$ begin return new; end $$;"
        )
      )
    ).toEqual([]);
    expect(
      definersAreClosed(
        later(
          "create function public.can_watch_thing(t text) returns boolean language sql " +
            "security definer set search_path = public as $$ select true $$;"
        )
      )
    ).toEqual([]);
  });

  it("catches an open UPDATE policy without the `project_id` freeze", () => {
    const naked = later("create policy issues_update on public.issues for update to authenticated " +
      "using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));");
    expect(updatePoliciesFreezeProjectId(naked, [...migrations, ...naked])).toHaveLength(1);

    const withFreeze = later(
      "create policy issues_update on public.issues for update to authenticated " +
        "using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));\n" +
        "create trigger issues_freeze_project_id before update of project_id on public.issues " +
        "for each row execute function public.freeze_project_id();"
    );
    expect(updatePoliciesFreezeProjectId(withFreeze, [...migrations, ...withFreeze])).toEqual([]);
  });

  it("splits a dollar-quoted body without being cut by its `;` characters", () => {
    const st = statementsOf(
      "create function public.f() returns void language plpgsql as $$ begin -- ; pas un commentaire\n" +
        " perform 1; perform 2; end $$;\nselect 1;"
    );
    expect(st).toHaveLength(2);
    expect(st[1]).toBe("select 1");
  });
});
