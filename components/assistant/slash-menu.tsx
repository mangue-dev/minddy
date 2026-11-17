"use client";

// The skill menu of the Numo composer — the twin of the mention suggestions.
// “/” opens the repository skills of the active project.

import type { CSSProperties } from "react";
import { AppIcon } from "@/components/icon";
import { LayersIcon as Layers } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { MENU_ROW_CLASS, MENU_SCROLL_CLASS, MENU_SURFACE_CLASS } from "@/components/ui/menu-surface";
import type { RepositorySkillSummary } from "@/lib/repository-skills";
import { useMenuScrollFade } from "@/components/ui/menu-scroll-fade";

export { filterSlashOptions } from "@/lib/assistant-slash-options";

export interface SlashSkillOption {
  id: string;
  label: string;
  description: string;
  icon: AppIcon;
  skill: RepositorySkillSummary;
}

export function repositorySkillOptions(
  skills: readonly RepositorySkillSummary[],
): SlashSkillOption[] {
  return skills.map((skill) => ({
    id: skill.path,
    label: skill.name,
    description: skill.description,
    icon: Layers,
    skill,
  }));
}

/** Skills that match the query typed after the “/”. */
export function SlashMenu({
  options,
  activeIndex,
  onPick,
  onHover,
  className,
  style,
}: {
  options: SlashSkillOption[];
  activeIndex: number;
  onPick: (option: SlashSkillOption) => void;
  onHover: (index: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  // Rows hidden past an edge fade out there, under a chevron.
  const fade = useMenuScrollFade<HTMLDivElement>();
  if (options.length === 0) return null;

  return (
    <div
      ref={fade.ref}
      onScroll={fade.onScroll}
      style={style}
      data-floating-surface
      className={cn(
        "absolute bottom-full z-50 mb-1 max-h-56 w-72",
        MENU_SURFACE_CLASS,
        MENU_SCROLL_CLASS,
        className,
      )}
    >
      {fade.start}
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          // mousedown, not click: the composer must not lose focus (the
          // blur would close the list before the click arrives).
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(option);
          }}
          // A real movement only: arrows scroll the list under a still
          // pointer, and the synthetic events that follow must not move the
          // selection.
          onMouseMove={(event) => {
            if (event.movementX !== 0 || event.movementY !== 0) onHover(index);
          }}
          className={cn(
            MENU_ROW_CLASS,
            index === activeIndex && "bg-emerald-500/10",
          )}
        >
          <AppIcon
            icon={option.icon}
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-emerald-700 dark:text-emerald-400">
              {option.label}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {option.description}
            </span>
          </span>
        </button>
      ))}
      {fade.end}
    </div>
  );
}
