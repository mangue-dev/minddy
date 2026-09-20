import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ create: vi.fn(), pageCreate: vi.fn(), after: vi.fn(), mentions: vi.fn(), reply: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => ({ ok: true, user: { id: "u1" }, supabase: {} }) }));
vi.mock("@/lib/server/session-rate-limit", () => ({ checkSessionRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/server/add-comment", () => ({ addCommentToIssue: mocks.create }));
vi.mock("@/lib/server/page-comments", () => ({ addPageComment: mocks.pageCreate }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/assistant/comment-agent", () => ({
  mentionsNumo: mocks.mentions, replyTargetsNumo: mocks.reply, replyTargetsNumoPage: mocks.reply,
  runCommentMention: vi.fn(), runPageCommentMention: vi.fn(),
}));

const issue = await import("@/app/api/issues/[id]/comments/route");
const page = await import("@/app/api/projects/[id]/pages/[pageId]/comments/route");
const id = "88888888-8888-4888-8888-888888888888";
type CommentInput = { id: string; body: string };
const request = (input: CommentInput) => new NextRequest("http://localhost/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });

beforeEach(() => { vi.clearAllMocks(); });
for (const entity of ["issue", "page"] as const) {
  const post = (input: CommentInput) => entity === "issue"
    ? issue.POST(request(input), { params: Promise.resolve({ id: "e1" }) })
    : page.POST(request(input), { params: Promise.resolve({ id: "p1", pageId: "e1" }) });
  const create = entity === "issue" ? mocks.create : mocks.pageCreate;
  describe(`${entity} comment retry route`, () => {
    it("rejects a malformed client UUID before calling the write service", async () => {
      expect((await post({ id: "wrong", body: "Message" })).status).toBe(400);
      expect(create).not.toHaveBeenCalled();
    });
    it("does not start an assistant or repeat mention resolution on an accepted replay", async () => {
      create.mockResolvedValueOnce({ ok: true, replayed: true, comment: { id, body: "@numo help" } });
      const response = await post({ id, body: "@numo help" });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ id });
      expect(mocks.after).not.toHaveBeenCalled();
      expect(mocks.mentions).not.toHaveBeenCalled();
      expect(mocks.reply).not.toHaveBeenCalled();
    });
  });
}

it("reports a partial attachment failure without pretending the resources were saved", async () => {
  mocks.create.mockResolvedValueOnce({ ok: true, replayed: true, attachmentError: true, comment: { id, body: "Message", attachments: [] } });
  const response = await issue.POST(request({ id, body: "Message" }), { params: Promise.resolve({ id: "e1" }) });
  expect(await response.json()).toMatchObject({ id, attachment_error: "databaseError" });
});
