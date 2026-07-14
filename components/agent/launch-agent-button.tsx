"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { Bot, ExternalLink } from "lucide-react";
import { useIssueAgentRunsQuery } from "@/lib/use-agent-runs";
import { isAgentRunActive, type AgentRunStatus } from "@/lib/agent-api";
import { LaunchAgentDialog } from "./launch-agent-dialog";

const STATUS_KEY: Record<AgentRunStatus, string> = {
  queued: "statusQueued",
  running: "statusRunning",
  needs_input: "statusNeedsInput",
  completed: "statusCompleted",
  failed: "statusFailed",
  canceled: "statusCanceled",
};

const PR_STATE_KEY: Record<string, string> = {
  merged: "prMerged",
  closed: "prClosed",
  open: "prOpen",
  draft: "prOpen",
};

/**
 * Bouton « Lancer un agent » du panneau d'issue (MIN-46) : lance l'agent de code
 * (dialogue avec picker de modèle), reflète l'état d'un run actif, et lie la PR
 * du dernier run. La vue live détaillée arrive en Phase 7.
 */
export function LaunchAgentButton({ issueId }: { issueId: string }) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);
  const { runs } = useIssueAgentRunsQuery(issueId);

  const activeRun = runs.find((r) => isAgentRunActive(r.status)) ?? null;
  const latest = runs[0] ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("sectionTitle")}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={!!activeRun}
        >
          <Bot className="size-4" />
          {activeRun ? t(STATUS_KEY[activeRun.status]) : t("launchButton")}
        </Button>
      </div>

      {latest?.pr_url ? (
        <a
          href={latest.pr_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
        >
          <ExternalLink className="size-3" />
          {t(PR_STATE_KEY[latest.pr_state ?? "open"] ?? "prOpen")}
          {latest.pr_number ? ` #${latest.pr_number}` : ""}
        </a>
      ) : null}

      <LaunchAgentDialog open={open} onOpenChange={setOpen} issueId={issueId} />
    </div>
  );
}
