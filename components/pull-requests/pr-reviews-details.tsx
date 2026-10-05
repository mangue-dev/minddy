"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { GitLogin } from "@/components/git/git-login";
import type { PrReviewState, PrTimelineEvent } from "@/lib/pr-timeline";
import type { MessageKey } from "@/lib/i18n-keys";
import { reviewerReviewGroups } from "@/lib/pr-review-request";

const VERDICT: Record<PrReviewState, MessageKey<"PullRequests">> = {
  approved: "timelineReviewApproved",
  changes_requested: "timelineReviewChangesRequested",
  commented: "timelineReviewCommented",
  dismissed: "timelineReviewDismissedState",
};

export function PrReviewsDetails({
  timeline,
  requestedReviewers,
  canRequest,
  onRequest,
}: {
  timeline: PrTimelineEvent[];
  requestedReviewers: { login: string; avatar_url: string | null }[];
  canRequest: boolean;
  onRequest: () => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const groups = reviewerReviewGroups(timeline);
  return (
    <div data-testid="pr-reviews-details">
      {groups.length === 0 && requestedReviewers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
      ) : null}
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {groups.map((group) => (
          <section key={group[0].id} data-testid="pr-reviewer-group">
            <header className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
              <ForgeUserAvatar user={group[0].actor} className="size-5" />
              {group[0].actor ? (
                <GitLogin
                  login={group[0].actor.login}
                  className="text-sm font-medium"
                />
              ) : (
                <span className="text-sm">{t("unknownReviewer")}</span>
              )}
            </header>
            <ul className="space-y-1 pt-1">
              {group.map((review) => (
                <li
                  key={review.id}
                  className="flex items-center justify-between gap-3 px-2 py-1 text-xs"
                >
                  <span
                    className={cn(
                      review.reviewState === "approved" &&
                        "text-emerald-700 dark:text-emerald-400",
                      review.reviewState === "changes_requested" &&
                        "text-destructive",
                    )}
                  >
                    {t(VERDICT[review.reviewState ?? "commented"])}
                  </span>
                  {review.createdAt ? (
                    <time
                      dateTime={review.createdAt}
                      className="shrink-0 text-muted-foreground"
                    >
                      {format.dateTime(new Date(review.createdAt), {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {requestedReviewers.length > 0 ? (
          <section>
            <h4 className="mb-2 text-xs text-muted-foreground">
              {t("pendingReviewRequests")}
            </h4>
            {requestedReviewers.map((user) => (
              <div
                key={user.login}
                className="flex items-center gap-2 px-2 py-1"
              >
                <ForgeUserAvatar user={user} className="size-5" />
                <GitLogin login={user.login} className="text-sm" />
              </div>
            ))}
          </section>
        ) : null}
      </div>
      {canRequest ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          data-testid="pr-request-reviewer"
          onClick={onRequest}
        >
          {t("requestReviewer")}
        </Button>
      ) : null}
    </div>
  );
}
