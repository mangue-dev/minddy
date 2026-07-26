"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ClipboardCopy, Code2, ListChecks, Plus } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import type { ContextMenuAction } from "@/components/issue-context-menu";

/**
 * Les deux entrées « agent » du menu ⋯ / clic droit d'un ticket — copier le
 * prompt, lancer l'agent Numo — partagées par les cartes du board et le panneau
 * latéral, pour qu'elles ne divergent pas.
 *
 * Chacune est un SOUS-MENU avec les deux façons de travailler un ticket : le
 * plan (cadrer, sans coder) et « Implémenter le ticket ». Les raccourcis
 * clavier ne bougent pas — ⇧P copie le prompt d'implémentation, ⇧A lance
 * l'agent dessus — et s'affichent donc sur cette feuille-là.
 *
 * La feuille « plan » suit l'état du ticket : « Générer un plan » quand il n'en
 * a pas, « Vérifier le plan » quand il en a un — en redemander un n'aurait pas
 * de sens, et le prompt sous-jacent bascule de la même façon.
 *
 * Session existante : « Ouvrir l'agent » reste une entrée simple (elle rouvre la
 * conversation, elle ne lance rien) et c'est « Nouvelle session » qui porte le
 * sous-menu.
 */
export function useAgentMenuActions({
  agentsEnabled,
  hasSession,
  hasPlan,
  onCopyPrompt,
  onCopyPlanPrompt,
  onImplementWithAgent,
  onWritePlanWithAgent,
  onOpenSession,
}: {
  /** Agents disponibles (plan payant + dépôt lié) — sinon, pas d'entrée agent. */
  agentsEnabled: boolean;
  /** Le ticket a déjà une conversation d'agent. */
  hasSession: boolean;
  /** Le ticket a déjà un plan (au moins une tâche) → vérifier, plutôt qu'écrire. */
  hasPlan: boolean;
  onCopyPrompt: () => void;
  onCopyPlanPrompt: () => void;
  onImplementWithAgent: () => void;
  onWritePlanWithAgent: () => void;
  /** Rouvre la conversation existante (modal côté panneau, page côté carte). */
  onOpenSession: () => void;
}): ContextMenuAction[] {
  const t = useTranslations("IssueUI");
  const tAgent = useTranslations("Agent");

  return useMemo(() => {
    // Les deux libellés restent cherchables ensemble : quel que soit l'état du
    // ticket, taper « plan » ou « vérifier » trouve l'entrée.
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
      ],
    };

    if (!agentsEnabled) return [copyPrompt];

    // Les deux feuilles du lancement d'agent. ⇧A ne s'affiche que quand il
    // déclenche VRAIMENT cette feuille — avec une session existante, il rouvre
    // la conversation, et le raccourci reste donc sur « Ouvrir l'agent ».
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
    onImplementWithAgent,
    onWritePlanWithAgent,
    onOpenSession,
    t,
    tAgent,
  ]);
}
