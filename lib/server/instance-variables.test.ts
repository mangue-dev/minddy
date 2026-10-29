import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The override layer of the instance variables (MIN-847): the database wins
 * over the file, only behind the file's switch and never on Minddy Cloud; a
 * failed read keeps the file values; an administrator cannot lock themselves
 * out; every change is kept in a history that can be restored.
 */

const store = vi.hoisted(() => new Map<string, string>());
const fail = vi.hoisted(() => ({ read: false }));
const accounts = vi.hoisted(() => ({
  byEmail: new Map<string, { user_id: string; email: string; email_confirmed: boolean }>(),
  roleAdmins: [] as Array<{ user_id: string; email: string; email_confirmed: boolean }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async (keys: string[]) => {
    if (fail.read) throw new Error("database unreachable");
    return Object.fromEntries(keys.map((key) => [key, store.get(key) ?? null]));
  },
  setAppConfigValue: async (key: string, value: string) => void store.set(key, value),
  clearAppConfigValue: async (key: string) => void store.delete(key),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.test`, user_metadata: { display_name: `Name ${id}` } } } }) } },
    rpc: async (name: string, args?: { p_email?: string }) => {
      if (name === "get_role_admin_accounts") return { data: accounts.roleAdmins, error: null };
      const row = accounts.byEmail.get(args?.p_email ?? "");
      return { data: row ? [row] : [], error: null };
    },
  }),
}));

const STATE = Symbol.for("minddy.instanceVariables");
const ACTOR = { id: "admin-1", email: "ops@example.test", appMetadata: {} };

async function load() {
  vi.resetModules();
  delete (globalThis as Record<symbol, unknown>)[STATE];
  return import("./instance-variables");
}

beforeEach(() => {
  store.clear();
  fail.read = false;
  accounts.byEmail.clear();
  accounts.roleAdmins = [];
  vi.stubEnv("MINDDY_EDITION", "self-hosted");
  vi.stubEnv("MINDDY_CONFIG_OVERRIDES", "1");
  vi.stubEnv("OPENROUTER_API_KEY", "file-key");
  vi.stubEnv("ADMIN_EMAILS", "ops@example.test");
  vi.stubEnv("MINDDY_PUBLIC_SITE_NAME", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<symbol, unknown>)[STATE];
});

describe("instance variable overrides", () => {
  it("lets the database value win over the file, and the file come back on removal", async () => {
    const layer = await load();
    await layer.hydrateInstanceVariables();
    expect(await layer.setInstanceVariable("OPENROUTER_API_KEY", "db-key-aaaaaaaa6789", ACTOR)).toMatchObject({ ok: true });
    expect(process.env.OPENROUTER_API_KEY).toBe("db-key-aaaaaaaa6789");
    expect(await layer.clearInstanceVariable("OPENROUTER_API_KEY", ACTOR)).toMatchObject({ ok: true });
    expect(process.env.OPENROUTER_API_KEY).toBe("file-key");
  });

  it("ignores stored overrides when the file does not turn the layer on", async () => {
    store.set("instance_variable:OPENROUTER_API_KEY", "db-key");
    vi.stubEnv("MINDDY_CONFIG_OVERRIDES", "0");
    const layer = await load();
    await layer.hydrateInstanceVariables();
    expect(process.env.OPENROUTER_API_KEY).toBe("file-key");
    expect(await layer.setInstanceVariable("OPENROUTER_API_KEY", "x-aaaaaaaa", ACTOR)).toMatchObject({ ok: false, reason: "disabled" });
  });

  it("never exists on Minddy Cloud, whatever the file says", async () => {
    vi.stubEnv("MINDDY_EDITION", "cloud");
    store.set("instance_variable:OPENROUTER_API_KEY", "db-key");
    const layer = await load();
    expect(layer.instanceOverridesStatus()).toBe("cloud");
    await layer.hydrateInstanceVariables();
    expect(process.env.OPENROUTER_API_KEY).toBe("file-key");
  });

  it("keeps the file values when the database cannot be read", async () => {
    const layer = await load();
    fail.read = true;
    await expect(layer.hydrateInstanceVariables()).resolves.toBeUndefined();
    expect(process.env.OPENROUTER_API_KEY).toBe("file-key");
  });

  it("never reads a key outside the allowlist, even from a hand-written row", async () => {
    store.set("instance_variable:SUPABASE_SERVICE_ROLE_KEY", "attacker");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "real");
    const layer = await load();
    await layer.hydrateInstanceVariables();
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("real");
    expect(await layer.setInstanceVariable("SUPABASE_SERVICE_ROLE_KEY", "attacker", ACTOR)).toMatchObject({ ok: false, reason: "not_overridable" });
  });

  it("refuses an administrator list that would lock out its author", async () => {
    const layer = await load();
    expect(await layer.setInstanceVariable("ADMIN_EMAILS", "other@example.test", ACTOR)).toMatchObject({ ok: false, reason: "cannot_remove_self" });
    const kept = await layer.setInstanceVariable("ADMIN_EMAILS", "ops@example.test, lead@example.test", ACTOR);
    expect(kept).toMatchObject({ ok: true, previousAdminEmails: "ops@example.test" });
    // The admin role keeps access without the list.
    const role = { ...ACTOR, appMetadata: { role: "admin" } };
    expect(await layer.setInstanceVariable("ADMIN_EMAILS", "lead@example.test", role)).toMatchObject({ ok: true });
  });

  it("lists sources and hides secrets, history included", async () => {
    const layer = await load();
    await layer.setInstanceVariable("OPENROUTER_API_KEY", "db-key-aaaaaaaa6789", ACTOR);
    await layer.setInstanceVariable("MINDDY_PUBLIC_SITE_NAME", "Acme tickets", ACTOR);
    const views = await layer.listInstanceVariables();
    const key = views.find((view) => view.key === "OPENROUTER_API_KEY")!;
    expect(key).toMatchObject({ source: "both", value: "••••6789", fileValue: "••••" });
    expect(JSON.stringify(key)).not.toContain("db-key");
    expect(key.history[0]).toMatchObject({ action: "set", actorName: "Name admin-1", value: "••••6789" });
    expect(views.find((view) => view.key === "MINDDY_PUBLIC_SITE_NAME")).toMatchObject({ source: "database", value: "Acme tickets" });
    expect(views.find((view) => view.key === "RESEND_API_KEY")).toMatchObject({ source: "unset", value: null });
  });

  it("records nothing when the saved value is the one already stored", async () => {
    const layer = await load();
    expect(await layer.setInstanceVariable("MINDDY_PUBLIC_SITE_NAME", "Acme", ACTOR)).not.toHaveProperty("unchanged");
    expect(await layer.setInstanceVariable("MINDDY_PUBLIC_SITE_NAME", " Acme ", ACTOR)).toMatchObject({ ok: true, unchanged: true });
    // Removing an override that does not exist changes nothing either.
    expect(await layer.clearInstanceVariable("RESEND_API_KEY", ACTOR)).toMatchObject({ ok: true, unchanged: true });
    const views = await layer.listInstanceVariables();
    expect(views.find((view) => view.key === "MINDDY_PUBLIC_SITE_NAME")!.history).toHaveLength(1);
    expect(views.find((view) => view.key === "RESEND_API_KEY")!.history).toHaveLength(0);
  });

  it("tells the listed administrators, the role administrators and the actor", async () => {
    accounts.byEmail.set("ops@example.test", { user_id: "admin-1", email: "ops@example.test", email_confirmed: true });
    accounts.byEmail.set("gone@example.test", { user_id: "admin-2", email: "gone@example.test", email_confirmed: true });
    accounts.roleAdmins = [
      { user_id: "root-1", email: "root@example.test", email_confirmed: true },
      { user_id: "root-2", email: "pending@example.test", email_confirmed: false },
    ];
    const layer = await load();
    const recipients = await layer.instanceAdminRecipients("admin-1", "ops@example.test,gone@example.test");
    expect(recipients.map((recipient) => recipient.id).sort()).toEqual(["admin-1", "admin-2", "root-1"]);
  });

  it("restores an earlier version from the history", async () => {
    const layer = await load();
    await layer.setInstanceVariable("MINDDY_PUBLIC_SITE_NAME", "First", ACTOR);
    await layer.setInstanceVariable("MINDDY_PUBLIC_SITE_NAME", "Second", ACTOR);
    expect(await layer.rollbackInstanceVariable("MINDDY_PUBLIC_SITE_NAME", 1, ACTOR)).toMatchObject({ ok: true });
    expect(process.env.MINDDY_PUBLIC_SITE_NAME).toBe("First");
    const history = (await layer.listInstanceVariables()).find((view) => view.key === "MINDDY_PUBLIC_SITE_NAME")!.history;
    expect(history.map((entry) => [entry.action, entry.value])).toEqual([["rollback", "First"], ["set", "Second"], ["set", "First"]]);
    expect(await layer.rollbackInstanceVariable("MINDDY_PUBLIC_SITE_NAME", 9, ACTOR)).toMatchObject({ ok: false, reason: "no_such_version" });
  });
});
