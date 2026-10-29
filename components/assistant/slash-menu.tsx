"use client";

// The command and skill menu of the Numo composer — the twin of the mention
// suggestions. “/” opens commands and skills; “$” opens skills only.

import { type CSSProperties, useMemo } from "react";
import { AppIcon } from "@/components/icon";
import { LayersIcon as Layers, PencilEdit01Icon as SquarePen } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MENU_ROW_ACTIVE_CLASS, MENU_ROW_CLASS, MENU_SCROLL_CLASS, MENU_SURFACE_CLASS } from "@/components/ui/menu-surface";
import type { AssistantCommandId } from "@/lib/assistant-types";
import type { RepositorySkillSummary } from "@/lib/repository-skills";
import { useMenuScrollFade } from "@/components/ui/menu-scroll-fade";

export { filterSlashOptions } from "@/lib/assistant-slash-options";

export interface SlashCommandOption {
  kind: "command";
  id: AssistantCommandId;
  /** What is written after the “/” — localized (“create issue” / “create ticket”). */
  label: string;
  /** What the command does, in one line, below the label. */
  description: string;
  icon: AppIcon;
  /** Search terms in addition to the label (the alias of the other language). */
  keywords?: string[];
}

export interface SlashSkillOption {
  kind: "skill";
  id: string;
  label: string;
  description: string;
  icon: AppIcon;
  skill: RepositorySkillSummary;
}

export type SlashMenuOption = SlashCommandOption | SlashSkillOption;

/**
 * The “/” commands offered by Numo composers (MIN-159) — ids
 * canonical, localized labels. A single table for all surfaces that
 * speak to him (the panel, the reception): a command added here opens
 * two sides, and its wording cannot diverge from one to the other.
 *
 * The keywords carry both languages: “/create” finds the same command
 * when the interface is in French, and vice versa.
 */
export function useSlashCommands(): SlashCommandOption[] {
  const t = useTranslations("Assistant");
  return useMemo(
    () => [
      {
        kind: "command" as const,
        id: "create-issue",
        label: t("slashCreateIssueLabel"),
        description: t("slashCreateIssueDescription"),
        icon: SquarePen,
        keywords: ["create issue", "créer ticket"],
      },
    ],
    [t],
  );
}

export function repositorySkillOptions(
  skills: readonly RepositorySkillSummary[],
): SlashSkillOption[] {
  return skills.map((skill) => ({
    kind: "skill",
    id: skill.path,
    label: skill.name,
    description: skill.description,
    icon: Layers,
    skill,
  }));
}

/** Commands or skills that match the query typed after the active trigger. */
export function SlashMenu({
  options,
  prefix = "/",
  activeIndex,
  onPick,
  onHover,
  className,
  style,
}: {
  options: SlashMenuOption[];
  prefix?: "/" | "$";
  activeIndex: number;
  onPick: (option: SlashMenuOption) => void;
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
            index === activeIndex &&
              (option.kind === "skill" ? "bg-emerald-500/10" : MENU_ROW_ACTIVE_CLASS),
          )}
        >
          <AppIcon
            icon={option.icon}
            className={cn(
              "size-4 shrink-0",
              option.kind === "skill"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          />
          <span className="min-w-0">
            <span
              className={cn(
                "block truncate",
                option.kind === "skill" &&
                  "font-medium text-emerald-700 dark:text-emerald-400",
              )}
            >
              {option.kind === "command" ? prefix : ""}
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
