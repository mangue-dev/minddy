import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The SQL side of the MIN-688 review fixes, read from the migrations: the
 * LATEST definition of each function or policy is the one production runs.
 * Their behavior was probed against the production schema in rollback-only
 * transactions (docs/page-collaboration.md#verification); these checks keep a
 * later migration from silently reverting them.
 */

const DIR = join(process.cwd(), "supabase/migrations");
const files = readdirSync(DIR).filter((file) => file.endsWith(".sql")).sort();

/** The text of the last migration statement that (re)defines `name`. */
function latest(pattern: RegExp): string {
  for (const file of [...files].reverse()) {
    const sql = readFileSync(join(DIR, file), "utf8");
    const match = pattern.exec(sql);
    if (!match) continue;
    const start = match.index;
    const end = sql.indexOf("$function$;", start);
    const policyEnd = sql.indexOf(");\n", start);
    return sql.slice(start, end > 0 && end > start ? end : policyEnd);
  }
  throw new Error(`no definition for ${pattern}`);
}

describe("page collaboration SQL review fixes (MIN-688)", () => {
  it("lets a guard re-assert an existing encryption marker without the exclusive lock", () => {
    const marker = latest(/CREATE (OR REPLACE )?FUNCTION public\.guard_encryption_marker_change\(\)/);
    const skip = marker.indexOf("IF present THEN RETURN NULL; END IF;");
    const lock = marker.indexOf("pg_advisory_xact_lock(");
    expect(skip).toBeGreaterThan(0);
    expect(skip).toBeLessThan(lock);
    expect(marker).toContain("pg_catalog.pg_trigger_depth()>1");
    const fence = latest(/CREATE (OR REPLACE )?FUNCTION public\.guard_encryption_snapshot_write\(\)/);
    expect(fence).toContain("'issue_encryption_scopes'");
    expect(fence).toContain("'push_content_write_scope'");
    expect(fence).not.toContain("'page_content_encryption_scope'");
  });

  it("keeps pending plaintext steps when a page is sealed", () => {
    const guard = latest(/CREATE (OR REPLACE )?FUNCTION public\.guard_page_collaboration\(\)/);
    expect(guard).toContain("page_collaboration_plaintext_pending");
    expect(guard.indexOf("page_collaboration_plaintext_pending"))
      .toBeLessThan(guard.indexOf("DELETE FROM public.page_collaboration_batches"));
  });

  it("writes no deleted author into a materialized page", () => {
    const projection = latest(/CREATE (OR REPLACE )?FUNCTION public\.write_page_collaboration_projection\(/);
    expect(projection).toContain("FROM auth.users AS account");
    expect(projection).toContain("FROM public.api_keys AS api_key");
    expect(projection).toContain("newer_bytes > 8388608");
  });

  it("locks the membership generation, refuses a trashed project and bounds the backlog", () => {
    const append = latest(/CREATE (OR REPLACE )?FUNCTION public\.append_page_collaboration\(/);
    expect(append).toContain("FOR SHARE OF generation");
    expect(append).toContain("project.deleted_at IS NULL");
    expect(append).toContain("'backlog'");
    expect(append).toContain("size_bytes");
  });

  it("indexes the journal and the heads by project for cascading deletions", () => {
    const sql = files.map((file) => readFileSync(join(DIR, file), "utf8")).join("\n");
    expect(sql).toMatch(/ON public\.page_collaboration_batches \(project_id\)/);
    expect(sql).toMatch(/ON public\.page_collaboration_heads \(project_id\)/);
  });

  it("lets only writers send carets", () => {
    const sql = files.map((file) => readFileSync(join(DIR, file), "utf8"));
    const last = [...sql].reverse().find((text) =>
      text.includes("CREATE POLICY members_send_page_collaboration_carets"))!;
    const policy = last.slice(last.indexOf("CREATE POLICY members_send_page_collaboration_carets"));
    expect(policy.slice(0, policy.indexOf(");\n"))).toContain("public.can_write_project(page.project_id)");
  });

  it("opens the collaboration gap inside the encrypted database import", () => {
    const importer = latest(/CREATE (OR REPLACE )?FUNCTION public\.import_encrypted_page_database\(/);
    expect(importer).toContain("PERFORM public.reset_page_collaboration(p_page);");
    const source = readFileSync(join(process.cwd(), "lib/server/database-import.ts"), "utf8");
    expect(source).not.toContain("resetCollaboration(");
  });
});
