"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import { ArrowLeft, GitMerge, ListPlus } from "lucide-react";
import type { PublicFacet, PublicIdentity, PublicPost } from "@/lib/feedback/types";
import {
  addFacetAction,
  findSimilarFacetsAction,
  toggleFacetVoteAction,
  togglePostVoteAction,
} from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { FeedbackStatusBadge, VoteButton } from "./feedback-bits";

/**
 * Page publique d'un post (MIN-37) : racine votable, facettes votables, réponse
 * d'équipe signée « Équipe <projet> », composeur de facette (avec check de
 * similarité au-delà de ~15 facettes — géré côté serveur). Les facettes
 * remplacent les commentaires : contribution structurée, actionnable.
 */

const SIMILAR_DEBOUNCE_MS = 1000;

export function FeedbackPostClient({
  token,
  projectName,
  post,
  facets,
  mergedFromTitles,
  identity,
}: {
  token: string;
  projectName: string;
  post: PublicPost;
  facets: PublicFacet[];
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-2 desktop:px-0">
      <Link
        href={`/f/${token}`}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t("back")}
      </Link>

      <div className="flex items-start gap-4">
        <VoteButton count={count} voted={voted} onToggle={toggleVote} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-base font-semibold leading-snug">{post.title}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <FeedbackStatusBadge status={post.status} />
            <span>{format.dateTime(new Date(post.createdAt), { dateStyle: "medium" })}</span>
            {post.authorPseudonym && (
              <span>{post.isMine ? t("you") : post.authorPseudonym}</span>
            )}
          </div>
        </div>
      </div>

      {post.body && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {post.body}
        </p>
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{t("facetsTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("facetsExplainer")}</p>
        </div>

        {facets.length > 0 && (
          <ul className="flex flex-col gap-2">
            {facets.map((facet) => (
              <FacetRow key={facet.id} token={token} facet={facet} onNeedAuth={requireAuth} />
            ))}
          </ul>
        )}

        <FacetComposer token={token} postId={post.id} onNeedAuth={requireAuth} />
      </section>

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

function FacetRow({
  token,
  facet,
  onNeedAuth,
}: {
  token: string;
  facet: PublicFacet;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<{ voted: boolean; count: number } | null>(null);
  const voted = optimistic?.voted ?? facet.votedByMe;
  const count = optimistic?.count ?? facet.voteCount;

  const toggle = () => {
    const next = { voted: !voted, count: count + (voted ? -1 : 1) };
    setOptimistic(next);
    void toggleFacetVoteAction(token, facet.id, next.voted)
      .then((result) => {
        if (!result.ok) {
          setOptimistic(null);
          if (result.notAuthenticated) onNeedAuth(toggle);
          return;
        }
        router.refresh();
      })
      .catch(() => setOptimistic(null));
  };

  return (
    <li className="flex items-center gap-3 rounded-md border px-3 py-2">
      <VoteButton size="sm" count={count} voted={voted} onToggle={toggle} />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        {facet.text}
        {facet.isMine && <span className="ml-1.5 text-xs text-muted-foreground">({t("you")})</span>}
      </p>
    </li>
  );
}

function FacetComposer({
  token,
  postId,
  onNeedAuth,
}: {
  token: string;
  postId: string;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [text, setText] = useState("");
  const [similar, setSimilar] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check de similarité serveur (actif seulement au-delà de ~15 facettes).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < 15) {
      setSimilar([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      // Best-effort : un échec de transport ne doit jamais faire tomber la page.
      void findSimilarFacetsAction(token, postId, trimmed)
        .then(setSimilar)
        .catch(() => setSimilar([]));
    }, SIMILAR_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, token, postId]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addFacetAction(token, postId, text.trim());
        if (!result?.ok) {
          if (result?.error === "notAuthenticated") {
            onNeedAuth(submit);
            return;
          }
          setError(result ? result.error : "failed");
          return;
        }
        setText("");
        setSimilar([]);
        router.refresh();
      } catch {
        setError("failed");
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) submit();
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("facetPlaceholder")}
          maxLength={200}
        />
        <Button type="submit" variant="outline" disabled={pending || !text.trim()}>
          {pending ? <Spinner /> : <ListPlus className="size-4" />}
          {t("addFacet")}
        </Button>
      </div>
      {similar.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("similarFacets")} {similar.join(" · ")}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
    </form>
  );
}
