"use client";

// La pilule de contexte de Numo : ce que l'assistant a sous les yeux, une
// chose par pilule.
//
// Le DESSIN (rayons concentriques, commande en surimpression) vit dans
// [components/entity-pill.tsx](../entity-pill.tsx), partagé avec les ressources
// d'un ticket. Ce qui reste ici est ce que le contexte a de propre :
//
//  • UNE TEINTE PAR NATURE, pour reconnaître la pilule avant de la lire.
//
//  • L'ŒIL. Le contexte ambiant n'est pas une pièce jointe : on ne le retire
//    pas, on l'ignore. L'œil apparaît au survol, éteint la pilule (grise, et
//    l'œil barré reste visible pour dire qu'il y a un chemin de retour), et le
//    champ correspondant quitte le contexte envoyé. Ce qu'on a épinglé à la
//    main, lui, se retire pour de bon — une croix.

import { useTranslations } from "next-intl";
import {
  BookText,
  Eye,
  EyeOff,
  FileText,
  CalendarClock,
  IterationCw,
  Layers,
  LayoutGrid,
  MessagesSquare,
  Target,
  X,
} from "lucide-react";
import { cn } from "mangue-ui";
import {
  EntityPill,
  PillIcon,
  PILL_INNER_RADIUS,
  type PillRadius,
} from "@/components/entity-pill";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import type {
  AssistantContextChip,
  AssistantContextKind,
} from "@/lib/assistant-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Une couleur par nature de contexte : la pilule se reconnaît du coin de l'œil,
 * avant d'être lue. Le fond reste une teinte à 12 % — c'est un repère, pas une
 * pastille.
 */
const STYLES: Record<
  AssistantContextKind,
  { icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  issue: {
    icon: FileText,
    tint: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  },
  issues: {
    icon: Layers,
    tint: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  },
  // L'objectif ne prend PAS sa teinte ici : il porte la SIENNE, celle qu'il
  // affiche partout ailleurs (voir plus bas, ObjectiveIconBadge). L'entrée reste
  // pour que la table couvre toutes les natures de contexte.
  objective: { icon: Target, tint: "" },
  feedback: {
    icon: MessagesSquare,
    tint: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  },
  // La même horloge que l'onglet Routines et son état vide : une routine se
  // reconnaît à sa figure, ici comme là-bas.
  routine: {
    icon: CalendarClock,
    tint: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  },
  // Le wiki : la même figure que l'arbre des pages dans la sidebar.
  page: {
    icon: BookText,
    tint: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  },
  view: {
    icon: LayoutGrid,
    tint: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
  },
  cycle: {
    icon: IterationCw,
    tint: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
  },
  // Membre et projet ne passent jamais par cette table : ils portent leur
  // propre figure (portrait, orbe).
  member: { icon: FileText, tint: "" },
  project: { icon: FileText, tint: "" },
};

export function ContextPill({
  chip,
  radius = "full",
  disabled = false,
  onToggle,
  onRemove,
  className,
}: {
  chip: AssistantContextChip;
  /** Rayon de la pilule — l'icône suit (voir PILL_INNER_RADIUS). */
  radius?: PillRadius;
  /** Contexte désélectionné : la pilule reste, grisée, et n'est plus envoyée. */
  disabled?: boolean;
  /** Bascule la sélection (contexte ambiant). Absent = pilule inerte. */
  onToggle?: () => void;
  /** Retire la pilule (contexte épinglé à la main). */
  onRemove?: () => void;
  className?: string;
}) {
  const t = useTranslations("Assistant");
  const style = STYLES[chip.kind];
  const Icon = style.icon;
  const action = onRemove ?? onToggle;
  const actionLabel = onRemove
    ? t("contextRemove")
    : disabled
      ? t("contextEnable")
      : t("contextDisable");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <EntityPill
          radius={radius}
          dimmed={disabled}
          ariaLabel={chip.tooltip}
          className={cn("max-w-[14rem] shrink-0", className)}
          action={
            action
              ? {
                  label: actionLabel,
                  onClick: action,
                  // Éteinte, la commande reste visible : c'est le seul chemin de
                  // retour vers le contexte.
                  persistent: disabled,
                  icon: onRemove ? (
                    <X className="size-3" />
                  ) : disabled ? (
                    <EyeOff className="size-3" />
                  ) : (
                    <Eye className="size-3" />
                  ),
                }
              : undefined
          }
        >
          {/* Membre et projet ont une figure à eux — le portrait, l'orbe (ou le
              favicon importé). Ils la portent telle quelle, sans pastille
              teintée autour : une icône générique dirait moins. */}
          {chip.kind === "member" ? (
            <UserAvatar
              seed={chip.avatarSeed}
              className={cn("size-5 shrink-0", disabled && "grayscale")}
            />
          ) : chip.kind === "project" ? (
            <ProjectOrb
              seed={chip.avatarSeed ?? chip.label}
              iconUrl={chip.iconUrl}
              className={cn(
                "size-5",
                PILL_INNER_RADIUS[radius],
                disabled && "grayscale",
              )}
            />
          ) : chip.kind === "objective" && !disabled ? (
            // Un objectif a une couleur à lui : sa cible la porte, ici comme sur
            // le board et dans une description. Éteinte, la pilule retombe sur
            // le gris commun — c'est l'extinction qu'on lit alors, pas l'objectif.
            <ObjectiveIconBadge
              color={chip.color}
              className={cn("size-5", PILL_INNER_RADIUS[radius])}
              iconClassName="h-3 w-3"
            />
          ) : (
            <PillIcon radius={radius} tint={disabled ? undefined : style.tint}>
              <Icon className="h-3 w-3" />
            </PillIcon>
          )}
          <span
            className={cn(
              "min-w-0 truncate font-medium",
              disabled ? "text-muted-foreground line-through" : "text-foreground/80",
            )}
          >
            {chip.label}
          </span>
        </EntityPill>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" sideOffset={6}>
        {disabled ? t("contextIgnored", { label: chip.tooltip }) : chip.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
