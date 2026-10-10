"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { agentEngineDisplay } from "@/lib/agent-engine-display";
import { isPrWorthShowing, type IssuePr } from "@/lib/agent-api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The agent status code on the exit panel header, in a chip — the
 * during board indicator panel (MIN-46 / MIN-68). It only shows
 * what calls for action:
 * • the agent is WORKING → frozen harness logo, click = open the conversation;
 * • otherwise, a live PR (open, draft) or delivered (merged) → click = the review.
 * Nothing to say (no run, PR closed) → nothing displayed. Everything else — throw,
 * new session, open — lives in the “⋯” menu to the right of the header.
 */
export function IssueAgentChip({
  working,
  engine,
  pr,
  onOpenConversation,
  onOpenPr,
}: {
  /** A run of the issue is queued/running. */
  working: boolean;
  /** Identity of the working run, independent of the account's current preference. */
  engine?: unknown;
  /** The PR of the ticket, all states combined — the chip itself discards `closed`. */
  pr: IssuePr | null;
  onOpenConversation: () => void;
  onOpenPr: () => void;
}) {
  const t = useTranslations("Agent");

  // At work: the agent IS the information. RA, if there is one, remains
  // accessible via the “⋯” menu.
  if (working) {
    const identity = agentEngineDisplay(engine);
    const label = t("engineWorking", { agent: identity.name ?? t("engineLegacyLabel") });
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenConversation}
            aria-label={label}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:bg-primary/10"
          >
            <McpAgentLogo agent={identity.logo} className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  // A REFUSED PR no longer calls for anything: the chip remains silent. The “⋯” menu, there
  // leads anyway — that's what happened on this ticket.
  if (!isPrWorthShowing(pr)) return null;
  const merged = pr?.state === "merged";
  const draft = pr?.state === "draft";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpenPr}
          aria-label={t("viewPullRequest")}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium outline-none transition-colors",
            merged
              ? "text-violet-600 hover:bg-violet-500/10 focus-visible:bg-violet-500/10 dark:text-violet-400"
              : "text-emerald-600 hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 dark:text-emerald-500"
          )}
        >
          <HugeiconsIcon icon={GitPullRequestIcon} className="size-3.5 shrink-0" />
          <span className="truncate">
            {merged ? t("prMerged") : draft ? t("prBadge") : t("prOpen")}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("viewPullRequest")}</TooltipContent>
    </Tooltip>
  );
}
