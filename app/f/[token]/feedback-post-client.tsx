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
 * Page publique d'un post (MIN-37) : besoin votable rendu en markdown, puis le
 * fil public où l'équipe répond et où l'on peut préciser sa demande (MIN-196).
 * Toute action nécessitant une identité passe par la porte OTP puis se rejoue
 * automatiquement — le vote comme le commentaire.
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
  /** Préfixe public des liens : /f/<token>, ou "" sur domaine personnalisé. */
  basePath: string;
  project: PublicProject;
  post: PublicPost;
  mergedFromTitles: string[];
  comments: PublicComment[];
  /** Réglage du board : faux = fil en lecture seule. */
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

      {/* Qui, dans quel état, depuis quand — AVANT le titre. En dessous, la
          ligne se lisait comme une signature de bas de page alors qu'elle est
          le cadre de lecture du titre : savoir qu'un besoin est « Prévu »
          change ce qu'on lit ensuite, et l'apprendre après coup oblige à le
          relire. C'est aussi l'ordre de la ligne du board — la même carte,
          dépliée. */}
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

      {/* La réponse de l'équipe n'est plus un encart : c'est le premier message
          du fil public (MIN-196). L'encadré en faisait une propriété du retour —
          une bannière que le produit affiche sur sa propre page, au même titre
          qu'un statut — alors que c'est quelqu'un qui répond à quelqu'un. Elle
          se lit maintenant là où on peut lui répondre. */}
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
