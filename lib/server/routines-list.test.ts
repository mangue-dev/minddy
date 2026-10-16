import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Round trips of the Routines list. The page renders only once this read
 * returns, so each owned project must not add its own serial row read and the
 * independent ownership and membership reads must start together. Archived
 * automations still become a paused proposal listed in the same response.
 */

const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const ARCHIVED_PROJECT = "project-archived";

type Row = Record<string, unknown>;

const world = {
  projects: [] as Row[],
  members: [] as Row[],
  routines: [] as Row[],
  /** Each started read, by table, in issue order. */
  started: [] as string[],
  /** Reads held until the test releases them. */
  hold: new Set<string>(),
  release: [] as Array<() => void>,
};

const matches = (row: Row, filters: Record<string, unknown>, inFilter: [string, unknown[]] | null) =>
  Object.entries(filters).every(([column, value]) => (row[column] ?? null) === value) &&
  (!inFilter || inFilter[1].includes(row[inFilter[0]]));

vi.mock("@/lib/supabase-service", () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inFilter: [string, unknown[]] | null = null;
    const query: Record<string, unknown> = {};
    const chain = () => query;
    query.select = chain;
    query.order = chain;
    query.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.is = (column: string, value: unknown) => {
      if (!column.includes(".")) filters[column] = value;
      return query;
    };
    query.in = (column: string, values: unknown[]) => {
      inFilter = [column, values];
      return query;
    };
    const rows = () => {
      const source = table === "projects" ? world.projects
        : table === "project_members" ? world.members
          : table === "agent_routines" ? world.routines : [];
      return source.filter((row) => matches(row, filters, inFilter));
    };
    query.maybeSingle = async () => {
      world.started.push(table);
      return { data: rows()[0] ?? null, error: null };
    };
    query.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
      world.started.push(table);
      const gate = world.hold.has(table)
        ? new Promise<void>((done) => world.release.push(done))
        : Promise.resolve();
      return gate.then(() => ({ data: rows(), error: null })).then(resolve, reject);
    };
    return query;
  };
  return {
    getServiceClient: () => ({
      from,
      auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: {} } }, error: null }) } },
    }),
  };
});

const decodeProject = vi.fn(async (row: Row) => {
  const { encrypted_content: _cipher, ...plain } = row;
  return { ...plain, automations: row.id === ARCHIVED_PROJECT ? row.archived : [] };
});
vi.mock("@/lib/server/project-content", () => ({ decodeProject }));

vi.mock("@/lib/server/routine-content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./routine-content")>()),
  decodeRoutine: async (row: Row) => ({ ...row, trigger: { type: "schedule" } }),
}));

const createRoutine = vi.fn(async (input: { projectId: string; legacySourceKey: string }) => {
  world.routines.push({
    id: `routine-${world.routines.length + 1}`,
    project_id: input.projectId,
    legacy_source_key: input.legacySourceKey,
    deleted_at: null,
  });
  return { ok: true as const };
});
vi.mock("@/lib/server/routines", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./routines")>()),
  createRoutine,
}));

// Loaded here first: when the original `routines` module imports it lazily,
// its own import of `routines` would otherwise bypass the `createRoutine` mock.
await import("@/lib/server/legacy-routine-proposals");
const { listRoutinesForUser } = await import("@/lib/server/routines");

const ownedProject = (id: string): Row => ({
  id,
  owner_id: OWNER_ID,
  deleted_at: null,
  automations_enabled: false,
  automations: [],
  encrypted_content: "sealed",
});

beforeEach(() => {
  world.projects = Array.from({ length: 6 }, (_, index) => ownedProject(`project-${index}`));
  world.members = [];
  world.routines = [];
  world.started = [];
  world.hold = new Set();
  world.release = [];
  decodeProject.mockClear();
  createRoutine.mockClear();
});

describe("listRoutinesForUser", () => {
  it("reads owned projects once and starts the membership read alongside", async () => {
    world.hold = new Set(["projects", "project_members"]);
    const listing = listRoutinesForUser(OWNER_ID);
    await vi.waitFor(() => expect(world.started).toContain("projects"));
    await Promise.resolve();
    expect(world.started).toContain("project_members");
    for (const release of world.release) release();
    expect(await listing).toEqual([]);
    expect(world.started.filter((table) => table === "projects")).toHaveLength(1);
    expect(decodeProject).toHaveBeenCalledTimes(6);
  });

  it("still lists a paused proposal created from archived automations in the same response", async () => {
    world.projects.push({
      ...ownedProject(ARCHIVED_PROJECT),
      archived: [{
        id: "archived-triage",
        enabled: true,
        when: { type: "status_changed", to: ["triage"] },
        if: {},
        then: [{ type: "await_human" }],
      }],
    });
    const rows = await listRoutinesForUser(OWNER_ID);
    expect(createRoutine).toHaveBeenCalledTimes(1);
    expect(createRoutine.mock.calls[0][0]).toMatchObject({ projectId: ARCHIVED_PROJECT, enabled: false });
    expect(rows.map((routine) => routine.project_id)).toEqual([ARCHIVED_PROJECT]);
    expect(world.started.filter((table) => table === "projects")).toHaveLength(1);
  });

  it("never decodes a row of another owner or in the trash", async () => {
    const { prepareLegacyRoutineProposals } = await import("@/lib/server/legacy-routine-proposals");
    expect(await prepareLegacyRoutineProposals([
      { ...ownedProject("foreign"), owner_id: "someone-else" },
      { ...ownedProject("trashed"), deleted_at: "2026-01-01T00:00:00.000Z" },
    ], OWNER_ID)).toBe(false);
    expect(decodeProject).not.toHaveBeenCalled();
  });
});
