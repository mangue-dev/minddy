import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  objective: null as Record<string, unknown> | null,
  access: true as boolean,
  issues: [] as Record<string, unknown>[],
  liveProjects: [] as string[],
  selections: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => mocks.authenticated
    ? { ok: true, user: { id: "viewer" } }
    : { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => mocks.access ? { canWrite: false } : null,
}));
vi.mock("@/lib/server/objective-store", () => ({
  objectiveStore: () => {
    const query = {
      select: () => query, is: () => query, eq: () => query,
      maybeSingle: async () => ({ data: mocks.objective, error: null }),
    };
    return query;
  },
}));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: (selection: string) => { mocks.selections.push(selection); return query; },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
      is: () => query,
      or: () => query,
      order: () => query,
      range: () => query,
      then: (resolve: (value: unknown) => unknown) => resolve({
        data: mocks.issues.filter((row) => filters.every((filter) => filter(row))),
        error: null,
      }),
    };
    return query;
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      let ids: string[] = [];
      const query = {
        select: () => query,
        in: (_column: string, values: string[]) => { ids = values; return query; },
        is: async () => ({
          data: ids.filter((id) => mocks.liveProjects.includes(id)).map((id) => ({ id })),
          error: null,
        }),
      };
      return query;
    },
  }),
}));

import { getObjectiveForecast } from "./objective-forecast";
import { GET } from "@/app/api/objectives/[id]/forecast/route";

const NOW = new Date("2026-10-30T17:00:00.000Z");
const DAY = 86_400_000;

function history(assignee: string, projectId: string, objectiveId: string | null) {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `${assignee}-${projectId}-${index}`,
    project_id: projectId,
    objective_id: objectiveId,
    assignee_id: assignee,
    status: "done",
    effort: "m",
    completed_at: new Date(NOW.getTime() - (index + 1) * DAY).toISOString(),
  }));
}

beforeEach(() => {
  mocks.authenticated = true;
  mocks.access = true;
  mocks.objective = {
    id: "objective-1", project_id: "project-1", status: "in_progress",
    created_at: "2026-09-01T00:00:00.000Z", target_date: "2026-12-31",
  };
  mocks.issues = [
    ...history("alice", "project-1", "objective-1"),
    { id: "open-1", project_id: "project-1", objective_id: "objective-1",
      assignee_id: "alice", status: "todo", effort: "l", completed_at: null },
  ];
  mocks.liveProjects = ["project-1", "private-project"];
  mocks.selections = [];
});

describe("getObjectiveForecast", () => {
  it("returns nothing when the viewer cannot read the objective's project", async () => {
    mocks.access = false;
    expect(await getObjectiveForecast("viewer", "objective-1", { timeZone: "UTC", now: NOW }))
      .toBeNull();
  });

  it("returns only the aggregate estimate, never contributor or project details", async () => {
    const result = await getObjectiveForecast("viewer", "objective-1", { timeZone: "UTC", now: NOW });
    expect(Object.keys(result!).sort()).toEqual(["basis", "forecastDate", "forecastDays"]);
    expect(result!.basis).toBe("contributors");
    expect(new Date(result!.forecastDate!).getTime()).toBeGreaterThan(NOW.getTime());
    // Only scheduling columns are read, never issue content.
    for (const selection of mocks.selections) expect(selection).not.toMatch(/title|description|plan/);
  });

  it("accounts for work in projects the viewer cannot see, unless they are trashed", async () => {
    const base = await getObjectiveForecast("viewer", "objective-1", { timeZone: "UTC", now: NOW });
    mocks.issues.push(...history("alice", "private-project", null),
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `private-open-${index}`, project_id: "private-project", objective_id: null,
        assignee_id: "alice", status: "todo", effort: "m", completed_at: null,
      })));
    const busy = await getObjectiveForecast("viewer", "objective-1", { timeZone: "UTC", now: NOW });
    expect(busy!.forecastDays!).toBeGreaterThan(base!.forecastDays!);

    mocks.liveProjects = ["project-1"];
    const trashed = await getObjectiveForecast("viewer", "objective-1", { timeZone: "UTC", now: NOW });
    expect(trashed!.forecastDays).toBe(base!.forecastDays);
  });

  it("falls back to the objective's own pace without a measured contributor", async () => {
    mocks.issues = mocks.issues.map((issue) => ({ ...issue, assignee_id: null }));
    const result = await getObjectiveForecast("viewer", "objective-1", { timeZone: "UTC", now: NOW });
    expect(result!.basis).toBe("objective");
    expect(result!.forecastDate).not.toBeNull();
  });

  it("does not estimate a canceled or finished objective", async () => {
    mocks.objective = { ...mocks.objective, status: "canceled" };
    expect(await getObjectiveForecast("viewer", "objective-1", { timeZone: "UTC", now: NOW }))
      .toEqual({ forecastDate: null, forecastDays: null, basis: null });
  });
});

describe("GET /api/objectives/[id]/forecast", () => {
  const call = () => GET(
    new NextRequest("https://minddy.test/api/objectives/objective-1/forecast?tz=Europe%2FParis"),
    { params: Promise.resolve({ id: "objective-1" }) },
  );

  it("refuses an anonymous request", async () => {
    mocks.authenticated = false;
    expect((await call()).status).toBe(401);
  });

  it("answers 404 for an objective outside the viewer's projects", async () => {
    mocks.access = false;
    expect((await call()).status).toBe(404);
  });

  it("serves the estimate without caching it", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).basis).toBe("contributors");
  });
});
