import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCyclePrefs } from "../cycle-prefs";
import { fillCycleForUser, getCycleOverview, runCycleBlockerPull } from "./cycles";

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock("@/lib/supabase-service", () => mocks);
vi.mock("@/lib/server/issue-events", () => ({ insertEvents: vi.fn() }));

type Row = Record<string, unknown>;

function database(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; ids: unknown[]; values: Row }> = [];
  const service = {
    from(table: string) {
      let columns = "*";
      let values: Row | undefined;
      let single = false;
      const filters: Array<(row: Row) => boolean> = [];
      const valueAt = (row: Row, key: string): unknown =>
        key.split(".").reduce<unknown>((value, part) => (value as Row)?.[part], row);
      const query = {
        select(value: string) { columns = value; return query; },
        eq(key: string, value: unknown) {
          filters.push((row) => valueAt(row, key) === value);
          return query;
        },
        is(key: string, value: unknown) { return query.eq(key, value); },
        in(key: string, values: unknown[]) {
          expect(values.length).toBeGreaterThan(0);
          filters.push((row) => values.includes(valueAt(row, key)));
          return query;
        },
        order() { return query; },
        limit() { return query; },
        update(value: Row) { values = value; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve: (result: { data: Row[] | Row | null; error: null }) => unknown) {
          const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
          if (values) {
            writes.push({ table, ids: rows.map((row) => row.id), values });
            for (const row of rows) Object.assign(row, values);
          }
          const data = rows.map((row) => columns === "*" || columns.startsWith("*,") ? { ...row } : Object.fromEntries(
            columns.split(/,(?![^()]*\))/).map((column) => {
              const key = column.trim().split(/[!(]/)[0];
              return [key, row[key]];
            })
          ));
          return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  mocks.getServiceClient.mockReturnValue(service);
  return { service, writes };
}

const cycle = (target = 80) => ({
  id: "cycle", user_id: "user", start_date: "2026-09-14", end_date: "2026-09-21",
  intensity: "medium" as const, target_points: target, completed_points: null,
  filled_at: "2026-09-14T00:00:00Z",
});

const issue = (id: string, fields: Row = {}): Row => ({
  id, project_id: "project", number: 1, title: id, status: "todo", priority: "medium",
  effort: "m", objective_id: null, assignee_id: "user", cycle_id: null,
  deleted_at: null, issue_categories: [], projects: { key: "MIN", deleted_at: null },
  ...fields,
});

const cases = [
  { name: "planned blocker", status: "planned", deleted: false, targetDeleted: false, blocked: true },
  { name: "in-progress blocker", status: "in_progress", deleted: false, targetDeleted: false, blocked: true },
  { name: "done blocker", status: "done", deleted: false, targetDeleted: false, blocked: false },
  { name: "canceled blocker", status: "canceled", deleted: false, targetDeleted: false, blocked: false },
  { name: "trashed blocker", status: "planned", deleted: true, targetDeleted: false, blocked: false },
  { name: "trashed target objective", status: "planned", deleted: false, targetDeleted: true, blocked: false },
];

function dependency(source: "issue" | "objective", target: "issue" | "objective", scenario: typeof cases[number]) {
  return {
    issues: source === "issue" ? [issue("external", {
      status: scenario.status === "planned" ? "todo" : scenario.status,
      assignee_id: "other-user", cycle_id: "other-cycle",
      deleted_at: scenario.deleted ? "2026-09-15" : null,
    })] : [],
    objectives: [
      { id: "goal", status: "planned", deleted_at: scenario.targetDeleted ? "2026-09-15" : null },
      ...(source === "objective" ? [{ id: "external", status: scenario.status, deleted_at: scenario.deleted ? "2026-09-15" : null }] : []),
    ],
    issue_relations: [{
      id: "edge", source_id: "external", source_type: source,
      target_id: target === "objective" ? "goal" : "a", target_type: target, type: "blocks",
    }],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe.each([
  { source: "issue", target: "issue" },
  { source: "issue", target: "objective" },
  { source: "objective", target: "issue" },
  { source: "objective", target: "objective" },
] as const)("cycle $source-to-$target blocking", ({ source, target }) => {
  const scenarios = cases.filter((scenario) => target === "objective" || !scenario.targetDeleted);

  it.each(scenarios)("overview and fill agree for $name", async (scenario) => {
    const dependencies = dependency(source, target, scenario);
    const { service } = database({
      ...dependencies,
      cycles: [cycle()],
      issues: [issue("a", { objective_id: "goal" }), issue("z"), ...dependencies.issues],
    });
    const result = await getCycleOverview({
      service, userId: "user", prefs: { ...resolveCyclePrefs(null), upcomingCount: 0 }, today: "2026-09-17",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.overview.candidates.find((candidate) => candidate.id === "a")?.blocked).toBe(scenario.blocked);
    expect(result.overview.candidates.map((candidate) => candidate.id)).toEqual(scenario.blocked ? ["z", "a"] : ["a", "z"]);
    const fill = await fillCycleForUser({ service, userId: "user", actorId: null, cycle: cycle() });
    expect(fill.pickedIds).toEqual(scenario.blocked ? ["z"] : ["a", "z"]);
  });

  it.each(scenarios)("rebalance ranks $name without pulling objectives", async (scenario) => {
    const dependencies = dependency(source, target, scenario);
    const tables = {
      ...dependencies,
      cycles: [cycle(12)],
      issues: [
        issue("blocked", { cycle_id: "cycle" }), issue("pull"),
        issue("a", { cycle_id: "cycle", objective_id: "goal" }),
        issue("z", { cycle_id: "cycle" }),
        issue("started", { cycle_id: "cycle", status: "in_progress", priority: "none" }),
        ...dependencies.issues,
      ],
    };
    const { writes } = database(tables);
    await runCycleBlockerPull({ blockerId: "pull", blockedId: "blocked", actorId: "user" });
    expect(writes.filter((write) => write.table === "issues")).toEqual([
      { table: "issues", ids: ["pull"], values: { cycle_id: "cycle", assignee_id: "user" } },
      { table: "issues", ids: [scenario.blocked ? "a" : "z"], values: { cycle_id: null } },
    ]);
    expect(tables.objectives).toEqual(dependencies.objectives);
  });
});

it("does not pull an objective passed as the blocker", async () => {
  const { writes } = database({
    cycles: [cycle()], issues: [issue("blocked", { cycle_id: "cycle" })],
    objectives: [{ id: "goal", status: "planned", deleted_at: null }],
  });
  await runCycleBlockerPull({ blockerId: "goal", blockedId: "blocked", actorId: "user" });
  expect(writes).toEqual([]);
});
