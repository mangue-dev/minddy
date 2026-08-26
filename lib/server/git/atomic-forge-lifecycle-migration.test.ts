import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106330000_atomic_forge_lifecycle.sql"),
);

describe("atomic Forge lifecycle migration", () => {
  it("claims rotating OAuth grants before an external refresh", () => {
    expect(sql).toContain("add column oauth_refresh_claim uuid");
    expect(sql).toContain("create or replace function public.claim_forge_oauth_refresh");
    expect(sql).toContain("oauth_refresh_claim is null");
    expect(sql).toContain("oauth_refresh_claimed_at < v_now - interval '2 minutes'");
    expect(sql).toContain("create or replace function public.claim_forge_relay_refresh_lineage");
    expect(sql).toContain("forge_relay_refresh_lineage_account_key");
  });

  it("leases each issue remote-status stream across workers", () => {
    expect(sql).toContain("create table public.issue_remote_status_push_locks");
    expect(sql).toContain("create or replace function public.claim_issue_remote_status_push");
    expect(sql).toContain("< v_now - interval '2 minutes'");
  });

  it("serializes GitHub installation ownership and GitLab account upserts", () => {
    expect(sql).toContain("hashtextextended('github:' || p_installation_id::text, 456)");
    expect(sql).toContain("'state', 'owned_by_another'");
    expect(sql).toContain("p_user_id::text || ':gitlab:' || p_provider_account_id");
    expect(sql).toContain("for update");
  });

  it("exposes only the lifecycle RPCs to the service role", () => {
    expect(sql).toContain("grant execute on function public.claim_forge_oauth_refresh");
    expect(sql).toContain("grant execute on function public.upsert_github_connection_atomic");
    expect(sql).toContain("grant execute on function public.upsert_gitlab_connection_atomic");
  });
});
