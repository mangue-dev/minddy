import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106400000_ordered_forge_relay_snapshots.sql"),
);

describe("ordered Forge relay snapshots migration", () => {
  it("locks the instance generation and rejects stale snapshots before mutation", () => {
    const sync = sql.indexOf("create or replace function public.apply_forge_relay_link_sync");
    const lock = sql.indexOf("last_link_snapshot_generation", sync);
    const stale = sql.indexOf("if p_generation <= v_previous", lock);
    const deletion = sql.indexOf("delete from public.forge_relay_link_mirror", stale);
    expect(lock).toBeGreaterThan(0);
    expect(stale).toBeGreaterThan(lock);
    expect(deletion).toBeGreaterThan(stale);
  });

  it("applies incremental events and snapshots inside the same ordered function", () => {
    expect(sql).toContain("p_events jsonb, p_snapshot jsonb");
    expect(sql).toContain("if p_snapshot is not null then");
    expect(sql).toContain("event.event = 'unlinked'");
    expect(sql).toContain("event.event = 'linked'");
  });
});
