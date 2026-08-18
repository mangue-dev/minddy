"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GitMerge } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import type {
  PublicComment,
  PublicIdentity,
  PublicPost,
  PublicProject,
} from "@/lib/feedback/types";
import { togglePostVoteAction } from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { PublicComments } from "./public-comments";
import {
  AuthorAvatar,
  BackToBoardLink,
  FeedbackPostedAt,
  FeedbackStatusBadge,
  VoteButton,
} from "./feedback-bits";

/**
 * Public page of a post (MIN-37): votable need rendered in markdown, then the
 * public thread where the team responds and where you can specify your request (MIN-196).
 * Any action requiring an identity goes through the OTP gate and then replays
 * automatically — both voting and commenting.
 */

export function FeedbackPostClient({
  token,
  basePath,
  project,
  post,
  mergedFromTitles,
  comments,
  allowComments,
  identity,
}: {
  token: string;
  /** Public link prefix: /f/<token>, or "" on custom domain. */
  basePath: string;
  project: PublicProject;
  post: PublicPost;
  mergedFromTitles: string[];
  comments: PublicComment[];
  /** Board setting: false = read-only wire. */
  allowComments: boolean;
  identity: PublicIdentity | null;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const pendingAfterAuth = useRef<(() => void) | null>(null);

  const requireAuth = (run: () => void) => {
    if (identity) {
      run();
    } else {
      pendingAfterAuth.current = run;
      setAuthOpen(true);
    }
  };

  const [optimistic, setOptimistic] = useState<{ voted: boolean; count: number } | null>(null);
  const voted = optimistic?.voted ?? post.votedByMe;
  const count = optimistic?.count ?? post.voteCount;

  const toggleVote = () => {
    const next = { voted: !voted, count: count + (voted ? -1 : 1) };
    setOptimistic(next);
    void togglePostVoteAction(token, post.id, next.voted)
      .then((result) => {
        if (!result.ok) {
          setOptimistic(null);
          if (result.notAuthenticated) requireAuth(toggleVote);
          return;
        }
        router.refresh();
      })
      .catch(() => setOptimistic(null));
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 pt-5 desktop:px-0">
      <BackToBoardLink basePath={basePath} />

      {/* Who, in what state, since when — BEFORE the title. Below, the
 line read like a footer signature whereas it is
 the reading frame of the title: knowing that a need is “Planned”
 changes what we read next, and learning it afterwards requires re-reading it. This is also the order of the board line — the same card,
 unfolded. */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <AuthorAvatar pseudonym={post.authorPseudonym} />
          <FeedbackStatusBadge status={post.status} projectName={project.name} />
          <FeedbackPostedAt post={post} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <h2 className="min-w-0 text-xl font-semibold leading-snug">{post.title}</h2>
          <VoteButton count={count} voted={voted} onToggle={toggleVote} />
        </div>
      </div>

      {post.body && (
        <MessageResponse className="text-sm leading-relaxed text-foreground/90">
          {post.body}
        </MessageResponse>
      )}

      {mergedFromTitles.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <GitMerge className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("mergedFrom", { titles: mergedFromTitles.join(" · ") })}</span>
        </div>
      )}

      {/* The team's response is no longer an insert: it is the first message
 in the public thread (MIN-196). The box made it a property of the return -
 a banner that the product displays on its own page, in the same way as
 as a status - when it is someone who responds to someone. It
 now reads where it can be answered. */}
      <PublicComments
        token={token}
        project={project}
        postId={post.id}
        comments={comments}
        allowComments={allowComments}
        identity={identity}
        onNeedAuth={requireAuth}
      />

      <FeedbackAuthDialog
        token={token}
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuthed={() => {
          const run = pendingAfterAuth.current;
          pendingAfterAuth.current = null;
          run?.();
        }}
      />
    </div>
  );
}
