import type {
  FeedbackPostSource,
  FeedbackPostStatus,
  FeedbackReviewState,
} from "@/lib/feedback/types";

export interface FeedbackNotificationState {
  source: FeedbackPostSource;
  reviewState: FeedbackReviewState;
  status: FeedbackPostStatus;
}

/**
 * A new-feedback notification represents a post becoming actionable for the
 * team. Reviewed submissions therefore notify only after acceptance, while
 * trusted or unreviewed submissions notify immediately.
 */
export function shouldNotifyFeedbackTransition(
  before: FeedbackNotificationState | null,
  after: FeedbackNotificationState,
): boolean {
  if (
    after.source === "internal" ||
    after.reviewState !== "published" ||
    after.status === "spam"
  ) {
    return false;
  }

  return (
    before === null ||
    before.reviewState !== "published" ||
    before.status === "spam"
  );
}
