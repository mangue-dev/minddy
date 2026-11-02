"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Edit01Icon,
  Search01Icon,
  SourceCodeIcon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { IssueCardFace } from "@/components/issue-card-face";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { PullRequestPreviewFace } from "@/components/pull-requests/pr-preview-face";
import { CARD_FADE } from "../card-fade";
import { FIGURE_CATEGORIES, FIGURE_MEMBERS, FIGURE_PROJECT_KEY, figureIssue, useFigureMaps } from "./figure-world";

/**
 * The coding agent chapter's three cards: the prompt you copy from an issue,
 * your agent at work through minddy's MCP server, and the merged pull request
 * that closes the issue. Menu labels are the app's own; tool names are the
 * server's and stay untranslated.
 */

const PR_NUMBER = 128;

/** The issue's "Copy as prompt" menu: one prompt per stage of the work. */
export function PromptMenu() {
  const t = useTranslations("IssueUI");
  const entries = [
    { icon: TaskDone01Icon, label: t("actionWritePlan") },
    { icon: SourceCodeIcon, label: t("actionImplement") },
    { icon: Search01Icon, label: t("actionVerifyImplementation") },
    { icon: Edit01Icon, label: t("actionCustomPrompt") },
  ];
  return (
    <div aria-hidden className={cn("h-full w-full select-none", CARD_FADE)}>
      <div className="w-72 rounded-xl bg-popover p-1.5 text-[15px] text-popover-foreground shadow-lg ring-1 ring-border">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <HugeiconsIcon icon={entry.icon} className="size-4 text-muted-foreground" />
            {entry.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Your agent's terminal: it reads the issue, checks its plan and opens the pull request. */
export function AgentTerminal() {
  const t = useTranslations("Landing");
  const lines = [
    { kind: "prompt", text: t("toolsFigure_prompt") },
    { kind: "tool", text: "minddy_get_issue AUR-42" },
    { kind: "tool", text: "minddy_update_plan_task 1 → done" },
    { kind: "tool", text: "minddy_update_plan_task 2 → done" },
    { kind: "done", text: t("toolsFigure_push") },
  ] as const;
  return (
    <div aria-hidden className={cn("h-full w-full select-none", CARD_FADE)}>
      {/* Always dark, as a terminal is. */}
      <div className="w-[30rem] rounded-tl-xl bg-[#16181d] p-4 font-mono text-[13px] leading-7 text-[#d4d7de]">
        <div className="mb-2 flex items-center gap-2 font-sans text-xs text-[#8b909a]">
          <McpAgentLogo agent="claude-desktop" size={14} />
          Claude Code
        </div>
        {lines.map((line) => (
          <div
            key={line.text}
            className={cn(
              "whitespace-nowrap",
              line.kind === "prompt" && "text-white",
              line.kind === "tool" && "text-[#8b909a]",
              line.kind === "done" && "text-emerald-400",
            )}
          >
            <span className="mr-2">{line.kind === "prompt" ? "›" : line.kind === "done" ? "✓" : "●"}</span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The merged pull request on GitHub, over the issue it moved to Done. */
export function MergedPullRequest() {
  const t = useTranslations("Landing");
  const { memberMap, categoryMap } = useFigureMaps();
  const issue = useMemo(
    () =>
      figureIssue({
        number: 42,
        title: t("heroFlow_issueTitle"),
        status: "done",
        priority: "high",
        effort: "s",
        category_ids: [FIGURE_CATEGORIES.bug.id],
        assignee_id: FIGURE_MEMBERS.tom.user_id,
      }),
    [t],
  );
  return (
    <div aria-hidden className={cn("relative h-full w-full select-none [&_*]:pointer-events-none", CARD_FADE)}>
      <div className="absolute top-0 left-0 z-10 w-[19rem] rounded-xl bg-background p-3.5 text-sm shadow-sm ring-1 ring-border">
        <PullRequestPreviewFace
          provider="github"
          repository="aurora/web"
          state="merged"
          title={t("toolsFigure_prTitle")}
          number={PR_NUMBER}
          checks={{ status: "passed", count: 0, names: [] }}
          checksLabel={t("toolsFigure_checks")}
          oneLineTitle
        />
      </div>
      <div className="absolute top-24 left-10 w-[19rem] rounded-2xl bg-background shadow-lg shadow-black/5">
        <IssueCardFace
          issue={issue}
          projectKey={FIGURE_PROJECT_KEY}
          memberMap={memberMap}
          categoryMap={categoryMap}
          pr={{ prId: "merged-pr", prNumber: PR_NUMBER, state: "merged" }}
        />
      </div>
    </div>
  );
}
