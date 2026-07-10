"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Input, Spinner, cn } from "mangue-ui";
import { MessagesSquare, User } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import type { PublicIdentity, PublicPost, SimilarPost } from "@/lib/feedback/types";
import {
  createPostAction,
  findSimilarPostsAction,
  logoutAction,
  togglePostVoteAction,
} from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { FeedbackStatusBadge, VoteButton } from "./feedback-bits";

/**
 * Liste du board public (MIN-37) : composeur avec suggestion live « ce post
 * existe peut-être déjà » (debounce ~1 s, ≥ 15 caractères, titre seul), tri
 * top/récent, votes optimistes. Toute action nécessitant une identité passe
 * par la porte OTP puis se rejoue automatiquement.
 */

const SIMILAR_DEBOUNCE_MS = 1000;
const SIMILAR_MIN_CHARS = 15;

export function FeedbackBoardClient({
  token,
  posts,
  sort,
  identity,
  ssoError,
}: {
  token: string;
  posts: PublicPost[];
  sort: "top" | "recent";
  identity: PublicIdentity | null;
  ssoError: boolean;
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-2 desktop:px-0">
      {ssoError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t("ssoError")}
        </p>
      )}

      <Composer token={token} onNeedAuth={requireAuth} />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <SortTab token={token} value="top" active={sort === "top"} label={t("sortTop")} />
          <SortTab
            token={token}
            value="recent"
            active={sort === "recent"}
            label={t("sortRecent")}
          />
        </div>
        <IdentityMenu token={token} identity={identity} onSignIn={() => setAuthOpen(true)} />
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
          <MessagesSquare className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {posts.map((post) => (
            <PostRow key={post.id} token={token} post={post} onNeedAuth={requireAuth} />
          ))}
        </ul>
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

function SortTab({
  token,
  value,
  active,
  label,
}: {
  token: string;
  value: "top" | "recent";
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={`/f/${token}${value === "top" ? "" : `?sort=${value}`}`}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

function IdentityMenu({
  token,
  identity,
  onSignIn,
}: {
  token: string;
  identity: PublicIdentity | null;
  onSignIn: () => void;
}) {
  const t = useTranslations("PublicFeedback");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!identity) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <User className="size-3.5" />
        {t("signIn")}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <Link
        href={`/f/${token}/me`}
        className="font-medium transition-colors hover:text-foreground"
      >
        {t("myFeedback")}
      </Link>
      <span className="hidden desktop:inline">{identity.pseudonym}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await logoutAction(token);
            } catch {
              // rien à faire : le refresh re-synchronise l'état de session
            }
            router.refresh();
          })
        }
        className="transition-colors hover:text-foreground"
      >
        {t("signOut")}
      </button>
    </div>
  );
}

function Composer({
  token,
  onNeedAuth,
}: {
  token: string;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [similar, setSimilar] = useState<SimilarPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Suggestion live « ce post existe peut-être déjà » — titre seul, debounce.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = title.trim();
    if (trimmed.length < SIMILAR_MIN_CHARS) {
      setSimilar([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      // Suggestion best-effort : un échec de transport (page périmée après un
      // déploiement, réseau) ne doit jamais faire tomber la page.
      void findSimilarPostsAction(token, trimmed)
        .then(setSimilar)
        .catch(() => setSimilar([]));
    }, SIMILAR_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title, token]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPostAction(token, {
          title: title.trim(),
          body: body.trim(),
        });
        if (!result?.ok) {
          if (result?.error === "notAuthenticated") {
            onNeedAuth(submit);
            return;
          }
          setError(result ? result.error : "failed");
          return;
        }
        setTitle("");
        setBody("");
        setExpanded(false);
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
        if (title.trim()) submit();
      }}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <p className="text-sm font-semibold">{t("composerTitle")}</p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setExpanded(true)}
        placeholder={t("postTitlePlaceholder")}
        maxLength={200}
      />
      {expanded && (
        <>
          <AutoTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("postBodyPlaceholder")}
            maxLength={10000}
            className="min-h-20 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          />
          {similar.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">{t("similarTitle")}</p>
              {similar.map((s) => (
                <Link
                  key={s.id}
                  href={`/f/${token}/p/${s.id}`}
                  className="flex items-center justify-between gap-2 text-sm transition-colors hover:text-brand"
                >
                  <span className="min-w-0 truncate">{s.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    ▲ {s.voteCount}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending && <Spinner />}
              {t("submitPost")}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

function PostRow({
  token,
  post,
  onNeedAuth,
}: {
  token: string;
  post: PublicPost;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();
  const router = useRouter();
  // Vote optimiste : l'état local prime jusqu'au refresh serveur.
  const [optimistic, setOptimistic] = useState<{ voted: boolean; count: number } | null>(null);
  const voted = optimistic?.voted ?? post.votedByMe;
  const count = optimistic?.count ?? post.voteCount;

  const toggle = () => {
    const next = { voted: !voted, count: count + (voted ? -1 : 1) };
    setOptimistic(next);
    void togglePostVoteAction(token, post.id, next.voted)
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
    <li>
      <Link href={`/f/${token}/p/${post.id}`} className="group flex items-start gap-3 py-3">
        <VoteButton count={count} voted={voted} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-medium leading-snug group-hover:text-brand">
            {post.title}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <FeedbackStatusBadge status={post.status} />
            {post.facetCount > 0 && (
              <span>{t("facetCount", { count: post.facetCount })}</span>
            )}
            <span>
              {format.dateTime(new Date(post.createdAt), { dateStyle: "medium" })}
            </span>
            {post.authorPseudonym && (
              <span>{post.isMine ? t("you") : post.authorPseudonym}</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
