import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  shouldNotifyFeedbackTransition,
  type FeedbackNotificationState,
} from "@/lib/feedback/notification-policy";
import type {
  FeedbackPostSource,
  FeedbackPostStatus,
  FeedbackReviewState,
} from "@/lib/feedback/types";
import {
  insertNotifications,
  projectMemberIds,
} from "@/lib/server/notifications";

export interface FeedbackNotificationPost {
  id: string;
  project_id: string;
  source: FeedbackPostSource;
  review_state: FeedbackReviewState;
  status: FeedbackPostStatus;
}

function notificationState(
  post: FeedbackNotificationPost,
): FeedbackNotificationState {
  return {
    source: post.source,
    reviewState: post.review_state,
    status: post.status,
  };
}

export async function notifyFeedbackTransition(
  service: SupabaseClient,
  before: FeedbackNotificationPost | null,
  after: FeedbackNotificationPost,
): Promise<void> {
  if (
    !shouldNotifyFeedbackTransition(
      before ? notificationState(before) : null,
      notificationState(after),
    )
  ) {
    return;
  }

  try {
    const members = await projectMemberIds(service, after.project_id);
    await insertNotifications(
      service,
      [...members].map((userId) => ({
        user_id: userId,
        project_id: after.project_id,
        type: "feedback_new" as const,
        issue_id: null,
        feedback_post_id: after.id,
        actor_id: null,
      })),
    );
  } catch (error) {
    console.error(
      "[feedback-notifications] insert failed:",
      (error as Error).message,
    );
  }
}
