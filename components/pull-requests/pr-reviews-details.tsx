"use client";

import type { ReactNode } from "react";
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

export interface PrReviewerDetails {
  id: string;
  name: ReactNode;
  avatar: ReactNode;
  logins?: readonly string[];
  action?: ReactNode;
  details?: ReactNode;
}

export function PrReviewsDetails({
  timeline,
  requestedReviewers,
  canRequest,
  onRequest,
  additionalReviewers = [],
}: {
  timeline: PrTimelineEvent[];
  requestedReviewers: { login: string; avatar_url: string | null }[];
  canRequest: boolean;
  onRequest: () => void;
  additionalReviewers?: PrReviewerDetails[];
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const groups = reviewerReviewGroups(timeline);
  const agentLogins = new Set(additionalReviewers.flatMap((reviewer) => reviewer.logins ?? []).map((login) => login.toLowerCase()));
  const humanGroups = groups.filter((group) => !agentLogins.has(group[0].actor?.login.toLowerCase() ?? ""));
  const pending = requestedReviewers.filter((user) => !agentLogins.has(user.login.toLowerCase()));
  const reviewEvents = (reviews: PrTimelineEvent[]) => reviews.length > 0 ? (
    <ul className="space-y-1 pt-1">
      {reviews.map((review) => (
        <li key={review.id} className="flex items-center justify-between gap-3 px-2 py-1 text-xs">
          <span className={cn(
            review.reviewState === "approved" && "text-emerald-700 dark:text-emerald-400",
            review.reviewState === "changes_requested" && "text-destructive",
          )}>{t(VERDICT[review.reviewState ?? "commented"])}</span>
          {review.createdAt ? (
            <time dateTime={review.createdAt} className="shrink-0 text-muted-foreground">
              {format.dateTime(new Date(review.createdAt), { month: "short", day: "numeric" })}
            </time>
          ) : null}
        </li>
      ))}
    </ul>
  ) : null;
  return (
    <div data-testid="pr-reviews-details">
      {groups.length === 0 && pending.length === 0 && additionalReviewers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noReviews")}</p>
      ) : null}
      <div className="space-y-3">
        {additionalReviewers.map((reviewer) => (
          <ReviewerSection key={reviewer.id} avatar={reviewer.avatar} name={reviewer.name} action={reviewer.action} testId={`pr-insight-detail-${reviewer.id}`}>
            {reviewer.details}
            {reviewEvents(groups.filter((group) => reviewer.logins?.some((login) => login.toLowerCase() === group[0].actor?.login.toLowerCase())).flat())}
            {requestedReviewers.some((user) => reviewer.logins?.some((login) => login.toLowerCase() === user.login.toLowerCase())) ? <p className="px-2 py-1 text-xs text-muted-foreground">{t("pendingReviewRequests")}</p> : null}
          </ReviewerSection>
        ))}
        {humanGroups.map((group) => (
          <ReviewerSection key={group[0].id} avatar={<ForgeUserAvatar user={group[0].actor} className="size-5" />} name={group[0].actor ? <GitLogin login={group[0].actor.login} className="text-sm font-medium" /> : t("unknownReviewer")}>
            {reviewEvents(group)}
            {pending.some((user) => user.login.toLowerCase() === group[0].actor?.login.toLowerCase()) ? <p className="px-2 py-1 text-xs text-muted-foreground">{t("pendingReviewRequests")}</p> : null}
          </ReviewerSection>
        ))}
        {pending.filter((user) => !humanGroups.some((group) => group[0].actor?.login.toLowerCase() === user.login.toLowerCase())).map((user) => (
          <ReviewerSection key={user.login} avatar={<ForgeUserAvatar user={user} className="size-5" />} name={<GitLogin login={user.login} className="text-sm font-medium" />}>
            <p className="px-2 py-1 text-xs text-muted-foreground">{t("pendingReviewRequests")}</p>
          </ReviewerSection>
        ))}
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

/** Every reviewer uses the same identity banner and details layout. */
function ReviewerSection({ avatar, name, action, children, testId }: {
  avatar: ReactNode;
  name: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId ?? "pr-reviewer-group"}>
      <header className="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
        {avatar}
        <span className="min-w-0 text-sm font-medium">{name}</span>
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
