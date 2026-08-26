import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106390000_atomic_forge_relay_ownership.sql"),
);

describe("atomic Forge relay ownership migration", () => {
  it("uses the Cloud provisioning lock before checking either ownership table", () => {
    const lock = sql.indexOf("'github:' || p_installation_id::text, 456");
    const cloud = sql.indexOf("from public.git_connections", lock);
    const relay = sql.indexOf("from public.forge_relay_installations", cloud);
    const insert = sql.indexOf("insert into public.forge_relay_installations", relay);
    expect(lock).toBeGreaterThan(0);
    expect(cloud).toBeGreaterThan(lock);
    expect(relay).toBeGreaterThan(cloud);
    expect(insert).toBeGreaterThan(relay);
  });

  it("completes the claim in the ownership transaction", () => {
    expect(sql).toContain("and status = 'verifying' for update");
    expect(sql).toContain("update public.forge_relay_claims set status = 'claimed'");
  });

  it("enforces the inverse ownership check for every Cloud and relay table write", () => {
    expect(sql).toContain("enforce_github_installation_single_owner");
    expect(sql).toContain("github_installation_relay_owned");
    expect(sql).toContain("github_installation_cloud_owned");
    expect(sql).toContain("git_connections_single_installation_owner");
    expect(sql).toContain("forge_relay_single_installation_owner");
  });
});
