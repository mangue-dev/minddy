import { describe, expect, it } from "vitest";
import { numoCommentNotificationTargets } from "./comment-agent";

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
