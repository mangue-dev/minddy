import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Round trips of the Routines list. The page renders only once this read
 * returns, so each owned project must not add its own serial row read and the
 * independent ownership and membership reads must start together.
 */

const OWNER_ID = "22222222-2222-4222-8222-222222222222";

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

const decodeProject = vi.fn();
vi.mock("@/lib/server/project-content", () => ({ decodeProject }));

vi.mock("@/lib/server/routine-content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./routine-content")>()),
  decodeRoutine: async (row: Row) => ({ ...row, trigger: { type: "schedule" } }),
}));

const { listRoutinesForUser } = await import("@/lib/server/routines");

const ownedProject = (id: string): Row => ({
  id,
  owner_id: OWNER_ID,
  deleted_at: null,
});

beforeEach(() => {
  world.projects = Array.from({ length: 6 }, (_, index) => ownedProject(`project-${index}`));
  world.members = [];
  world.routines = [];
  world.started = [];
  world.hold = new Set();
  world.release = [];
  decodeProject.mockClear();
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
    expect(decodeProject).not.toHaveBeenCalled();
  });

});
