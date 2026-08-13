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
import { ArrowUpDown, Check, ChevronDown, ListFilter, Mic, MessagesSquare, Megaphone, Search } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { EmptyScene } from "@/components/empty-scene";
import { MarkdownEditor } from "@/components/markdown-editor";
import { NumoIcon } from "@/components/numo-icon";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { SendShortcutTooltip, isSendShortcut } from "@/components/send-shortcut";
import { HelpHint } from "@/components/settings/help-hint";
import { SidebarFilterField, matchesFilter } from "@/components/sidebar-filter-field";
import { useFeedbackDictation } from "@/lib/use-feedback-dictation";
import {
  FEEDBACK_PUBLIC_STATUSES,
  FEEDBACK_TO_ISSUE_STATUS,
  type PublicIdentity,
  type PublicPost,
  type PublicProject,
  type PublicStatusFilter,
  type SimilarPost,
} from "@/lib/feedback/types";
import { createPostAction, dictateFeedbackAction, findSimilarPostsAction } from "./actions";
import { FeedbackAuthDialog } from "./feedback-auth";
import { StatusIndicator } from "@/components/issue-indicators";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  FeedbackPostRow,
} from "./feedback-bits";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

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
  project,
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
  /** Le produit : nom (infobulles d'état) et icône (badge « L'équipe a répondu »). */
  project: PublicProject;
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
  const [search, setSearch] = useState("");
  const pendingAfterAuth = useRef<(() => void) | null>(null);

  const requireAuth = (run: () => void) => {
    if (identity) {
      run();
    } else {
      pendingAfterAuth.current = run;
      setAuthOpen(true);
    }
  };

  // La recherche travaille sur la page déjà chargée, en place et sans aller-
  // retour — le même geste que les filtres de sidebar de l'app, et la même
  // fonction de correspondance (mots, sans accents, titre ET corps).
  const query = search.trim();
  const visible = query
    ? posts.filter((post) => matchesFilter(query, [post.title, post.body]))
    : posts;

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

        <FilterBar
          basePath={basePath}
          sort={sort}
          filter={filter}
          search={search}
          onSearchChange={setSearch}
          // Un board sans le moindre retour public n'a rien à chercher : le
          // champ y promettrait une liste qui n'existe pas.
          searchable={!boardEmpty}
        />

        {visible.length === 0 ? (
          query ? (
            /* Le vide de la RECHERCHE, pas celui du filtre : il nomme les mots
               tapés, et la sortie qu'il propose est de les effacer — pas
               d'élargir le filtre, qui n'est pas ce qui vient de vider la
               liste. */
            <EmptyScene icon={Search} title={t("emptySearch", { query })}>
              <Button variant="outline" onClick={() => setSearch("")}>
                {t("emptySearchClear")}
              </Button>
            </EmptyScene>
          ) : (
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
          )
        ) : (
          <>
            {/* Des cartes, donc de l'air entre elles : le filet qui les séparait
                collait deux retours l'un à l'autre, et un fond de survol arrêté
                net sur ce filet se lisait comme une erreur de rendu. */}
            <ul className="-mx-3 flex flex-col gap-0.5">
              {visible.map((post) => (
                <FeedbackPostRow
                  key={post.id}
                  token={token}
                  href={`${basePath}/p/${post.id}`}
                  post={post}
                  project={project}
                  onNeedAuth={requireAuth}
                />
              ))}
            </ul>
            <EndOfList filter={filter} query={query} />
          </>
        )}
      </div>

      <aside className="hidden w-64 shrink-0 desktop:block">
        {/* Le bouton se CENTRE sur la bande du header, comme les déclencheurs de
            filtre s'y centrent — pas sur le haut de la colonne, ni sur le filet.
            La bande fait 24 px (`h-6`, la même que celle de FilterBar) ; le
            bouton en fait 36 (`h-9`) et déborde donc de 6 px de part et d'autre,
            symétriquement. Hauteur FIXE, sinon la boîte s'étire à la taille du
            bouton et « centrer » ne veut plus rien dire (MIN-255). */}
        <div className="flex h-6 items-center">
          <Button className="w-full" onClick={() => setComposerOpen(true)}>
            <Megaphone />
            {t("composerTitle")}
          </Button>
        </div>
      </aside>

      <ComposerDialog
        token={token}
        basePath={basePath}
        identified={!!identity}
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

/**
 * La barre de tête du board : chercher, filtrer, trier — dans cet ordre.
 *
 * L'ordre est celui de la question qu'on se pose : « est-ce que mon besoin est
 * déjà là ? » d'abord, et seulement ensuite « montre-moi ce qui est prévu » ou
 * « les plus votés ». La recherche prend la place, les deux déclencheurs se
 * rangent à droite, côte à côte, parce qu'ils font la même chose — restreindre
 * puis ordonner la même liste.
 *
 * Le champ est celui des sidebars (`SidebarFilterField`) : ni bordure ni fond,
 * la grammaire discrète des filtres de l'app. Une vraie boîte de recherche
 * bordée, en haut d'une page publique, se lirait comme la recherche du SITE.
 */
function FilterBar({
  basePath,
  sort,
  filter,
  search,
  onSearchChange,
  searchable,
}: {
  basePath: string;
  sort: "top" | "recent";
  filter: PublicStatusFilter;
  search: string;
  onSearchChange: (value: string) => void;
  searchable: boolean;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  return (
    // `min-h-6` fige la hauteur de la bande à 24 px — celle des déclencheurs de
    // filtre. C'est sur cette bande, et non sur le filet, que se centre le
    // bouton « Partager un retour » de la colonne de droite.
    <div className="flex min-h-6 items-center gap-3 border-b border-border/60 pb-3">
      {searchable ? (
        <SidebarFilterField
          value={search}
          onChange={onSearchChange}
          placeholder={t("searchPlaceholder")}
          clearLabel={t("searchClear")}
        />
      ) : (
        <span className="flex-1" />
      )}
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

/**
 * La fin de la liste, DITE.
 *
 * Un board se termine sans rien : la page s'arrête, et rien ne dit si on a tout
 * vu ou si le chargement s'est arrêté là. La ligne ferme la liste — et elle
 * nomme ce dont c'est la fin, parce que ce n'est presque jamais « tous les
 * retours » : le board s'ouvre sur les vivants, et les résolus, eux, sont
 * derrière un filtre qu'on n'a pas encore ouvert.
 */
function EndOfList({ filter, query }: { filter: PublicStatusFilter; query: string }) {
  const t = useTranslations("PublicFeedback");
  return (
    <p className="pt-2 text-center text-xs text-muted-foreground">
      {query
        ? t("endOfSearch")
        : // Clé assemblée à l'exécution (lib/i18n-keys.ts) : « all » et les
          // statuts exacts sont des clés à part entière, `null` retombe sur
          // « ouverts » comme le fait déjà l'état vide.
          t(`endOfList.${filter ?? "open"}` as MessageKey<"PublicFeedback">)}
    </p>
  );
}

// ── Composeur (dialog) ────────────────────────────────────────────────────────

function ComposerDialog({
  token,
  basePath,
  identified,
  open,
  onOpenChange,
  onNeedAuth,
}: {
  token: string;
  basePath: string;
  /** Le visiteur a passé la porte OTP — seule condition pour ouvrir le micro. */
  identified: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const tDictate = useTranslations("Dictate");
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

  // ── Dictée (MIN-37) ────────────────────────────────────────────────────────
  // Une prise = deux étapes visibles : l'écoute (le micro passe en spinner),
  // puis Numo qui range (son visage remplace le micro, et le liseré souligne le
  // modal). Le transport diffère du dashboard, la mécanique non — d'où le hook.

  const [transcribing, setTranscribing] = useState(false);

  /** Remplace le titre / le corps par ce que Numo vient d'écrire. Le corps est
      un éditeur riche : le remonter est la seule façon d'y poser du texte. */
  const applyPatch = (patch: { title?: string; body?: string }) => {
    const nextTitle = patch.title ?? title;
    const nextBody = patch.body ?? bodyRef.current;
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) {
      bodyRef.current = patch.body;
      setInitialBody(patch.body);
      setEditorKey((k) => k + 1);
    }
    persistDraft(nextTitle, nextBody);
  };

  const {
    busy: numoBusy,
    onTranscript,
    noteRun,
    reset: resetDictation,
  } = useFeedbackDictation({
    getDraft: () => ({ title, body: bodyRef.current }),
    applyPatch,
    dictate: async ({ runId, transcript, draft, history }) => {
      const result = await dictateFeedbackAction(token, {
        runId: runId ?? undefined,
        transcript,
        draft,
        history,
      });
      if (result.ok) return { ok: true, patch: result.patch, reply: result.reply };
      if (result.error === "notAuthenticated") {
        // La session a expiré entre l'écoute et le rangement : on renvoie à la
        // porte, la prise est perdue mais le texte déjà écrit reste.
        onNeedAuth(() => {});
        return { ok: false, handled: true };
      }
      if (result.error === "unavailable") {
        toast.error(tDictate("unavailable"));
        return { ok: false, handled: true };
      }
      if (result.error === "rateLimited") {
        toast.error(tDictate("rateLimitReached", { minutes: 60 }));
        return { ok: false, handled: true };
      }
      return { ok: false };
    },
  });

  /** L'écoute : la prise part au board, qui la transcrit et rend le run. */
  const uploadAudio = async (blob: Blob): Promise<string | null> => {
    const form = new FormData();
    form.append(
      "audio",
      blob,
      `feedback.${blob.type.includes("ogg") ? "ogg" : "webm"}`
    );
    const res = await fetch(`/f/${token}/voice`, { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        retry_after?: number;
      };
      if (res.status === 401) onNeedAuth(() => {});
      else if (res.status === 413) toast.error(tDictate("tooLarge"));
      else if (res.status === 422) toast.error(tDictate("emptyResult"));
      else if (res.status === 429) {
        const minutes = Math.max(1, Math.ceil((data.retry_after ?? 3600) / 60));
        toast.error(tDictate("rateLimitReached", { minutes }));
      } else if (res.status === 503) toast.error(tDictate("unavailable"));
      else toast.error(tDictate("error"));
      return null;
    }
    const data = (await res.json()) as { text?: string; runId?: string };
    noteRun(data.runId ?? null);
    return data.text ?? "";
  };

  const reset = () => {
    setTitle("");
    setIsPublic(true);
    setSimilar([]);
    setChecking(false);
    setError(null);
    bodyRef.current = "";
    setInitialBody("");
    setEditorKey((k) => k + 1);
    resetDictation();
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
        // Une dictée en vol travaille SUR ce formulaire : le transcript, puis
        // le texte de Numo, vont y atterrir. Fermer maintenant les jetterait.
        if (!next && (transcribing || numoBusy)) {
          toast.info(tDictate("inFlight"), { id: "dictation-in-flight" });
          return;
        }
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
          if (title.trim() && !pending && !numoBusy) submit();
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
            if (title.trim() && !pending && !numoBusy) submit();
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
        {/* Barre du bas : la voix à gauche, l'envoi à droite — la même que le
            modal de création de ticket, parce que c'est le même geste. Pendant
            que Numo range, son visage prend la place du micro. */}
        <div className="mt-3 flex items-center justify-between gap-4 border-t pt-3">
          {numoBusy ? (
            <span
              className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center"
              aria-hidden
            >
              <NumoIcon
                state="thinking"
                className="size-6 text-primary animate-in fade-in duration-300"
              />
            </span>
          ) : identified ? (
            /* L'infobulle dit ce que le micro FAIT, pas comment il s'appelle :
               un visiteur ne vient pas ici chercher une dictée, et « Dictée
               vocale » ne lui apprend rien. Elle promet le résultat — parler,
               et trouver le retour écrit. */
            <DictateButton
              onTranscription={onTranscript}
              uploadAudio={uploadAudio}
              onProcessingChange={setTranscribing}
              tooltipLabel={t("voiceTooltip")}
              disabled={pending}
              className="-ml-2"
            />
          ) : (
            /* Pas encore identifié : le micro EXISTE, il demande d'abord qui
               parle. Le cacher ferait apparaître un bouton de nulle part une
               fois l'email vérifié — et dicter fait dépenser l'équipe, donc on
               sait toujours qui a parlé. Même promesse en infobulle : la porte
               ne se justifie que si on sait déjà ce qu'il y a derrière. */
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onNeedAuth(() => {})}
                    aria-label={t("voiceTooltip")}
                    className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    <Mic className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("voiceTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {numoBusy && (
            <span className="sr-only" role="status">
              {tDictate("numoWorking")}
            </span>
          )}
          <SendShortcutTooltip label={t("submitPost")}>
            <Button
              onClick={() => title.trim() && submit()}
              disabled={pending || numoBusy || !title.trim()}
            >
              {pending && <Spinner />}
              {t("submitPost")}
            </Button>
          </SendShortcutTooltip>
        </div>

        {/* Numo reprend la dictée : le liseré souligne le bord du modal pendant
            qu'il travaille — même signal que son visage, plus haut. */}
        <AgentBeamOverlay active={numoBusy} />
      </DialogContent>
    </Dialog>
  );
}
