"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, GitMerge } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import type { PublicIdentity, PublicPost } from "@/lib/feedback/types";
import { togglePostVoteAction } from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { FeedbackStatusBadge, VoteButton } from "./feedback-bits";

/**
 * Page publique d'un post (MIN-37) : besoin votable rendu en markdown, réponse
 * d'équipe signée « Équipe <projet> ». Toute action nécessitant une identité
 * passe par la porte OTP puis se rejoue automatiquement.
 */

export function FeedbackPostClient({
  token,
  basePath,
  projectName,
  post,
  mergedFromTitles,
  identity,
}: {
  token: string;
  /** Préfixe public des liens : /f/<token>, ou "" sur domaine personnalisé. */
  basePath: string;
  projectName: string;
  post: PublicPost;
  mergedFromTitles: string[];
  identity: PublicIdentity | null;
}) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();
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
      <Link
        href={basePath || "/"}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t("back")}
      </Link>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="min-w-0 text-xl font-semibold leading-snug">{post.title}</h2>
          <VoteButton count={count} voted={voted} onToggle={toggleVote} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <FeedbackStatusBadge status={post.status} />
          <span>{format.dateTime(new Date(post.createdAt), { dateStyle: "medium" })}</span>
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

      {post.teamResponse && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3">
          <p className="text-xs font-semibold text-brand">
            {t("teamResponse", { project: projectName })}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.teamResponse}</p>
        </div>
      )}

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
