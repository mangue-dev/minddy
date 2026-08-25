import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106310000_bound_provider_operations.sql"),
);

describe("bounded provider-operation migration", () => {
  it("indexes keyed GitLab hook-token digests for pre-parse authentication", () => {
    expect(sql).toContain("add column webhook_secret_digest text");
    expect(sql).toContain(
      "create index idx_forge_relay_link_mirror_gitlab_secret_digest",
    );
  });

  it("serializes quota counting and resource deduplication before insertion", () => {
    const quotaLock = sql.indexOf(
      "hashtextextended(p_actor_id::text || ':' || p_provider, 465)",
    );
    const resourceLock = sql.indexOf(
      "p_provider || ':' || p_resource_key",
    );
    const count = sql.indexOf("select count(*), min(created_at)", resourceLock);
    const insert = sql.indexOf("insert into public.provider_operation_reservations", count);

    expect(quotaLock).toBeGreaterThan(0);
    expect(resourceLock).toBeGreaterThan(quotaLock);
    expect(count).toBeGreaterThan(resourceLock);
    expect(insert).toBeGreaterThan(count);
    expect(sql).toContain("'state', 'deduplicated'");
    expect(sql).toContain("'state', 'quota_exceeded'");
  });

  it("exposes only the atomic reservation function to the service role", () => {
    expect(sql).toContain(
      "revoke all on table public.provider_operation_reservations from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.reserve_provider_operation( uuid, text, text, text, integer, integer, integer ) to service_role",
    );
  });
});
