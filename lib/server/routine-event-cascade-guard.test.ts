import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The routine journal trigger is redefined by whole-body migrations, so the
// guards must survive in whichever migration defines it last.
const migrations = path.join(process.cwd(), "supabase/migrations");
const latest = readdirSync(migrations)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(path.join(migrations, file), "utf8"))
  .filter((sql) => /function public\.capture_routine_event\(\)\s+returns trigger/i.test(sql))
  .at(-1)
  ?.toLowerCase() ?? "";

describe("routine event journal during cascading deletions (MIN-767)", () => {
  it("skips subjects whose project was deleted in the same statement", () => {
    expect(latest).toContain(
      "if not exists(select 1 from public.projects where id=pid) then return coalesce(new,old); end if;",
    );
  });

  it("skips an issue the cascade removed before the trigger re-read it", () => {
    const reread = latest.indexOf("into after_value from public.issues i where i.id=sid;");
    expect(reread).toBeGreaterThan(-1);
    expect(latest.indexOf("if not found then return coalesce(new,old); end if;", reread)).toBeGreaterThan(reread);
  });
});
