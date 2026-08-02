"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  Spinner,
  cn,
} from "mangue-ui";
import { Check, ChevronDown, ChevronRight, GitPullRequest } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { GitLogin } from "@/components/git/git-login";
import { NumoIcon } from "@/components/numo-icon";
import { PrDetail } from "@/components/pull-requests/pr-detail";
import { PrIssuePanel } from "@/components/pull-requests/pr-issue-panel";
import { PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import { PULL_REQUESTS_PAGE, useAllPullRequestsQuery } from "@/lib/use-agent-runs";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { prIdentifier } from "@/lib/repo-providers";
import type { MessageKey } from "@/lib/i18n-keys";
import type { PullRequestStateFilter } from "@/lib/agent-api";

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
}> = [
  { value: "open", label: "filterOpen" },
  { value: "merged", label: "filterMerged" },
  { value: "closed", label: "filterClosed" },
  { value: "all", label: "filterAll" },
];

/** Le style commun des deux déclencheurs de filtre de la sidebar : un bouton
    fantôme discret, la forme que prennent TOUS les filtres de l'app (barre du
    board, en-tête de cycle) — pas un champ de formulaire. */
const FILTER_TRIGGER = "px-2 font-normal text-muted-foreground hover:text-foreground";

export function PullRequestsPage() {
  const t = useTranslations("PullRequests");
  const format = useFormatter();

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
  const [limit, setLimit] = useState(PULL_REQUESTS_PAGE);
  const [selectedPrId, setSelectedPrId] = useState<string | null>(prParam);
  const [mobileDetail, setMobileDetail] = useState(!!deepLink);
  // Issue liée ouverte dans le panneau latéral (par-dessus la page, pas de navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);

  // Le deep-link est ÉPINGLÉ côté serveur : la PR visée entre dans la réponse
  // même si elle tombe hors de la page (une PR d'il y a six mois). Sans ça, le
  // lien retomberait sur la première de la liste — la PR d'un autre ticket.
  const pin = useMemo(() => ({ pr: prParam, run: runParam }), [prParam, runParam]);
  const { pullRequests, hasMore, truncated, loading, fetching, refetch } =
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

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  return (
    <div className="flex h-full min-h-0">
      {/* ── Gauche : liste des PR ───────────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 w-full shrink-0 flex-col overflow-y-auto border-border md:flex md:w-80 md:border-r",
          mobileDetail ? "hidden" : "flex",
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-5 pb-3">
          <h1 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h1>
          <span className="text-sm tabular-nums text-muted-foreground">{filtered.length}</span>
          {/* `-mr-2` compense le padding du bouton : son libellé s'aligne alors
              sur le bord droit de la liste, pas 8 px en-deçà. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(FILTER_TRIGGER, "-mr-2 ml-auto")}>
                {t(STATE_FILTERS.find((s) => s.value === filter)?.label ?? "filterOpen")}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATE_FILTERS.map((state) => (
                <DropdownMenuItem
                  key={state.value}
                  onSelect={() => {
                    setFilter(state.value);
                    setLimit(PULL_REQUESTS_PAGE);
                  }}
                >
                  {t(state.label)}
                  {state.value === filter ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filtre d'auteur — la seconde question qu'on se pose devant une liste
            où Numo et les humains cohabitent. Masqué tant qu'il n'y a qu'un seul
            auteur : il n'aurait rien à trancher. */}
        {authors.length > 1 ? (
          <div className="flex px-4 pb-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={cn(FILTER_TRIGGER, "-ml-2 max-w-full")}>
                  {author === AUTHOR_ALL ? (
                    <span className="min-w-0 truncate">{t("filterByAuthor")}</span>
                  ) : author === AUTHOR_NUMO ? (
                    <span className="min-w-0 truncate">{t("filterNumoOnly")}</span>
                  ) : (
                    // `GitLogin` tronque déjà le nom sans écraser sa pastille
                    // « bot » — l'envelopper d'un `truncate` la couperait.
                    <GitLogin login={author} />
                  )}
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-w-72">
                <DropdownMenuItem onSelect={() => setAuthor(AUTHOR_ALL)}>
                  {t("filterByAuthor")}
                  {author === AUTHOR_ALL ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAuthor(AUTHOR_NUMO)}>
                  {t("filterNumoOnly")}
                  {author === AUTHOR_NUMO ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
                {authors.map((a) => (
                  <DropdownMenuItem key={a.login} onSelect={() => setAuthor(a.login)}>
                    <GitLogin login={a.login} />
                    {a.login === author ? <Check className="ml-auto size-4" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<GitPullRequest className="size-6" />}
              description={t("emptyState")}
            />
          </div>
        ) : (
          <div className="flex flex-col px-2 pb-4">
            {filtered.map((pr) => {
              // L'identifiant de la PR d'abord — c'est CETTE ligne qu'on regarde ;
              // le ticket lié se lit à droite, derrière un chevron qui dit la
              // relation (même forme que le sous-ticket dans la carte d'issue).
              const identifier = prIdentifier(pr.provider, pr.pr_number);
              const linkedIssue =
                pr.issue && pr.project
                  ? issueIdentifier(pr.project.key, pr.issue.number)
                  : null;
              return (
                <button
                  key={pr.prId}
                  type="button"
                  onClick={() => {
                    setSelectedPrId(pr.prId);
                    setMobileDetail(true);
                  }}
                  // `selectedId` — la sélection DÉRIVÉE — et non `selectedPrId`,
                  // qui n'enregistre que les CLICS. Les deux divergent dans les
                  // deux cas d'ouverture les plus courants : à l'arrivée sur la
                  // page (rien n'a été cliqué, la première PR s'affiche) et sur
                  // un `?run=`, résolu en PR sans passer par l'état. La liste ne
                  // surlignait alors rien, en face d'une PR bel et bien ouverte.
                  aria-current={pr.prId === selectedId ? "true" : undefined}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                    pr.prId === selectedId
                      ? "bg-muted"
                      : "hover:bg-muted/60 focus-visible:bg-muted/60",
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
                      <span className="text-xs text-muted-foreground">{fmtDay(pr.updated_at)}</span>
                    </span>
                  </div>
                  <span className="line-clamp-2 text-sm font-medium">
                    {pr.title ?? pr.issue?.title ?? identifier}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {/* L'AUTEUR distingue une PR de Numo d'une PR humaine, maintenant
                        qu'elles cohabitent. Le run tranche : il ne ment pas, là où le
                        login de la forge dépend de l'installation. */}
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
                    {pr.project ? (
                      <>
                        <span aria-hidden>·</span>
                        <ProjectOrb
                          seed={pr.project.id}
                          iconUrl={pr.project.icon_url}
                          className="size-3.5 shrink-0"
                        />
                        <span className="truncate">{pr.project.name}</span>
                      </>
                    ) : null}
                  </span>
                </button>
              );
            })}

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
      </div>

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
