"use client";

// What can be cited by “@”, and what it looks like in a list of
// suggestions.
//
// A single table for the two surfaces which open an “@”: compose it from
// Numo (contentEditable, list placed above) and the description editor
// (tiptap, menu brought to the body of the document). They don't share their box —
// one is anchored to the composer, the other to the caret — but they share the
// FIGURE and the LINE: a person, a project, a ticket, an objective, a page
// from the wiki are recognized by the same sign on both sides.

import { useEffect, useRef } from "react";
import { BookText, FileText } from "lucide-react";
import { cn } from "mangue-ui";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import { filterMentionItems } from "@/lib/mention-menu";

export interface MentionOption {
  type: "member" | "project" | "issue" | "objective" | "page";
  id: string;
  /** What is written after the “@”. */
  label: string;
  /** Members: seed of the portrait. Projects: seed of the orb, when the draw
 was restarted (`projectOrbSeed`). */
  avatarSeed?: string;
  /** Projects: the imported favicon, when there is one (otherwise the orb). */
  iconUrl?: string | null;
  /** Objectifs : leur couleur — celle que porte leur cible partout ailleurs. */
  color?: string | null;
  /** Pages: their emoji, when they have one (MIN-273). */
  icon?: string | null;
  /** Second row of the line: the title of a ticket, the name of the project of an objective. What distinguishes MIN-42 from MIN-43 when choosing. */
  detail?: string;
  /** Search terms in addition to the label (email, project key, title). */
  keywords?: string[];
}

/** The options that match the query typed after the “@”. */
export function filterMentions(
  options: MentionOption[],
  query: string,
): MentionOption[] {
  return filterMentionItems(options, query);
}

/** The figure of an option — the same as that of its pill once placed. */
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
 * A line from the list. `mousedown` and not `click`: the editing surface does not
 * must not lose focus, otherwise the blur closes the list before the click
 * arrives.
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
      role="option"
      aria-selected={active}
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

/** The list anchored ABOVE its composer (Numo's, pasted at the bottom of its
 panel). The description editor anchors his to the caret. */
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
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, options]);

  if (options.length === 0) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      className={cn(
        "scrollbar-quiet absolute bottom-full z-50 mb-1 max-h-56 w-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-md",
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
