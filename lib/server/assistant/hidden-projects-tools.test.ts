import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MyNotification } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  hidden: new Set<string>(),
  hiddenFails: false,
  notifications: [] as MyNotification[],
}));

vi.mock("@/lib/server/hidden-projects", () => ({
  hiddenProjectIdSet: async () => {
    if (mocks.hiddenFails) throw new Error("hidden_projects list failed");
    return new Set(mocks.hidden);
  },
}));
vi.mock("@/lib/server/inbox", () => ({
  readInboxNotifications: async () => ({ notifications: mocks.notifications, error: null }),
}));

import { executeTool, type ToolContext } from "./execute-tool";

const USER_ID = "51600000-0000-4000-8000-000000000001";
const SHOWN = "51600000-0000-4000-8000-0000000000a1";
const HIDDEN = "51600000-0000-4000-8000-0000000000b2";

const PROJECTS = [
  { id: SHOWN, name: "minddy", key: "MIN", owner_id: USER_ID },
  { id: HIDDEN, name: "Side project", key: "SID", owner_id: USER_ID },
];

/** Fake service client: the user owns both projects and is a member of none.
    Every projects read answers with the rows whose id it was asked for. */
function service(): SupabaseClient {
  return {
    from: (table: string) => {
      let ids: string[] | null = null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        in: (_column: string, values: string[]) => {
          ids = values;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const data = table === "projects"
            ? PROJECTS.filter((project) => ids === null || ids.includes(project.id))
            : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function context(): ToolContext {
  const client = service();
  return { projectId: null, userId: USER_ID, supabase: client, service: client, locale: "en" };
}

function notification(id: string, projectId: string, projectKey: string): MyNotification {
  return {
    id, type: "assigned", project_id: projectId, project_key: projectKey,
    created_at: "2026-11-18T10:00:00.000Z", read_at: null,
  } as unknown as MyNotification;
}

beforeEach(() => {
  mocks.hidden = new Set([HIDDEN]);
  mocks.hiddenFails = false;
  mocks.notifications = [notification("n-shown", SHOWN, "MIN"), notification("n-hidden", HIDDEN, "SID")];
});

describe("Numo leaves the projects the user hid out of its default reads (MIN-1016)", () => {
  it("list_projects skips a hidden project", async () => {
    const out = await executeTool("list_projects", {}, context());
    expect(out.success).toBe(true);
    const text = JSON.stringify(out.result);
    expect(text).toContain("MIN");
    expect(text).not.toContain("SID");
    expect(text).not.toContain(HIDDEN);
  });

  it("list_projects returns it, flagged, when the user asks about hidden projects", async () => {
    const out = await executeTool("list_projects", { include_hidden: true }, context());
    expect(out.result).toEqual({
      projects: [
        { id: SHOWN, name: "minddy", key: "MIN", role: "owner", hidden: false },
        { id: HIDDEN, name: "Side project", key: "SID", role: "owner", hidden: true },
      ],
    });
  });

  it("list_projects fails rather than listing a hidden project when the preference is unreadable", async () => {
    mocks.hiddenFails = true;
    const out = await executeTool("list_projects", {}, context());
    expect(out.success).toBe(false);
    expect(JSON.stringify(out.result)).not.toContain("SID");
  });

  it("list_inbox skips a hidden project's notifications and counts them", async () => {
    const out = await executeTool("list_inbox", {}, context());
    expect(out.success).toBe(true);
    const result = out.result as { notifications: Array<{ id: string }>; hidden_project_notifications_skipped?: number };
    expect(result.notifications.map((n) => n.id)).toEqual(["n-shown"]);
    expect(result.hidden_project_notifications_skipped).toBe(1);
    expect(JSON.stringify(result)).not.toContain("SID");
  });

  it("list_inbox returns them when the user asks about hidden projects", async () => {
    const out = await executeTool("list_inbox", { include_hidden: true }, context());
    const result = out.result as { notifications: Array<{ id: string }> };
    expect(result.notifications.map((n) => n.id)).toEqual(["n-shown", "n-hidden"]);
  });
});
