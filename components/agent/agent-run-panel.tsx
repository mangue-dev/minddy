"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Spinner, toast } from "mangue-ui";
import { Activity, GitPullRequest, Square } from "lucide-react";
import { issueAgentRunsQueryKey } from "@/lib/use-agent-runs";
import {
  isAgentRunActive,
  stopAgentRunApi,
  type AgentRunSummary,
} from "@/lib/agent-api";
import { ModelBadge } from "@/components/model-badge";
import { AgentActivityPanel } from "./agent-activity-panel";
import { AgentStatusBadge } from "./agent-run-status";

/**
 * Résumé compact d'un run d'agent (MIN-46) dans le panneau d'issue : statut +
 * modèle, bouton stop, et deux actions — ouvrir l'activité (modal réutilisant le
 * shell Numo) et voir la pull request (page Pull Requests présélectionnée sur ce
 * run). Le flux d'événements et la review de PR ne vivent plus ici : ils sont
 * respectivement dans la modal et sur la page Pull Requests.
 */
export function AgentRunPanel({ issueId, run }: { issueId: string; run: AgentRunSummary }) {
  const t = useTranslations("Agent");
  const router = useRouter();
  const queryClient = useQueryClient();
  const active = isAgentRunActive(run.status);
  const [stopping, setStopping] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopAgentRunApi(run.id);
      await queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) });
      toast.success(t("stoppedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ModelBadge model={run.model} className="min-w-0" />
        <div className="flex shrink-0 items-center gap-2">
          <AgentStatusBadge status={run.status} />
          {active ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => void stop()} disabled={stopping}>
              {stopping ? <Spinner /> : <Square className="size-3.5" />}
              {t("stop")}
            </Button>
          ) : null}
        </div>
      </div>

      {run.status === "failed" && run.error_message ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          {run.error_message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => setActivityOpen(true)}
        >
          <Activity className="size-3.5" />
          {t("viewActivity")}
        </Button>
        {run.pr_number != null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => router.push(`/pull-requests?run=${run.id}`)}
          >
            <GitPullRequest className="size-3.5" />
            {t("viewPullRequest")}
          </Button>
        ) : null}
      </div>

      <AgentActivityPanel open={activityOpen} onOpenChange={setActivityOpen} run={run} />
    </div>
  );
}
