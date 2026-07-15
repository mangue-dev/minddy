"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Skeleton, cn } from "mangue-ui";
import { AgentSessionDetail } from "@/components/agents/agent-session-detail";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { PrIssuePanel } from "@/components/pull-requests/pr-issue-panel";
import { ProjectOrb } from "@/components/project-orb";
import { NumoIcon } from "@/components/numo-icon";
import { useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { issueIdentifier } from "@/lib/issue-constants";

/**
 * Page Agents — vue liste/détail façon Pull Requests : à gauche TOUTES les sessions
 * de l'agent Numo (tous projets accessibles, sans filtre), à droite la conversation
 * inline (`AgentSessionDetail` → `AgentConversation`, le même cœur que la modal). Une
 * SESSION = une issue ; le titre affiché est dérivé du titre de l'issue liée.
 * Alimentée par /api/agent-runs (dédoublonné par issue). La session sélectionnée est
 * publiée dans le contexte de Numo (il peut la lire / agir sur l'issue).
 */
export function AgentsPage() {
  const t = useTranslations("Agents");
  const format = useFormatter();
  const { sessions, loading } = useAgentSessionsQuery();

  // Deep-link (« Ouvrir l'agent » depuis ailleurs) : ?issue=<issueId> présélectionne
  // la session de cette issue (toujours visible — la liste n'est pas filtrée).
  const searchParams = useSearchParams();
  const issueParam = searchParams.get("issue");

  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(issueParam);
  const [mobileDetail, setMobileDetail] = useState(!!issueParam);
  // Issue liée ouverte dans le panneau latéral (par-dessus la page, pas de navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);

  // Suit les changements de param (navigation client vers une autre session).
  useEffect(() => {
    if (!issueParam) return;
    setSelectedIssueId(issueParam);
    setMobileDetail(true);
  }, [issueParam]);

  const selected = sessions.find((s) => s.issue?.id === selectedIssueId) ?? null;

  // Publie la session sélectionnée à Numo : il résout « cette issue » (et sa PR le
  // cas échéant), la lit et peut agir dessus.
  useAssistantContext(
    selected && selected.project && selected.issue
      ? {
          projectId: selected.project.id,
          issueId: selected.issue.id,
          issueIdentifier: issueIdentifier(selected.project.key, selected.issue.number),
          issueTitle: selected.issue.title,
          ...(selected.pr_number != null
            ? {
                prNumber: selected.pr_number,
                prState: selected.pr_state ?? undefined,
                prRunId: selected.runId,
              }
            : {}),
        }
      : null,
  );

  // Garde une sélection valide : défaut = 1re session, avance quand la sélection
  // disparaît. On ne remet PAS à null sur liste vide (chargement / présélection deep-link).
  useEffect(() => {
    if (sessions.length === 0) return;
    if (!selectedIssueId || !sessions.some((s) => s.issue?.id === selectedIssueId)) {
      setSelectedIssueId(sessions[0].issue?.id ?? null);
    }
  }, [sessions, selectedIssueId]);

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  return (
    <div className="flex h-full min-h-0">
      {/* ── Gauche : liste des sessions ─────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 w-full shrink-0 flex-col overflow-y-auto border-border md:flex md:w-80 md:border-r",
          mobileDetail ? "hidden" : "flex",
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-5 pb-2">
          <h1 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h1>
          <span className="text-sm tabular-nums text-muted-foreground">{sessions.length}</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <NumoIcon className="size-6" animated={false} />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{t("emptyState")}</p>
          </div>
        ) : (
          <div className="flex flex-col px-2 pb-4">
            {sessions.map((s) => {
              const identifier =
                s.issue && s.project
                  ? issueIdentifier(s.project.key, s.issue.number)
                  : "—";
              return (
                <button
                  key={s.issue?.id ?? s.runId}
                  type="button"
                  onClick={() => {
                    setSelectedIssueId(s.issue?.id ?? null);
                    setMobileDetail(true);
                  }}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                    s.issue?.id === selectedIssueId
                      ? "bg-muted"
                      : "hover:bg-muted/60 focus-visible:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {identifier}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <AgentStatusBadge
                        status={s.status}
                        working={s.working}
                        prNumber={s.pr_number}
                        prState={s.pr_state}
                        className="h-5 px-2 text-[10px]"
                      />
                      <span className="text-xs text-muted-foreground">{fmtDay(s.updated_at)}</span>
                    </span>
                  </div>
                  <span className="line-clamp-2 text-sm font-medium">
                    {s.issue?.title ?? identifier}
                  </span>
                  {s.project ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <ProjectOrb seed={s.project.id} className="size-3.5 shrink-0" />
                      <span className="truncate">{s.project.name}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Droite : conversation de la session ─────────────────────────── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {selected ? (
          <AgentSessionDetail
            key={selected.issue?.id ?? selected.runId}
            item={selected}
            onBack={() => setMobileDetail(false)}
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
