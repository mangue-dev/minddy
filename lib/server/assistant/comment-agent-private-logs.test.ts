import { afterEach, expect, it, vi } from "vitest";

const sentinel = "MIN591_PRIVATE_COMMENT_SENTINEL";
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: async () => ({ project: { id: "project", key: "MIN" } }) }));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => true }));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: (service: { from: (table: string) => unknown }) => service.from("issues") }));
vi.mock("@/lib/server/comment-store", () => ({ commentStore: (service: { from: (table: string) => unknown }) => service.from("comments") }));
vi.mock("@/lib/server/auth-users", () => ({ fetchAuthUsersById: async () => new Map(), toNamed: () => null }));
vi.mock("@/lib/server/numo/surface-conversations", () => ({
  ensureNumoSurfaceThread: async () => { throw new Error("MIN591_PRIVATE_COMMENT_SENTINEL"); },
}));
import { runCommentMention } from "./comment-agent";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("does not log private comment context when Numo surface initialization fails in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const service = { from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, is: () => query,
      or: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: table === "issues"
        ? { id: "issue", project_id: "project", title: sentinel, number: 1 }
        : { id: "comment", parent_id: null, body: sentinel, author_id: "actor" } }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  } };
  await runCommentMention({ service: service as never, supabase: {} as never,
    actorId: "actor", issueId: "issue", triggerCommentId: "comment", locale: "en" });
  expect(log).toHaveBeenCalled();
  expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(sentinel);
});
