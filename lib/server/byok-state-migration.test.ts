import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20270106990000_multi_provider_byok.sql",
  ),
  "utf8",
);
const route = readFileSync(
  join(process.cwd(), "app/api/account/ai-keys/route.ts"),
  "utf8",
);

describe("multi-provider BYOK persistence boundary", () => {
  it("allows one credential per provider and one assignment per capability", () => {
    expect(migration).toContain(
      "create unique index if not exists idx_user_ai_keys_user_provider",
    );
    expect(migration).toContain(
      "on public.user_ai_keys using btree (user_id, provider)",
    );
    expect(migration).toContain("primary key (user_id, capability)");
    expect(migration).toContain("foreign key (ai_key_id, user_id)");
  });

  it("serializes credential and assignment changes on the same user lock", () => {
    expect(
      migration.match(
        /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 0\)\)/g,
      ),
    ).toHaveLength(4);
    expect(migration).toContain(
      "create or replace function public.upsert_user_ai_key",
    );
    expect(migration).toContain(
      "create or replace function public.delete_user_ai_key",
    );
    expect(migration).toContain(
      "create or replace function public.set_user_ai_capability_assignment",
    );
    expect(migration).toContain(
      "create or replace function public.update_user_ai_key_preferences",
    );
  });

  it("claims unassigned capabilities only when inserting a new credential", () => {
    const updateBranch = migration.indexOf("if found then");
    const updateReturn = migration.indexOf("return;", updateBranch);
    const assignmentInsert = migration.indexOf(
      "insert into public.user_ai_capability_assignments",
      updateBranch,
    );
    expect(updateBranch).toBeGreaterThan(-1);
    expect(updateReturn).toBeGreaterThan(updateBranch);
    expect(assignmentInsert).toBeGreaterThan(updateReturn);
  });

  it("uses only transactional functions for route-level mutations", () => {
    expect(route).toContain('.rpc("upsert_user_ai_key"');
    expect(route).toContain('.rpc("delete_user_ai_key"');
    expect(route).toContain('.rpc("set_user_ai_capability_assignment"');
    expect(route).toContain('.rpc("update_user_ai_key_preferences"');
    expect(route).not.toContain('.delete().eq("user_id"');
  });
});
