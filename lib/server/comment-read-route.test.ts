import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), store: vi.fn(), actors: vi.fn(), decode: vi.fn(), legacy: vi.fn(), scope: vi.fn(), sidecar: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: mocks.auth }));
vi.mock("@/lib/server/comment-store", () => ({ commentStore: mocks.store }));
vi.mock("@/lib/server/api-key-actors", () => ({ resolveApiKeyActors: mocks.actors }));
vi.mock("@/lib/server/git/comment-sync-url-content", () => ({ decodeGithubCommentUrl: mocks.decode, legacyGithubCommentUrlSchema: mocks.legacy }));
vi.mock("@/lib/server/add-comment", () => ({ addCommentToIssue: vi.fn() }));
vi.mock("@/lib/server/assistant/comment-agent", () => ({ mentionsNumo: vi.fn(), replyTargetsNumo: vi.fn(), runCommentMention: vi.fn() }));
const { GET } = await import("@/app/api/issues/[id]/comments/route");
const comment = { id: "comment-1", body: "Encrypted repository projection", api_key_id: "key-1", attachments: [{ id: "file-1" }] };
const read = () => GET(new NextRequest("http://localhost/api/issues/issue-1/comments"), { params: Promise.resolve({ id: "issue-1" }) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  const thread = { select: vi.fn(() => thread), eq: vi.fn(() => thread), order: vi.fn(async () => ({ data: [comment], error: null })) };
  mocks.store.mockReturnValue(thread);
  mocks.scope.mockResolvedValue({ data: { project_id: "project-1" }, error: null });
  mocks.sidecar.mockResolvedValue({ data: [{ comment_id: comment.id, html_url: "protected", author_login: "synthetic" }], error: null });
  const client = { from: vi.fn((table: string) => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: mocks.scope, in: mocks.sidecar };
    expect(["issues", "github_issue_comment_syncs"]).toContain(table); return query;
  }) };
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "actor-1" }, supabase: client });
  mocks.actors.mockResolvedValue(new Map([["key-1", { name: "Synthetic key", agent: "agent" }]]));
  mocks.decode.mockImplementation(async (_project, row) => ({ ...row, html_url: "https://example.com/synthetic" }));
  mocks.legacy.mockReturnValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("authorized comment read scheduling", () => {
  it("starts caller-scoped reads together and resolves independent decorations together", async () => {
    const thread = deferred<{ data: typeof comment[]; error: null }>();
    const scope = deferred<{ data: { project_id: string }; error: null }>();
    const actors = deferred<Map<string, { name: string; agent: string }>>();
    const query = mocks.store(); query.order.mockReturnValue(thread.promise);
    mocks.scope.mockReturnValue(scope.promise); mocks.actors.mockReturnValue(actors.promise);
    const response = read(); await tick();
    expect(query.eq).toHaveBeenCalledWith("issue_id", "issue-1");
    expect(mocks.scope).toHaveBeenCalledOnce();
    expect(mocks.sidecar).not.toHaveBeenCalled();
    scope.resolve({ data: { project_id: "project-1" }, error: null });
    thread.resolve({ data: [comment], error: null }); await tick();
    expect(mocks.actors).toHaveBeenCalledWith(["key-1"]);
    expect(mocks.sidecar).toHaveBeenCalledWith("comment_id", [comment.id]);
    actors.resolve(new Map([["key-1", { name: "Synthetic key", agent: "agent" }]]));
    expect(await (await response).json()).toEqual([{ ...comment, api_key_name: "Synthetic key", api_key_agent: "agent", github: {
      author_login: "synthetic", author_association: null, url: "https://example.com/synthetic", created_at: null, updated_at: null, deleted_at: null,
    } }]);
    expect(mocks.decode).toHaveBeenCalledWith("project-1", expect.anything(), "actor-1");
  });

  it("performs no repository read when live authorization rejects the caller", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await read()).status).toBe(403); expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.scope).not.toHaveBeenCalled();
  });

  it.each([null, { project_id: null }])("does not publish content without a visible issue scope (%s)", async (data) => {
    mocks.scope.mockResolvedValue({ data, error: null });
    expect((await read()).status).toBe(500); expect(mocks.decode).not.toHaveBeenCalled(); expect(mocks.actors).not.toHaveBeenCalled();
  });

  it("preserves sidecar errors and the legacy-schema fallback", async () => {
    mocks.sidecar.mockResolvedValueOnce({ data: null, error: { code: "42703" } });
    mocks.legacy.mockReturnValueOnce(true);
    expect((await read()).status).toBe(200); expect(mocks.sidecar).toHaveBeenCalledTimes(2);
    mocks.sidecar.mockResolvedValueOnce({ data: null, error: { code: "unavailable" } });
    expect((await read()).status).toBe(500);
  });
});
