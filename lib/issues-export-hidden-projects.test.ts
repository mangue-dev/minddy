import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-751: “all my projects” leaves out the projects I hid; a project chosen
 * by its id is exported as before, hidden or not.
 */
const state = vi.hoisted(() => ({
  hidden: [] as string[],
  issueFilters: [] as Array<[string, unknown]>,
}));

const projects = [
  { id: "visible", key: "VIS", name: "Visible", owner_id: "user" },
  { id: "hidden", key: "HID", name: "Hidden", owner_id: "user" },
];
const issueRow = (id: string, project_id: string, number: number, title: string) => ({
  id, project_id, number, title, description: "", status: "todo", priority: "none", effort: null,
  assignee_id: null, objective_id: null, parent_id: null, due_date: null,
  created_at: "2026-10-01T00:00:00Z", completed_at: null, issue_categories: [],
});
const issues = [issueRow("i1", "visible", 1, "Shown"), issueRow("i2", "hidden", 2, "Secret")];

function rows(table: string, filters: Array<[string, unknown]>) {
  const all = table === "issues" ? issues : table === "projects" ? projects : [];
  return all.filter((row) => filters.every(([key, value]) =>
    Array.isArray(value) ? value.includes((row as Record<string, unknown>)[key]) : (row as Record<string, unknown>)[key] === value));
}

function query(table: string) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select() { return builder; },
    is() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    eq(key: string, value: unknown) { filters.push([key, value]); return builder; },
    in(key: string, value: unknown[]) {
      if (key === "status") return builder;
      filters.push([key, value]);
      return builder;
    },
    then(resolve: (result: unknown) => unknown) {
      if (table === "issues") state.issueFilters = [...filters];
      return Promise.resolve({ data: rows(table, filters), error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "user" }, supabase: { from: query } }),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/project-members", () => ({ buildMembersByProject: async () => ({ members: {} }) }));
vi.mock("@/lib/server/project-content", () => ({ decodeProjectName: async (row: { name: string }) => row.name }));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: () => query("issues") }));
vi.mock("@/lib/server/category-store", () => ({ categoryStore: () => query("categories") }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => query("objectives") }));
vi.mock("@/lib/server/hidden-projects", () => ({ listHiddenProjectIds: async () => state.hidden }));

const { GET } = await import("@/app/api/me/issues/export/route");

async function exportCsv(project?: string) {
  const url = new URL("http://localhost/api/me/issues/export");
  if (project) url.searchParams.set("project", project);
  const response = await GET({ nextUrl: url } as never);
  expect(response.status).toBe(200);
  return response.text();
}

beforeEach(() => { state.hidden = []; });

describe("issues CSV export and hidden projects (MIN-751)", () => {
  it("leaves hidden projects out of “all my projects”", async () => {
    state.hidden = ["hidden"];
    const csv = await exportCsv();
    expect(csv).toContain("VIS-1");
    expect(csv).not.toContain("HID-2");
    expect(csv).not.toContain("Secret");
    // The hidden project does not take a share of the export ceiling.
    expect(state.issueFilters).toContainEqual(["project_id", ["visible"]]);
  });

  it("still exports a hidden project chosen explicitly", async () => {
    state.hidden = ["hidden"];
    const csv = await exportCsv("hidden");
    expect(csv).toContain("HID-2");
  });
});
