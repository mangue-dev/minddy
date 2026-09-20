import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20270106900000_extend_relations_to_objectives.sql"),
  "utf8",
);
const baseline = readFileSync(
  join(process.cwd(), "supabase/migrations/20270106090000_baseline.sql"),
  "utf8",
);
const enforce = migration.split('FUNCTION "public"."enforce_issue_relation"()')[1]
  .split("$$;")[0];

describe("objective relation migration", () => {
  it.each([
    ["source", "issues", "i"],
    ["source", "objectives", "o"],
    ["target", "issues", "i"],
    ["target", "objectives", "o"],
  ])("requires a live %s endpoint in %s within the same project", (side, table, alias) => {
    expect(enforce).toMatch(new RegExp(
      `select 1 from public\\.${table} ${alias}\\s+` +
      `where ${alias}\\.id = new\\.${side}_id and ${alias}\\.project_id = new\\.project_id\\s+` +
      `and ${alias}\\.deleted_at is null\\s+\\) then\\s+raise exception`,
    ));
  });

  it("validates both kinds before canonicalizing related endpoints without filtering closed statuses", () => {
    expect(enforce).toContain("if new.source_type not in ('issue', 'objective') then");
    expect(enforce).toContain("if new.target_type not in ('issue', 'objective') then");
    expect(enforce).toContain("if new.source_type = 'issue' then");
    expect(enforce).toContain("if new.target_type = 'issue' then");
    expect(enforce).not.toMatch(/\bstatus\b/);
    expect(enforce).toContain("if new.type = 'related' and new.source_id > new.target_id then");
    expect(enforce).toContain("tmp_type := new.source_type;");
    expect(enforce).toContain("new.source_type := new.target_type;");
    expect(enforce).toContain("new.target_type := tmp_type;");
    expect(enforce.lastIndexOf("deleted_at is null"))
      .toBeLessThan(enforce.indexOf("if new.type = 'related'"));
  });

  it("keeps endpoint validation on inserts and updates and retains soft-deleted relations", () => {
    expect(baseline).toContain(
      'CREATE OR REPLACE TRIGGER "issue_relations_enforce" BEFORE INSERT OR UPDATE ON "public"."issue_relations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_issue_relation"();',
    );
    expect(migration).not.toContain('DROP TRIGGER IF EXISTS "issue_relations_enforce"');
    for (const table of ["issues", "objectives"]) {
      expect(migration).toContain(
        `CREATE TRIGGER "${table}_purge_relations" AFTER DELETE ON "public"."${table}"`,
      );
    }
  });
});
