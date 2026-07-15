"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { GitPullRequest, MessagesSquare } from "lucide-react";
import { isAgentRunWorking, type AgentRunSummary } from "@/lib/agent-api";
import { ModelBadge } from "@/components/model-badge";
import { AgentBeam } from "@/components/agent-beam";
import { AgentChatModal } from "./agent-chat-modal";
import { AgentStatusBadge } from "./agent-run-status";

/**
 * Résumé compact de la session d'agent (MIN-46) dans le panneau d'issue : statut +
 * modèle, et deux actions — ouvrir la conversation (modal grand format, où l'on
 * suit / interrompt / relance l'agent) et voir la pull request. L'interruption et
 * le flux d'événements vivent dans la modal ; la review de PR sur la page dédiée.
 */
export function AgentRunPanel({
  issueId,
  issueIdentifier,
  run,
}: {
  issueId: string;
  issueIdentifier: string;
  run: AgentRunSummary;
}) {
  const t = useTranslations("Agent");
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  // L'agent travaille → le container porte le liseré animé (comme les cartes) et
  // on masque le badge « En cours » : le beam signale l'activité (les autres
  // statuts — terminé/attente/échec — gardent leur badge).
  const working = isAgentRunWorking(run.status);

  return (
    <AgentBeam active={working} className="rounded-xl">
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ModelBadge model={run.model} className="min-w-0" />
        {!working ? <AgentStatusBadge status={run.status} /> : null}
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
          onClick={() => setChatOpen(true)}
        >
          <MessagesSquare className="size-3.5" />
          {t("openConversation")}
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

      <AgentChatModal
        open={chatOpen}
        onOpenChange={setChatOpen}
        issueId={issueId}
        issueIdentifier={issueIdentifier}
        initialRun={run}
      />
    </div>
    </AgentBeam>
  );
}
