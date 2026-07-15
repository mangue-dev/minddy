"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import { Maximize2, Minimize2, X } from "lucide-react";
import {
  panelSheetClassName,
  panelOverlayClassName,
  type PanelDisplayMode,
} from "@/components/assistant/panel-geometry";
import { AgentConversation } from "./agent-conversation";

/**
 * Modal conversationnelle de l'agent de code (MIN-46). Réutilise le shell du chat
 * Numo (Sheet flottant grand format + morph compact/étendu) et héberge le cœur
 * partagé `AgentConversation` (identique à la page Agents). Les boutons
 * agrandir/replier/fermer sont fournis en `headerActions` ; l'en-tête gauche (modèle
 * en live / issue ciblée en compose) et tout le comportement viennent du cœur.
 *
 * `initialRunId` ouvre une run précise (« Ouvrir la conversation »). Sans lui, la
 * modal ouvre la run active de l'issue, ou compose une NOUVELLE run à froid — c'est
 * la modal du bouton « Lancer un agent » (MIN-68).
 */
export function AgentChatModal({
  open,
  onOpenChange,
  issueId,
  issueIdentifier,
  initialRunId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  /** Identifiant lisible (MIN-42) — pré-écrit dans le prompt en phase compose. */
  issueIdentifier: string;
  /** Ouvre CETTE run (sinon : run active de l'issue, à défaut nouvelle run). */
  initialRunId?: string | null;
}) {
  const t = useTranslations("Agent");
  const tc = useTranslations("Common");
  const ta = useTranslations("Assistant");

  // Grand format par défaut (vrai modal centré) ; repliable en widget de coin.
  const [displayMode, setDisplayMode] = useState<PanelDisplayMode>("expanded");
  const isExpanded = displayMode === "expanded";
  const toggleDisplayMode = () =>
    setDisplayMode((prev) => (prev === "compact" ? "expanded" : "compact"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName={panelOverlayClassName(displayMode)}
        data-mode={displayMode}
        className={panelSheetClassName(displayMode)}
      >
        <SheetTitle className="sr-only">{t("dialogTitle")}</SheetTitle>

        <AgentConversation
          active={open}
          issueId={issueId}
          issueIdentifier={issueIdentifier}
          initialRunId={initialRunId}
          headerActions={
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hidden md:inline-flex"
                    aria-label={isExpanded ? ta("collapse") : ta("expand")}
                    onClick={toggleDisplayMode}
                  >
                    {isExpanded ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {isExpanded ? ta("collapse") : ta("expand")}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tc("close")}
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} align="end">
                  {tc("close")}
                </TooltipContent>
              </Tooltip>
            </>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
