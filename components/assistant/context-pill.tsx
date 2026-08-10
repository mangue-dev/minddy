"use client";

// La pilule de contexte de Numo : ce que l'assistant a sous les yeux, une
// chose par pilule.
//
// Deux détails qui font tout le rendu :
//
//  • RAYONS CONCENTRIQUES. Le carré d'icône est un enfant de la pilule, donc
//    son rayon vaut « rayon de la pilule − padding ». La pilule a p-1 (4px) :
//    en `rounded-md` (14px) l'icône est à 10px, en `rounded-full` elle est
//    ronde elle aussi (14 − 4 = 10 = la moitié de ses 20px). Un carré à rayon
//    fixe dans une pilule ronde, c'est exactement l'erreur que ça corrige.
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
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import type {
  AssistantContextChip,
  AssistantContextKind,
} from "@/lib/assistant-context";

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

/** Rayon intérieur = rayon de la pilule − son padding (4px). */
const INNER_RADIUS = {
  full: "rounded-full",
  md: "rounded-[10px]",
} as const;

export function ContextPill({
  chip,
  radius = "full",
  disabled = false,
  onToggle,
  onRemove,
  className,
}: {
  chip: AssistantContextChip;
  /** Rayon de la pilule — l'icône suit (voir INNER_RADIUS). */
  radius?: keyof typeof INNER_RADIUS;
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
        <span
          aria-label={chip.tooltip}
          data-disabled={disabled || undefined}
          className={cn(
            "group/pill relative flex max-w-[14rem] shrink-0 items-center gap-1.5 border border-border bg-card py-1 pl-1 pr-2.5 text-xs shadow-sm transition-opacity",
            radius === "full" ? "rounded-full" : "rounded-md",
            disabled && "opacity-60",
            className,
          )}
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
              className={cn("size-5", INNER_RADIUS[radius], disabled && "grayscale")}
            />
          ) : chip.kind === "objective" && !disabled ? (
            // Un objectif a une couleur à lui : sa cible la porte, ici comme sur
            // le board et dans une description. Éteinte, la pilule retombe sur
            // le gris commun — c'est l'extinction qu'on lit alors, pas l'objectif.
            <ObjectiveIconBadge
              color={chip.color}
              className={cn("size-5", INNER_RADIUS[radius])}
              iconClassName="h-3 w-3"
            />
          ) : (
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center",
                INNER_RADIUS[radius],
                disabled ? "bg-muted text-muted-foreground" : style.tint,
              )}
            >
              <Icon className="h-3 w-3" />
            </span>
          )}
          <span
            className={cn(
              "min-w-0 truncate font-medium",
              disabled ? "text-muted-foreground line-through" : "text-foreground/80",
            )}
          >
            {chip.label}
          </span>
          {action && (
            // La commande se pose PAR-DESSUS la fin du libellé, elle ne prend
            // pas de place à côté : lui réserver une gouttière laisserait un
            // vide à droite de chaque pilule au repos, pour un bouton qu'on ne
            // voit qu'au survol. Le dégradé vers la couleur de la pilule fait
            // disparaître le texte dessous au lieu de le barrer.
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-[inherit] bg-gradient-to-l from-card via-card to-transparent pl-4 pr-1 transition-opacity",
                // Éteinte, la commande reste visible : c'est le seul chemin de
                // retour vers le contexte. Au clavier, c'est le focus du bouton
                // qui la révèle — sans quoi on tabulerait sur un invisible.
                disabled
                  ? "opacity-100"
                  : "opacity-0 group-hover/pill:opacity-100 has-[:focus-visible]:opacity-100",
              )}
            >
              <button
                type="button"
                aria-label={actionLabel}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  action();
                }}
                className="pointer-events-auto flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none"
              >
                {onRemove ? (
                  <X className="size-3" />
                ) : disabled ? (
                  <EyeOff className="size-3" />
                ) : (
                  <Eye className="size-3" />
                )}
              </button>
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" sideOffset={6}>
        {disabled ? t("contextIgnored", { label: chip.tooltip }) : chip.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
