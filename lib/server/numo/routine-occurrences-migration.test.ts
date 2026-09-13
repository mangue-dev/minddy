import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20270106780000_numo_routine_occurrences.sql",
  ),
  "utf8",
).toLowerCase();

describe("Numo routine occurrence migration", () => {
  it("reserves one conversation for each scheduled occurrence", () => {
    expect(sql).toContain("create table public.numo_routine_occurrences");
    expect(sql).toContain("on public.numo_routine_occurrences (routine_id, scheduled_for)");
    expect(sql).toContain("where origin = 'scheduled'");
    expect(sql).toContain("request_id uuid not null unique");
    expect(sql).toContain("turn_id uuid unique references public.numo_assistant_turns");
  });

  it("records manual and scheduled provenance explicitly", () => {
    expect(sql).toContain("origin in ('scheduled', 'manual')");
    expect(sql).toContain("origin = 'scheduled' and scheduled_for is not null");
    expect(sql).toContain("origin = 'manual' and scheduled_for is null");
  });

  it("does not reinterpret legacy worker settings as conversation settings", () => {
    expect(sql).toContain("model, reasoning_level");
    expect(sql).toContain("null, null");
    expect(sql).toContain("legacy\n-- routine model/reasoning values were removed");
    expect(sql).toContain("legacy direct-worker setting retained for history");
    expect(sql).toContain("numo routine occurrences do not read or update it");
  });

  it("keeps occurrence admission service-owned", () => {
    expect(sql).toContain("if v_routine.owner_id is distinct from p_user_id");
    expect(sql).toContain("raise exception 'routine_occurrence_conflict'");
    expect(sql).toContain(
      "revoke all on public.numo_routine_occurrences from public, anon, authenticated",
    );
    expect(sql).toContain("to service_role");
  });
});
