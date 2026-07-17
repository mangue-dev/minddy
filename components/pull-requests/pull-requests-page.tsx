"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  cn,
} from "mangue-ui";
import { GitPullRequest } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PrDetail } from "@/components/pull-requests/pr-detail";
import { PrIssuePanel } from "@/components/pull-requests/pr-issue-panel";
import { ProjectOrb } from "@/components/project-orb";
import { useAllPullRequestsQuery } from "@/lib/use-agent-runs";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { issueIdentifier } from "@/lib/issue-constants";
import type { PullRequestListItem } from "@/lib/agent-api";

/**
 * Page Pull Requests (MIN-66) — vue liste/détail façon triage : à gauche toutes
 * les PR de Numo (tous projets accessibles), à droite le diff + commentaires +
 * actions. Alimentée par /api/pull-requests (dédoublonné par PR). La PR
 * sélectionnée est publiée dans le contexte de Numo (il peut la lire / agir).
 */

type Filter = "open" | "merged" | "closed" | "all";

function matchesFilter(state: PullRequestListItem["pr_state"], filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "merged") return state === "merged";
  if (filter === "closed") return state === "closed";
  // open : open, draft, ou état non encore synchronisé.
  return state === "open" || state === "draft" || state == null;
}

function stateVariant(
  state: PullRequestListItem["pr_state"],
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "merged") return "default";
  if (state === "closed") return "destructive";
  return "secondary";
}

export function PullRequestsPage() {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const { pullRequests, loading, refetch } = useAllPullRequestsQuery();

  // Deep-link depuis la sidebar d'issue (« Voir la pull request ») : ?run=<id>
  // présélectionne la PR de ce run et bascule le filtre sur « tous » pour qu'elle
  // soit toujours visible quel que soit son état.
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");

  const [filter, setFilter] = useState<Filter>(runParam ? "all" : "open");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runParam);
  const [mobileDetail, setMobileDetail] = useState(!!runParam);
  // Issue liée ouverte dans le panneau latéral (par-dessus la page, pas de navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);

  // Suit les changements de param (navigation client vers un autre run).
  useEffect(() => {
    if (!runParam) return;
    setSelectedRunId(runParam);
    setFilter("all");
    setMobileDetail(true);
  }, [runParam]);

  const filtered = useMemo(
    () => pullRequests.filter((p) => matchesFilter(p.pr_state, filter)),
    [pullRequests, filter],
  );

  // Une PR est partagée par TOUS les runs successifs de son issue (MIN-68) : les
  // liens « voir la pull request » portent le run le plus récent, alors que l'item
  // est identifié par le run canonique (le plus ancien). On matche donc sur
  // n'importe quel run de la PR — sinon le deep-link tombe à côté et l'effet de
  // garde ci-dessous ouvrirait la PR d'un autre ticket sans rien signaler.
  const holdsRun = (p: PullRequestListItem, runId: string | null): boolean =>
    !!runId && (p.runIds?.includes(runId) ?? p.runId === runId);
  const selected = filtered.find((p) => holdsRun(p, selectedRunId)) ?? null;

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
          prState: selected.pr_state ?? undefined,
          prRunId: selected.runId,
        }
      : null,
  );

  // Garde une sélection valide : défaut = 1re PR, avance quand elle quitte le
  // filtre. On ne remet PAS à null sur liste vide : pendant le chargement la
  // liste est vide et cela écraserait une présélection deep-link (?run=) avant
  // que les données arrivent. `selected` renvoie null tout seul si l'id n'existe pas.
  useEffect(() => {
    if (filtered.length === 0) return;
    if (!selectedRunId || !filtered.some((p) => holdsRun(p, selectedRunId))) {
      setSelectedRunId(filtered[0].runId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selectedRunId]);

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  const stateLabel = (state: PullRequestListItem["pr_state"]): string =>
    t(state === "merged" ? "stateMerged" : state === "closed" ? "stateClosed" : "stateOpen");

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
          {/* Pas de classe de largeur : le trigger est `w-fit`, il se cale donc
              sur son libellé et tient sur la ligne du titre. */}
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger size="sm" className="ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t("filterOpen")}</SelectItem>
              <SelectItem value="merged">{t("filterMerged")}</SelectItem>
              <SelectItem value="closed">{t("filterClosed")}</SelectItem>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
              const identifier =
                pr.issue && pr.project
                  ? issueIdentifier(pr.project.key, pr.issue.number)
                  : `#${pr.pr_number}`;
              return (
                <button
                  key={pr.runId}
                  type="button"
                  onClick={() => {
                    setSelectedRunId(pr.runId);
                    setMobileDetail(true);
                  }}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                    pr.runId === selectedRunId
                      ? "bg-muted"
                      : "hover:bg-muted/60 focus-visible:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {identifier}
                    </span>
                    {pr.activeRunId ? <Spinner className="size-3 shrink-0" /> : null}
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <Badge variant={stateVariant(pr.pr_state)} className="h-5 px-2 text-[10px]">
                        {stateLabel(pr.pr_state)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fmtDay(pr.updated_at)}</span>
                    </span>
                  </div>
                  <span className="line-clamp-2 text-sm font-medium">
                    {pr.issue?.title ?? identifier}
                  </span>
                  {pr.project ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <ProjectOrb seed={pr.project.id} className="size-3.5 shrink-0" />
                      <span className="truncate">{pr.project.name}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
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
            key={selected.runId}
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
