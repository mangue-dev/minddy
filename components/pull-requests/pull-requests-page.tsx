"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, SegmentedControl, Skeleton, Spinner, cn } from "mangue-ui";
import { GitPullRequest } from "lucide-react";
import { PrDetail } from "@/components/pull-requests/pr-detail";
import { useAllPullRequestsQuery } from "@/lib/use-agent-runs";
import { issueIdentifier } from "@/lib/issue-constants";
import type { PullRequestListItem } from "@/lib/agent-api";

/**
 * Page Pull Requests (MIN-66) — vue liste/détail façon triage : à gauche toutes
 * les PR de Numo (tous projets accessibles), à droite le diff + commentaires +
 * actions. Alimentée par /api/pull-requests (dédoublonné par PR).
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

  const [filter, setFilter] = useState<Filter>("open");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const filtered = useMemo(
    () => pullRequests.filter((p) => matchesFilter(p.pr_state, filter)),
    [pullRequests, filter],
  );

  const selected = filtered.find((p) => p.runId === selectedRunId) ?? null;

  // Garde une sélection valide : défaut = 1re PR, avance quand elle quitte le filtre.
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedRunId !== null) setSelectedRunId(null);
      return;
    }
    if (!selectedRunId || !filtered.some((p) => p.runId === selectedRunId)) {
      setSelectedRunId(filtered[0].runId);
    }
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
        <div className="flex items-center gap-2 px-4 pt-5 pb-2">
          <h1 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h1>
          <span className="text-sm tabular-nums text-muted-foreground">{filtered.length}</span>
        </div>
        <div className="px-3 pb-2">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: t("filterOpen") },
              { value: "merged", label: t("filterMerged") },
              { value: "closed", label: t("filterClosed") },
              { value: "all", label: t("filterAll") },
            ]}
          />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <GitPullRequest className="size-6" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{t("emptyState")}</p>
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
                    <span className="truncate text-xs text-muted-foreground">
                      {pr.project.name}
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
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
