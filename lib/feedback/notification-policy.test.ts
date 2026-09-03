import { describe, expect, it } from "vitest";
import {
  shouldNotifyFeedbackTransition,
  type FeedbackNotificationState,
} from "@/lib/feedback/notification-policy";

const externalPublished: FeedbackNotificationState = {
  source: "board",
  reviewState: "published",
  status: "open",
};

describe("shouldNotifyFeedbackTransition", () => {
  it("notifies immediately when external feedback is published without review", () => {
    expect(shouldNotifyFeedbackTransition(null, externalPublished)).toBe(true);
  });

  it("waits while external feedback is pending review", () => {
    expect(
      shouldNotifyFeedbackTransition(null, {
        ...externalPublished,
        reviewState: "pending",
      }),
    ).toBe(false);
  });

  it("notifies when a pending external feedback post is accepted", () => {
    expect(
      shouldNotifyFeedbackTransition(
        { ...externalPublished, reviewState: "pending" },
        externalPublished,
      ),
    ).toBe(true);
  });

  it("does not notify when reviewed feedback is classified as spam", () => {
    expect(
      shouldNotifyFeedbackTransition(
        { ...externalPublished, reviewState: "pending" },
        { ...externalPublished, status: "spam" },
      ),
    ).toBe(false);
  });

  it("does not send duplicate notifications for an already published post", () => {
    expect(
      shouldNotifyFeedbackTransition(externalPublished, externalPublished),
    ).toBe(false);
  });

  it("notifies when a team member restores a published post from spam", () => {
    expect(
      shouldNotifyFeedbackTransition(
        { ...externalPublished, status: "spam" },
        externalPublished,
      ),
    ).toBe(true);
  });

  it("never notifies for internal feedback", () => {
    expect(
      shouldNotifyFeedbackTransition(null, {
        ...externalPublished,
        source: "internal",
      }),
    ).toBe(false);
  });
});
