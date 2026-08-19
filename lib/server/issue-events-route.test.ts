import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const resolveApiKeyActors = vi.fn();
const state = vi.hoisted(() => ({
  issue: { project_id: "project-1" } as Record<string, unknown> | null,
  issueError: null as { message: string } | null,
  events: [] as Array<Record<string, unknown>>,
  eventsError: null as { message: string } | null,
  eventQueries: 0,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/server/api-key-actors", () => ({
  resolveApiKeyActors: (...args: unknown[]) => resolveApiKeyActors(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table === "issues") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.issue, error: state.issueError }),
            }),
          }),
        };
      }
      state.eventQueries += 1;
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: state.events, error: state.eventsError }),
          }),
        }),
      };
    },
  }),
}));

const { GET } = await import("@/app/api/issues/[id]/events/route");

const ISSUE = "7c45d6d3-dd6a-45d2-a7e8-77a2df80a72c";
const params = { params: Promise.resolve({ id: ISSUE }) };
const request = () => new Request(`https://minddy.app/api/issues/${ISSUE}/events`) as never;

beforeEach(() => {
  vi.clearAllMocks();
  state.issue = { project_id: "project-1" };
  state.issueError = null;
  state.events = [];
  state.eventsError = null;
  state.eventQueries = 0;
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  getProjectAccess.mockResolvedValue({ isMember: true });
  resolveApiKeyActors.mockResolvedValue(new Map());
});

describe("GET /api/issues/[id]/events", () => {
  it("reads the activity through the service after checking project membership", async () => {
    state.events = [
      {
        id: "event-1",
        issue_id: ISSUE,
        api_key_id: null,
        integration: null,
        type: "updated",
      },
    ];

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(getProjectAccess).toHaveBeenCalledWith("user-1", "project-1");
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "event-1", integration_name: null }),
    ]);
  });

  it("does not reveal or read the activity when the caller cannot access its project", async () => {
    getProjectAccess.mockResolvedValue(null);

    const response = await GET(request(), params);

    expect(response.status).toBe(404);
    expect(state.eventQueries).toBe(0);
  });
});
