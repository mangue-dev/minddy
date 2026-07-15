"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { Bot } from "lucide-react";
import { useIssueAgentRunsQuery } from "@/lib/use-agent-runs";
import { isAgentRunActive } from "@/lib/agent-api";
import { AgentChatModal } from "./agent-chat-modal";
import { AgentRunPanel } from "./agent-run-panel";

/**
 * Section « Agent de code » du panneau d'issue (MIN-46) : le lanceur (modal
 * conversationnelle avec picker de modèle) et, s'il existe un run, sa vue live
 * (statut, événements, stop, review de PR). Un seul run actif à la fois par issue.
 */
export function LaunchAgentButton({
  issueId,
  issueIdentifier,
}: {
  issueId: string;
  issueIdentifier: string;
}) {
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
          {t("launchButton")}
        </Button>
      </div>

      {latest ? (
        <AgentRunPanel
          issueId={issueId}
          issueIdentifier={issueIdentifier}
          run={latest}
        />
      ) : null}

      <AgentChatModal
        open={open}
        onOpenChange={setOpen}
        issueId={issueId}
        issueIdentifier={issueIdentifier}
      />
    </div>
  );
}
