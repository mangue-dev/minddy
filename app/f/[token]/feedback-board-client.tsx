"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  Switch,
  toast,
} from "mangue-ui";
import { ArrowUpDown, Check, ChevronDown, ListFilter, MessagesSquare, Megaphone } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { EmptyScene } from "@/components/empty-scene";
import { MarkdownEditor } from "@/components/markdown-editor";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { SendShortcutTooltip, isSendShortcut } from "@/components/send-shortcut";
import { HelpHint } from "@/components/settings/help-hint";
import {
  FEEDBACK_PUBLIC_STATUSES,
  type PublicIdentity,
  type PublicPost,
  type PublicStatusFilter,
  type SimilarPost,
} from "@/lib/feedback/types";
import { createPostAction, findSimilarPostsAction } from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { StatusIndicator } from "@/components/issue-indicators";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  FEEDBACK_TO_ISSUE_STATUS,
  FeedbackPostRow,
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
  filter,
  boardEmpty,
  identity,
  ssoError,
}: {
  token: string;
  /** Préfixe public des liens : /f/<token>, ou "" sur domaine personnalisé. */
  basePath: string;
  posts: PublicPost[];
  sort: "top" | "recent";
  /** null = le défaut du board : les retours encore vivants. */
  filter: PublicStatusFilter;
  /** Aucun retour public, filtre à part — départage les deux états vides. */
  boardEmpty: boolean;
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

        <FilterBar basePath={basePath} sort={sort} filter={filter} />

        {posts.length === 0 ? (
          /* Le vide se NOMME : « aucun retour ouvert » dit à la fois ce qui
             manque et sous quel filtre on regarde, là où « rien ne correspond »
             laissait chercher lequel. Et le board par défaut ne montre que les
             retours vivants : vide ici ne veut pas dire vide tout court, c'est
             le serveur qui tranche (`boardEmpty`), pas le filtre. */
          <EmptyScene
            icon={MessagesSquare}
            title={
              boardEmpty || filter === "all"
                ? t("empty")
                : // Clé assemblée à l'exécution (lib/i18n-keys.ts).
                  t(`emptyStatus.${filter ?? "open"}` as MessageKey<"PublicFeedback">)
            }
          >
            {boardEmpty || filter === "all" ? (
              <Button onClick={() => setComposerOpen(true)}>
                <Megaphone />
                {t("composerTitle")}
              </Button>
            ) : (
              /* La sortie du filtre, sous la phrase qui vient de le nommer : le
                 combobox est une pastille de 20 px en haut de page, et c'est ici
                 qu'on se demande où sont passés les autres retours. */
              <Button variant="outline" asChild>
                <Link href={buildHref(basePath, sort, "all")}>{t("emptySeeAll")}</Link>
              </Button>
            )}
          </EmptyScene>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {posts.map((post) => (
              <FeedbackPostRow
                key={post.id}
                token={token}
                href={`${basePath}/p/${post.id}`}
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
  filter: PublicStatusFilter
): string {
  const params = new URLSearchParams();
  if (sort === "recent") params.set("sort", "recent");
  // Le défaut est l'ABSENCE de paramètre : l'URL du board reste l'URL du board.
  if (filter) params.set("status", filter);
  const query = params.toString();
  // basePath "" (domaine personnalisé) : la racine du board est "/".
  return `${basePath || "/"}${query ? `?${query}` : ""}`;
}

/**
 * Le filtre d'état, en UN déclencheur.
 *
 * C'était six pastilles en ligne, qui débordaient sur mobile et donnaient le
 * même poids visuel à « Ouvert » qu'à « Décliné » — alors que l'un est ce qu'on
 * vient voir et l'autre ce qu'on vient rarement chercher. Le même combobox
 * cherchable que le dashboard le replie : « Ouverts » d'abord, qui est le point
 * de départ et groupe les trois états vivants, les états exacts ensuite, « tous »
 * en dernier pour qui veut l'archive.
 */
function StatusFilterMenu({
  basePath,
  sort,
  filter,
}: {
  basePath: string;
  sort: "top" | "recent";
  filter: PublicStatusFilter;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const label =
    filter === null
      ? t("filterOpen")
      : filter === "all"
        ? t("filterAll")
        : t(`status.${filter}`);

  const pick = (next: PublicStatusFilter) => {
    setOpen(false);
    router.push(buildHref(basePath, sort, next));
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="start"
      searchPlaceholder={t("filterSearch")}
      trigger={
        <button
          type="button"
          className="flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ListFilter className="size-3" />
          {label}
          <ChevronDown className="size-3" />
        </button>
      }
    >
      <CommandGroup>
        {/* Les `value` de cmdk sont l'IDENTITÉ des lignes, pas une étiquette :
            le groupe « Ouverts » et le statut `open` partageaient
            « filter-open », et cmdk allumait donc les deux d'un coup. Deux
            préfixes distincts, et la question ne se repose plus. */}
        <CommandItem
          value="group-open"
          keywords={[t("filterOpen")]}
          onSelect={() => pick(null)}
          {...checkedProps(filter === null)}
        >
          <span className="truncate">{t("filterOpen")}</span>
        </CommandItem>
        {FEEDBACK_PUBLIC_STATUSES.map((value) => (
          <CommandItem
            key={value}
            value={`status-${value}`}
            keywords={[t(`status.${value}`)]}
            onSelect={() => pick(value)}
            {...checkedProps(filter === value)}
          >
            <StatusIndicator
              status={FEEDBACK_TO_ISSUE_STATUS[value]}
              className="size-4 shrink-0"
            />
            <span className="truncate">{t(`status.${value}`)}</span>
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandSeparator className="my-1" />
      <CommandGroup>
        <CommandItem
          value="filter-all"
          keywords={[t("filterAll")]}
          onSelect={() => pick("all")}
          {...checkedProps(filter === "all")}
        >
          <span className="truncate">{t("filterAll")}</span>
        </CommandItem>
      </CommandGroup>
    </SearchMenu>
  );
}

function FilterBar({
  basePath,
  sort,
  filter,
}: {
  basePath: string;
  sort: "top" | "recent";
  filter: PublicStatusFilter;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
      <StatusFilterMenu basePath={basePath} sort={sort} filter={filter} />
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
              onSelect={() => router.push(buildHref(basePath, value, filter))}
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
        // Revue avant publication (MIN-54) : un retour public passe d'abord par la
        // vérification IA (catégorisation + modération) avant d'apparaître ; un
        // retour privé part directement à l'équipe.
        toast.success(isPublic ? t("submittedPublic") : t("submittedPrivate"));
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
      {/* ⌘/Ctrl+Entrée envoie depuis N'IMPORTE QUEL champ du modal — le titre
          comme le corps. Le raccourci est posé ici plutôt que sur chaque champ
          parce que le corps est un éditeur riche : la touche y remonte par
          bouillonnement. `defaultPrevented` laisse la priorité à l'éditeur quand
          il s'en sert lui-même (sortir d'un bloc de code). */}
      <DialogContent
        className="top-24 translate-y-0 gap-0 sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.defaultPrevented || !isSendShortcut(e)) return;
          e.preventDefault();
          if (title.trim() && !pending) submit();
        }}
      >
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
          <p className="mt-3 text-sm text-destructive">
            {/* Code d'erreur serveur : clé assemblée à l'exécution. */}
            {t(`errors.${error}` as MessageKey<"PublicFeedback">)}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          {/* Le ⓘ vit HORS du <label> : dedans, l'ouvrir basculerait aussi
              l'interrupteur — lire l'explication rendrait public le retour
              qu'on hésitait justement à publier. */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="feedback-make-public"
                className="cursor-pointer text-sm font-medium"
              >
                {t("makePublic")}
              </label>
              <HelpHint>
                <span className="flex flex-col gap-2">
                  <span className="block">{t("makePublicHelpAnonymous")}</span>
                  <span className="block">{t("makePublicHelpPrivate")}</span>
                </span>
              </HelpHint>
            </div>
            <span className="text-xs text-muted-foreground">
              {isPublic ? t("makePublicHint") : t("makePrivateHint")}
            </span>
          </div>
          <Switch
            id="feedback-make-public"
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </div>
        <div className="mt-3 flex items-center justify-end gap-4 border-t pt-3">
          <SendShortcutTooltip label={t("submitPost")}>
            <Button onClick={() => title.trim() && submit()} disabled={pending || !title.trim()}>
              {pending && <Spinner />}
              {t("submitPost")}
            </Button>
          </SendShortcutTooltip>
        </div>
      </DialogContent>
    </Dialog>
  );
}
