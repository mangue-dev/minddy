import { beforeEach, expect, it, vi } from "vitest";
import { prMaintenanceActionResponse, updatePrCommentResponse, type PrScope } from "./pr-actions";

const record = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./pr-comment-edits", () => ({ recordPrCommentEditQuiet: record }));
vi.mock("./pr-live", () => ({ broadcastPrChanged: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

function fixture() {
  const updateComment = vi.fn();
  const updateBody = vi.fn();
  const scope = {
    pr: { id: "pr-history", number: 42 },
    target: { provider: "github", repoFullName: "acme/app" },
    call: { token: "token", repoFullName: "acme/app", number: 42 },
    actor: async () => ({ kind: "actor", token: "human-token", login: "author", capability: "write" }),
    forge: {
      getPullRequest: async () => ({ body: "Original" }),
      listPullRequestComments: async () => [{ id: 7, body: "Original" }],
      updatePullRequestComment: updateComment,
      updatePullRequestBody: updateBody,
    },
  } as unknown as PrScope;
  return { scope, updateComment, updateBody };
}

it.each(["body", "comment"])("records the previous %s only after success using the forge edit timestamp", async (kind) => {
  const { scope, updateComment, updateBody } = fixture();
  let release!: (value: unknown) => void;
  const write = kind === "body" ? updateBody : updateComment;
  write.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const response = kind === "body"
    ? prMaintenanceActionResponse(scope, "update_body", { body: "Revised" })
    : updatePrCommentResponse(scope, { commentId: 7, body: "Revised" });
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  expect(record).not.toHaveBeenCalled();
  release({ body: "Revised", updatedAt: "2026-10-04T12:00:00Z", updated_at: "2026-10-04T12:00:00Z" });
  expect((await response).status).toBe(200);
  expect(record).toHaveBeenCalledWith({
    provider: "github", repoFullName: "acme/app", prNumber: 42, commentId: kind === "body" ? 0 : 7,
    body: "Original", editedBy: "author", occurredAt: "2026-10-04T12:00:00Z",
  });
});

it.each(["body", "comment"])("does not invent history for a failed %s write", async (kind) => {
  const { scope, updateComment, updateBody } = fixture();
  (kind === "body" ? updateBody : updateComment).mockRejectedValue(new Error("Unavailable"));
  const response = kind === "body"
    ? await prMaintenanceActionResponse(scope, "update_body", { body: "Revised" })
    : await updatePrCommentResponse(scope, { commentId: 7, body: "Revised" });
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(record).not.toHaveBeenCalled();
});

it.each(["body", "comment"])("does not label an unchanged %s as edited", async (kind) => {
  const { scope, updateComment, updateBody } = fixture();
  (kind === "body" ? updateBody : updateComment).mockResolvedValue({ body: "Original", updatedAt: "2026-10-04T12:00:00Z", updated_at: "2026-10-04T12:00:00Z" });
  const response = kind === "body"
    ? await prMaintenanceActionResponse(scope, "update_body", { body: "Original" })
    : await updatePrCommentResponse(scope, { commentId: 7, body: "Original" });
  expect(response.status).toBe(200);
  expect(record).not.toHaveBeenCalled();
});
