import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedStore } from "./encryption/store";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  store: null as EncryptedStore | null,
  tables: {} as Record<string, Row[]>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => state.store,
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => client() }));

const { encodePage } = await import("./page-content");
const { encodePullRequestContent } = await import("./agent/pull-request-content");
const { emptyTrash, listTrash } = await import("./trash");
const { readAppTabMetadata } = await import("./app-tab-metadata");
const { pageBacklinks } = await import("./page-backlinks");

const project = "10000000-0000-4000-8000-000000000001";
const page = "20000000-0000-4000-8000-000000000001";
const objective = "30000000-0000-4000-8000-000000000001";
const issue = "40000000-0000-4000-8000-000000000001";
const pr = "50000000-0000-4000-8000-000000000001";
const actor = "60000000-0000-4000-8000-000000000001";
const deleted = "2026-09-01T00:00:00Z";

function client(): SupabaseClient {
  return { from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let columns = "*";
    let maximum = Infinity;
    let deleting = false;
    const query = {
      select(value: string) { columns = value; return query; },
      delete() { deleting = true; return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
      is(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      not(key: string, _operator: string, value: unknown) {
        filters.push((row) => row[key] !== value); return query;
      },
      or(expression: string) {
        const clauses = expression.split(",").map((clause) => clause.split("."));
        filters.push((row) => clauses.some(([key, , value]) => row[key] === value));
        return query;
      },
      order() { return query; },
      limit(value: number) { maximum = value; return query; },
      async maybeSingle() {
        const row = (state.tables[table] ?? []).find((candidate) =>
          filters.every((filter) => filter(candidate)));
        return { data: row ? columns === "*" ? row :
          Object.fromEntries(columns.split(",").map((key) =>
            [key.trim(), row[key.trim()]])) : null, error: null };
      },
      then(resolve: (value: unknown) => unknown) {
        const matches = (state.tables[table] ?? []).filter((row) =>
          filters.every((filter) => filter(row))).slice(0, maximum);
        if (deleting) {
          state.tables[table] = (state.tables[table] ?? []).filter((row) =>
            !matches.includes(row));
        }
        const data = matches.map((row) =>
          columns === "*" ? row : Object.fromEntries(columns.split(",").map((key) =>
            [key.trim(), row[key.trim()]])));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  } } as unknown as SupabaseClient;
}

async function fixture() {
  const codec = new EncryptedRowCodec(state.store!);
  const issueRow = await codec.encode({ id: issue, project_id: project,
    number: 42, title: "Protected issue", description: null, plan: null,
    remote_url: null, automation_override: null, deleted_at: deleted,
    deleted_by: null, encrypted_content: null, encryption_version: 0 } as StoredRow,
  { table: "issues", scope: { kind: "project", id: project } });
  const objectiveRow = await codec.encode({ id: objective, project_id: project,
    name: "Protected objective", description: null, color: "amber",
    deleted_at: deleted, deleted_by: null, encrypted_content: null,
    encryption_version: 0 } as StoredRow,
  { table: "objectives", scope: { kind: "project", id: project } });
  const pageRow = await encodePage({ id: page, project_id: project,
    title: "Protected page", icon: null, content: { type: "doc", content: [] },
    database_schema: null, database_title_name: null, property_values: {},
    deleted_at: deleted, deleted_by: null, deleted_root_id: null }, { force: true });
  state.tables = {
    projects: [{ id: project, owner_id: actor, name: "Project", key: "MIN",
      deleted_at: null, color: null, icon_url: null, orb_seed: null }],
    issues: [issueRow], objectives: [objectiveRow], pages: [pageRow],
    pull_requests: [{ id: pr, number: 7,
      title: await encodePullRequestContent(pr, "title", "Protected pull request") }],
    page_links: [{ page_id: page, source_kind: "issue", source_id: issue,
      created_at: deleted }, { page_id: page, source_kind: "objective",
      source_id: objective, created_at: deleted }],
    attachments: [],
  };
  return { issueRow, objectiveRow, pageRow };
}

beforeEach(() => {
  const key = randomBytes(32);
  state.store = new EncryptedStore({
    current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
  });
  state.tables = {};
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("protected incidental readers", () => {
  it("lists protected trash roots and restores issue and objective labels", async () => {
    const { pageRow } = await fixture();
    expect(pageRow.title).toBeNull();
    const items = await listTrash(actor, client());
    expect(items.map((item) => [item.type, item.title]).sort()).toEqual([
      ["issue", "Protected issue"], ["objective", "Protected objective"],
      ["page", "Protected page"],
    ].sort());
  });

  it("distinguishes protected databases, drafts and deleted subtrees", async () => {
    await fixture();
    state.tables.issues = [];
    state.tables.objectives = [];
    state.tables.pages = [];
    async function add(id: string, title: string, content: Row,
      databaseSchema: Row[] | null, deletedRootId: string | null = null) {
      const row = await encodePage({ id, project_id: project, title, icon: null,
        content, database_schema: databaseSchema, database_title_name: null,
        property_values: {}, deleted_at: deleted, deleted_by: null,
        deleted_root_id: deletedRootId }, { force: true });
      state.tables.pages.push(row);
    }
    const blank = { type: "doc", content: [{ type: "paragraph" }] };
    await add("database", "", blank, []);
    await add("draft", "", blank, null);
    await add("untitled", "", { type: "doc", content: [{ type: "paragraph",
      content: [{ type: "text", text: "Protected body" }] }] }, null);
    await add("parent", "", blank, null);
    await add("child", "Protected child", blank, null, "parent");
    const items = await listTrash(actor, client());
    expect(items.filter((item) => item.type === "page").map((item) =>
      [item.id, item.is_database, item.title]).sort()).toEqual([
      ["database", true, ""], ["untitled", false, ""],
      ["parent", false, ""],
    ].sort());
    expect(items.some((item) => item.id === "draft" || item.id === "child")).toBe(false);
  });

  it("empties visible protected roots and their descendants without purging a hidden draft", async () => {
    await fixture();
    state.tables.issues = [];
    state.tables.objectives = [];
    const blank = { type: "doc", content: [{ type: "paragraph" }] };
    async function add(id: string, title: string, databaseSchema: Row[] | null,
      deletedRootId: string | null = null) {
      state.tables.pages.push(await encodePage({ id, project_id: project,
        title, icon: null, content: blank, database_schema: databaseSchema,
        database_title_name: null, property_values: {}, deleted_at: deleted,
        deleted_by: null, deleted_root_id: deletedRootId }, { force: true }));
    }
    await add("database", "", []);
    await add("draft", "", null);
    await add("parent", "", null);
    await add("child", "Protected child", null, "parent");
    expect(await emptyTrash(actor, client())).toEqual({ purged: 3 });
    expect(state.tables.pages.map((row) => row.id)).toEqual(["draft"]);
  });

  it("resolves protected tab and backlink labels without returning ciphertext", async () => {
    await fixture();
    state.tables.issues[0].deleted_at = null;
    state.tables.objectives[0].deleted_at = null;
    const tabs = await readAppTabMetadata(client(), [
      `/projects/${project}/pages/${page}`,
      `/projects/${project}?objective=${objective}`,
      `/projects/${project}?family=${issue}`,
      `/pull-requests?pr=${pr}`,
    ]);
    expect(tabs.pages[0].title).toBe("Protected page");
    expect(tabs.objectives[0].name).toBe("Protected objective");
    expect(tabs.issues[0].title).toBe("Protected issue");
    expect(tabs.pullRequests[0].title).toBe("Protected pull request");
    const links = await pageBacklinks(client() as never, { pageId: page, projectKey: "MIN" });
    expect(links.map((link) => link.title)).toEqual(["Protected issue", "Protected objective"]);
    expect(JSON.stringify({ tabs, links })).not.toContain("encrypted_content");
  });
});
