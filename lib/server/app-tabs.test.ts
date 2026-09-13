import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listAppTabs, mutateAppTab } from "./app-tabs";
import { createHomeTab } from "@/lib/app-tabs";

describe("account tab operations", () => {
  it("rejects malformed fields before reaching the database", async () => {
    const rpc = vi.fn(); const client = { rpc } as unknown as SupabaseClient;
    expect(await mutateAppTab(client, "update", { id: "bad", revision: 1, patch: { pinned: true } })).toEqual({ code: "invalid" });
    expect(await mutateAppTab(client, "create", { id: "bad" })).toEqual({ code: "invalid" });
    expect(await mutateAppTab(client, "ensure", { id: "bad" })).toEqual({ code: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("forwards only normalized fields and never accepts a supplied owner", async () => {
    const tab = createHomeTab("owner");
    const rpc = vi.fn(async () => ({ data: { tab }, error: null }));
    await mutateAppTab({ rpc } as unknown as SupabaseClient, "update", { id: tab.id, revision: 1, patch: { href: "/all?issue=i&view=a", user_id: "other" } });
    expect(rpc).toHaveBeenCalledWith("mutate_app_tab", { p_operation: "update", p_id: tab.id, p_revision: 1, p_patch: { href: "/all?view=a" } });
  });
  it("loads every page of an account with more than 1000 tabs", async () => {
    const rows = Array.from({ length: 1201 }, () => createHomeTab("owner")).sort((a, b) => a.id.localeCompare(b.id));
    const from = vi.fn(() => {
      let after = "";
      const query = { select: () => query, order: () => query, limit: () => query,
        gt: (_key: string, cursor: string) => { after = cursor; return query; },
        then: (resolve: (value: unknown) => void) => resolve({ data: rows.filter((row) => row.id > after).slice(0, 500), error: null }) };
      return query;
    });
    expect(await listAppTabs({ from } as unknown as SupabaseClient)).toEqual(rows);
    expect(from).toHaveBeenCalledTimes(3);
  });
});
