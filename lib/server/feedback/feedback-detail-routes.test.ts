import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Round trips of the feedback detail panel: post detail, comments and events
 * load together, so each route must not add a serial read. The post's presence
 * is probed alongside the access check without reading content, and nothing is
 * read or decoded for a post outside the project or a denied project.
 */

const USER = "user-1";
const PROJECT = "project-1";
const POST = "post-1";

const world = {
  log: [] as string[],
  /** Posts by id, with their project. */
  posts: new Map<string, { project_id: string }>(),
  /** Hold the full post read until the test releases it. */
  holdPostRead: false,
  releasePostRead: () => {},
};

let releaseAccess: (value: unknown) => void = () => {};
const access = vi.fn(() => {
  world.log.push("access");
  return new Promise((resolve) => {
    releaseAccess = (value) => {
      world.log.push("access-resolved");
      resolve(value);
    };
  });
});

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: USER }, supabase: {} }),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: () => access(),
  hasProjectAccess: () => access(),
}));
vi.mock("@/lib/server/feedback-post-store", () => ({
  feedbackPostStore: () => {
    let selection = "*";
    const filters: Record<string, unknown> = {};
    const kind = () => selection === "id" ? "post-probe"
      : filters.merged_into_id ? "merged-from"
        : selection === "id, title" ? "titles" : "post-read";
    const rows = () => {
      if (filters.merged_into_id) return [];
      const post = world.posts.get(filters.id as string);
      return post && post.project_id === filters.project_id
        ? [{ id: filters.id, project_id: post.project_id, feedback_post_categories: [], author: null }]
        : [];
    };
    const execute = async () => {
      const name = kind();
      world.log.push(name);
      if (name === "post-read" && world.holdPostRead) {
        await new Promise<void>((resolve) => { world.releasePostRead = resolve; });
      }
      return { data: rows(), error: null };
    };
    const query = {
      select: (value: string) => {
        selection = value.replace(/\s+/g, " ").trim();
        return query;
      },
      is: () => query,
      in: () => query,
      order: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => ({ ...(await execute()), data: rows()[0] ?? null }),
      then: (resolve: (value: unknown) => unknown) => execute().then(resolve),
    };
    return query;
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          world.log.push(table);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/comment-store", () => ({
  commentStore: () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        world.log.push("comments");
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return query;
  },
}));
vi.mock("@/lib/server/issue-event-store", () => ({
  readIssueEvents: async () => {
    world.log.push("events");
    return { data: [], error: null };
  },
}));
vi.mock("@/lib/server/api-key-actors", () => ({ resolveApiKeyActors: async () => new Map() }));
vi.mock("@/lib/server/add-comment", () => ({ addCommentToFeedbackPost: vi.fn() }));
vi.mock("@/lib/server/assistant/comment-agent", () => ({
  mentionsNumo: () => false,
  replyTargetsNumoFeedback: () => false,
  runFeedbackCommentMention: vi.fn(),
}));
vi.mock("@/lib/server/trash", () => ({ softDeleteItem: vi.fn() }));

const comments = await import("@/app/api/projects/[id]/feedback/[postId]/comments/route");
const events = await import("@/app/api/projects/[id]/feedback/[postId]/events/route");
const detail = await import("@/app/api/projects/[id]/feedback/[postId]/route");

const context = (postId = POST) => ({ params: Promise.resolve({ id: PROJECT, postId }) });
const request = (path: string) => new NextRequest(`https://minddy.test${path}`);

beforeEach(() => {
  world.log = [];
  world.posts = new Map([[POST, { project_id: PROJECT }], ["post-elsewhere", { project_id: "project-2" }]]);
  world.holdPostRead = false;
  access.mockClear();
});

describe("feedback detail routes", () => {
  it.each([
    ["comments", () => comments.GET(request("/comments"), context())],
    ["events", () => events.GET(request("/events"), context())],
  ])("%s: probes the post without content while access is pending", async (read, call) => {
    const response = call();
    await vi.waitFor(() => expect(world.log).toContain("post-probe"));
    expect(world.log).not.toContain("access-resolved");
    releaseAccess({ isOwner: false });
    expect((await response).status).toBe(200);
    expect(world.log).not.toContain("post-read");
    expect(world.log.indexOf(read)).toBeGreaterThan(world.log.indexOf("access-resolved"));
  });

  it("answers 404 for a post of another project without reading its comments", async () => {
    const response = comments.GET(request("/comments"), context("post-elsewhere"));
    await vi.waitFor(() => expect(access).toHaveBeenCalled());
    releaseAccess({ isOwner: true });
    const result = await response;
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: "feedbackNotFound" });
    expect(world.log).not.toContain("comments");
  });

  it("lets a project denial win over an existing post", async () => {
    const response = events.GET(request("/events"), context());
    await vi.waitFor(() => expect(access).toHaveBeenCalled());
    releaseAccess(null);
    const result = await response;
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: "projectNotFound" });
    expect(world.log).not.toContain("events");
  });

  it("detail: starts the merge reads while the post read is pending", async () => {
    world.holdPostRead = true;
    const response = detail.GET(request(""), context());
    await vi.waitFor(() => expect(access).toHaveBeenCalled());
    releaseAccess({ isOwner: true });
    await vi.waitFor(() => expect(world.log).toContain("post-read"));
    await vi.waitFor(() => expect(world.log).toContain("feedback_merge_events"));
    expect(world.log).toContain("merged-from");
    world.releasePostRead();
    const result = await response;
    expect(result.status).toBe(200);
    expect((await result.json()).post).toMatchObject({ id: POST, merged_from: [], merge_events: [] });
  });
});
