import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessibleProjectIds: vi.fn(),
  fetchAuthUsersById: vi.fn(),
  fetchAvatarSeeds: vi.fn(),
  resolveApiKeyActors: vi.fn(),
}));

vi.mock("@/lib/server/project-access", () => ({
  accessibleProjectIds: mocks.accessibleProjectIds,
}));
vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: mocks.fetchAuthUsersById,
  toNamed: (value: unknown) => value,
}));
vi.mock("@/lib/server/avatar-seeds", () => ({
  fetchAvatarSeeds: mocks.fetchAvatarSeeds,
}));
vi.mock("@/lib/server/api-key-actors", () => ({
  resolveApiKeyActors: mocks.resolveApiKeyActors,
}));
vi.mock("@/lib/display-name", () => ({ displayName: () => "Actor" }));

import { readInboxNotifications } from "./inbox";

type Row = Record<string, unknown>;
type Fixtures = Record<string, Row[]>;

class Query {
  private rows: Row[];

  constructor(rows: Row[]) {
    this.rows = [...rows];
  }

  select() {
    return this;
  }

  in(column: string, values: unknown[]) {
    this.rows = this.rows.filter((row) => values.includes(row[column]));
    return this;
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.rows = this.rows.slice(0, value);
    return this;
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

function client(fixtures: Fixtures) {
  return {
    from: (table: string) => new Query(fixtures[table] ?? []),
  };
}

const notification = (id: string, target: Partial<Row>): Row => ({
  id,
  user_id: "user-1",
  project_id: "project-a",
  type: "comment",
  issue_id: null,
  agent_conversation_id: null,
  objective_id: null,
  feedback_post_id: null,
  routine_id: null,
  pull_request_id: null,
  page_id: null,
  block_id: null,
  comment_id: null,
  actor_id: null,
  api_key_id: null,
  via_assistant: false,
  via_mcp: false,
  via_smart_assign: false,
  via_automation: false,
  read_at: null,
  created_at: "2026-09-07T00:00:00.000Z",
  ...target,
});

describe("readInboxNotifications target isolation", () => {
  beforeEach(() => {
    mocks.accessibleProjectIds.mockReset();
    mocks.accessibleProjectIds.mockResolvedValue(
      new Set(["project-a", "project-b"]),
    );
    mocks.fetchAuthUsersById.mockReset();
    mocks.fetchAuthUsersById.mockResolvedValue(new Map());
    mocks.fetchAvatarSeeds.mockReset();
    mocks.fetchAvatarSeeds.mockResolvedValue(new Map());
    mocks.resolveApiKeyActors.mockReset();
    mocks.resolveApiKeyActors.mockResolvedValue(new Map());
  });

  it("drops a notification whose issue or comment parent belongs to another project", async () => {
    const notifications = [
      notification("valid", { issue_id: "issue-a", comment_id: "comment-a" }),
      notification("foreign-issue", { issue_id: "issue-b" }),
      notification("foreign-comment", { comment_id: "comment-b" }),
    ];
    const fixtures: Fixtures = {
      notifications,
      projects: [{ id: "project-a", key: "A" }],
      issues: [
        {
          id: "issue-a",
          project_id: "project-a",
          number: 1,
          title: "Allowed issue",
          deleted_at: null,
        },
        {
          id: "issue-b",
          project_id: "project-b",
          number: 2,
          title: "Foreign issue secret",
          deleted_at: null,
        },
      ],
      comments: [
        {
          id: "comment-a",
          issue_id: "issue-a",
          objective_id: null,
          feedback_post_id: null,
          body: "Allowed comment",
          via_assistant: false,
          via_mcp: false,
          api_key_id: null,
        },
        {
          id: "comment-b",
          issue_id: "issue-b",
          objective_id: null,
          feedback_post_id: null,
          body: "Foreign comment secret",
          via_assistant: false,
          via_mcp: false,
          api_key_id: null,
        },
      ],
    };

    const result = await readInboxNotifications({
      client: client(fixtures) as never,
      service: client(fixtures) as never,
      userId: "user-1",
      clientIsUserScoped: true,
    });

    expect(result.error).toBeNull();
    expect(result.notifications.map((row) => row.id)).toEqual(["valid"]);
    expect(result.notifications[0]).toMatchObject({
      issue_title: "Allowed issue",
      comment_excerpt: "Allowed comment",
    });
    expect(JSON.stringify(result.notifications)).not.toContain("Foreign");
  });

  it("requires every service-hydrated target kind to match the notification project", async () => {
    const notifications = [
      notification("objective-a", { objective_id: "objective-a" }),
      notification("objective-b", { objective_id: "objective-b" }),
      notification("feedback-a", { feedback_post_id: "feedback-a" }),
      notification("feedback-b", { feedback_post_id: "feedback-b" }),
      notification("routine-a", { routine_id: "routine-a" }),
      notification("routine-b", { routine_id: "routine-b" }),
      notification("conversation-a", {
        agent_conversation_id: "conversation-a",
      }),
      notification("conversation-b", {
        agent_conversation_id: "conversation-b",
      }),
      notification("page-a", { page_id: "page-a" }),
      notification("page-b", { page_id: "page-b" }),
      notification("pull-a", { pull_request_id: "pull-a" }),
      notification("pull-b", { pull_request_id: "pull-b" }),
    ];
    const scoped = (id: string, project: string, title: string) => ({
      id,
      project_id: project,
      title,
      name: title,
      deleted_at: null,
    });
    const fixtures: Fixtures = {
      notifications,
      projects: [{ id: "project-a", key: "A" }],
      objectives: [
        scoped("objective-a", "project-a", "Allowed objective"),
        scoped("objective-b", "project-b", "Foreign objective"),
      ],
      feedback_posts: [
        scoped("feedback-a", "project-a", "Allowed feedback"),
        scoped("feedback-b", "project-b", "Foreign feedback"),
      ],
      agent_routines: [
        scoped("routine-a", "project-a", "Allowed routine"),
        scoped("routine-b", "project-b", "Foreign routine"),
      ],
      agent_conversations: [
        scoped("conversation-a", "project-a", "Allowed conversation"),
        scoped("conversation-b", "project-b", "Foreign conversation"),
      ],
      pages: [
        scoped("page-a", "project-a", "Allowed page"),
        scoped("page-b", "project-b", "Foreign page"),
      ],
      pull_requests: [
        {
          id: "pull-a",
          provider: "github",
          repo_full_name: "org/a",
          number: 1,
          title: "Allowed pull request",
        },
        {
          id: "pull-b",
          provider: "github",
          repo_full_name: "org/b",
          number: 2,
          title: "Foreign pull request",
        },
      ],
      project_git_links: [
        {
          project_id: "project-a",
          provider: "github",
          repo_full_name: "org/a",
        },
        {
          project_id: "project-b",
          provider: "github",
          repo_full_name: "org/b",
        },
      ],
    };

    const result = await readInboxNotifications({
      client: client(fixtures) as never,
      service: client(fixtures) as never,
      userId: "user-1",
      clientIsUserScoped: true,
    });

    expect(result.error).toBeNull();
    expect(result.notifications.map((row) => row.id)).toEqual([
      "objective-a",
      "feedback-a",
      "routine-a",
      "conversation-a",
      "page-a",
      "pull-a",
    ]);
    expect(JSON.stringify(result.notifications)).not.toContain("Foreign");
  });

  it("does not hydrate legacy actor or API key ids outside the notification project", async () => {
    const notifications = [
      notification("member-actor", { actor_id: "member-a" }),
      notification("foreign-actor", { actor_id: "member-b" }),
      notification("member-key", { api_key_id: "key-a", via_mcp: true }),
      notification("foreign-key", { api_key_id: "key-b", via_mcp: true }),
      notification("foreign-comment-key", {
        comment_id: "comment-with-foreign-key",
        api_key_id: "key-a",
      }),
      notification("global-actor", {
        project_id: null,
        actor_id: "member-a",
      }),
      notification("global-key", {
        project_id: null,
        api_key_id: "key-a",
        via_mcp: true,
      }),
    ];
    const fixtures: Fixtures = {
      notifications,
      projects: [
        { id: "project-a", key: "A", owner_id: "owner-a" },
        { id: "project-b", key: "B", owner_id: "owner-b" },
      ],
      project_members: [
        { project_id: "project-a", user_id: "member-a" },
        { project_id: "project-b", user_id: "member-b" },
      ],
      api_keys: [
        { id: "key-a", user_id: "member-a" },
        { id: "key-b", user_id: "member-b" },
      ],
      issues: [
        {
          id: "issue-a",
          project_id: "project-a",
          number: 1,
          title: "Allowed issue",
          deleted_at: null,
        },
      ],
      comments: [
        {
          id: "comment-with-foreign-key",
          issue_id: "issue-a",
          objective_id: null,
          feedback_post_id: null,
          body: "Allowed comment body",
          via_assistant: false,
          via_mcp: true,
          api_key_id: "key-b",
        },
      ],
    };
    mocks.fetchAuthUsersById.mockImplementation(
      async (_service: unknown, ids: string[]) =>
        new Map(
          ids.map((id) => [
            id,
            { id, email: `${id}@example.test`, user_metadata: {} },
          ]),
        ),
    );
    mocks.fetchAvatarSeeds.mockImplementation(
      async (_service: unknown, ids: string[]) =>
        new Map(ids.map((id) => [id, `seed-${id}`])),
    );
    mocks.resolveApiKeyActors.mockImplementation(async (ids: string[]) =>
      new Map(
        ids.map((id) => [
          id,
          { name: id === "key-a" ? "Allowed key" : "Foreign key", agent: null },
        ]),
      ),
    );

    const result = await readInboxNotifications({
      client: client(fixtures) as never,
      service: client(fixtures) as never,
      userId: "user-1",
      clientIsUserScoped: true,
    });

    expect(result.error).toBeNull();
    expect(result.notifications.map((row) => row.id)).toEqual(
      notifications.map((row) => row.id),
    );
    const byId = new Map(result.notifications.map((row) => [row.id, row]));
    expect(byId.get("member-actor")).toMatchObject({
      actor_name: "Actor",
      actor_avatar_seed: "seed-member-a",
    });
    expect(byId.get("foreign-actor")).toMatchObject({
      actor_name: null,
      actor_avatar_seed: null,
    });
    expect(byId.get("member-key")).toMatchObject({
      api_key_name: "Allowed key",
    });
    expect(byId.get("foreign-key")).toMatchObject({
      api_key_name: null,
      api_key_agent: null,
    });
    expect(byId.get("foreign-comment-key")).toMatchObject({
      comment_excerpt: "Allowed comment body",
      via_mcp: true,
      api_key_name: null,
      api_key_agent: null,
    });
    expect(byId.get("global-actor")).toMatchObject({
      actor_name: null,
      actor_avatar_seed: null,
    });
    expect(byId.get("global-key")).toMatchObject({
      api_key_name: null,
      api_key_agent: null,
    });
    expect(mocks.fetchAuthUsersById).toHaveBeenCalledWith(
      expect.anything(),
      ["member-a"],
    );
    expect(mocks.resolveApiKeyActors).toHaveBeenCalledWith(["key-a"]);
  });
});
