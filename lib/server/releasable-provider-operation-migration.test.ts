import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106380000_releasable_provider_operation_leases.sql"),
);

describe("releasable provider-operation migration", () => {
  it("updates only the latest active matching lease under the resource lock", () => {
    expect(sql).toContain("p_provider || ':' || p_resource_key, 466");
    expect(sql).toContain("and operation = p_operation");
    expect(sql).toContain("and lease_expires_at > pg_catalog.clock_timestamp()");
    expect(sql).toContain("set lease_expires_at = pg_catalog.clock_timestamp()");
  });

  it("exposes only the release function to the service role", () => {
    expect(sql).toContain(
      "revoke all on function public.release_provider_operation(uuid, text, text, text) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.release_provider_operation(uuid, text, text, text) to service_role",
    );
  });
});
