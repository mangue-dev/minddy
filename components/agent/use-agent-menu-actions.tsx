"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { CodeSimpleIcon as Code2, Comment01Icon, Copy01Icon, Edit01Icon, Search01Icon, TaskDone01Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ContextMenuAction } from "@/components/issue-context-menu";

/**
 * The “Copy as prompt” entry in the ⋯ / right-click menu of a ticket, shared
 * by the board cards and the side panel so that they do not diverge. It copies
 * a prompt for the user's own coding agent.
 *
 * It is a SUBMENU with the ways to work on a ticket, in the order they are
 * used: the plan (scope, without coding), “Implement the ticket”, “Check the
 * implementation” (reread the work against the plan and the comments), then
 * “Custom” — the user's own instructions, last because they leave the three
 * framed ways. ⇧P copies the implementation prompt, so it is displayed on that
 * leaf.
 *
 * The “plan” leaf tracks the ticket: “Generate a plan” when there is none,
 * “Check the plan” when it has one, and the underlying prompt switches the
 * same way.
 *
 * When people commented after the ticket's MCP agent last did (MIN-801), a
 * top-level “Copy prompt for new comments” entry comes first: it is the one
 * thing the ticket is waiting for.
 */
export function useAgentMenuActions({
  hasPlan,
  onCopyPrompt,
  onCopyPlanPrompt,
  onCopyVerifyPrompt,
  onCopyCustomPrompt,
  onCopyCommentsPrompt,
}: {
  /** The ticket already has a plan (at least one task) → check, rather than write. */
  hasPlan: boolean;
  onCopyPrompt: () => void;
  onCopyPlanPrompt: () => void;
  /** Copies the "check implementation" prompt for an external agent. */
  onCopyVerifyPrompt: () => void;
  /** Opens the free instruction dialog, then copies the corresponding prompt. */
  onCopyCustomPrompt: () => void;
  /** Copies the prompt for the comments the MCP agent has not answered;
      absent when there are none. */
  onCopyCommentsPrompt?: () => void;
}): ContextMenuAction[] {
  const t = useTranslations("IssueUI");

  return useMemo(() => {
    // The two labels remain searchable together: whatever the state of the
    // ticket, typing “plan” or “check” finds the entry. French keywords are
    // intentional: the menu search matches what French users type.
    const planKeywords = [
      "plan",
      "planifier",
      "cadrer",
      "scope",
      "générer",
      "vérifier",
      "verify",
      "review",
      "check",
    ];
    const planLabel = hasPlan ? t("actionReviewPlan") : t("actionWritePlan");
    const implementKeywords = ["implement", "implémenter", "code", "coder", "build"];
    const verifyKeywords = [
      "verify",
      "vérifier",
      "check",
      "relire",
      "review",
      "bug",
      "bugs",
      "implémentation",
      "implementation",
    ];

    const copyPrompt: ContextMenuAction = {
      id: "copy-prompt",
      label: t("copyAsPrompt"),
      keywords: ["copy", "prompt", "agent", "copier", ...planKeywords],
      icon: <HugeiconsIcon icon={Copy01Icon} className="size-4" />,
      children: [
        {
          id: "copy-prompt-plan",
          label: planLabel,
          keywords: planKeywords,
          icon: <HugeiconsIcon icon={TaskDone01Icon} className="size-4" />,
          onSelect: onCopyPlanPrompt,
        },
        {
          id: "copy-prompt-implement",
          label: t("actionImplement"),
          keywords: implementKeywords,
          icon: <AppIcon icon={Code2} className="size-4" />,
          shortcut: "⇧P",
          onSelect: onCopyPrompt,
        },
        {
          id: "copy-prompt-verify",
          label: t("actionVerifyImplementation"),
          keywords: verifyKeywords,
          icon: <HugeiconsIcon icon={Search01Icon} className="size-4" />,
          onSelect: onCopyVerifyPrompt,
        },
        {
          id: "copy-prompt-custom",
          label: t("actionCustomPrompt"),
          keywords: ["custom", "personnalisé", "personnalise", "prompt", "libre", "autre", "own"],
          icon: <HugeiconsIcon icon={Edit01Icon} className="size-4" />,
          transfersFocus: true,
          onSelect: onCopyCustomPrompt,
        },
      ],
    };
    if (!onCopyCommentsPrompt) return [copyPrompt];
    const copyCommentsPrompt: ContextMenuAction = {
      id: "copy-comments-prompt",
      label: t("commentsPromptAction"),
      keywords: ["comments", "commentaires", "reply", "répondre", "feedback", "prompt", "agent", "copy", "copier"],
      icon: <HugeiconsIcon icon={Comment01Icon} className="size-4" />,
      onSelect: onCopyCommentsPrompt,
    };
    return [copyCommentsPrompt, copyPrompt];
  }, [hasPlan, onCopyPrompt, onCopyPlanPrompt, onCopyVerifyPrompt, onCopyCustomPrompt, onCopyCommentsPrompt, t]);
}
