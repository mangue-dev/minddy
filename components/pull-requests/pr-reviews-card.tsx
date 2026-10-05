"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserRoundCheckIcon } from "@hugeicons/core-free-icons";
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

export function PrReviewsCard({
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
  const count = groups.reduce((total, group) => total + group.length, 0);
  const latest = groups.map((group) => group[0]);
  const danger = latest.some(
    (review) => review.reviewState === "changes_requested",
  );
  const success =
    latest.length > 0 &&
    latest.every((review) => review.reviewState === "approved") &&
    requestedReviewers.length === 0;
  const className = cn(
    "flex h-24 min-w-40 max-w-full flex-col gap-2 rounded-xl p-3 text-left",
    danger
      ? "bg-destructive/10 text-destructive"
      : success
        ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
        : "border border-border bg-card text-foreground",
  );
  const content = (
    <>
      <span className="flex items-center">
        {latest.length > 0 ? (
          latest
            .slice(0, 4)
            .map((review, index) => (
              <ForgeUserAvatar
                key={review.id}
                user={review.actor}
                className={cn("size-5 ring-1 ring-card", index > 0 && "-ml-1")}
              />
            ))
        ) : (
          <HugeiconsIcon icon={UserRoundCheckIcon} className="size-5" />
        )}
      </span>
      <span className="mt-auto text-[13px] font-medium">
        {t("cardReviews", { count })}
      </span>
      <span className="max-w-60 truncate text-xs text-muted-foreground">
        {count === 0
          ? t("noReviews")
          : latest
              .map((review) => review.actor?.login ?? t("unknownReviewer"))
              .join(", ")}
      </span>
    </>
  );
  if (count === 0 && requestedReviewers.length === 0) {
    return (
      <button
        type="button"
        data-testid="pr-status-card-reviews"
        className={cn(
          className,
          "group relative outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={onRequest}
        disabled={!canRequest}
        aria-label={canRequest ? t("requestReviewer") : t("noReviews")}
      >
        <span
          className={cn(
            "flex h-full flex-col gap-2",
            canRequest && "group-hover:opacity-0 group-focus-visible:opacity-0",
          )}
        >
          {content}
        </span>
        {canRequest ? (
          <span className="absolute inset-0 grid place-items-center text-sm font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
            {t("requestReviewer")}
          </span>
        ) : null}
      </button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="pr-status-card-reviews"
          className={cn(
            className,
            "outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={t("viewReviews")}
        >
          {content}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        data-testid="pr-reviews-popover"
        className="w-[min(26rem,calc(100vw-2rem))] p-3"
      >
        <h3 className="mb-3 text-sm font-medium">{t("reviewsTitle")}</h3>
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
      </PopoverContent>
    </Popover>
  );
}
