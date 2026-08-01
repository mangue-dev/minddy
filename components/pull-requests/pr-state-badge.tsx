"use client";

import { useTranslations } from "next-intl";
import { Badge, cn } from "mangue-ui";
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
} from "lucide-react";
import type { PullRequestListItem } from "@/lib/agent-api";

/**
 * Badge d'état d'une pull request — un seul endroit, pour la liste comme pour
 * le détail (les deux le peignaient chacun de leur côté, et pas pareil).
 *
 * Les COULEURS sont celles de GitHub : vert ouverte, violet fusionnée, rouge
 * fermée, gris brouillon. Ce n'est pas une palette qu'une app personnalise —
 * c'est un code que l'utilisateur lit déjà ailleurs, et le lui traduire en
 * couleurs maison lui coûterait un aller-retour à chaque coup d'œil. L'icône
 * suit la même logique : GitHub en a une par état, et elle porte l'information
 * sans la couleur (donc sans exclure qui ne la distingue pas).
 *
 * La FORME, elle, reste celle des badges de minddy : teinte à 10 %, bord à
 * 20 %, jamais un aplat — c'est ça qui est à nous.
 *
 * `PR_STATE_STYLES` est exporté parce que l'état d'une PR se lit AILLEURS que
 * dans ce badge — la liste des sessions d'agent, l'en-tête d'une conversation —
 * et que ces endroits-là repeignaient à leur tour, en vert le « fusionnée » que
 * GitHub met en violet. Une seule table, et le code reste lisible partout.
 */

type PrState = PullRequestListItem["pr_state"];

export const PR_STATE_STYLES: Record<PrState, string> = {
  open: "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/25 dark:bg-green-500/15 dark:text-green-400",
  merged:
    "border-violet-600/20 bg-violet-600/10 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400",
  closed:
    "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/15",
  // Le brouillon garde le gris de `secondary` : c'est déjà celui de GitHub.
  draft: "",
};

const STATE_ICONS: Record<PrState, LucideIcon> = {
  open: GitPullRequest,
  merged: GitMerge,
  closed: GitPullRequestClosed,
  draft: GitPullRequestDraft,
};

const STATE_LABELS = {
  open: "stateOpen",
  merged: "stateMerged",
  closed: "stateClosed",
  draft: "stateDraft",
} as const satisfies Record<PrState, string>;

export function PrStateBadge({
  state,
  /** Icône d'état — hors de la liste, où le badge tient en 10 px de haut. */
  icon = false,
  className,
}: {
  state: PrState;
  icon?: boolean;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const Icon = STATE_ICONS[state];

  return (
    <Badge
      variant="secondary"
      icon={icon ? <Icon /> : undefined}
      className={cn(PR_STATE_STYLES[state], className)}
    >
      {t(STATE_LABELS[state])}
    </Badge>
  );
}
