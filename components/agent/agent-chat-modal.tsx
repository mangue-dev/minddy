"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
} from "mangue-ui";
import { Maximize2, Minimize2, X } from "lucide-react";
import {
  panelSheetClassName,
  panelOverlayClassName,
  type PanelDisplayMode,
} from "@/components/assistant/panel-geometry";
import { AgentConversation } from "./agent-conversation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Modal conversational agent code (MIN-46). Reuse the cat shell
 * Numo (Large format floating sheet + compact/extended morph) and hosts the core
 * shared `AgentConversation` (same as Agents page). The buttons
 * expand/collapse/close are provided in `headerActions`; the left header (model
 * live / targeted issue in composition) and all behavior comes from the heart.
 *
 * `initialRunId` opens a specific run: this is the role that remains for this modal,
 * hot RESUMPTION of an existing conversation from the issue panel
 * (“Open conversation” by `AgentRunPanel`). New work starts in Numo; this
 * modal only opens an existing worker session.
 */
export function AgentChatModal({
  open,
  onOpenChange,
  issueId,
  issueIdentifier,
  projectId,
  initialRunId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  /** Readable identifier (MIN-42) — displayed while the run is loading. */
  issueIdentifier: string;
  projectId?: string | null;
  /** Open THIS run (otherwise: session at work, otherwise the last session). */
  initialRunId?: string | null;
}) {
  const t = useTranslations("Agent");
  const tc = useTranslations("Common");
  const ta = useTranslations("Assistant");

  // Large format by default (true modal centered); collapsible into corner widget.
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
          projectId={projectId}
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
