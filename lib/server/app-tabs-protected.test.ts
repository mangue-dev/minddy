import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHomeTab } from "@/lib/app-tabs";

vi.mock("./app-tabs-content", () => ({
  shouldProtectAppTabs: async () => true,
  encodeAppTabValue: async (_owner: string, _id: string, field: string, value: string) =>
    `sealed:${field}:${value}`,
  decodeAppTab: async (owner: string, tab: ReturnType<typeof createHomeTab>) => {
    if (tab.user_id !== owner) throw new Error("Application tab owner changed");
    return { ...tab, href: tab.href.replace(/^sealed:href:/, ""),
      custom_name: tab.custom_name?.replace(/^sealed:custom_name:/, "") ?? null };
  },
}));

const { mutateAppTab, moveAppTab, listAppTabs } = await import("./app-tabs");

describe("protected application tab RPC boundaries", () => {
  it("seals creates and updates while returning decoded results", async () => {
    const user = randomUUID();
    const id = randomUUID();
    const tab = { ...createHomeTab(user, id), href: "sealed:href:/home" };
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: { tab: { ...tab, ...(args.p_patch as object) } }, error: null,
    }));
    const client = { rpc } as unknown as SupabaseClient;
    expect((await mutateAppTab(client, "create", { id }, user)).tab?.href).toBe("/home");
    expect(rpc).toHaveBeenCalledWith("mutate_app_tab", {
      p_operation: "create", p_id: id, p_revision: null,
      p_patch: { href: "sealed:href:/home" },
    });
    const result = await mutateAppTab(client, "update", { id, revision: 1,
      patch: { href: "/all", custom_name: "Secret queue" } }, user);
    expect(result.tab).toMatchObject({ href: "/all", custom_name: "Secret queue" });
    expect(rpc).toHaveBeenLastCalledWith("mutate_app_tab", {
      p_operation: "update", p_id: id, p_revision: 1,
      p_patch: { href: "sealed:href:/all",
        custom_name: "sealed:custom_name:Secret queue" },
    });
  });

  it("decodes move conflicts, projections, and list pages for the owner", async () => {
    const user = randomUUID();
    const tab = { ...createHomeTab(user), href: "sealed:href:/home",
      custom_name: "sealed:custom_name:Private" };
    const rpc = vi.fn(async () => ({ data: { tab, tabs: [tab] }, error: null }));
    expect(await moveAppTab({ rpc } as unknown as SupabaseClient,
      { id: tab.id, revision: 1, beforeId: null }, user))
      .toMatchObject({ tab: { href: "/home" }, tabs: [{ custom_name: "Private" }] });
    const query = { select: () => query, order: () => query, limit: () => query,
      then: (resolve: (value: unknown) => void) => resolve({ data: [tab], error: null }) };
    const client = { from: () => query } as unknown as SupabaseClient;
    expect(await listAppTabs(client, user)).toMatchObject([{ href: "/home",
      custom_name: "Private" }]);
    await expect(listAppTabs(client, randomUUID())).rejects.toThrow();
  });
});
