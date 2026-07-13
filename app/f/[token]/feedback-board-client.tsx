"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  Switch,
  cn,
} from "mangue-ui";
import { ArrowUpDown, Check, ChevronDown, MessagesSquare, Megaphone } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  FEEDBACK_POST_STATUSES,
  type FeedbackPostStatus,
  type PublicIdentity,
  type PublicPost,
  type SimilarPost,
} from "@/lib/feedback/types";
import {
  createPostAction,
  findSimilarPostsAction,
  togglePostVoteAction,
} from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { StatusIndicator } from "@/components/issue-indicators";
import {
  CategoryTag,
  FEEDBACK_TO_ISSUE_STATUS,
  FeedbackStatusBadge,
  VoteButton,
} from "./feedback-bits";

/**
 * Liste du board public (MIN-37) — structure type UserJot : barre de filtres
 * par statut + tri, lignes auteur/titre/extrait avec vote en pill, sidebar
 * « Partager un retour » (composeur en dialog avec suggestion live « existe
 * peut-être déjà »). Toute action nécessitant une identité passe par la porte
 * OTP puis se rejoue automatiquement.
 */

const SIMILAR_DEBOUNCE_MS = 1000;
const SIMILAR_MIN_CHARS = 15;

export function FeedbackBoardClient({
  token,
  basePath,
  posts,
  sort,
  status,
  identity,
  ssoError,
}: {
  token: string;
  /** Préfixe public des liens : /f/<token>, ou "" sur domaine personnalisé. */
  basePath: string;
  posts: PublicPost[];
  sort: "top" | "recent";
  status: FeedbackPostStatus | null;
  identity: PublicIdentity | null;
  ssoError: boolean;
}) {
  const t = useTranslations("PublicFeedback");
  const [authOpen, setAuthOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
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
    <div className="mx-auto flex w-full max-w-5xl gap-8 px-4 pb-16 pt-4 desktop:px-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {ssoError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("ssoError")}
          </p>
        )}

        <Button className="desktop:hidden" onClick={() => setComposerOpen(true)}>
          <Megaphone />
          {t("composerTitle")}
        </Button>

        <FilterBar basePath={basePath} sort={sort} status={status} />

        {posts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
            <MessagesSquare className="size-5 text-muted-foreground" />
            {/* Filtre actif = la vue est vide, pas le board. */}
            <p className="text-sm text-muted-foreground">
              {status ? t("emptyFiltered") : t("empty")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {posts.map((post) => (
              <PostRow
                key={post.id}
                token={token}
                basePath={basePath}
                post={post}
                onNeedAuth={requireAuth}
              />
            ))}
          </ul>
        )}
      </div>

      <aside className="hidden w-64 shrink-0 pt-1 desktop:block">
        <Button className="w-full" onClick={() => setComposerOpen(true)}>
          <Megaphone />
          {t("composerTitle")}
        </Button>
      </aside>

      <ComposerDialog
        token={token}
        basePath={basePath}
        open={composerOpen}
        onOpenChange={setComposerOpen}
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

// ── Filtres par statut + tri ─────────────────────────────────────────────────

function buildHref(
  basePath: string,
  sort: "top" | "recent",
  status: FeedbackPostStatus | null
): string {
  const params = new URLSearchParams();
  if (sort === "recent") params.set("sort", "recent");
  if (status) params.set("status", status);
  const query = params.toString();
  // basePath "" (domaine personnalisé) : la racine du board est "/".
  return `${basePath || "/"}${query ? `?${query}` : ""}`;
}

function FilterBar({
  basePath,
  sort,
  status,
}: {
  basePath: string;
  sort: "top" | "recent";
  status: FeedbackPostStatus | null;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  return (
    // Sur mobile, statuts et tri passent sur deux lignes ; le tri est compacté
    // en dropdown partout.
    <div className="flex flex-col gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FEEDBACK_POST_STATUSES.map((value) => {
          const active = status === value;
          return (
            <Link
              key={value}
              // re-cliquer le filtre actif le retire
              href={buildHref(basePath, sort, active ? null : value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <StatusIndicator
                status={FEEDBACK_TO_ISSUE_STATUS[value]}
                className="size-3.5"
              />
              {t(`status.${value}`)}
            </Link>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowUpDown className="size-3" />
            {sort === "top" ? t("sortTop") : t("sortRecent")}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(["top", "recent"] as const).map((value) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => router.push(buildHref(basePath, value, status))}
            >
              {value === "top" ? t("sortTop") : t("sortRecent")}
              {sort === value && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Ligne de post ─────────────────────────────────────────────────────────────

function PostRow({
  token,
  basePath,
  post,
  onNeedAuth,
}: {
  token: string;
  basePath: string;
  post: PublicPost;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();
  const router = useRouter();
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
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`${basePath}/p/${post.id}`} className="group flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold leading-snug group-hover:text-brand">
              {post.title}
            </h3>
            {post.body && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {post.body}
              </p>
            )}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <FeedbackStatusBadge status={post.status} />
            <span>{format.dateTime(new Date(post.createdAt), { dateStyle: "medium" })}</span>
            {post.categories.map((c) => (
              <CategoryTag key={c.id} category={c} />
            ))}
          </div>
        </div>
        <VoteButton count={count} voted={voted} onToggle={toggle} />
      </div>
    </li>
  );
}

// ── Composeur (dialog) ────────────────────────────────────────────────────────

function ComposerDialog({
  token,
  basePath,
  open,
  onOpenChange,
  onNeedAuth,
}: {
  token: string;
  basePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [title, setTitle] = useState("");
  // Coché par défaut : publier sur le board. Décoché = retour privé à l'équipe.
  const [isPublic, setIsPublic] = useState(true);
  const [similar, setSimilar] = useState<SimilarPost[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Le MarkdownEditor ne committe qu'au blur — la ref porte toujours la
  // dernière valeur commitée, et submit() force le blur avant de lire.
  const bodyRef = useRef("");
  const [initialBody, setInitialBody] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  // Brouillon en localStorage : si le modal se ferme (vérification email qui
  // tourne mal, fausse manip), le retour en cours d'écriture est récupéré à la
  // réouverture. Effacé seulement après publication.
  const draftKey = `mdy-feedback-draft:${token}`;
  const persistDraft = (nextTitle: string, nextBody: string) => {
    try {
      if (!nextTitle.trim() && !nextBody.trim()) {
        localStorage.removeItem(draftKey);
      } else {
        localStorage.setItem(draftKey, JSON.stringify({ title: nextTitle, body: nextBody }));
      }
    } catch {
      // localStorage indisponible — tant pis pour le brouillon
    }
  };

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { title?: string; body?: string };
      if (typeof draft.title === "string") setTitle(draft.title);
      if (typeof draft.body === "string" && draft.body) {
        bodyRef.current = draft.body;
        setInitialBody(draft.body);
        setEditorKey((k) => k + 1);
      }
    } catch {
      // brouillon illisible — on repart de zéro
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Suggestion live « ce post existe peut-être déjà » — titre seul, debounce.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = title.trim();
    if (!open || trimmed.length < SIMILAR_MIN_CHARS) {
      setSimilar([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      // L'état « recherche… » rend le système visible même sans résultat.
      setChecking(true);
      void findSimilarPostsAction(token, trimmed)
        .then(setSimilar)
        .catch(() => setSimilar([]))
        .finally(() => setChecking(false));
    }, SIMILAR_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title, token, open]);

  const reset = () => {
    setTitle("");
    setIsPublic(true);
    setSimilar([]);
    setChecking(false);
    setError(null);
    bodyRef.current = "";
    setInitialBody("");
    setEditorKey((k) => k + 1);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        // Committe le contenu markdown en cours d'édition avant lecture.
        (document.activeElement as HTMLElement | null)?.blur();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const result = await createPostAction(token, {
          title: title.trim(),
          body: bodyRef.current.trim(),
          isPublic,
        });
        if (!result?.ok) {
          if (result?.error === "notAuthenticated") {
            onNeedAuth(submit);
            return;
          }
          setError(result ? result.error : "failed");
          return;
        }
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        reset();
        onOpenChange(false);
        router.refresh();
      } catch {
        setError("failed");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="top-24 translate-y-0 gap-0 sm:max-w-xl">
        {/* Style « modal de création d'issue » : titre et description sont des
            surfaces d'écriture libres, sans containers. */}
        <DialogTitle className="sr-only">{t("composerTitle")}</DialogTitle>
        <AutoTextarea
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            persistDraft(e.target.value, bodyRef.current);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (title.trim()) submit();
          }}
          placeholder={t("postTitlePlaceholder")}
          maxLength={200}
          className="w-full overflow-hidden bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <MarkdownEditor
          key={editorKey}
          value={initialBody}
          onCommit={(markdown) => {
            bodyRef.current = markdown;
            persistDraft(title, markdown);
          }}
          placeholder={t("postBodyPlaceholder")}
          className="mt-3 min-h-24"
        />
        {checking && similar.length === 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            {t("similarChecking")}
          </p>
        )}
        {similar.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">{t("similarTitle")}</p>
            {similar.map((s) => (
              <Link
                key={s.id}
                href={`${basePath}/p/${s.id}`}
                onClick={() => onOpenChange(false)}
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
        {error && (
          <p className="mt-3 text-sm text-destructive">{t(`errors.${error}`)}</p>
        )}
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          <label htmlFor="feedback-make-public" className="flex min-w-0 cursor-pointer flex-col">
            <span className="text-sm font-medium">{t("makePublic")}</span>
            <span className="text-xs text-muted-foreground">
              {isPublic ? t("makePublicHint") : t("makePrivateHint")}
            </span>
          </label>
          <Switch
            id="feedback-make-public"
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 border-t pt-3">
          <p className="text-xs text-muted-foreground">{t("composerIntro")}</p>
          <Button onClick={() => title.trim() && submit()} disabled={pending || !title.trim()}>
            {pending && <Spinner />}
            {t("submitPost")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
