import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Numo can change every setting of the app (MIN-955).
 *
 * New settings kept shipping without a Numo tool: nothing failed, and the
 * user only found out when Numo answered that it could not do it. This suite
 * reads the settings screens and the update cores, and fails when a setting
 * is missing from `settings-coverage.ts` or when the tool it names cannot
 * actually change it.
 */

type Meta = Record<string, unknown>;

const h = vi.hoisted(() => ({
  meta: {} as Record<string, unknown>,
  hidden: [] as string[],
  readable: new Set<string>(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: "user-1", email: "camille@example.test", user_metadata: h.meta } },
          error: null,
        }),
        // GoTrue replaces the metadata with what it is given.
        updateUserById: async (_id: string, patch: { user_metadata: Meta }) => {
          h.meta = { ...patch.user_metadata };
          return { error: null };
        },
      },
    },
  }),
}));

vi.mock("@/lib/server/hidden-projects", () => ({
  HiddenProjectsError: class HiddenProjectsError extends Error {},
  listHiddenProjectIds: async () => [...h.hidden],
  setProjectHidden: async (_db: unknown, _userId: string, projectId: string, hidden: boolean) => {
    if (hidden && !h.readable.has(projectId)) return "not_found";
    h.hidden = hidden
      ? [...new Set([...h.hidden, projectId])]
      : h.hidden.filter((id) => id !== projectId);
    return "ok";
  },
}));

import { getAccountSettings, updateAccountSettings } from "@/lib/server/account-settings";
import { MCP_CLIENT_TOOLS, MCP_SETUP_TOOLS } from "@/lib/mcp-client-tools";
import { THEME_PRESET_META_KEYS } from "@/lib/theme-presets";
import { ASSISTANT_TOOLS, CONVERSATION_ASSISTANT_TOOLS } from "./tools";
import {
  ACCOUNT_METADATA_COVERAGE,
  ACCOUNT_TAB_COVERAGE,
  PROJECT_FIELD_COVERAGE,
  PROJECT_TAB_COVERAGE,
  isHumanOnly,
  type NumoAccountSetting,
} from "./settings-coverage";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** Every `user_metadata` key the app defines or writes, with one file that names it. */
function accountMetadataKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const add = (key: string, file: string) => {
    if (!keys.has(key)) keys.set(key, file);
  };
  for (const file of [...sourceFiles("lib"), ...sourceFiles("components"), ...sourceFiles("app")]) {
    const text = read(file);
    for (const m of text.matchAll(/const\s+[A-Z0-9_]+_META_KEY\s*=\s*"([a-z0-9_]+)"/g)) add(m[1], file);
    // A preference read and written under a literal key.
    for (const m of text.matchAll(/useAccountPreference(?:<[^>]*>)?\(\s*"([a-z0-9_]+)"/g)) add(m[1], file);
    for (const m of text.matchAll(/updateUserMetadata\(\{\s*([a-z0-9_]+)\s*:/g)) add(m[1], file);
  }
  for (const key of Object.values(THEME_PRESET_META_KEYS)) add(key, "lib/theme-presets.ts");
  // Keys the account core writes under their own name.
  const core = "lib/server/account-settings.ts";
  for (const m of read(core).matchAll(/\bnext\.([a-z0-9_]+)\s*=/g)) add(m[1], core);
  return keys;
}

const tool = (name: string) => ASSISTANT_TOOLS.find((t) => t.function.name === name);
const accountProperties = tool("update_account_settings")!.function.parameters.properties as Record<
  string,
  { type?: string | string[]; enum?: unknown[] }
>;

/** Whether the tool's JSON schema accepts this value for the field. */
function schemaAccepts(schema: { type?: string | string[]; enum?: unknown[] }, value: unknown): boolean {
  if (schema.enum) return schema.enum.includes(value);
  const types = [schema.type ?? []].flat();
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  return types.includes(kind);
}

function readPath(settings: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], settings);
}

const numoAccountSettings = Object.entries(ACCOUNT_METADATA_COVERAGE).filter(
  (entry): entry is [string, NumoAccountSetting] => !isHumanOnly(entry[1]),
);

beforeEach(() => {
  h.meta = {};
  h.hidden = [];
  h.readable = new Set();
});

describe("account settings Numo can change (MIN-955)", () => {
  it("lists every account preference key the app writes", () => {
    const keys = accountMetadataKeys();
    const missing = [...keys].filter(([key]) => !(key in ACCOUNT_METADATA_COVERAGE));
    expect(
      missing.map(([key, file]) => `${key} (${file})`),
      "New account preference: add a field to update_account_settings and list it in settings-coverage.ts",
    ).toEqual([]);
    const stale = Object.keys(ACCOUNT_METADATA_COVERAGE).filter((key) => !keys.has(key));
    expect(stale, "settings-coverage.ts lists a key the app no longer has").toEqual([]);
  });

  it.each(numoAccountSettings)("update_account_settings accepts %s", (key, { sample }) => {
    expect(accountProperties, `update_account_settings has no ${key} field`).toHaveProperty(key);
    expect(schemaAccepts(accountProperties[key], sample), `the ${key} schema refuses ${JSON.stringify(sample)}`).toBe(true);
  });

  it.each(numoAccountSettings)("writes %s and reads it back", async (key, { read: path, sample, readBack }) => {
    const before = await getAccountSettings({ userId: "user-1" });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(readPath(before.settings, path), `get_account_settings returns no ${path}`).not.toBeUndefined();

    const result = await updateAccountSettings({ userId: "user-1", input: { [key]: sample } });
    expect(result, `updateAccountSettings refused ${key}`).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(h.meta[key]).toEqual(sample);
    const value = readPath(result.settings, path);
    expect(value).toEqual(readBack ?? sample);
    expect(value, `${key}: the sample is the default, so the round trip proves nothing`).not.toEqual(
      readPath(before.settings, path),
    );
  });

  it("documents why a human-only key stays out of Numo's reach", () => {
    for (const [key, coverage] of Object.entries(ACCOUNT_METADATA_COVERAGE)) {
      if (isHumanOnly(coverage)) {
        expect(coverage.humanOnly.length, key).toBeGreaterThan(10);
        expect(accountProperties, `${key} is human-only but update_account_settings offers it`).not.toHaveProperty(key);
      }
    }
  });

  it("hides and shows projects for the user", async () => {
    h.readable = new Set(["project-a", "project-b"]);
    const db = {} as never;
    const hidden = await updateAccountSettings({
      userId: "user-1",
      input: { hide_project_ids: ["project-a", "project-b"] },
      supabase: db,
    });
    expect(hidden).toMatchObject({ ok: true, settings: { hidden_project_ids: ["project-a", "project-b"] } });
    // No metadata write for a visibility change alone.
    expect(h.meta).toEqual({});

    const shown = await updateAccountSettings({
      userId: "user-1",
      input: { show_project_ids: ["project-a"] },
      supabase: db,
    });
    expect(shown).toMatchObject({ ok: true, settings: { hidden_project_ids: ["project-b"] } });

    const unknown = await updateAccountSettings({
      userId: "user-1",
      input: { hide_project_ids: ["elsewhere"] },
      supabase: db,
    });
    expect(unknown).toEqual({ ok: false, error: "Project not found: elsewhere." });
    const both = await updateAccountSettings({
      userId: "user-1",
      input: { hide_project_ids: ["project-a"], show_project_ids: ["project-a"] },
      supabase: db,
    });
    expect(both.ok).toBe(false);
    // Without the request's client the visibility cannot be reached.
    expect((await updateAccountSettings({ userId: "user-1", input: { hide_project_ids: ["project-a"] } })).ok).toBe(false);
    expect(accountProperties).toHaveProperty("hide_project_ids");
    expect(accountProperties).toHaveProperty("show_project_ids");
  });

  it("refuses an unknown coding agent and a malformed vocabulary", async () => {
    for (const input of [
      { prompt_send_agent: "vim" },
      { prompt_send_to_agent: "yes" },
      { dictation_vocabulary: "minddy" },
      { smart_fill_objectives: "off" },
    ]) {
      expect((await updateAccountSettings({ userId: "user-1", input })).ok, JSON.stringify(input)).toBe(false);
    }
    // null clears the chosen app: prompts open in the first connected one.
    h.meta = { prompt_send_agent: "cursor" };
    const cleared = await updateAccountSettings({ userId: "user-1", input: { prompt_send_agent: null } });
    expect(cleared).toMatchObject({ ok: true, settings: { prompt_send_agent: null } });
    expect(h.meta).not.toHaveProperty("prompt_send_agent");
  });

  it("normalizes the dictation vocabulary as the settings screen does", async () => {
    const result = await updateAccountSettings({
      userId: "user-1",
      input: { dictation_vocabulary: [{ term: "  minddy " }, { term: "minddy" }, { term: "" }, { heardAs: "x" }] },
    });
    expect(result).toMatchObject({ ok: true, settings: { dictation_vocabulary: [{ term: "minddy" }] } });
  });
});

/** The `value: "…"` of each tab in a settings page. */
function tabValues(path: string): string[] {
  return [...read(path).matchAll(/^\s*value: "([a-z-]+)",$/gm)].map((m) => m[1]);
}

const toolNames = new Set(
  [...ASSISTANT_TOOLS, ...MCP_CLIENT_TOOLS, ...MCP_SETUP_TOOLS].map((t) => t.function.name),
);

describe("settings tabs Numo can reach (MIN-955)", () => {
  it.each([
    ["account", "components/settings/account-settings-page.tsx", ACCOUNT_TAB_COVERAGE],
    ["project", "components/settings/project-settings-page.tsx", PROJECT_TAB_COVERAGE],
  ] as const)("covers every %s settings tab", (_scope, page, coverage) => {
    const tabs = tabValues(page);
    expect(tabs.length).toBeGreaterThan(5);
    expect(tabs.toSorted(), "New settings tab: list it in settings-coverage.ts").toEqual(
      Object.keys(coverage).toSorted(),
    );
    for (const [tab, { tools, humanOnly }] of Object.entries(coverage)) {
      expect(tools.length > 0 || !!humanOnly, `${tab} names neither a tool nor a reason`).toBe(true);
      for (const name of tools) expect(toolNames.has(name), `${tab}: no Numo tool ${name}`).toBe(true);
    }
  });

  it("offers the account and member tools in a conversation", () => {
    const conversation = new Set(CONVERSATION_ASSISTANT_TOOLS.map((t) => t.function.name));
    for (const name of ["get_account_settings", "update_account_settings", "update_project", "update_member_role"]) {
      expect(conversation.has(name), name).toBe(true);
    }
  });
});

describe("project settings Numo can change (MIN-955)", () => {
  const core = "lib/server/update-project.ts";
  const projectProperties = tool("update_project")!.function.parameters.properties as Record<string, unknown>;

  it("lists every field the project settings core accepts", () => {
    const text = read(core);
    const fields = new Set([
      ...[...text.matchAll(/\binput\.([a-z0-9_]+)/g)].map((m) => m[1]),
      ...[...text.matchAll(/"([a-z0-9_]+)" in input/g)].map((m) => m[1]),
    ]);
    expect(
      [...fields].filter((field) => !(field in PROJECT_FIELD_COVERAGE)),
      `New project setting in ${relative(ROOT, join(ROOT, core))}: add it to update_project and settings-coverage.ts`,
    ).toEqual([]);
    expect(Object.keys(PROJECT_FIELD_COVERAGE).filter((field) => !fields.has(field))).toEqual([]);
  });

  it.each(Object.entries(PROJECT_FIELD_COVERAGE))("update_project and %s", (field, coverage) => {
    if (isHumanOnly(coverage)) expect(projectProperties).not.toHaveProperty(field);
    else expect(projectProperties, `update_project has no ${field} field`).toHaveProperty(field);
  });

  it("lets the owner set a member's role at the invitation and afterwards", () => {
    const invite = tool("invite_member")!.function.parameters.properties as Record<string, { enum?: unknown[] }>;
    expect(invite.role?.enum).toEqual(["member", "reader"]);
    expect(invite).toHaveProperty("can_comment");
    const role = tool("update_member_role")!.function.parameters;
    expect(role.required).toEqual(["role"]);
    expect(Object.keys(role.properties).toSorted()).toEqual(["can_comment", "invitation_id", "role", "user_id"]);
  });
});
