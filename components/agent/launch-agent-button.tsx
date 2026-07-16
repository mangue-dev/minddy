"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import { useIssueAgentRunsQuery } from "@/lib/use-agent-runs";
import { isAgentRunActive } from "@/lib/agent-api";
import { AgentChatModal } from "./agent-chat-modal";
import { AgentRunPanel } from "./agent-run-panel";

/**
 * Section « Agent de code » du panneau d'issue (MIN-46 + MIN-68) : le lanceur et,
 * s'il existe un run, sa vue live (statut, événements, PR).
 *
 * Le bouton lance TOUJOURS une run NEUVE (modal en phase compose, avec picker de
 * modèle) — il ne rouvre jamais la dernière run terminée ; c'est le point d'entrée
 * « froid ». La reprise à chaud passe par « Ouvrir la conversation » du panneau
 * ci-dessous. Une seule run à la fois par issue : tant qu'une run est active, le
 * bouton est désactivé et renvoie vers sa conversation.
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

  const launchButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setOpen(true)}
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

      {/* `compose` → la modal s'ouvre sur un composer VIERGE : une NOUVELLE session
          (sans lui, elle rouvrirait la dernière conversation de l'issue). */}
      <AgentChatModal
        open={open}
        onOpenChange={setOpen}
        issueId={issueId}
        issueIdentifier={issueIdentifier}
        compose
      />
    </div>
  );
}
