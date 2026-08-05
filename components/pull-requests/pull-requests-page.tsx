"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  Skeleton,
  Spinner,
  cn,
} from "mangue-ui";
import { ChevronRight, GitPullRequest, ListFilter, Plus } from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import { GitLogin } from "@/components/git/git-login";
import { NumoIcon } from "@/components/numo-icon";
import { PrDetail } from "@/components/pull-requests/pr-detail";
import { PrIssuePanel } from "@/components/pull-requests/pr-issue-panel";
import { PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  PROJECT_GROUP_INDENT,
  PROJECT_GROUP_LIMIT,
  SidebarProjectGroup,
  groupByProject,
  toggledSet,
  type ProjectGroup,
} from "@/components/sidebar-project-group";
import { UserAvatar } from "@/components/user-avatar";
import { PULL_REQUESTS_PAGE, useAllPullRequestsQuery } from "@/lib/use-agent-runs";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { useProjects } from "@/lib/projects-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { prIdentifier } from "@/lib/repo-providers";
import type { MessageKey } from "@/lib/i18n-keys";
import type { PullRequestListItem, PullRequestStateFilter } from "@/lib/agent-api";

/**
 * Page Pull Requests (MIN-66, élargie par MIN-143) — vue liste/détail façon
 * triage : à gauche TOUTES les PR des dépôts liés (de Numo comme des humains,
 * tous projets accessibles), à droite le diff + commentaires + actions.
 *
 * Deux filtres, et pas un de plus. L'ÉTAT, servi par le serveur — « toutes »
 * veut maintenant dire des centaines de lignes. L'AUTEUR, appliqué sur la page
 * chargée, avec l'entrée « ouvertes par Numo » qui est la question qu'on se pose
 * vraiment souvent. Ce qui MANQUE volontairement, c'est « à relire par moi » : il
 * faudrait savoir quel compte de forge est quel membre minddy, et `git_connections`
 * ne le dit que du compte qui a lié le dépôt.
 */

/** Valeur du filtre d'auteur : tous, Numo, ou un login de forge précis. */
const AUTHOR_ALL = "__all__";
const AUTHOR_NUMO = "__numo__";

/**
 * Les états servis par le filtre, dans l'ordre du menu.
 *
 * Une TABLE plutôt que quatre entrées écrites à la main : le menu et le libellé
 * du bouton lisent la même source, donc ils ne peuvent pas diverger. Typée en
 * `MessageKey` et non en `string` — une clé qui n'existe pas ne compile pas
 * (cf. CLAUDE.md), là où un `Record<string, string>` afficherait sereinement
 * « PullRequests.filterOpen » à l'écran.
 */
const STATE_FILTERS: ReadonlyArray<{
  value: PullRequestStateFilter;
  label: MessageKey<"PullRequests">;
  /**
   * Titre de la colonne vide quand c'est CET état, et lui seul, qui la vide —
   * « aucune pull request fusionnée » dit ce qu'on cherchait, là où « aucune
   * dans ces filtres » renvoie l'utilisateur ouvrir le menu pour se rappeler
   * lesquels. « Toutes » n'en a pas : un état qui n'exclut rien n'a rien à
   * nommer, et cette surface-là est déjà traitée avant le rendu de la colonne.
   */
  empty?: MessageKey<"PullRequests">;
}> = [
  { value: "open", label: "filterOpen", empty: "emptyOpen" },
  { value: "merged", label: "filterMerged", empty: "emptyMerged" },
  { value: "closed", label: "filterClosed", empty: "emptyClosed" },
  { value: "all", label: "filterAll" },
];

/**
 * Le filtre de la colonne : UN déclencheur pour les deux dimensions.
 *
 * C'est un COMBOBOX, le même que les sélecteurs de champ d'un ticket (statut,
 * priorité, assigné) — `SearchMenu`, donc cmdk, donc cherchable. Sur un dépôt à
 * quinze contributeurs, une liste d'auteurs qu'on ne peut que parcourir des yeux
 * n'est pas un filtre, c'est un annuaire.
 *
 * Le déclencheur ne porte plus ni libellé ni chevron, juste l'icône de filtre :
 * la ligne fait 320 px, et le champ de saisie a besoin de tout ce qu'on peut lui
 * laisser. Ce que le libellé disait — l'état courant — passe dans le tooltip, et
 * une pastille signale de loin qu'un filtre est posé ; sans elle, une liste
 * restreinte n'aurait plus rien pour le dire.
 */
function PrFilterMenu({
  state,
  author,
  authors,
  onStateChange,
  onAuthorChange,
}: {
  state: PullRequestStateFilter;
  author: string;
  authors: { login: string; avatar_url: string | null }[];
  onStateChange: (state: PullRequestStateFilter) => void;
  onAuthorChange: (author: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);

  const stateLabel = t(
    STATE_FILTERS.find((s) => s.value === state)?.label ?? "filterOpen",
  );
  // « Ouvertes, tous auteurs » est le point de départ : rien à signaler. Tout le
  // reste restreint la liste, et doit se voir sans ouvrir le menu.
  const active = state !== "open" || author !== AUTHOR_ALL;

  const pick = (run: () => void) => {
    run();
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      tooltip={t("filterTooltip", { state: stateLabel })}
      trigger={
        /* `-mr-2` compense le padding du bouton : l'icône s'aligne alors sur le
           bord droit des lignes de la liste, pas 8 px en-deçà. */
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-2 text-muted-foreground hover:text-foreground"
          aria-label={t("filterTooltip", { state: stateLabel })}
        >
          <span className="relative flex items-center justify-center">
            <ListFilter className="size-4" />
            {active ? (
              /* L'anneau à la couleur de la barre détache la pastille du trait
                 de l'icône, qui passe juste dessous. */
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
        {STATE_FILTERS.map((s) => (
          <CommandItem
            key={s.value}
            value={`state-${s.value}`}
            keywords={[t(s.label)]}
            onSelect={() => pick(() => onStateChange(s.value))}
            {...checkedProps(s.value === state)}
          >
            <span className="truncate">{t(s.label)}</span>
          </CommandItem>
        ))}
      </CommandGroup>
      {/* L'auteur ne se pose que là où Numo et les humains cohabitent : à un
          seul auteur, le groupe n'aurait rien à trancher. */}
      {authors.length > 1 ? (
        <>
          <CommandSeparator className="my-1" />
          <CommandGroup heading={t("filterAuthorLabel")}>
            <CommandItem
              value="author-all"
              keywords={[t("filterByAuthor")]}
              onSelect={() => pick(() => onAuthorChange(AUTHOR_ALL))}
              {...checkedProps(author === AUTHOR_ALL)}
            >
              <span className="truncate">{t("filterByAuthor")}</span>
            </CommandItem>
            <CommandItem
              value="author-numo"
              keywords={[t("filterNumoOnly"), "numo", "agent"]}
              onSelect={() => pick(() => onAuthorChange(AUTHOR_NUMO))}
              {...checkedProps(author === AUTHOR_NUMO)}
            >
              <span className="truncate">{t("filterNumoOnly")}</span>
            </CommandItem>
            {authors.map((a) => (
              <CommandItem
                key={a.login}
                value={`author-${a.login}`}
                keywords={[a.login]}
                onSelect={() => pick(() => onAuthorChange(a.login))}
                {...checkedProps(a.login === author)}
              >
                {/* `GitLogin` tronque déjà le nom sans écraser sa pastille
                    « bot » — l'envelopper d'un `truncate` la couperait. */}
                <GitLogin login={a.login} />
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}
    </SearchMenu>
  );
}

/**
 * Une pull request dans la liste. Elle dit ce qu'elle disait déjà — identifiant,
 * ticket lié, état, date, titre, auteur — MOINS son projet, qui est écrit
 * au-dessus d'elle par l'accordéon et n'a plus à l'être une fois par ligne.
 */
function PrRow({
  pr,
  selected,
  dateLabel,
  onSelect,
}: {
  pr: PullRequestListItem;
  selected: boolean;
  dateLabel: string;
  onSelect: () => void;
}) {
  const t = useTranslations("PullRequests");
  // L'identifiant de la PR d'abord — c'est CETTE ligne qu'on regarde ; le ticket
  // lié se lit à droite, derrière un chevron qui dit la relation (même forme que
  // le sous-ticket dans la carte d'issue).
  const identifier = prIdentifier(pr.provider, pr.pr_number);
  const linkedIssue =
    pr.issue && pr.project ? issueIdentifier(pr.project.key, pr.issue.number) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      // La sélection DÉRIVÉE de la page, et non l'état des CLICS : les deux
      // divergent dans les deux cas d'ouverture les plus courants — à l'arrivée
      // sur la page (rien n'a été cliqué, la première PR s'affiche) et sur un
      // `?run=`, résolu en PR sans passer par l'état. La liste ne surlignait
      // alors rien, en face d'une PR bel et bien ouverte.
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-lg py-2 pr-2 text-left outline-none transition-colors",
        PROJECT_GROUP_INDENT,
        selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground">
          <span className="shrink-0 text-foreground">{identifier}</span>
          {linkedIssue ? (
            <>
              <ChevronRight className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{linkedIssue}</span>
            </>
          ) : null}
        </span>
        {pr.activeRunId ? <Spinner className="size-3 shrink-0" /> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <PrStateBadge state={pr.pr_state} className="h-5 px-2 text-[10px]" />
          <span className="text-xs text-muted-foreground">{dateLabel}</span>
        </span>
      </div>
      <span className="line-clamp-2 text-sm font-medium">
        {pr.title ?? pr.issue?.title ?? identifier}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {/* L'AUTEUR distingue une PR de Numo d'une PR humaine, maintenant qu'elles
            cohabitent. Le run tranche : il ne ment pas, là où le login de la forge
            dépend de l'installation. */}
        {pr.runId ? (
          <NumoIcon animated={false} className="size-3.5 shrink-0" />
        ) : pr.author ? (
          <UserAvatar
            url={pr.author.avatar_url}
            seed={pr.author.login}
            className="size-3.5 shrink-0"
          />
        ) : null}
        {pr.runId ? (
          <span className="truncate">{t("numoAuthor")}</span>
        ) : (
          <GitLogin login={pr.author?.login} className="text-xs" />
        )}
      </span>
    </button>
  );
}

/** Un projet et ses pull requests — la coque partagée, garnie de `PrRow`. */
function PrGroupRows({
  group,
  open,
  showAll,
  collapsible,
  selectedId,
  fmtDay,
  onToggle,
  onShowAll,
  onSelect,
}: {
  group: ProjectGroup<PullRequestListItem>;
  open: boolean;
  showAll: boolean;
  collapsible: boolean;
  selectedId: string | null;
  fmtDay: (at: string) => string;
  onToggle: () => void;
  onShowAll: () => void;
  onSelect: (prId: string) => void;
}) {
  const tCommon = useTranslations("Common");
  const prs = group.items;

  // La PR OUVERTE reste visible : si elle est au-delà des cinq premières, la
  // coupe descend jusqu'à elle plutôt que de la cacher.
  const selectedIndex = prs.findIndex((p) => p.prId === selectedId);
  const shown = showAll
    ? prs
    : prs.slice(0, Math.max(PROJECT_GROUP_LIMIT, selectedIndex + 1));

  return (
    <SidebarProjectGroup
      project={group.project}
      fallbackLabel={tCommon("noProjectGroup")}
      open={open}
      collapsible={collapsible}
      onToggle={onToggle}
      hiddenCount={prs.length - shown.length}
      onShowAll={onShowAll}
      showMoreLabel={tCommon("showMore")}
      // Replié, l'en-tête garde le seul signal qui n'attend pas : un agent
      // travaille sur l'une de ces PR.
      collapsedBadge={
        prs.some((p) => p.activeRunId) ? <Spinner className="size-3 shrink-0" /> : null
      }
    >
      {shown.map((pr) => (
        <PrRow
          key={pr.prId}
          pr={pr}
          selected={pr.prId === selectedId}
          dateLabel={fmtDay(pr.updated_at)}
          onSelect={() => onSelect(pr.prId)}
        />
      ))}
    </SidebarProjectGroup>
  );
}

export function PullRequestsPage() {
  const t = useTranslations("PullRequests");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const { projects, openCreateProject } = useProjects();

  // Deep-links : `?pr=<id>` (direct, MIN-143) et `?run=<id>` (historique — la
  // sidebar d'issue et tous les liens déjà en circulation parlent en run).
  // Les deux présélectionnent la PR et basculent le filtre sur « tous » pour
  // qu'elle soit visible quel que soit son état.
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");
  const prParam = searchParams.get("pr");
  const deepLink = prParam ?? runParam;

  const [filter, setFilter] = useState<PullRequestStateFilter>(deepLink ? "all" : "open");
  const [author, setAuthor] = useState<string>(AUTHOR_ALL);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PULL_REQUESTS_PAGE);
  const [selectedPrId, setSelectedPrId] = useState<string | null>(prParam);
  const [mobileDetail, setMobileDetail] = useState(!!deepLink);
  // Issue liée ouverte dans le panneau latéral (par-dessus la page, pas de navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Accordéon de la liste : les projets REPLIÉS (tout est déplié par défaut — on
  // arrive pour voir, pas pour ouvrir) et ceux dont on a demandé toutes les PR.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /** Replie / déplie un projet. Le replier remet sa liste à ses cinq premières. */
  const toggleGroup = (key: string) => {
    const wasOpen = !collapsedGroups.has(key);
    setCollapsedGroups((prev) => toggledSet(prev, key));
    if (wasOpen && expandedGroups.has(key)) {
      setExpandedGroups((prev) => toggledSet(prev, key));
    }
  };

  // Le deep-link est ÉPINGLÉ côté serveur : la PR visée entre dans la réponse
  // même si elle tombe hors de la page (une PR d'il y a six mois). Sans ça, le
  // lien retomberait sur la première de la liste — la PR d'un autre ticket.
  const pin = useMemo(() => ({ pr: prParam, run: runParam }), [prParam, runParam]);
  const { pullRequests, hasMore, truncated, repoCount, anyPr, loading, fetching, refetch } =
    useAllPullRequestsQuery(filter, limit, pin);

  // Suit les changements de param (navigation client vers une autre PR).
  useEffect(() => {
    if (!deepLink) return;
    if (prParam) setSelectedPrId(prParam);
    setFilter("all");
    setMobileDetail(true);
  }, [deepLink, prParam]);

  // Le deep-link HISTORIQUE parle en `run` (les liens « voir la pull request »
  // portent le run le plus récent) : on le résout en `prId` dès que la liste
  // arrive. Une PR est partagée par TOUS les runs successifs de son ticket
  // (MIN-68) — on matche donc sur n'importe lequel, sinon le lien tomberait à
  // côté et l'effet de garde plus bas ouvrirait la PR d'un autre ticket.
  const deepLinkedByRun = useMemo(
    () =>
      runParam && !prParam
        ? (pullRequests.find((p) => p.runIds.includes(runParam)) ?? null)
        : null,
    [runParam, prParam, pullRequests],
  );
  // Auteurs présents dans la page chargée — le menu ne propose que ce qu'on a.
  const authors = useMemo(() => {
    const seen = new Map<string, { login: string; avatar_url: string | null }>();
    for (const pr of pullRequests) {
      if (pr.author && !seen.has(pr.author.login)) seen.set(pr.author.login, pr.author);
    }
    return [...seen.values()].sort((a, b) => a.login.localeCompare(b.login));
  }, [pullRequests]);

  const filtered = useMemo(() => {
    if (author === AUTHOR_ALL) return pullRequests;
    // « Ouvertes par Numo » se lit sur le RUN, pas sur le login : selon la forge
    // et l'installation, l'auteur d'une PR de Numo est tantôt l'app, tantôt le
    // compte connecté. Le run, lui, ne ment pas.
    if (author === AUTHOR_NUMO) return pullRequests.filter((p) => !!p.runId);
    return pullRequests.filter((p) => p.author?.login === author);
  }, [pullRequests, author]);

  /**
   * Ce que la colonne AFFICHE. Distinct de `filtered`, dont la sélection est
   * dérivée : le filtre texte ne doit pas la déplacer. Autrement chaque frappe
   * ferait retomber le détail sur la première ligne restante — et repartir
   * chercher son diff, une fois par lettre.
   *
   * Les champs cherchés sont ceux qu'on LIT sur une ligne, plus la branche :
   * c'est souvent son nom qu'on a en tête pour une PR qu'on vient de pousser.
   */
  const visible = useMemo(() => {
    if (!query.trim()) return filtered;
    return filtered.filter((p) =>
      matchesFilter(query, [
        p.title,
        p.head_branch,
        p.author?.login,
        `#${p.pr_number}`,
        p.project?.name,
        p.issue?.title,
        p.project && p.issue
          ? issueIdentifier(p.project.key, p.issue.number)
          : null,
      ]),
    );
  }, [filtered, query]);

  /**
   * La sélection est DÉRIVÉE, pas gardée par un effet.
   *
   * Elle l'était : un effet résolvait le deep-link, un second remettait la
   * sélection dans le filtre. Les deux se déclenchaient au même rendu — celui où
   * la liste arrive — et le second écrasait le premier, ouvrant la PREMIÈRE PR
   * de la liste au lieu de celle du lien. Mesuré : `?run=<run de la PR #1>`
   * ouvrait la PR #17.
   *
   * L'ordre ci-dessous DIT la règle, au lieu de la faire émerger d'une course :
   * le clic de l'utilisateur d'abord (tant qu'il est dans le filtre), puis le
   * deep-link, puis la première de la liste — et rien tant qu'un fetch est en
   * vol, sinon on ouvrirait un défaut juste avant que la bonne PR arrive.
   */
  const clicked =
    selectedPrId && filtered.some((p) => p.prId === selectedPrId) ? selectedPrId : null;
  const selectedId =
    clicked ?? deepLinkedByRun?.prId ?? (fetching ? null : (filtered[0]?.prId ?? null));
  const selected = filtered.find((p) => p.prId === selectedId) ?? null;

  // Publie la PR sélectionnée à Numo : il résout « cette PR », la lit
  // (read_pull_request) et peut lancer des changements sur l'issue liée.
  useAssistantContext(
    selected && selected.project && selected.issue
      ? {
          projectId: selected.project.id,
          issueId: selected.issue.id,
          issueIdentifier: issueIdentifier(selected.project.key, selected.issue.number),
          issueTitle: selected.issue.title,
          prNumber: selected.pr_number,
          prState: selected.pr_state,
          prRunId: selected.runId ?? undefined,
        }
      : null,
  );

  const groups = useMemo(
    () => groupByProject(visible, (p) => p.project),
    [visible],
  );
  // Un filtre en cours DÉPLIE tout et lève la coupe des cinq : chercher, c'est
  // demander à voir ce qui correspond, pas à savoir où c'est rangé.
  const filtering = query.trim().length > 0;

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  /**
   * Rien à lister NULLE PART — à distinguer d'un filtre sans résultat, qui garde
   * sa petite boîte dans la colonne. Trois marches, dans l'ordre où on les
   * franchit : un projet, un dépôt lié, puis des pull requests. `anyPr` compte
   * tous les états, sinon « aucune ouverte » passerait pour « aucune jamais ».
   */
  if (!loading && (projects.length === 0 || repoCount === 0 || !anyPr)) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {projects.length === 0 ? (
            <EmptyScene icon={GitPullRequest} title={t("emptyNoProject")}>
              <Button onClick={openCreateProject}>
                <Plus />
                {tProjects("firstProject")}
              </Button>
            </EmptyScene>
          ) : (
            /* Sans dépôt lié, il n'y a pas de bouton à offrir : le dépôt se lie
               dans les réglages D'UN projet, et on ne sait pas lequel. */
            <EmptyScene
              icon={GitPullRequest}
              title={repoCount === 0 ? t("emptyNoRepo") : t("emptyNone")}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Gauche : liste des PR ───────────────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: visible.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          <PrFilterMenu
            state={filter}
            author={author}
            authors={authors}
            onStateChange={(next) => {
              setFilter(next);
              setLimit(PULL_REQUESTS_PAGE);
            }}
            onAuthorChange={setAuthor}
          />
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          /* Des PR existent forcément ici — la surface entièrement vide est
             traitée plus haut, avant le rendu de la colonne. La liste ne peut
             donc être vide que parce qu'un filtre l'a vidée, et la même scène
             que les autres états vides le dit, à la taille de la colonne.
             « Rien ne correspond » et « aucune PR dans cet état » ne sont pas la
             même nouvelle : la première se répare en effaçant trois lettres, la
             seconde demande de rouvrir le filtre — d'où le bouton, qui n'a rien
             à offrir tant que c'est la saisie qui restreint.

             Et quand l'état est la SEULE restriction, la scène le nomme. Dès
             qu'un auteur s'y ajoute, elle repasse au libellé générique : « aucune
             pull request ouverte » serait faux s'il en existe, mais d'un autre. */
          <EmptyScene
            size="compact"
            icon={GitPullRequest}
            title={
              query.trim()
                ? tCommon("noFilterMatch")
                : t(
                    (author === AUTHOR_ALL
                      ? STATE_FILTERS.find((s) => s.value === filter)?.empty
                      : undefined) ?? "emptyState",
                  )
            }
            className="py-10"
          >
            {query.trim() ? null : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setAuthor(AUTHOR_ALL);
                  setLimit(PULL_REQUESTS_PAGE);
                }}
              >
                {t("emptyShowAll")}
              </Button>
            )}
          </EmptyScene>
        ) : (
          <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
            {/* Un projet, ses pull requests — même accordéon que la colonne des
                conversations de l'agent (`SidebarProjectGroup`). C'est lui qui
                porte le projet, et c'est pour ça que les lignes ne le portent
                plus : il serait écrit une fois par ligne sous son propre titre. */}
            {groups.map((g) => (
              <PrGroupRows
                key={g.key}
                group={g}
                open={filtering || !collapsedGroups.has(g.key)}
                showAll={filtering || expandedGroups.has(g.key)}
                collapsible={!filtering}
                selectedId={selectedId}
                fmtDay={fmtDay}
                onToggle={() => toggleGroup(g.key)}
                onShowAll={() => setExpandedGroups((prev) => toggledSet(prev, g.key))}
                onSelect={(prId) => {
                  setSelectedPrId(prId);
                  setMobileDetail(true);
                }}
              />
            ))}

            {hasMore ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 self-center"
                disabled={fetching}
                onClick={() => setLimit((n) => n + PULL_REQUESTS_PAGE)}
              >
                {fetching ? <Spinner /> : null}
                {t("loadMore")}
              </Button>
            ) : null}

            {/* La pagination d'une forge a été coupée : le dire, plutôt que de
                laisser croire que la liste est complète. */}
            {truncated ? (
              <p className="px-3 pt-3 text-xs text-muted-foreground">{t("listTruncated")}</p>
            ) : null}
          </div>
        )}
      </SecondarySidebar>

      {/* ── Droite : détail de la PR ────────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {selected ? (
          <PrDetail
            key={selected.prId}
            item={selected}
            onBack={() => setMobileDetail(false)}
            onRefetchList={() => void refetch()}
            onOpenIssue={(issueId, projectId) => setPanel({ projectId, issueId })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {/* Panneau latéral de l'issue liée — overlay par-dessus la page (pas de nav). */}
      {panel ? (
        <PrIssuePanel
          key={`${panel.projectId}:${panel.issueId}`}
          projectId={panel.projectId}
          issueId={panel.issueId}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}
