"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  ClipboardCopy,
  Code2,
  ListChecks,
  PenLine,
  Plus,
  SearchCheck,
} from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import type { ContextMenuAction } from "@/components/issue-context-menu";

/**
 * The two “agent” entries in the menu ⋯ / right-click on a ticket — copy the
 * prompt, launch the Numo agent — shared by the board cards and the panel
 * lateral, so that they do not diverge.
 *
 * Each is a SUBMENU with ways to work on a ticket, in order
 * where we cross them: the plan (frame, without coding), “Implement the ticket”,
 * “Check the implementation” (read again the work against the plan and the
 * comments, fix real bugs), then “Custom” — the instructions
 * written by the user, last because it comes out in all three ways
 * framed. Keyboard shortcuts do not move — ⇧P copies the prompt
 * implementation, ⇧A launches the agent on it — and are therefore displayed on this
 * leaf there.
 *
 * The “plan” sheet tracks the status of the ticket: “Generate a plan” when there is no
 * does not, “Check the plan” when he has one — asking for one again would not have
 * direction, and the underlying prompt switches the same way. The leaf
 * “check” does not depend on any state: the menu keeps the same form whatever
 * whatever the ticket (the prompt adapts to the plan which exists or not).
 *
 * Existing session: “Open agent” remains a simple entry (it reopens the
 * conversation, it does not launch anything) and it is “New session” which carries the
 * sous-menu.
 */
export function useAgentMenuActions({
  agentsEnabled,
  hasSession,
  hasPlan,
  onCopyPrompt,
  onCopyPlanPrompt,
  onCopyVerifyPrompt,
  onCopyCustomPrompt,
  onImplementWithAgent,
  onWritePlanWithAgent,
  onVerifyWithAgent,
  onCustomWithAgent,
  onOpenSession,
}: {
  /** Agents available (paid plan + linked deposit) — otherwise, no agent entry. */
  agentsEnabled: boolean;
  /** The ticket already has an agent conversation. */
  hasSession: boolean;
  /** The ticket already has a plan (at least one task) → check, rather than write. */
  hasPlan: boolean;
  onCopyPrompt: () => void;
  onCopyPlanPrompt: () => void;
  /** Copies the "check implementation" prompt for an external agent. */
  onCopyVerifyPrompt: () => void;
  /** Opens the free instruction dialog, then copies the corresponding prompt. */
  onCopyCustomPrompt: () => void;
  onImplementWithAgent: () => void;
  onWritePlanWithAgent: () => void;
  /** Lance Numo on checking the work already done. */
  onVerifyWithAgent: () => void;
  /** Open the free locker dialog, then launch Numo on it. */
  onCustomWithAgent: () => void;
  /** Reopens the existing conversation (modal on panel side, page on card side). */
  onOpenSession: () => void;
}): ContextMenuAction[] {
  const t = useTranslations("IssueUI");
  const tAgent = useTranslations("Agent");

  return useMemo(() => {

    // The two labels remain searchable together: whatever the state of the
    // ticket, typing “map” or “check” finds the entry.
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
    // “Check” is also the word of the plan sheet: the words that separate
    // so both (bug, proofread, implementation) are the ones that matter here.
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

    const verifyAction = (id: string, onSelect: () => void): ContextMenuAction => ({
      id,
      label: t("actionVerifyImplementation"),
      keywords: verifyKeywords,
      icon: <SearchCheck className="size-4" />,
      onSelect,
    });

    // “Personalized”: the user writes the instructions (dialog), Minddy keeps
    // the context of the ticket around. Searchable by what you type when you want
    // get out of the three framed ways.
    const customAction = (id: string, onSelect: () => void): ContextMenuAction => ({
      id,
      label: t("actionCustomPrompt"),
      keywords: [
        "custom",
        "personnalisé",
        "personnalise",
        "prompt",
        "libre",
        "autre",
        "own",
      ],
      icon: <PenLine className="size-4" />,
      onSelect,
    });

    const copyPrompt: ContextMenuAction = {
      id: "copy-prompt",
      label: t("copyAsPrompt"),
      keywords: ["copy", "prompt", "agent", "copier", ...planKeywords],
      icon: <ClipboardCopy className="size-4" />,
      children: [
        {
          id: "copy-prompt-plan",
          label: planLabel,
          keywords: planKeywords,
          icon: <ListChecks className="size-4" />,
          onSelect: onCopyPlanPrompt,
        },
        {
          id: "copy-prompt-implement",
          label: t("actionImplement"),
          keywords: implementKeywords,
          icon: <Code2 className="size-4" />,
          shortcut: "⇧P",
          onSelect: onCopyPrompt,
        },
        verifyAction("copy-prompt-verify", onCopyVerifyPrompt),
        customAction("copy-prompt-custom", onCopyCustomPrompt),
      ],
    };

    if (!agentsEnabled) return [copyPrompt];

    // The two sheets of agent launch. ⇧A is only displayed when it
    // REALLY triggers this sheet — with an existing session it reopens
    // the conversation, and the shortcut therefore remains on “Open agent”.
    const launchChildren: ContextMenuAction[] = [
      {
        id: "agent-plan",
        label: planLabel,
        keywords: planKeywords,
        icon: <ListChecks className="size-4" />,
        onSelect: onWritePlanWithAgent,
      },
      {
        id: "agent-implement",
        label: t("actionImplement"),
        keywords: implementKeywords,
        icon: <Code2 className="size-4" />,
        ...(hasSession ? {} : { shortcut: "⇧A" }),
        onSelect: onImplementWithAgent,
      },
      verifyAction("agent-verify", onVerifyWithAgent),
      customAction("agent-custom", onCustomWithAgent),
    ];

    return hasSession
      ? [
          copyPrompt,
          {
            id: "open-agent",
            label: tAgent("openAgent"),
            keywords: ["agent", "open", "ouvrir", "session", "code", "ai", "numo"],
            icon: <NumoIcon className="size-4" />,
            shortcut: "⇧A",
            onSelect: onOpenSession,
          },
          {
            id: "new-agent-session",
            label: tAgent("newSession"),
            keywords: ["agent", "new", "nouvelle", "session", "launch", "lancer", "numo"],
            icon: <Plus className="size-4" />,
            children: launchChildren,
          },
        ]
      : [
          copyPrompt,
          {
            id: "launch-agent",
            label: tAgent("menuLaunch"),
            keywords: ["agent", "launch", "lancer", "code", "ai", "numo"],
            icon: <NumoIcon className="size-4" />,
            children: launchChildren,
          },
        ];
  }, [
    agentsEnabled,
    hasSession,
    hasPlan,
    onCopyPrompt,
    onCopyPlanPrompt,
    onCopyVerifyPrompt,
    onCopyCustomPrompt,
    onImplementWithAgent,
    onWritePlanWithAgent,
    onVerifyWithAgent,
    onCustomWithAgent,
    onOpenSession,
    t,
    tAgent,
  ]);
}
