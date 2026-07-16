"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import { useIssueAgentRunsQuery } from "@/lib/use-agent-runs";
import { isAgentRunActive } from "@/lib/agent-api";
import { setAgentComposeDraft } from "@/lib/agent-compose-draft";
import { agentLaunchPromptVariant } from "@/lib/agent-launch-prompt";
import type { IssueEffort } from "@/lib/issue-constants";
import { AgentRunPanel } from "./agent-run-panel";

/**
 * Section « Agent de code » du panneau d'issue (MIN-46 + MIN-68) : le lanceur et,
 * s'il existe un run, sa vue live (statut, événements, PR).
 *
 * Le bouton lance TOUJOURS une run NEUVE — il ne rouvre jamais la dernière run
 * terminée ; c'est le point d'entrée « froid ». Plutôt qu'ouvrir une modal, il
 * NAVIGUE vers la page Agents avec un brouillon de composition optimiste (une entrée
 * de liste pour cette issue) : l'utilisateur y rédige le 1er message dans le même
 * cadre que les sessions existantes. S'il n'envoie rien, l'entrée disparaît ; dès
 * qu'il envoie, elle devient une vraie session. La reprise à chaud d'un run existant
 * passe, elle, par « Ouvrir la conversation » du panneau ci-dessous. Une seule run à
 * la fois par issue : tant qu'une run est active, le bouton est désactivé.
 */
export function LaunchAgentButton({
  issueId,
  issueNumber,
  issueTitle,
  issuePlan,
  issueEffort,
  projectId,
  projectKey,
  issueIdentifier,
}: {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  issuePlan: string | null;
  issueEffort: IssueEffort | null;
  projectId: string;
  projectKey: string;
  issueIdentifier: string;
}) {
  const t = useTranslations("Agent");
  const router = useRouter();
  const { runs } = useIssueAgentRunsQuery(issueId);

  const activeRun = runs.find((r) => isAgentRunActive(r.status)) ?? null;
  const latest = runs[0] ?? null;

  const launch = () => {
    // Brouillon posé AVANT la navigation (la page le lit au montage). Le param
    // `?compose=` le verrouille à cette issue : une visite ultérieure de /agents,
    // sans le param, l'ignore. Aucune run n'existe encore — c'est de l'UI pure.
    const variant = agentLaunchPromptVariant({ plan: issuePlan, effort: issueEffort });
    setAgentComposeDraft({
      issueId,
      issueNumber,
      issueTitle,
      projectId,
      projectKey,
      prompt: `${t("launchPrompt.head", { identifier: issueIdentifier, title: issueTitle })}\n\n${t(`launchPrompt.${variant}`)}`,
    });
    router.push(`/agents?compose=${issueId}`);
  };

  const launchButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={launch}
      disabled={!!activeRun}
    >
      <NumoIcon className="size-4" />
      {latest ? t("launchNewButton") : t("launchButton")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("sectionTitle")}</span>
        {activeRun ? (
          <Tooltip>
            {/* Un bouton désactivé n'émet pas d'événement de survol : le trigger
                doit envelopper, pas remplacer. */}
            <TooltipTrigger asChild>
              <span tabIndex={0}>{launchButton}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              {t("errorAlreadyRunning")}
            </TooltipContent>
          </Tooltip>
        ) : (
          launchButton
        )}
      </div>

      {latest ? (
        <AgentRunPanel
          issueId={issueId}
          issueIdentifier={issueIdentifier}
          run={latest}
        />
      ) : null}
    </div>
  );
}
