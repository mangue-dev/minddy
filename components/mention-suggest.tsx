"use client";

// Ce qu'on peut citer par « @ », et à quoi ça ressemble dans une liste de
// suggestions.
//
// Une seule table pour les deux surfaces qui ouvrent un « @ » : le composer de
// Numo (contentEditable, liste posée au-dessus) et l'éditeur de description
// (tiptap, menu porté au corps du document). Elles ne partagent pas leur boîte —
// l'une est ancrée au composer, l'autre au caret — mais elles partagent la
// FIGURE et la LIGNE : une personne, un projet, un ticket, un objectif, une page
// du wiki s'y reconnaissent au même signe des deux côtés.

import { BookText, FileText } from "lucide-react";
import { cn } from "mangue-ui";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";

export interface MentionOption {
  type: "member" | "project" | "issue" | "objective" | "page";
  id: string;
  /** Ce qui s'écrit après le « @ ». */
  label: string;
  /** Membres : graine du portrait. Projets : graine de l'orbe, quand le tirage
      a été relancé (`projectOrbSeed`). */
  avatarSeed?: string;
  /** Projets : le favicon importé, quand il y en a un (sinon l'orbe). */
  iconUrl?: string | null;
  /** Objectifs : leur couleur — celle que porte leur cible partout ailleurs. */
  color?: string | null;
  /** Pages : leur émoji, quand elles en ont un (MIN-273). */
  icon?: string | null;
  /** Second rang de la ligne : le titre d'un ticket, le nom du projet d'un
      objectif. Ce qui distingue MIN-42 de MIN-43 quand on choisit. */
  detail?: string;
  /** Termes de recherche en plus du libellé (e-mail, clé de projet, titre). */
  keywords?: string[];
}

/** Les options qui correspondent à la requête tapée après le « @ ». */
export function filterMentions(
  options: MentionOption[],
  query: string,
  limit = 6,
): MentionOption[] {
  const q = query.trim().toLowerCase();
  return options
    .filter((o) =>
      q
        ? [o.label, ...(o.keywords ?? [])].some((term) =>
            term.toLowerCase().includes(q),
          )
        : true,
    )
    .slice(0, limit);
}

/** La figure d'une option — la même que celle de sa pilule une fois posée. */
export function MentionFigure({
  option,
  className = "size-5",
}: {
  option: MentionOption;
  className?: string;
}) {
  if (option.type === "member") {
    return <UserAvatar seed={option.avatarSeed} className={cn("shrink-0", className)} />;
  }
  if (option.type === "project") {
    return (
      <ProjectOrb
        seed={option.avatarSeed ?? option.id}
        iconUrl={option.iconUrl}
        className={className}
      />
    );
  }
  if (option.type === "objective") {
    return (
      <ObjectiveIconBadge
        color={option.color}
        className={cn("shrink-0 rounded-full", className)}
        iconClassName="size-3"
      />
    );
  }
  if (option.type === "page") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
          className,
        )}
      >
        {option.icon ? (
          <span className="text-[0.7rem] leading-none">{option.icon}</span>
        ) : (
          <BookText className="size-3" />
        )}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-blue-500/12 text-blue-600 dark:text-blue-400",
        className,
      )}
    >
      <FileText className="size-3" />
    </span>
  );
}

/**
 * Une ligne de la liste. `mousedown` et non `click` : la surface d'édition ne
 * doit pas perdre le focus, sinon le blur referme la liste avant que le clic
 * n'arrive.
 */
export function MentionOptionRow({
  option,
  active,
  onPick,
  onHover,
}: {
  option: MentionOption;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      onMouseEnter={onHover}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        active && "bg-muted",
      )}
    >
      <MentionFigure option={option} />
      <span className="min-w-0 truncate">
        {option.label}
        {option.detail && (
          <span className="ml-1.5 text-muted-foreground">{option.detail}</span>
        )}
      </span>
    </button>
  );
}

/** La liste ancrée AU-DESSUS de son composer (celui de Numo, collé en bas de son
    panneau). L'éditeur de description, lui, ancre la sienne au caret. */
export function MentionSuggestions({
  options,
  activeIndex,
  onPick,
  onHover,
  className,
}: {
  options: MentionOption[];
  activeIndex: number;
  onPick: (option: MentionOption) => void;
  onHover: (index: number) => void;
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full z-50 mb-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md",
        className,
      )}
    >
      {options.map((option, index) => (
        <MentionOptionRow
          key={`${option.type}:${option.id}`}
          option={option}
          active={index === activeIndex}
          onPick={() => onPick(option)}
          onHover={() => onHover(index)}
        />
      ))}
    </div>
  );
}
