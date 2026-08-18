"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "mangue-ui";
import { Clock, GitMerge, UserRound } from "lucide-react";
import type { PublicIdentity, PublicPost, PublicProject } from "@/lib/feedback/types";
import { FeedbackAuthDialog } from "../feedback-auth";
import { BackToBoardLink, FeedbackPostRow, UnpublishedBadge } from "../feedback-bits";

export interface MyFeedbackItem {
  post: PublicPost;
  relation: "authored" | "voted";
  mergedFromTitle: string | null;
}

/** “My feedback” (MIN-37): pull-based monitoring of posts and votes, with
    advancement — including after merge (the canonical is followed instead).

    The line is that of the board, identically (`FeedbackPostRow`): it is the
    same return, we can vote from here as from there, and what does not belong
    that on this page — private, in verification, written or voted — is added to the line
    of meta instead of inventing a second form for it. */
export function MyFeedbackClient({
  token,
  basePath,
  project,
  identity,
  entries,
}: {
  token: string;
  /** Public prefix of links: /f/<token>, or "" on custom domain. */
  basePath: string;
  /** The product: name (status tooltips) and icon (“Team responded” badge). */
  project: PublicProject;
  identity: PublicIdentity | null;
  entries: MyFeedbackItem[];
}) {
  const t = useTranslations("PublicFeedback");
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-5 desktop:px-0">
      <BackToBoardLink basePath={basePath} />

      {!identity ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
          <UserRound className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("meSignInPrompt")}</p>
          <Button variant="outline" onClick={() => setAuthOpen(true)}>
            {t("signIn")}
          </Button>
          <FeedbackAuthDialog token={token} open={authOpen} onOpenChange={setAuthOpen} />
        </div>
      ) : (
        <>
          {/* The pseudonym is no longer said here: it is not displayed NOWHERE on the
              public — neither on a line on the board, nor on a feedback page.
              Announcing it was promising the visitor that he would see this name
              somewhere, and send him to get it for nothing. */}
          <h2 className="text-base font-semibold">{t("myFeedback")}</h2>

          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("meEmpty")}</p>
            </div>
          ) : (
            <ul className="-mx-3 flex flex-col gap-0.5">
              {entries.map((entry) => (
                <FeedbackPostRow
                  key={`${entry.relation}:${entry.post.id}`}
                  token={token}
                  href={`${basePath}/p/${entry.post.id}`}
                  post={entry.post}
                  project={project}
                  statusBadge={
                    // Absent from the board, for any reason: kept private
                    // by its author, or dismissed by moderation. The two
                    // say the same word. “Spam” is the vocabulary of
                    // the team and not a response to a visitor; and a badge
                    // “Private” placed next to the status made two labels
                    // for a single idea — it is the STATUS which is “no
                    // published.”
                    entry.post.status === "spam" || !entry.post.isPublic ? (
                      <UnpublishedBadge projectName={project.name} />
                    ) : undefined
                  }
                  meta={
                    <>
                      {/* Review before publication (MIN-54): the author sees his
                          pending return until it is published. */}
                      {entry.relation === "authored" &&
                        entry.post.isPublic &&
                        entry.post.reviewState === "pending" && (
                          <Badge variant="secondary" icon={<Clock />}>
                            {t("pendingReview")}
                          </Badge>
                        )}
                      <span>
                        {entry.relation === "authored" ? t("meAuthored") : t("meVoted")}
                      </span>
                    </>
                  }
                  footer={
                    entry.mergedFromTitle ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitMerge className="size-3" />
                        {t("meMergedFrom", { title: entry.mergedFromTitle })}
                      </p>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
