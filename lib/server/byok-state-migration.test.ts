import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20270106260000_atomic_byok_provider_state.sql"),
  "utf8",
);
const route = readFileSync(join(process.cwd(), "app/api/account/ai-keys/route.ts"), "utf8");

describe("atomic BYOK persistence boundary", () => {
  it("enforces one provider row per user and local-only surfaces in the database", () => {
    expect(migration).toContain("create unique index idx_user_ai_keys_user");
    expect(migration).toContain("on public.user_ai_keys using btree (user_id)");
    expect(migration).toContain("user_ai_keys_local_surfaces_check");
    expect(migration).toContain("enabled_surfaces <@ array['agent']::text[]");
  });

  it("serializes replacement and preference changes on the same user lock", () => {
    expect(migration.match(/pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 0\)\)/g))
      .toHaveLength(2);
    expect(migration).toContain("create or replace function public.replace_user_ai_key");
    expect(migration).toContain(
      "create or replace function public.update_user_ai_key_preferences",
    );
  });

  it("uses only the transactional functions for route-level replacement and preferences", () => {
    expect(route).toContain('.rpc("replace_user_ai_key"');
    expect(route).toContain('.rpc("update_user_ai_key_preferences"');
    expect(route).not.toContain('.neq("provider", provider)');
  });
});
