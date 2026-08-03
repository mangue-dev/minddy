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
 * Les deux entrées « agent » du menu ⋯ / clic droit d'un ticket — copier le
 * prompt, lancer l'agent Numo — partagées par les cartes du board et le panneau
 * latéral, pour qu'elles ne divergent pas.
 *
 * Chacune est un SOUS-MENU avec les façons de travailler un ticket, dans l'ordre
 * où on les traverse : le plan (cadrer, sans coder), « Implémenter le ticket »,
 * « Vérifier l'implémentation » (relire le travail fait face au plan et aux
 * commentaires, corriger les vrais bugs), puis « Personnalisé » — la consigne
 * écrite par l'utilisateur, en dernier parce qu'elle sort des trois façons
 * cadrées. Les raccourcis clavier ne bougent pas — ⇧P copie le prompt
 * d'implémentation, ⇧A lance l'agent dessus — et s'affichent donc sur cette
 * feuille-là.
 *
 * La feuille « plan » suit l'état du ticket : « Générer un plan » quand il n'en
 * a pas, « Vérifier le plan » quand il en a un — en redemander un n'aurait pas
 * de sens, et le prompt sous-jacent bascule de la même façon. La feuille
 * « vérifier », elle, ne dépend d'aucun état : le menu garde la même forme quel
 * que soit le ticket (le prompt, lui, s'adapte au plan qui existe ou non).
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
  onCopyVerifyPrompt,
  onCopyCustomPrompt,
  onImplementWithAgent,
  onWritePlanWithAgent,
  onVerifyWithAgent,
  onCustomWithAgent,
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
  /** Copie le prompt « vérifie l'implémentation » pour un agent externe. */
  onCopyVerifyPrompt: () => void;
  /** Ouvre le dialog de consigne libre, puis copie le prompt correspondant. */
  onCopyCustomPrompt: () => void;
  onImplementWithAgent: () => void;
  onWritePlanWithAgent: () => void;
  /** Lance Numo sur la vérification du travail déjà fait. */
  onVerifyWithAgent: () => void;
  /** Ouvre le dialog de consigne libre, puis lance Numo dessus. */
  onCustomWithAgent: () => void;
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
    // « Vérifier » est aussi le mot de la feuille plan : les mots qui séparent
    // les deux (bug, relire, implémentation) sont donc ceux qui comptent ici.
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

    // « Personnalisé » : l'utilisateur écrit la consigne (dialog), minddy garde
    // le contexte du ticket autour. Cherchable par ce qu'on tape quand on veut
    // sortir des trois façons cadrées.
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
