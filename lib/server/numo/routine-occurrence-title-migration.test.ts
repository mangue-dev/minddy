import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrations = path.join(process.cwd(), "supabase/migrations");
const DEFINITION = "create or replace function public.ensure_numo_routine_occurrence(";

/** The body Postgres runs: the last migration that (re)defines the function. */
function latestDefinition() {
  const file = readdirSync(migrations).filter((name) => name.endsWith(".sql"))
    .sort().reverse().find((name) => readFileSync(path.join(migrations, name),
      "utf8").toLowerCase().includes(DEFINITION));
  if (!file) throw new Error("ensure_numo_routine_occurrence is not defined");
  const sql = readFileSync(path.join(migrations, file), "utf8").toLowerCase();
  const start = sql.lastIndexOf(DEFINITION);
  return sql.slice(start, sql.indexOf("$$;", sql.indexOf("$$", start) + 2));
}

describe("Routine occurrence conversation titles (MIN-791)", () => {
  // startRoutineOccurrence encrypts the title bound to the request id before
  // the conversation exists; any other id or a cut ciphertext makes the
  // conversation unreadable.
  it("creates the conversation under the request id the title is bound to", () => {
    const body = latestDefinition();
    expect(body).toMatch(/insert into public\.conversations \(\s*id,/);
    expect(body).toMatch(/\) values \(\s*p_request_id,/);
  });

  it("stores an encrypted title without truncating it", () => {
    expect(latestDefinition()).toContain(
      "case when p_title like 'mdyn3:%'\n      then p_title else pg_catalog.left(pg_catalog.btrim(p_title), 200) end",
    );
  });
});
