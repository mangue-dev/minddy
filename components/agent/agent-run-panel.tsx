"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { GitPullRequest, MessagesSquare } from "lucide-react";
import { isAgentRunWorking, type AgentRunSummary } from "@/lib/agent-api";
import { ModelBadge } from "@/components/model-badge";
import { AgentBeam } from "@/components/agent-beam";
import { AgentChatModal } from "./agent-chat-modal";

/**
 * Résumé compact de la DERNIÈRE run d'agent de l'issue (MIN-46 + MIN-68) dans le
 * panneau d'issue : modèle, PR liée, et deux actions — ouvrir sa conversation (modal
 * grand format : on l'y suit, on l'interrompt, on lui parle à chaud, et on navigue
 * dans les runs précédentes) et voir la pull request. Lancer une run NEUVE est
 * l'affaire du bouton au-dessus (`LaunchAgentButton`), pas de ce panneau.
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
  // L'agent travaille → le container porte le liseré animé (comme les cartes), aucun
  // badge. Au repos, on n'affiche PAS de badge d'état (le résultat qui compte est la
  // PR) — seulement « Pull request disponible » quand une PR existe.
  const working = isAgentRunWorking(run.status);
  // Un ticket peut enchaîner plusieurs runs sur la même PR (MIN-68) : l'indicateur
  // doit dire où en est CETTE PR — disponible, fusionnée (livrée) ou fermée.
  const prLabel =
    run.pr_state === "merged"
      ? t("prMerged")
      : run.pr_state === "closed"
        ? t("prClosed")
        : t("prAvailable");

  return (
    <AgentBeam active={working} className="rounded-xl">
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ModelBadge model={run.model} className="min-w-0" />
        {/* L'état de la PR, pas sa simple existence : `pr_number` survit au merge et
            à la fermeture, donc s'y fier annonçait « disponible » sur du travail
            déjà livré ou refusé. */}
        {!working && run.pr_number != null && prLabel ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
              run.pr_state === "merged"
                ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                : run.pr_state === "closed"
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500",
            )}
          >
            <GitPullRequest className="size-3.5" />
            {prLabel}
          </span>
        ) : null}
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

      {/* Ouvre CETTE run (la dernière), pas un nouveau lancement : c'est le chemin
          de reprise à chaud, et d'accès à l'historique des runs de l'issue. */}
      <AgentChatModal
        open={chatOpen}
        onOpenChange={setChatOpen}
        issueId={issueId}
        issueIdentifier={issueIdentifier}
        initialRunId={run.id}
      />
    </div>
    </AgentBeam>
  );
}
