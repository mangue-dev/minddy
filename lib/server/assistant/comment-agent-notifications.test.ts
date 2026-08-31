import { describe, expect, it } from "vitest";
import {
  numoCommentNotificationTargets,
  replyTargetsNumoPage,
} from "./comment-agent";

describe("Numo comment notification recipients", () => {
  it("does not notify the requester who triggered Numo's reply", () => {
    expect(
      numoCommentNotificationTargets(
        "requester",
        new Set(["requester", "owner", "assignee"]),
        ["requester", "requester", "owner", "assignee"]
      )
    ).toEqual(["owner", "assignee"]);
  });

  it("keeps only distinct project members", () => {
    expect(
      numoCommentNotificationTargets(
        "requester",
        new Set(["requester", "member"]),
        ["member", "outsider", "member", null, undefined]
      )
    ).toEqual(["member"]);
  });
});

describe("Numo page comment continuation", () => {
  const serviceWithLastComment = (data: Record<string, unknown> | null) =>
    ({
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              neq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data }) }),
                }),
              }),
            }),
          }),
        }),
      }),
    }) as never;

  it("continues a page thread after Numo's completed reply", async () => {
    await expect(
      replyTargetsNumoPage(
        serviceWithLastComment({
          via_assistant: true,
          assistant_status: "done",
        }),
        { id: "reply", page_id: "page", parent_id: "root" }
      )
    ).resolves.toBe(true);
  });

  it("does not overlap a page reply that Numo is still writing", async () => {
    await expect(
      replyTargetsNumoPage(
        serviceWithLastComment({
          via_assistant: true,
          assistant_status: "working",
        }),
        { id: "reply", page_id: "page", parent_id: "root" }
      )
    ).resolves.toBe(false);
  });

  it("does not treat a root page comment as a continuation", async () => {
    await expect(
      replyTargetsNumoPage(serviceWithLastComment(null), {
        id: "root",
        page_id: "page",
        parent_id: null,
      })
    ).resolves.toBe(false);
  });
});
