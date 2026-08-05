"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useNow, useTranslations, useFormatter } from "next-intl";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Badge,
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  Spinner,
  SplitButton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronUp,
  Clock,
  Copy,
  GitMerge,
  Globe,
  Link2,
  Languages,
  ListFilter,
  Lock,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
// (ChevronUp sert au compteur de voix des posts)
import { EmptyState } from "@/components/empty-state";
import { EmptyScene } from "@/components/empty-scene";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { SearchMenu } from "@/components/search-menu";
import { SearchSelect, checkedProps } from "@/components/search-select";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { CategoryValue, PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { CommentComposer, IssueActivity } from "@/components/issue-timeline";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { SendShortcutTooltip, isSendShortcut } from "@/components/send-shortcut";
import { UserAvatar } from "@/components/user-avatar";
import { Markdown } from "@/components/markdown";
import { displayName } from "@/lib/display-name";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useFeedbackTimeline } from "@/lib/use-feedback-timeline";
import { useAuth } from "@/lib/auth-context";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import type { EventContext } from "@/lib/describe-event";
import type {
  AttachmentInput,
  Category,
  Issue,
  IssueRelationType,
  Member,
  Objective,
  Project,
} from "@/lib/types";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import { StatusIndicator } from "@/components/issue-indicators";
import {
  FEEDBACK_TO_ISSUE_STATUS,
  FeedbackStatusBadge,
} from "@/app/f/[token]/feedback-bits";
import { useProjects } from "@/lib/projects-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { defaultLocale } from "@/i18n/config";
import {
  languageLabel,
  normalizeLanguage,
  type FeedbackLanguage,
} from "@/lib/feedback/languages";
import {
  FEEDBACK_POST_STATUSES,
  isResolvedFeedbackStatus,
  type FeedbackPostStatus,
  type FeedbackReviewState,
} from "@/lib/feedback/types";
import type { MessageKey } from "@/lib/i18n-keys";
import type {
  TeamFeedbackDetail,
  TeamFeedbackListItem,
} from "@/lib/server/feedback/team-queries";
import type { TeamFeedbackUserOption } from "@/app/api/projects/[id]/feedback/users/route";
import { trackEvent } from "@/lib/analytics";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";

/**
 * Onglet équipe des retours (MIN-37) — deux panneaux façon triage : liste
 * filtrable (vraies identités, indicateur de suggestion IA), détail avec
 * édition de la couche canonique (le brut reste visible), merge 1-clic + undo,
 * file de suggestions, réponse d'équipe, promotion en issue et saisie interne
 * au nom d'un utilisateur.
 *
 * Deux règles gouvernent ce que l'écran montre :
 *
 * - **Tout ce qui se décide sur un retour se lit au même endroit** — la table
 *   clé/valeur, comme sur un ticket : statut, type, visibilité, auteur,
 *   catégories. Le haut de page ne garde que ce qu'on FAIT (promouvoir,
 *   refuser), pas ce que le retour EST.
 * - **Sans board public, la moitié de ces commandes n'a plus d'objet** : pas de
 *   voix à compter, pas de public/privé à trancher. Elles disparaissent au lieu
 *   de proposer des gestes qui ne mènent nulle part (`boardEnabled`).
 */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || "error");
  return data as T;
}

/** Chrome d'un badge qui OUVRE quelque chose (statut, visibilité) : le badge
    porte déjà sa forme, le déclencheur ne fait qu'annoncer qu'on peut cliquer. */
const BADGE_TRIGGER =
  "rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80";

/** Le badge tel qu'il tient dans une LIGNE de la colonne — même gabarit que sur
    la liste des pull requests, d'où ces trois valeurs. L'icône descend à 12 px
    avec lui : à sa taille de détail elle remplissait toute la hauteur du badge. */
const LIST_BADGE = "h-5 px-2 text-[10px] [&>svg]:size-3";

// ── Filtres de la colonne ────────────────────────────────────────────────────

/**
 * L'état filtré. `unresolved` n'est pas un statut : c'est « tout ce qui n'est
 * pas tranché » — le point de départ, et le pendant exact du filtre « ouvertes »
 * des pull requests, qui exclut lui aussi fusionnées et fermées.
 */
type FeedbackStateFilter = "unresolved" | FeedbackPostStatus | "all";

/** L'ordre de la colonne. `top` (les plus soutenus d'abord) est celui du
    serveur et du board public ; les deux autres sont chronologiques. */
type FeedbackSort = "top" | "recent" | "oldest";

const SORTS: ReadonlyArray<{
  value: FeedbackSort;
  label: MessageKey<"FeedbackBoard">;
}> = [
  { value: "top", label: "sortTop" },
  { value: "recent", label: "sortRecent" },
  { value: "oldest", label: "sortOldest" },
];

function matchesStateFilter(post: TeamFeedbackListItem, filter: FeedbackStateFilter) {
  if (filter === "all") return true;
  if (filter === "unresolved") return !isResolvedFeedbackStatus(post.status);
  return post.status === filter;
}

/**
 * Le filtre de la colonne : UN déclencheur pour trois dimensions — l'état, le
 * tri, et ce qui reste à trancher. Le même combobox que les pull requests, pour
 * la même raison : sur la ligne de titre il ne reste la place que d'une icône,
 * et ce que le libellé disait passe dans le tooltip. Une pastille signale de
 * loin qu'un filtre est posé — sans elle, une liste restreinte n'aurait plus
 * rien pour le dire.
 */
function FeedbackFilterMenu({
  state,
  sort,
  onlyToReview,
  toReviewCount,
  onStateChange,
  onSortChange,
  onToReviewChange,
}: {
  state: FeedbackStateFilter;
  sort: FeedbackSort;
  onlyToReview: boolean;
  toReviewCount: number;
  onStateChange: (state: FeedbackStateFilter) => void;
  onSortChange: (sort: FeedbackSort) => void;
  onToReviewChange: (only: boolean) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tStatus = useTranslations("PublicFeedback");
  const [open, setOpen] = useState(false);

  const stateLabel =
    state === "unresolved"
      ? t("filterUnresolved")
      : state === "all"
        ? t("filterAll")
        : tStatus(`status.${state}`);
  // « Ouverts, par popularité, tout » est le point de départ : rien à signaler.
  const active = state !== "unresolved" || sort !== "top" || onlyToReview;
  const tooltip = t("filterTooltip", { state: stateLabel });

  const pick = (run: () => void) => {
    run();
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      tooltip={tooltip}
      trigger={
        /* `-mr-2` compense le padding du bouton : l'icône s'aligne alors sur le
           bord droit des lignes de la liste, pas 8 px en-deçà. */
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-2 text-muted-foreground hover:text-foreground"
          aria-label={tooltip}
        >
          <span className="relative flex items-center justify-center">
            <ListFilter className="size-4" />
            {active ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar"
              />
            ) : null}
          </span>
        </Button>
      }
    >
      <CommandGroup heading={t("filterStateLabel")}>
        <CommandItem
          value="state-unresolved"
          keywords={[t("filterUnresolved")]}
          onSelect={() => pick(() => onStateChange("unresolved"))}
          {...checkedProps(state === "unresolved")}
        >
          <span className="truncate">{t("filterUnresolved")}</span>
        </CommandItem>
        {FEEDBACK_POST_STATUSES.map((value) => (
          <CommandItem
            key={value}
            value={`state-${value}`}
            keywords={[tStatus(`status.${value}`)]}
            onSelect={() => pick(() => onStateChange(value))}
            {...checkedProps(state === value)}
          >
            {value === "spam" ? (
              <Ban className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <StatusIndicator
                status={FEEDBACK_TO_ISSUE_STATUS[value]}
                className="size-4 shrink-0"
              />
            )}
            <span className="truncate">{tStatus(`status.${value}`)}</span>
          </CommandItem>
        ))}
        <CommandItem
          value="state-all"
          keywords={[t("filterAll")]}
          onSelect={() => pick(() => onStateChange("all"))}
          {...checkedProps(state === "all")}
        >
          <span className="truncate">{t("filterAll")}</span>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator className="my-1" />
      <CommandGroup heading={t("filterSortLabel")}>
        {SORTS.map((option) => (
          <CommandItem
            key={option.value}
            value={`sort-${option.value}`}
            keywords={[t(option.label)]}
            onSelect={() => pick(() => onSortChange(option.value))}
            {...checkedProps(sort === option.value)}
          >
            <span className="truncate">{t(option.label)}</span>
          </CommandItem>
        ))}
      </CommandGroup>

      {/* « À revoir » (MIN-87) : ce que la revue automatique n'a pas tranché est
          noyé dans une liste triée par votes. L'entrée n'apparaît que s'il y a
          matière — pas de ligne morte. */}
      {toReviewCount > 0 ? (
        <>
          <CommandSeparator className="my-1" />
          <CommandGroup>
            <CommandItem
              value="to-review"
              keywords={[t("filterToReview")]}
              onSelect={() => pick(() => onToReviewChange(!onlyToReview))}
              {...checkedProps(onlyToReview)}
            >
              <span className="truncate">{t("filterToReview")}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {toReviewCount}
              </span>
            </CommandItem>
          </CommandGroup>
        </>
      ) : null}
    </SearchMenu>
  );
}

// ── Briques partagées liste / détail ─────────────────────────────────────────

/** Résumé compact des catégories d'un retour dans la colonne — pastille + 1er
    nom + « +N » pour le reste (MIN-52). Du TEXTE, et non des badges : à côté du
    statut et de l'auteur, trois pastilles de plus faisaient une ligne de
    confettis où l'on ne lisait plus rien. */
function CategorySummary({
  categoryIds,
  categoryMap,
}: {
  categoryIds: string[];
  categoryMap: Map<string, Category>;
}) {
  const cats = categoryIds
    .map((id) => categoryMap.get(id))
    .filter((c): c is Category => !!c);
  if (cats.length === 0) return null;
  const [first, ...rest] = cats;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: first.color }}
        aria-hidden
      />
      <span className="max-w-[7rem] truncate">{first.name}</span>
      {rest.length > 0 && <span className="shrink-0">+{rest.length}</span>}
    </span>
  );
}

/** Compteur de voix d'un retour. Absent quand le board public est éteint : sans
    lui, personne ne peut voter, et un « 0 » permanent serait un reproche. */
function VoteCount({
  count,
  size = "sm",
  className,
}: {
  count: number;
  /**
   * `sm` pour la tête de ligne de la colonne, au gabarit des badges de liste.
   * `md` dans la fiche, où il ouvre la table clé/valeur : il y voisinait des
   * badges de 28 px avec ses 20, et le chiffre le plus important du retour
   * était le plus petit de l'écran.
   */
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border font-semibold tabular-nums text-muted-foreground",
        size === "md" ? "h-7 gap-1.5 px-3 text-xs" : "gap-1 px-1.5 py-0.5 text-xs",
        className
      )}
    >
      <ChevronUp className={size === "md" ? "size-3.5" : "size-3"} />
      {count}
    </span>
  );
}

/**
 * Public ou privé, dit par sa couleur autant que par son mot : bleu pour ce qui
 * est exposé, orangé pour ce qui reste à l'équipe. Ce sont les deux moitiés
 * d'une même question, donc les deux se montrent — un badge présent d'un côté
 * et absent de l'autre se lit comme un oubli, pas comme un état.
 */
function VisibilityBadge({
  isPublic,
  className,
}: {
  isPublic: boolean;
  className?: string;
}) {
  const t = useTranslations("FeedbackBoard");
  return (
    <Badge
      variant="secondary"
      icon={isPublic ? <Globe /> : <Lock />}
      className={cn(
        isPublic
          ? "border-sky-700/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-400"
          : "border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
        className
      )}
    >
      {isPublic ? t("public") : t("private")}
    </Badge>
  );
}

/**
 * Un retour qui réclame une décision humaine (MIN-87) : pas encore publié, ou
 * publié mais signalé sensible. C'est la matière du filtre « À revoir » — sans
 * lui, un post que la revue automatique n'a pas su trancher reste invisible.
 */
function needsHumanReview(post: TeamFeedbackListItem): boolean {
  return post.review_state !== "published" || post.sensitivity !== null;
}

/** La revue automatique a abandonné (3 échecs) : à trancher à la main (MIN-87). */
function reviewGaveUp(post: {
  analysis_failures: number;
  classified_at: string | null;
}): boolean {
  return post.analysis_failures >= 3 && post.classified_at === null;
}

/**
 * Badges d'état de revue IA (MIN-54) : en attente de publication, et alerte
 * contenu sensible (le motif est en tooltip). Partagé liste + détail.
 *
 * Le rejet n'y est plus : il est devenu le statut `spam`, et se lit donc avec
 * les autres statuts, là où l'équipe lit toutes ses décisions.
 */
function ReviewBadges({
  reviewState,
  sensitivity,
  moderationReason,
  reviewFailed,
  className,
}: {
  reviewState: FeedbackReviewState;
  sensitivity: string | null;
  moderationReason: string | null;
  reviewFailed?: boolean;
  /** Gabarit du badge — resserré dans la colonne, pleine taille au détail. */
  className?: string;
}) {
  const t = useTranslations("FeedbackBoard");
  return (
    <>
      {reviewState === "pending" && (
        <Badge variant="secondary" icon={<Clock />} className={className}>
          {t("reviewPending")}
        </Badge>
      )}
      {reviewFailed && (
        <Badge
          variant="secondary"
          icon={<TriangleAlert />}
          title={t("reviewFailedHint")}
          className={cn("text-muted-foreground", className)}
        >
          {t("reviewFailed")}
        </Badge>
      )}
      {sensitivity && (
        <Badge
          variant="secondary"
          icon={<ShieldAlert />}
          title={moderationReason ?? undefined}
          className={cn(
            "border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
            className
          )}
        >
          {t("sensitive")}
        </Badge>
      )}
    </>
  );
}

/**
 * L'auteur d'un retour, tel qu'on le nomme partout : son nom si on le connaît,
 * sinon son email — jamais les deux collés, qui donnaient une ligne à rallonge
 * dont on ne lisait ni l'un ni l'autre. L'email reste à un survol, et se copie :
 * c'est le canal de recontact, la seule chose qu'on vient chercher ici.
 */
function AuthorValue({
  name,
  email,
  pseudonym,
  seed,
}: {
  name: string | null;
  email: string | null;
  pseudonym: string | null;
  /** Graine d'avatar résolue par `authorAvatarSeed`. */
  seed: string;
}) {
  const t = useTranslations("FeedbackBoard");
  const [copied, setCopied] = useState(false);
  const label = name?.trim() || email?.trim() || pseudonym || "";

  const copy = () => {
    if (!email) return;
    void navigator.clipboard
      .writeText(email)
      .then(() => {
        // La coche dans l'infobulle et le toast disent la même chose deux fois,
        // et c'est voulu : l'infobulle disparaît dès qu'on écarte la souris —
        // souvent le geste même qui suit la copie — et emporterait sa preuve.
        setCopied(true);
        toast.success(t("emailCopied"));
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error(t("errorGeneric")));
  };

  const identity = (
    <span className="flex min-w-0 items-center gap-1.5">
      <UserAvatar seed={seed} className="size-5" />
      <span className="min-w-0 truncate text-sm">{label}</span>
    </span>
  );

  // Sans email il n'y a rien à révéler au survol : le nom se suffit.
  if (!email) return identity;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t("emailCopied") : t("copyEmail")}
          className="-mr-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
        >
          {identity}
        </button>
      </TooltipTrigger>
      {/* L'email, et le geste en icône — « Copier l'email » écrit en toutes
          lettres à côté de l'adresse doublait la largeur de l'infobulle pour
          répéter ce qu'une paire de feuillets dit déjà. La coche qui remplace
          l'icône est l'accusé de réception ; le mot reste, mais en
          `aria-label`, pour qui ne voit pas l'icône. */}
      <TooltipContent className="flex items-center gap-2">
        {email}
        {copied ? (
          <Check className="size-3.5 shrink-0" />
        ) : (
          <Copy className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Ligne de la colonne ──────────────────────────────────────────────────────

/**
 * Un retour dans la liste — le gabarit des pull requests, garni de ce qu'un
 * retour a de propre : à la place de l'identifiant, le nombre de voix (c'est ce
 * qui trie la liste et ce qu'on vient y comparer) ; à droite, l'état et la date
 * en « il y a… », parce qu'un retour se juge à sa fraîcheur plus qu'à son jour.
 */
function FeedbackRow({
  post,
  selected,
  boardEnabled,
  dateLabel,
  categoryMap,
  memberSeeds,
  teamLanguage,
  onSelect,
}: {
  post: TeamFeedbackListItem;
  selected: boolean;
  boardEnabled: boolean;
  dateLabel: string;
  categoryMap: Map<string, Category>;
  /** Email → graine d'avatar des membres (cf. `authorAvatarSeed`). */
  memberSeeds: Map<string, string>;
  /** Langue de l'équipe — décide si la traduction stockée vaut encore. */
  teamLanguage: FeedbackLanguage;
  onSelect: () => void;
}) {
  // La colonne se lit dans la langue de l'équipe : un titre qu'on ne comprend
  // pas ne sert à rien pour choisir quoi ouvrir. C'est le seul endroit où la
  // traduction s'impose sans bascule — il n'y a pas la place pour une.
  const title =
    (normalizeLanguage(post.translated_language) === teamLanguage
      ? post.translated_title
      : null) ?? post.title;
  const authorLabel = post.author?.name?.trim() || post.author?.email?.trim() || null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60"
      )}
    >
      <div className="flex items-center gap-2">
        {/* UNE case en tête de ligne, et les deux choses qui peuvent l'occuper
            ne coexistent jamais : le soutien d'un retour public, ou le fait
            qu'il soit privé. Un retour privé n'a pas de voix à montrer —
            personne ne peut lui en donner — et c'est ce qu'il faut lire à sa
            place. Sans board publié, ni l'un ni l'autre n'a de sens. */}
        {boardEnabled ? (
          post.is_public ? (
            <VoteCount count={post.vote_count} />
          ) : (
            <VisibilityBadge isPublic={false} className={LIST_BADGE} />
          )
        ) : null}
        {post.issue_id ? (
          <Link2 className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        {post.suggested_merge_into_id ? (
          <Sparkles className="size-3 shrink-0 text-brand" aria-hidden />
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <FeedbackStatusBadge status={post.status} className={LIST_BADGE} />
          <span className="text-xs text-muted-foreground">{dateLabel}</span>
        </span>
      </div>

      <span className="line-clamp-2 text-sm font-medium leading-snug">{title}</span>

      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {authorLabel ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <UserAvatar
              seed={authorAvatarSeed(post.author, memberSeeds)}
              className="size-3.5"
            />
            <span className="max-w-[9rem] truncate">{authorLabel}</span>
          </span>
        ) : null}
        <ReviewBadges
          reviewState={post.review_state}
          sensitivity={post.sensitivity}
          moderationReason={post.moderation_reason}
          reviewFailed={reviewGaveUp(post)}
          className={LIST_BADGE}
        />
        <CategorySummary categoryIds={post.category_ids} categoryMap={categoryMap} />
      </span>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function FeedbackTeamPage() {
  const t = useTranslations("FeedbackBoard");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const now = useNow();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const searchParams = useSearchParams();
  const postParam = searchParams.get("post");
  const router = useRouter();
  const pathname = usePathname();
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const queryClient = useQueryClient();

  const { data: listData, isPending } = useQuery({
    queryKey: ["feedback", projectId],
    queryFn: () =>
      api<{ posts: TeamFeedbackListItem[]; board_enabled: boolean }>(
        `/api/projects/${projectId}/feedback`
      ),
  });
  const posts = useMemo(() => listData?.posts ?? [], [listData]);
  const boardEnabled = listData?.board_enabled ?? false;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");

  // On arrive sur cette page pour trancher ce qui n'est pas tranché : la
  // colonne s'ouvre donc sur les retours ouverts, et non sur les centaines
  // d'archivés qui les enterraient.
  const [state, setState] = useState<FeedbackStateFilter>("unresolved");
  const [sort, setSort] = useState<FeedbackSort>("top");
  const [onlyToReview, setOnlyToReview] = useState(false);
  const toReviewCount = useMemo(() => posts.filter(needsHumanReview).length, [posts]);
  useEffect(() => {
    if (toReviewCount === 0 && onlyToReview) setOnlyToReview(false);
  }, [toReviewCount, onlyToReview]);

  const visiblePosts = useMemo(() => {
    const kept = posts.filter(
      (p) => matchesStateFilter(p, state) && (!onlyToReview || needsHumanReview(p))
    );
    /**
     * Le tri choisi est le tri obtenu — RIEN ne passe devant.
     *
     * La liste arrivait déjà ordonnée par le serveur : voix décroissantes, puis
     * date, et surtout les retours résolus repoussés en bas. Cette dernière
     * règle datait d'avant le sélecteur de tri, où elle rendait service. Depuis
     * qu'on peut demander « les plus populaires », elle ment : le retour le plus
     * soutenu du projet, s'il est livré, se retrouve au fond de la liste, et
     * c'est le plus RÉCENT qui s'affiche en tête. Un ordre qu'on a demandé
     * explicitement ne se laisse pas corriger par une heuristique.
     */
    const sorted = [...kept];
    if (sort === "top") {
      sorted.sort(
        (a, b) =>
          b.vote_count - a.vote_count ||
          Date.parse(b.created_at) - Date.parse(a.created_at)
      );
    } else {
      sorted.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      if (sort === "recent") sorted.reverse();
    }
    return sorted;
  }, [posts, state, onlyToReview, sort]);

  /**
   * Ce que la colonne AFFICHE. Un cran EN DESSOUS de `visiblePosts`, qui porte la
   * sélection : le filtre texte ne doit pas la déplacer, sinon chaque frappe
   * ferait changer le retour ouvert à droite — alors qu'on filtre justement pour
   * aller en chercher un autre, et le choisir soi-même.
   *
   * Le texte SOUMIS est cherché autant que le texte canonique : c'est souvent
   * avec les mots de l'auteur qu'on se souvient d'un retour, pas avec le titre
   * réécrit par l'équipe.
   */
  const listedPosts = useMemo(() => {
    if (!query.trim()) return visiblePosts;
    return visiblePosts.filter((p) =>
      matchesFilter(query, [
        p.title,
        p.body,
        p.submitted_title,
        p.submitted_body,
        // On cherche un retour avec les mots qu'on a LUS : le titre traduit est
        // celui que la colonne affiche, il doit donc répondre à la frappe.
        p.translated_title,
        p.translated_body,
        p.author?.name,
        p.author?.email,
        p.author?.pseudonym,
      ])
    );
  }, [visiblePosts, query]);

  // Side panel d'issue : le ticket lié s'ouvre ICI, sans navigation — même
  // câblage que le board (issues + relations + collections du projet).
  const { issues, createIssue, updateIssue, deleteIssue, setCategories } =
    useIssuesQuery(projectId);
  const { relations, addRelation, removeRelation } = useIssueRelationsQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const memberSeeds = useMemberSeeds(members);
  const teamLanguage =
    normalizeLanguage(project?.feedback_team_language) ??
    (normalizeLanguage(defaultLocale) as FeedbackLanguage);

  // Publie le retour sélectionné à Numo (MIN-52) : il résout « ce feedback »,
  // « promeus-le », « réponds-lui » sur ce post sans le chercher — comme le
  // panneau d'issue publie l'issue ouverte.
  const selectedPost = posts.find((p) => p.id === selectedId) ?? null;
  useAssistantContext(
    project
      ? selectedPost
        ? { projectId, feedbackId: selectedPost.id, feedbackTitle: selectedPost.title }
        : { projectId }
      : null
  );
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const openIssue: Issue | null = issues.find((i) => i.id === openIssueId) ?? null;
  const handleAddRelation = useCallback(
    (sourceId: string, type: IssueRelationType, targetId: string) => {
      void addRelation(sourceId, type, targetId).catch((err) =>
        toast.error((err as Error).message)
      );
    },
    [addRelation]
  );
  const handleRemoveRelation = useCallback(
    (relationId: string) => {
      void removeRelation(relationId).catch((err) => toast.error((err as Error).message));
    },
    [removeRelation]
  );

  useEffect(() => {
    if (visiblePosts.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !visiblePosts.some((p) => p.id === selectedId)) {
      setSelectedId(visiblePosts[0].id);
    }
  }, [visiblePosts, selectedId]);

  // Deep link from an Inbox notification: ?post=<id> selects that feedback and
  // opens the detail on mobile, then strips the param so a background list
  // refetch can't snap the selection back (same idiom as the objectives ?open).
  //
  // Le filtre repasse à « tous » : le retour visé peut être livré, décliné ou
  // écarté, et le lien doit l'ouvrir quel que soit son état.
  useEffect(() => {
    if (postParam) {
      setState("all");
      setOnlyToReview(false);
      setSelectedId(postParam);
      setMobileDetail(true);
      router.replace(pathname);
    }
  }, [postParam, pathname, router]);

  // Invalide la liste ET tous les détails du projet (préfixe) : un merge/undo
  // change aussi le post canonique, pas seulement celui qu'on regarde. Le
  // badge de la sidebar suit aussi (compteur ouverts/prévus).
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["feedback", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-count", projectId] });
  };

  const createDialog = (
    <InternalFeedbackDialog
      projectId={projectId}
      members={members}
      boardEnabled={boardEnabled}
      open={createOpen}
      onOpenChange={setCreateOpen}
      onCreated={(postId) => {
        refresh();
        // Un retour tout juste saisi est ouvert : il tombe dans le filtre par
        // défaut. Mais si la colonne est ailleurs, l'ouvrir sans l'y ramener
        // sélectionnerait un post que la liste ne montre pas.
        setState("all");
        setSelectedId(postId);
      }}
    />
  );

  // Rien du tout (pas « rien dans ce filtre ») : les deux colonnes n'ont plus
  // rien à montrer, et l'écran doit dire d'où viennent les retours plutôt que
  // d'afficher une liste vide à côté d'un « sélectionnez un retour ». Les deux
  // gestes restent à portée : en saisir un à la main, et aller régler la
  // collecte — c'est elle qui remplit la page ensuite.
  if (!isPending && posts.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-5xl">
              <EmptyScene icon={MessagesSquare} title={t("emptyTitle")}>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus />
                  {t("newFeedback")}
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/projects/${projectId}/settings?tab=feedback`}>
                    <Globe />
                    {t("emptyConfigure")}
                  </Link>
                </Button>
              </EmptyScene>
            </div>
          </div>
        </div>

        {/* Le dialog reste monté : c'est lui que « Nouveau retour » ouvre. */}
        {createDialog}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Liste ────────────────────────────────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: listedPosts.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          <>
            <FeedbackFilterMenu
              state={state}
              sort={sort}
              onlyToReview={onlyToReview}
              toReviewCount={toReviewCount}
              onStateChange={setState}
              onSortChange={setSort}
              onToReviewChange={setOnlyToReview}
            />
            {/* Icône seule : le libellé complet mangeait la moitié de la ligne.
                Ce qu'il disait revient au survol — un vrai tooltip, celui de
                l'app, et non l'infobulle du navigateur. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-2 text-muted-foreground hover:text-foreground"
                  aria-label={t("newFeedback")}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("newFeedback")}</TooltipContent>
            </Tooltip>
          </>
        }
      >
        <div className="min-h-0 flex-1">
          {isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : listedPosts.length === 0 ? (
            /* Des retours existent forcément ici — la surface entièrement vide
               est traitée plus haut. La liste ne peut donc être vide que parce
               qu'un filtre l'a vidée, et la même scène que les autres états
               vides le dit, à la taille de la colonne.
               « Rien ne correspond » et « aucun retour ouvert » ne sont pas la
               même nouvelle : la première se répare en effaçant trois lettres,
               la seconde demande de rouvrir le filtre — d'où le bouton, qui n'a
               rien à offrir tant que c'est la saisie qui restreint. */
            <EmptyScene
              size="compact"
              icon={MessagesSquare}
              /* La colonne vide NOMME ce qu'on cherchait. « Aucun retour dans
                 ce filtre » renvoyait rouvrir le menu pour se rappeler lequel
                 était posé — alors que la réponse tient dans la phrase.
                 L'ordre compte : une saisie qui ne matche rien se répare en
                 effaçant trois lettres, et c'est cette nouvelle-là qui prime
                 sur l'état, quel qu'il soit. */
              title={
                query.trim()
                  ? tCommon("noFilterMatch")
                  : onlyToReview
                    ? t("emptyToReview")
                    : state === "unresolved"
                      ? t("emptyUnresolved")
                      : state === "all"
                        ? t("emptyFiltered")
                        : // Clé assemblée à l'exécution : elle échappe au typage
                          // des clés, d'où le cast (cf. CLAUDE.md).
                          t(`emptyStatus.${state}` as MessageKey<"FeedbackBoard">)
              }
              className="py-10"
            >
              {query.trim() ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setState("all");
                    setOnlyToReview(false);
                  }}
                >
                  {t("emptyShowAll")}
                </Button>
              )}
            </EmptyScene>
          ) : (
            /* La MÊME ligne que le triage, les agents et les pull requests :
               une pastille arrondie dans une gouttière de 8 px, et non un bandeau
               pleine largeur. Quatre listes qui se ressemblent doivent se
               ressembler jusque dans la forme de leur sélection. */
            <ul className="flex flex-col gap-1 px-2 pt-2 pb-4">
              {listedPosts.map((post) => (
                <li key={post.id}>
                  <FeedbackRow
                    post={post}
                    selected={selectedId === post.id}
                    boardEnabled={boardEnabled}
                    dateLabel={format.relativeTime(new Date(post.created_at), now)}
                    categoryMap={categoryMap}
                    memberSeeds={memberSeeds}
                    teamLanguage={teamLanguage}
                    onSelect={() => {
                      setSelectedId(post.id);
                      setMobileDetail(true);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SecondarySidebar>

      {/* ── Détail ──────────────────────────────────────────────────────── */}
      <div className={cn("min-w-0 flex-1", !mobileDetail && "hidden md:block")}>
        {selectedId ? (
          <FeedbackDetail
            key={selectedId}
            projectId={projectId}
            project={project ?? null}
            projectName={project?.name ?? ""}
            projectKey={project?.key ?? ""}
            postId={selectedId}
            boardEnabled={boardEnabled}
            allPosts={posts}
            members={members}
            categories={categories}
            objectives={objectives}
            issues={issues}
            onBack={() => setMobileDetail(false)}
            onChanged={refresh}
            onOpenIssue={setOpenIssueId}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">{t("selectPost")}</p>
          </div>
        )}
      </div>

      {createDialog}

      <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={(next) => {
          if (!next) setOpenIssueId(null);
        }}
        projectKey={project?.key ?? ""}
        members={members}
        categories={categories}
        objectives={objectives}
        allIssues={issues}
        relations={relations}
        onUpdate={updateIssue}
        onDelete={async (issueId) => {
          await deleteIssue(issueId);
          setOpenIssueId(null);
          refresh();
        }}
        onSetCategories={setCategories}
        onCreate={createIssue}
        onOpenIssue={setOpenIssueId}
        onAddRelation={handleAddRelation}
        onRemoveRelation={handleRemoveRelation}
      />
    </div>
  );
}

// ── Détail ──────────────────────────────────────────────────────────────────

function FeedbackDetail({
  projectId,
  project,
  projectName,
  projectKey,
  postId,
  boardEnabled,
  allPosts,
  members,
  categories,
  objectives,
  issues,
  onBack,
  onChanged,
  onOpenIssue,
}: {
  projectId: string;
  /** Le projet lui-même — le formulaire de promotion en a besoin. */
  project: Project | null;
  projectName: string;
  projectKey: string;
  postId: string;
  /** Board public publié : sans lui, ni voix ni choix public/privé. */
  boardEnabled: boolean;
  allPosts: TeamFeedbackListItem[];
  /** Project members + issues — resolve actor names and issue refs in the feed. */
  members: Member[];
  /** Catégories du projet (celles des issues) — réutilisées ici (MIN-52). */
  categories: Category[];
  /** Objectifs du projet — le sélecteur du formulaire de promotion. */
  objectives: Objective[];
  issues: Issue[];
  onBack: () => void;
  onChanged: () => void;
  /** Ouvre le side panel d'issue directement (pas de navigation). */
  onOpenIssue: (issueId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tStatus = useTranslations("PublicFeedback");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const memberSeeds = useMemberSeeds(members);
  // La langue vers laquelle la revue traduit. NULL en base = jamais renseignée
  // (projet d'avant la migration) : même repli que côté serveur, pour que les
  // deux jugent une traduction valide sur le même critère.
  const teamLanguage =
    normalizeLanguage(project?.feedback_team_language) ??
    (normalizeLanguage(defaultLocale) as FeedbackLanguage);
  const {
    items: activityItems,
    addComment,
    updateComment,
    deleteComment,
    deleteAttachment,
  } = useFeedbackTimeline(projectId, postId);

  // IssueActivity is generic — the feedback thread wires the same handlers as
  // the issue/objective panels (onReply flips the arg order of addComment).
  const handleReply = useCallback(
    (
      parentId: string,
      body: string,
      mentionedUserIds: string[],
      attachments: AttachmentInput[]
    ) => addComment(body, mentionedUserIds, parentId, attachments),
    [addComment]
  );
  const handleComment = useCallback(
    (body: string, mentionedUserIds: string[], attachments: AttachmentInput[]) =>
      addComment(body, mentionedUserIds, null, attachments),
    [addComment]
  );

  // describeFeedbackEvent reads members (actors) + issues/projectKey (refs);
  // objectives/categories are unused for feedback.
  const eventCtx = useMemo<EventContext>(
    () => ({ members, objectives: [], categories: [], issues, projectKey }),
    [members, issues, projectKey]
  );

  const { data, isPending } = useQuery({
    queryKey: ["feedback-detail", projectId, postId],
    queryFn: () =>
      api<{ post: TeamFeedbackDetail }>(`/api/projects/${projectId}/feedback/${postId}`),
  });
  const post = data?.post ?? null;

  const [title, setTitle] = useState("");
  const [response, setResponse] = useState("");
  const [respondEditing, setRespondEditing] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Traduit, le retour s'ouvre sur sa traduction : c'est la version que
  // l'équipe peut lire. La bascule est par retour et repart à zéro en changeant
  // de retour (`key={selectedId}` remonte tout le détail).
  const [showTranslated, setShowTranslated] = useState(true);

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setResponse(post.team_response ?? "");
      setRespondEditing(false);
    }
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
    // Le fil d'activité n'a pas de realtime : chaque action le rafraîchit.
    void queryClient.invalidateQueries({ queryKey: ["feedback-events", projectId] });
    onChanged();
  };

  const patch = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      api(`/api/projects/${projectId}/feedback/${postId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: refreshDetail,
    onError: (e: Error) => toast.error(e.message || t("errorGeneric")),
  });

  // Publier la réponse d'équipe. Le bouton du bas et le ⌘/Ctrl+Entrée du champ
  // passent par le même geste et la même garde : la touche ne doit pas pouvoir
  // envoyer ce que le bouton refuse.
  const respondDisabled =
    patch.isPending || response.trim() === (post?.team_response ?? "");
  const publishResponse = () =>
    patch.mutate(
      { team_response: response },
      { onSuccess: () => setRespondEditing(false) },
    );

  const action = useMutation({
    mutationFn: ({ path, body: payload }: { path: string; body?: unknown }) =>
      api(`/api/projects/${projectId}/feedback/${path}`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      }),
    onSuccess: (_data, variables) => {
      // Toutes les actions d'équipe (promouvoir, fusionner, annuler une
      // fusion…) passent par cette mutation : le dernier segment du chemin EST
      // le nom de l'action. Un seul point d'instrumentation plutôt qu'un par
      // bouton, et les actions futures sont couvertes d'office.
      const verb = variables.path.split("/").filter(Boolean).pop() ?? "unknown";
      trackEvent("feedback_action", { action: verb });
      return refreshDetail();
    },
    onError: (e: Error) => toast.error(e.message || t("errorGeneric")),
  });

  // Catégories du post (MIN-52) : optimiste + debounce 300 ms, comme les cartes
  // d'issue. Des toggles rapides patchent le cache tout de suite et fusionnent en
  // un seul PUT du jeu final (évite le delete-then-insert concurrent sur la
  // table de jonction). Erreur → toast + refetch autoritatif.
  const catTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catLatest = useRef<string[] | null>(null);
  const flushCategories = useCallback(
    (ids: string[]) =>
      api(`/api/projects/${projectId}/feedback/${postId}/categories`, {
        method: "PUT",
        body: JSON.stringify({ category_ids: ids }),
      }),
    [projectId, postId]
  );
  const handleCategoriesChange = useCallback(
    (ids: string[]) => {
      queryClient.setQueryData<{ post: TeamFeedbackDetail }>(
        ["feedback-detail", projectId, postId],
        (old) => (old ? { post: { ...old.post, category_ids: ids } } : old)
      );
      queryClient.setQueryData<{ posts: TeamFeedbackListItem[]; board_enabled: boolean }>(
        ["feedback", projectId],
        (old) =>
          old
            ? {
                ...old,
                posts: old.posts.map((p) =>
                  p.id === postId ? { ...p, category_ids: ids } : p
                ),
              }
            : old
      );
      catLatest.current = ids;
      if (catTimer.current) clearTimeout(catTimer.current);
      catTimer.current = setTimeout(() => {
        catTimer.current = null;
        const finalIds = catLatest.current ?? ids;
        catLatest.current = null;
        void flushCategories(finalIds).catch((e: Error) => {
          toast.error(e.message || t("errorGeneric"));
          void queryClient.invalidateQueries({ queryKey: ["feedback", projectId] });
          void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
        });
      }, 300);
    },
    [projectId, postId, queryClient, flushCategories, t]
  );
  // Quitter le détail avant la fin du debounce ne doit pas perdre l'édition :
  // on flush l'écriture en attente à l'unmount (le patch optimiste est déjà posé).
  useEffect(() => {
    return () => {
      if (!catTimer.current) return;
      clearTimeout(catTimer.current);
      catTimer.current = null;
      const ids = catLatest.current;
      catLatest.current = null;
      if (ids) void flushCategories(ids).catch(() => {});
    };
  }, [flushCategories]);

  // Le fondu qui remplace la bordure sous la barre du haut : il ne paraît que
  // du côté où il reste quelque chose à découvrir.
  //
  // Il est déclaré ICI, loin du JSX qui s'en sert, et pas juste au-dessus de
  // lui : c'est un HOOK, et le squelette de chargement rend plus bas. Appelé
  // après ce `return`, il n'existait pas au premier rendu (`post` encore nul)
  // et apparaissait au second — « Rendered more hooks than during the previous
  // render », et tout l'écran Retours tombait sur sa frontière d'erreur dès
  // qu'un projet avait des retours à afficher.
  const detailFade = useScrollFade<HTMLDivElement>();

  if (isPending || !post) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const rawDiffers =
    post.submitted_title !== post.title || post.submitted_body !== post.body;

  /**
   * La traduction, si la revue en a produit une ET qu'elle vaut encore.
   *
   * `translated_language` est comparée à la langue de l'équipe : une équipe qui
   * passe du français à l'anglais a en base des traductions françaises, et les
   * présenter comme « la version que vous pouvez lire » serait un mensonge.
   * Elles ne réapparaîtront que si la langue revient — on ne re-traduit pas
   * l'historique.
   */
  const translation =
    post.translated_title &&
    normalizeLanguage(post.translated_language) === teamLanguage
      ? { title: post.translated_title, body: post.translated_body }
      : null;

  /**
   * Le statut d'un retour lié à un ticket n'est plus le sien : `status-sync` le
   * recopie depuis l'issue à chaque changement. Le laisser modifiable ici
   * offrirait un geste que la prochaine transition du ticket écraserait — d'où
   * la lecture seule, sur le statut comme sur les raccourcis qui le posent.
   */
  const statusLocked = !!post.issue;

  /**
   * On a répondu non. Il n'y a plus de ticket à faire naître d'un retour
   * refusé ou écarté — proposer encore « Promouvoir » rouvrirait, d'un clic
   * sans confirmation, une décision qu'on vient de prendre.
   *
   * Le geste n'est pas perdu pour autant : il revient dès que le statut
   * repasse ouvert, et ce statut est juste en dessous, dans la fiche.
   */
  const settledAsNo = post.status === "declined" || post.status === "spam";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barre du haut, façon triage : retour (mobile) · identifiants (voix,
          source, date) à gauche · ce qu'on FAIT du retour à droite. Ce qu'il
          EST — statut, visibilité, type, auteur — se lit plus bas, dans la
          table clé/valeur, avec le reste de ses propriétés.
          SANS bordure : c'est le fondu du contenu qui dit qu'il continue
          au-dessus, et une barre séparée le couperait de ce qu'il coiffe (même
          parti que la pull request et la conversation d'agent). */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("title")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        {/* Ce qui reste ici : les alertes de revue, seules choses qui demandent
            une réaction. Les voix, la date et la provenance sont descendues
            dans la table clé/valeur, avec le reste de ce que le retour EST. */}
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <ReviewBadges
            reviewState={post.review_state}
            sensitivity={post.sensitivity}
            moderationReason={post.moderation_reason}
            reviewFailed={reviewGaveUp(post)}
          />
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {/* Le ticket lié n'est plus ANNONCÉ ici : il a sa rangée dans la
              fiche, avec son statut, son titre et son détachement. Ne reste que
              le geste qui n'existe qu'avant lui — en fabriquer un. */}
          {post.issue || settledAsNo ? null : (
            <SplitButton
              variant="outline"
              size="sm"
              disabled={action.isPending}
              onClick={() => setPromoteOpen(true)}
              menuLabel={t("linkToIssue")}
              menu={
                <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                  <Link2 className="size-4" />
                  {t("linkToIssue")}
                </DropdownMenuItem>
              }
            >
              {t("promote")}
            </SplitButton>
          )}
          {/* Les deux issues d'un retour encore ouvert : on le prend, ou on le
              refuse. Le troisième cas — ce n'était pas un retour — vit sous le
              chevron : c'est un jugement sur l'expéditeur, pas sur la demande,
              et il n'a pas à être à un clic de distance. */}
          {post.status === "open" && !statusLocked ? (
            <SplitButton
              // Destructif : refuser, c'est répondre non à quelqu'un. Le bouton
              // doit le dire avant le clic, pas après.
              variant="destructive"
              size="sm"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ status: "declined" })}
              menuLabel={t("markSpam")}
              menu={
                <DropdownMenuItem onSelect={() => patch.mutate({ status: "spam" })}>
                  <Ban className="size-4" />
                  {t("markSpam")}
                </DropdownMenuItem>
              }
            >
              {t("decline")}
            </SplitButton>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="…">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Revue IA (MIN-54) : l'équipe peut publier un retour que la
                  revue n'a pas encore laissé passer. L'écarter, lui, est
                  devenu un statut — il se pose dans la table clé/valeur. */}
              {post.review_state !== "published" && (
                <DropdownMenuItem
                  onSelect={() => patch.mutate({ review_state: "published" })}
                >
                  <Send className="size-4" />
                  {t("publishReview")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
                <GitMerge className="size-4" />
                {t("mergeInto")}
              </DropdownMenuItem>
              {/* Délier a suivi le ticket dans la fiche : il se fait sur la
                  ligne du ticket lui-même, là où on le voit. */}
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                {t("deletePost")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Corps défilant, centré comme le triage. */}
      <div
        ref={detailFade.ref}
        {...detailFade.scrollProps}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {post.suggested_merge_into_id && post.suggested_title && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2">
            <Sparkles className="size-3.5 shrink-0 text-brand" />
            <p className="min-w-0 flex-1 text-xs">
              {t("suggestionBanner", {
                title: post.suggested_title,
                confidence: Math.round((post.suggested_confidence ?? 0) * 100),
              })}
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `${postId}/suggestion`, body: { action: "accept" } })
                }
              >
                {t("acceptSuggestion")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `${postId}/suggestion`, body: { action: "reject" } })
                }
              >
                {t("rejectSuggestion")}
              </Button>
            </div>
          </div>
        )}

        {/* Titre + description rapprochés, comme dans le triage — la
            description est éditée en markdown rendu (même éditeur).

            Traduit, le retour s'ouvre SUR sa traduction : c'est la version que
            l'équipe peut lire, et la lui cacher derrière un onglet reviendrait
            à ne pas l'avoir traduite. Mais elle est en LECTURE SEULE — éditer
            une traduction produirait un texte que plus rien ne relie à ce que
            l'utilisateur a écrit, et que la prochaine passe de revue écraserait
            sans le savoir. La couche canonique, elle, s'édite comme avant, sous
            l'onglet « version originale ». */}
        {translation ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {([true, false] as const).map((wanted) => (
                <button
                  key={String(wanted)}
                  type="button"
                  aria-pressed={showTranslated === wanted}
                  onClick={() => setShowTranslated(wanted)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    showTranslated === wanted
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {wanted ? t("translated") : t("original")}
                </button>
              ))}
            </div>
            {showTranslated ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Languages className="size-3.5" />
                {t("translatedFrom", {
                  language: languageLabel(post.source_language ?? "", locale),
                })}
              </span>
            ) : null}
          </div>
        ) : null}

        {translation && showTranslated ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl leading-tight font-semibold">{translation.title}</h2>
            {translation.body ? (
              <Markdown className="text-sm">{translation.body}</Markdown>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("translatedReadOnly")}</p>
          </div>
        ) : (
        <div className="flex flex-col gap-2">
          <AutoTextarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && trimmed !== post.title) patch.mutate({ title: trimmed });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="w-full overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
            maxLength={200}
          />
          <MarkdownEditor
            key={post.id}
            value={post.body}
            onCommit={(markdown) => {
              if (markdown !== post.body) patch.mutate({ body: markdown });
            }}
            placeholder={t("postBodyPlaceholder")}
            className="min-h-16"
          />
        </div>
        )}

        {/* Tout ce que le retour EST, sur des rangées clé/valeur — mêmes
            contrôles que le panneau d'issue. C'est ici, et nulle part ailleurs,
            qu'on lit son statut, sa nature, sa visibilité, son auteur. */}
        <div className="flex flex-col">
          {/* En tête de fiche : le soutien. C'est le chiffre qu'on vient
              comparer, et celui qui décide de l'ordre de la colonne. Il ne se
              compte que là où on peut en donner — board publié ET retour
              public ; sur un retour privé ce serait un nombre qui ne bougera
              jamais. */}
          {boardEnabled && post.is_public ? (
            <PropertyRow label={t("votes")}>
              <VoteCount count={post.vote_count} size="md" />
            </PropertyRow>
          ) : null}

          <PropertyRow label={tField("status")}>
            {statusLocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <FeedbackStatusBadge status={post.status} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("statusLockedHint")}</TooltipContent>
              </Tooltip>
            ) : (
              <SearchSelect
                value={post.status}
                onChange={(value) => {
                  if (value && value !== post.status) patch.mutate({ status: value });
                }}
                options={FEEDBACK_POST_STATUSES.map((status) => ({
                  value: status,
                  label: tStatus(`status.${status}`),
                  icon:
                    status === "spam" ? (
                      <Ban className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <StatusIndicator
                        status={FEEDBACK_TO_ISSUE_STATUS[status]}
                        className="size-4 shrink-0"
                      />
                    ),
                }))}
                align="end"
                tooltip={tField("status")}
                trigger={
                  <button type="button" className={BADGE_TRIGGER}>
                    <FeedbackStatusBadge status={post.status} />
                  </button>
                }
              />
            )}
          </PropertyRow>

          {/* Le ticket lié, sur le modèle des relations d'un ticket : la ligne
              existe TOUJOURS, même vide. C'est elle qui apprend qu'un retour
              peut porter un ticket — cachée tant qu'il n'y en a pas, elle ne
              l'apprenait qu'à ceux qui le savaient déjà. Vide, son déclencheur
              ouvre la recherche ; garni, le ticket se lit en dessous, pleine
              largeur, parce qu'un titre ne tient pas dans la moitié droite
              d'une rangée clé/valeur. */}
          <PropertyRow label={t("linkedIssue")}>
            {post.issue ? null : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("linkToIssue")}
                    className={cn(TRIGGER, "text-muted-foreground")}
                    onClick={() => setLinkOpen(true)}
                  >
                    <Link2 className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("linkToIssue")}</TooltipContent>
              </Tooltip>
            )}
          </PropertyRow>
          {post.issue ? (
            <div className="group/linked mb-2 flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60">
              <button
                type="button"
                onClick={() => onOpenIssue(post.issue!.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <StatusIndicator
                  status={post.issue.status as Issue["status"]}
                  className="size-4 shrink-0"
                />
                <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                  {issueIdentifier(projectKey, post.issue.number)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {issues.find((i) => i.id === post.issue!.id)?.title ??
                    issueIdentifier(projectKey, post.issue.number)}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("unlinkIssue")}
                className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/linked:opacity-100 focus-visible:opacity-100"
                onClick={() =>
                  void api(`/api/projects/${projectId}/feedback/${postId}/link`, {
                    method: "DELETE",
                  })
                    .then(refreshDetail)
                    .catch((e: Error) => toast.error(e.message || t("errorGeneric")))
                }
              >
                <X />
              </Button>
            </div>
          ) : null}

          {/* Interne / externe : de qui vient ce retour. Ce n'est pas modifiable
              — c'est un fait sur sa provenance, pas une décision — donc le
              survol explique au lieu d'ouvrir. Il dit aussi PAR OÙ il est
              arrivé (board, API), ce que la barre du haut portait avant : la
              distinction reste utile, mais pas au point d'occuper une ligne. */}
          <PropertyRow label={t("feedbackType")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="rounded-md px-1.5 py-1 text-sm outline-none">
                  {post.source === "internal" ? t("typeInternal") : t("typeExternal")}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(`typeHint.${post.source}`)}</TooltipContent>
            </Tooltip>
          </PropertyRow>

          {/* Public ou privé — la question ne se pose que s'il existe un board
              où publier. */}
          {boardEnabled ? (
            <PropertyRow label={t("visibility")}>
              <SearchSelect
                value={post.is_public ? "public" : "private"}
                onChange={(value) => {
                  const next = value === "public";
                  if (next !== post.is_public) patch.mutate({ is_public: next });
                }}
                options={[
                  {
                    value: "public",
                    label: t("public"),
                    icon: <Globe className="size-4 shrink-0" />,
                  },
                  {
                    value: "private",
                    label: t("private"),
                    icon: <Lock className="size-4 shrink-0" />,
                  },
                ]}
                align="end"
                tooltip={post.is_public ? t("publicHint") : t("privateHint")}
                trigger={
                  <button type="button" className={BADGE_TRIGGER}>
                    <VisibilityBadge isPublic={post.is_public} />
                  </button>
                }
              />
            </PropertyRow>
          ) : null}

          {post.author && (post.author.name || post.author.email) && (
            <PropertyRow label={t("author")}>
              <AuthorValue
                name={post.author.name}
                email={post.author.email}
                pseudonym={post.author.pseudonym}
                seed={authorAvatarSeed(post.author, memberSeeds)}
              />
            </PropertyRow>
          )}

          <PropertyRow label={tField("categories")}>
            <CategoryValue
              categories={categories}
              projectId={projectId}
              value={post.category_ids}
              onChange={handleCategoriesChange}
            />
          </PropertyRow>

          <PropertyRow label={t("createdAt")}>
            <span className="text-sm">
              {format.dateTime(new Date(post.created_at), { dateStyle: "medium" })}
            </span>
          </PropertyRow>
        </div>

        {rawDiffers && (
          <details className="rounded-md border border-border/60 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {t("rawTitle")}
            </summary>
            <div className="mt-2 flex flex-col gap-1 text-sm">
              <p className="font-medium">{post.submitted_title}</p>
              {post.submitted_body && (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {post.submitted_body}
                </p>
              )}
            </div>
          </details>
        )}

        {post.merged_from.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitMerge className="size-3" />
            {t("mergedFromLabel")} : {post.merged_from.map((m) => m.title).join(" · ")}
          </p>
        )}

        {post.merge_events.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border/60 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">{t("merges")}</p>
            {post.merge_events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">
                  {event.dup_title ?? event.dup_id} ·{" "}
                  {event.performed_by === "ai" ? t("byAi") : t("byTeam")}
                  {event.confidence !== null &&
                    ` (${Math.round(event.confidence * 100)} %)`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ path: `merges/${event.id}/undo` })}
                >
                  <Undo2 className="size-3.5" />
                  {t("undo")}
                </Button>
              </div>
            ))}
          </div>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("respondTitle")}</h3>
          {post.team_response && !respondEditing ? (
            // État publié : la réponse telle que le board la montre, avec sa
            // date — l'édition est un mode explicite.
            <div className="flex flex-col gap-1.5 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {post.team_response}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {post.team_response_at
                    ? t("respondPublishedAt", {
                        date: format.dateTime(new Date(post.team_response_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })
                    : null}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setResponse(post.team_response ?? "");
                    setRespondEditing(true);
                  }}
                >
                  {t("respondEdit")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <AutoTextarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                // Une réponse d'équipe est un message publié à qui a écrit le
                // retour : elle part au même raccourci que partout ailleurs.
                onKeyDown={(e) => {
                  if (!isSendShortcut(e)) return;
                  e.preventDefault();
                  if (!respondDisabled) publishResponse();
                }}
                placeholder={t("respondPlaceholder", { project: projectName })}
                // `bg-card`, comme le composeur de commentaire juste dessous :
                // en transparent, le champ n'était plus une surface d'écriture
                // posée sur la page mais un trou dedans, et les deux zones de
                // saisie de l'écran ne se ressemblaient pas.
                className="min-h-16 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                maxLength={5000}
              />
              <div className="flex items-center justify-end gap-2">
                {respondEditing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setResponse(post.team_response ?? "");
                      setRespondEditing(false);
                    }}
                  >
                    {t("respondCancel")}
                  </Button>
                )}
                <SendShortcutTooltip
                  label={post.team_response ? t("respondUpdate") : t("saveResponse")}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={respondDisabled}
                    onClick={publishResponse}
                  >
                    {patch.isPending && <Spinner />}
                    {post.team_response ? t("respondUpdate") : t("saveResponse")}
                  </Button>
                </SendShortcutTooltip>
              </div>
            </>
          )}
        </section>

        {/* Journal d'activité + commentaires internes — parité tickets/objectifs
            (MIN-51). Commentaires team-only : jamais exposés sur le board public. */}
        <div className="flex flex-col gap-3">
          <IssueActivity
            items={activityItems}
            ctx={eventCtx}
            entity="feedback"
            currentUserId={user?.id ?? null}
            projectId={projectId}
            onReply={handleReply}
            onEditComment={updateComment}
            onDeleteComment={deleteComment}
            onDeleteAttachment={deleteAttachment}
          />
          <CommentComposer
            members={members}
            projectId={projectId}
            onSubmit={handleComment}
          />
        </div>
        </div>
      </div>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        boardEnabled={boardEnabled}
        // Ni ce retour-ci, ni un retour déjà porté par un ticket, ni un spam :
        // absorber un vrai retour dans un post écarté l'enterrerait derrière un
        // tombstone que le board ne montre plus (même garde que la revue IA).
        candidates={allPosts.filter(
          (p) => p.id !== postId && !p.issue_id && p.status !== "spam"
        )}
        onMerge={(canonicalId) => {
          setMergeOpen(false);
          action.mutate({ path: `${postId}/merge`, body: { canonical_id: canonicalId } });
        }}
      />
      <LinkIssueDialog
        projectId={projectId}
        projectKey={projectKey}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLink={(issueId) => {
          setLinkOpen(false);
          action.mutate({ path: `${postId}/link`, body: { issue_id: issueId } });
        }}
      />
      {/* Promouvoir, c'est ouvrir le formulaire de création de ticket déjà
          rempli par le retour — pas fabriquer un ticket dans le dos de qui
          clique. Le retour donne ce qu'il sait (titre, texte, catégories) ;
          l'effort, la priorité, l'assigné et l'échéance sont des jugements
          d'équipe, et se posent ici plutôt qu'en rouvrant le ticket juste
          après. C'est le MÊME formulaire que partout ailleurs : ses raccourcis
          de champ, sa dictée et ses brouillons viennent avec.
          `projects` ne porte que le projet courant : un retour appartient à
          son projet, « créer dans un autre projet » n'aurait pas de sens et
          laisserait le lien derrière lui. */}
      <CreateIssueDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        projectId={projectId}
        projects={project ? [project] : []}
        members={members}
        categories={categories}
        objectives={objectives}
        initialTitle={post.title}
        initialDescription={post.body}
        initialCategoryIds={post.category_ids}
        analyticsSource="feedback"
        onCreate={async (input) => {
          await api(`/api/projects/${projectId}/feedback/${postId}/promote`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          trackEvent("feedback_action", { action: "promote" });
          setPromoteOpen(false);
          refreshDetail();
        }}
        // Inatteignable (aucun autre projet dans la liste), mais la prop est
        // requise : la faire échouer bruyamment vaut mieux qu'un ticket créé
        // ailleurs et détaché de son retour.
        onCreateInProject={() => Promise.reject(new Error(t("errorGeneric")))}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("deletePostTitle", { title: post.title })}
        description={t("deletePostConfirm", { days: TRASH_RETENTION_DAYS })}
        confirmLabel={t("deletePost")}
        cancelLabel={tCommon("cancel")}
        onConfirm={async () => {
          await api(`/api/projects/${projectId}/feedback/${postId}`, { method: "DELETE" });
          setDeleteOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

/**
 * Fusionner ce retour DANS un autre.
 *
 * Deux temps, et c'est délibéré : on choisit le retour parent, puis on confirme
 * en le lisant. Une fusion déplace des voix et fait rediriger une URL publique ;
 * elle se défait, mais après coup, et un clic dans une liste de titres proches
 * n'est pas un endroit où se tromper en silence.
 */
function MergeDialog({
  open,
  onOpenChange,
  boardEnabled,
  candidates,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardEnabled: boolean;
  candidates: TeamFeedbackListItem[];
  onMerge: (canonicalId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tCommon = useTranslations("Common");
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<TeamFeedbackListItem | null>(null);
  const filtered = candidates.filter((p) =>
    p.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  const close = (next: boolean) => {
    if (!next) {
      setSearch("");
      setConfirming(null);
    }
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="size-4 text-brand" />
              {t("mergeDialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("mergeDialogDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("mergeSearchPlaceholder")}
          />
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {filtered.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setConfirming(post)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="min-w-0 truncate">{post.title}</span>
                {boardEnabled ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    ▲ {post.vote_count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirming} onOpenChange={(next) => !next && setConfirming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mergeConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("mergeConfirmDesc", { title: confirming?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => {
                const target = confirming;
                setConfirming(null);
                if (target) onMerge(target.id);
              }}
            >
              <GitMerge className="size-4" />
              {t("merge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Lier à une issue existante : recherche par titre ou identifiant, les
    issues closes (canceled/duplicate) sont exclues. */
function LinkIssueDialog({
  projectId,
  projectKey,
  open,
  onOpenChange,
  onLink,
}: {
  projectId: string;
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (issueId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const { issues } = useIssuesQuery(open ? projectId : null);
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const candidates = issues
    .filter((issue) => issue.status !== "canceled" && issue.status !== "duplicate")
    .filter(
      (issue) =>
        !needle ||
        issue.title.toLowerCase().includes(needle) ||
        issueIdentifier(projectKey, issue.number).toLowerCase().includes(needle)
    )
    .slice(0, 30);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-brand" />
            {t("linkToIssue")}
          </DialogTitle>
          <DialogDescription>{t("linkIssueDialogDesc")}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("linkIssueSearchPlaceholder")}
        />
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {candidates.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => onLink(issue.id)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <StatusIndicator status={issue.status} className="size-4 shrink-0" />
              <code className="shrink-0 font-mono text-xs text-muted-foreground">
                {issueIdentifier(projectKey, issue.number)}
              </code>
              <span className="min-w-0 truncate">{issue.title}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Saisie interne ───────────────────────────────────────────────────────────

/** L'auteur choisi dans le composeur : quelqu'un qu'on connaît déjà, ou un
    email frais. Les deux se résolvent en la même identité côté serveur. */
interface ComposerAuthor {
  email: string;
  name: string | null;
  /** Graine d'avatar d'un membre de l'équipe — voir {@link authorAvatarSeed}. */
  seed?: string | null;
}

/**
 * La graine de l'avatar d'un auteur.
 *
 * Un membre de l'équipe a DÉJÀ un visage dans minddy, tiré au sort une fois
 * pour toutes (`public.user_avatars`) et affiché partout ailleurs — sur ses
 * tickets, dans le fil d'activité, dans le sélecteur d'assigné. Le semer ici
 * sur son email lui en dessinerait un second, sans rapport avec le premier :
 * la même personne, deux visages, sur deux écrans voisins.
 *
 * D'où l'ordre : la graine du compte s'il en a un, l'email sinon (un visiteur
 * du board n'a pas de compte, et son email est ce qu'il a de stable), le
 * pseudonyme en dernier recours.
 */
function authorAvatarSeed(
  author: { email?: string | null; pseudonym?: string | null } | null,
  memberSeeds: Map<string, string>
): string {
  const email = author?.email?.trim().toLowerCase() || null;
  return (
    (email ? memberSeeds.get(email) : null) ?? email ?? author?.pseudonym ?? ""
  );
}

/** Email (en minuscules) → graine d'avatar, pour les membres du projet. */
function useMemberSeeds(members: Member[]): Map<string, string> {
  return useMemo(
    () =>
      new Map(
        members
          .filter((m) => m.email)
          .map((m) => [m.email!.trim().toLowerCase(), m.avatar_seed])
      ),
    [members]
  );
}

/**
 * Au nom de qui l'équipe saisit ce retour.
 *
 * Retaper l'email de tête créait une SECONDE identité à la moindre faute — avec
 * son pseudonyme, sa voix et son historique séparés. Le champ propose donc ceux
 * qui ont déjà écrit ou voté, et n'accepte une saisie libre qu'après avoir
 * montré qu'aucun d'eux ne correspond.
 */
function AuthorPicker({
  projectId,
  members,
  value,
  onChange,
  onCreateRequested,
}: {
  projectId: string;
  /** Les membres du projet — eux aussi ont des retours à faire remonter. */
  members: Member[];
  value: ComposerAuthor | null;
  onChange: (author: ComposerAuthor | null) => void;
  /** Bascule le champ en saisie d'une personne neuve, avec ce qui a été tapé. */
  onCreateRequested: (typed: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["feedback-users", projectId, search.trim()],
    queryFn: () =>
      api<{ users: TeamFeedbackUserOption[] }>(
        `/api/projects/${projectId}/feedback/users?q=${encodeURIComponent(search.trim())}`
      ),
    enabled: open,
  });
  const users = data?.users ?? [];
  const typed = search.trim();

  /**
   * L'équipe d'abord. Un retour saisi à la main vient très souvent de
   * l'intérieur — quelqu'un est tombé sur un défaut, l'a raconté en réunion, et
   * on le consigne. Sans les membres dans cette liste, il fallait retaper de
   * mémoire l'email d'un collègue qui est pourtant déjà dans le projet.
   *
   * Ils ne sont PAS filtrés à la main : cmdk filtre déjà les items sur leur
   * valeur et leurs mots-clés, et le faire deux fois donnerait deux résultats
   * différents pour une même frappe.
   */
  const teamOptions = useMemo(
    () => members.filter((m) => m.email),
    [members]
  );
  // Un membre qui a déjà écrit sur le board a AUSSI une ligne côté visiteurs :
  // c'est la même personne, et c'est l'entrée « équipe » qu'on garde — elle
  // seule porte son vrai visage et son nom de compte.
  const teamEmails = useMemo(
    () => new Set(teamOptions.map((m) => m.email!.trim().toLowerCase())),
    [teamOptions]
  );
  const visitorOptions = users.filter(
    (u) => !u.email || !teamEmails.has(u.email.trim().toLowerCase())
  );

  const pick = (author: ComposerAuthor) => {
    onChange(author);
    setSearch("");
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        setOpen(next);
      }}
      align="start"
      searchValue={search}
      onSearchValueChange={setSearch}
      searchPlaceholder={t("authorSearchPlaceholder")}
      // « Aucun résultat » n'a jamais le dernier mot ici : la ligne de création
      // juste dessous EST la réponse quand rien ne correspond.
      hideEmpty
      contentClassName="w-80"
      trigger={
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:border-ring"
        >
          {value ? (
            <>
              <UserAvatar seed={value.seed || value.email} className="size-5" />
              <span className="min-w-0 truncate">{value.name?.trim() || value.email}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("authorPlaceholder")}</span>
          )}
        </button>
      }
    >
      <CommandGroup heading={t("authorTeamGroup")}>
        {teamOptions.map((m) => (
          <CommandItem
            key={m.user_id}
            value={`member-${m.user_id}`}
            keywords={[m.email ?? "", m.full_name ?? ""]}
            onSelect={() =>
              pick({ email: m.email!, name: m.full_name, seed: m.avatar_seed })
            }
          >
            {/* Sa graine de compte, pas son email : le même visage que partout
                ailleurs dans minddy. */}
            <UserAvatar seed={m.avatar_seed} className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{displayName(m)}</span>
              {m.full_name?.trim() && m.email ? (
                <span className="truncate text-xs text-muted-foreground">{m.email}</span>
              ) : null}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandGroup heading={t("authorPeopleGroup")}>
        {visitorOptions.map((u) => (
          <CommandItem
            key={u.id}
            value={u.id}
            keywords={[u.email ?? "", u.name ?? "", u.pseudonym]}
            onSelect={() =>
              u.email ? pick({ email: u.email, name: u.name }) : undefined
            }
            disabled={!u.email}
          >
            <UserAvatar seed={u.email || u.pseudonym} className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{u.name?.trim() || u.email || u.pseudonym}</span>
              {u.name?.trim() && u.email ? (
                <span className="truncate text-xs text-muted-foreground">{u.email}</span>
              ) : null}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
      {/* Créer quelqu'un est TOUJOURS à portée, pas seulement quand la
          recherche échoue : le plus souvent, saisir un retour reçu par mail,
          c'est saisir une personne qu'on n'a jamais vue. `forceMount` la garde
          affichée quand cmdk ne trouve rien — c'est-à-dire précisément là où
          elle sert. */}
      <CommandSeparator alwaysRender className="my-1" />
      <CommandGroup forceMount>
        <CommandItem
          forceMount
          value="__new__"
          keywords={[t("authorCreate")]}
          onSelect={() => {
            setOpen(false);
            setSearch("");
            onCreateRequested(typed);
          }}
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {typed ? t("authorNew", { name: typed }) : t("authorCreate")}
          </span>
        </CommandItem>
      </CommandGroup>
    </SearchMenu>
  );
}

/**
 * La personne neuve : email et nom, les deux champs que la saisie interne a
 * toujours eus. Ils reviennent parce que le sélecteur seul les avait perdus —
 * on ne pouvait plus que retrouver quelqu'un, jamais l'inscrire, alors que
 * saisir un retour reçu par mail commence presque toujours par là.
 *
 * Rendus SUR PLACE, dans le composeur, plutôt que dans un second dialog :
 * empiler deux modales pour deux champs coûte plus cher en attention que ce
 * qu'elles demandent.
 */
function NewAuthorFields({
  email,
  name,
  onEmailChange,
  onNameChange,
  onCancel,
}: {
  email: string;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("FeedbackBoard");
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        autoFocus
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={t("authorEmail")}
        className="h-8 min-w-0 flex-1"
      />
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={t("authorName")}
        className="h-8 min-w-0 flex-1"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("authorBack")}
            onClick={onCancel}
          >
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("authorBack")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Saisir un retour reçu ailleurs — un email, un appel, une conversation.
 *
 * Même surface d'écriture que le composeur du board public : le titre et le
 * corps sont des champs libres, sans chrome, parce que ce qu'on écrit ici finit
 * exactement au même endroit. Ce qui s'y ajoute est ce que le visiteur n'a pas
 * à choisir : AU NOM DE QUI on écrit.
 */
function InternalFeedbackDialog({
  projectId,
  members,
  boardEnabled,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  /** Les membres du projet, proposés comme auteurs au même titre que les
      visiteurs du board. */
  members: Member[];
  boardEnabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (postId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const [author, setAuthor] = useState<ComposerAuthor | null>(null);
  // Personne neuve en cours de saisie. `null` = on est sur le sélecteur.
  const [draftAuthor, setDraftAuthor] = useState<{ email: string; name: string } | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  // Le MarkdownEditor ne committe qu'au blur — la ref porte toujours la
  // dernière valeur commitée, et submit() force le blur avant de lire.
  const bodyRef = useRef("");
  const [editorKey, setEditorKey] = useState(0);

  const reset = () => {
    setAuthor(null);
    setDraftAuthor(null);
    setTitle("");
    setIsPublic(true);
    bodyRef.current = "";
    setEditorKey((k) => k + 1);
  };

  /**
   * Qui signe ce retour, quel que soit le mode : la personne choisie dans la
   * liste, ou celle qu'on est en train d'inscrire. Un email est le minimum —
   * c'est lui qui résout l'identité côté serveur (`upsertFeedbackUser`), et
   * c'est par lui qu'on recontactera.
   */
  const resolvedAuthor: ComposerAuthor | null = draftAuthor
    ? draftAuthor.email.trim().includes("@")
      ? { email: draftAuthor.email.trim(), name: draftAuthor.name.trim() || null, seed: null }
      : null
    : author;

  const canSubmit = !busy && !!title.trim() && !!resolvedAuthor;

  const submit = async () => {
    const signer = resolvedAuthor;
    if (busy || !title.trim() || !signer) return;
    setBusy(true);
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const created = await api<{ post: { id: string } }>(
        `/api/projects/${projectId}/feedback`,
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            body: bodyRef.current.trim(),
            is_public: boardEnabled ? isPublic : false,
            user: { email: signer.email, name: signer.name ?? undefined },
          }),
        }
      );
      reset();
      onOpenChange(false);
      onCreated(created.post.id);
    } catch (err) {
      toast.error((err as Error).message || t("errorGeneric"));
    } finally {
      setBusy(false);
    }
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
          bouillonnement. `defaultPrevented` laisse la priorité à l'éditeur
          quand il s'en sert lui-même (sortir d'un bloc de code). */}
      <DialogContent
        className="top-24 translate-y-0 gap-0 sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.defaultPrevented || !isSendShortcut(e)) return;
          e.preventDefault();
          void submit();
        }}
      >
        <DialogTitle className="sr-only">{t("internalDialogTitle")}</DialogTitle>
        <AutoTextarea
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void submit();
          }}
          placeholder={t("postTitlePlaceholder")}
          maxLength={200}
          className="w-full overflow-hidden bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <MarkdownEditor
          key={editorKey}
          value=""
          onCommit={(markdown) => {
            bodyRef.current = markdown;
          }}
          placeholder={t("postBodyPlaceholder")}
          className="mt-3 min-h-24"
        />

        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="shrink-0 text-sm font-medium">{t("authorLabel")}</span>
          {draftAuthor ? (
            <NewAuthorFields
              email={draftAuthor.email}
              name={draftAuthor.name}
              onEmailChange={(email) => setDraftAuthor((d) => ({ ...d!, email }))}
              onNameChange={(name) => setDraftAuthor((d) => ({ ...d!, name }))}
              onCancel={() => setDraftAuthor(null)}
            />
          ) : (
            <AuthorPicker
              projectId={projectId}
              members={members}
              value={author}
              onChange={setAuthor}
              // Ce qui a été tapé n'est pas perdu au passage : un email part
              // dans le champ email, tout le reste dans le champ nom.
              onCreateRequested={(typed) => {
                setAuthor(null);
                setDraftAuthor(
                  typed.includes("@")
                    ? { email: typed, name: "" }
                    : { email: "", name: typed }
                );
              }}
            />
          )}
        </div>

        {boardEnabled ? (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <label
              htmlFor="internal-feedback-public"
              className="flex min-w-0 cursor-pointer flex-col"
            >
              <span className="text-sm font-medium">{t("public")}</span>
              <span className="text-xs text-muted-foreground">
                {isPublic ? t("publicHint") : t("privateHint")}
              </span>
            </label>
            <Switch
              id="internal-feedback-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-end gap-4 border-t pt-3">
          <SendShortcutTooltip label={t("create")}>
            <Button disabled={!canSubmit} onClick={() => void submit()}>
              {busy && <Spinner />}
              {t("create")}
            </Button>
          </SendShortcutTooltip>
        </div>
      </DialogContent>
    </Dialog>
  );
}
