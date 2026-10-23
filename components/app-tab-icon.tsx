"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { CircleDotDashedIcon, CreditCardIcon, Delete02Icon, File02Icon, Folder01Icon, GitPullRequestIcon, Home01Icon, InboxIcon, MessageMultiple01Icon, Settings01Icon, Shield01Icon, Target01Icon } from "@hugeicons/core-free-icons";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { objectiveColor } from "./objective-icon";
import { ObjectiveStatusIndicator } from "@/components/issue-indicators";
import type { ObjectiveStatus } from "@/lib/objective-validation";
import type { Project } from "@/lib/types";
import { BOARD_ICON, ROUTINE_ICON } from "@/components/feature-icons";

const icons = { home: Home01Icon, all: BOARD_ICON, tickets: BOARD_ICON, inbox: InboxIcon, routines: ROUTINE_ICON,
  "pull-requests": GitPullRequestIcon, trash: Delete02Icon, settings: Settings01Icon, billing: CreditCardIcon,
  admin: Shield01Icon, pages: File02Icon, objectives: Target01Icon, feedback: MessageMultiple01Icon, triage: CircleDotDashedIcon };

export function AppTabIcon({ section, project, projectId, objectiveColor: color, objectiveStatus }: {
  section: string;
  project?: Project;
  projectId: string | null;
  /** Set when the tab carries an objective's tickets: the OBJECTIVE icon takes
   *  ITS color, so the tab reads as an objective. */
  objectiveColor?: string | null;
  /** The objective's status, once known: its real status glyph replaces the
   *  target (MIN-785). */
  objectiveStatus?: ObjectiveStatus;
}) {
  const objectiveGlyph = color !== undefined && objectiveStatus
    ? <ObjectiveStatusIndicator status={objectiveStatus} className="size-3.5 shrink-0" />
    : null;
  // EXPERIMENT (to revert): a project tab pairs the project orb with the
  // screen's own icon — the orb says WHERE the tab lives, the section icon
  // (the objective's target, in its color, when it carries an objective)
  // says WHAT it shows.
  if (projectId && project) {
    const SectionIcon = color !== undefined ? Target01Icon : icons[section as keyof typeof icons] ?? Folder01Icon;
    return (
      <span className="flex shrink-0 items-center gap-1">
        <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-4 rounded-[4px]" />
        {objectiveGlyph ?? <HugeiconsIcon icon={SectionIcon} aria-hidden className="size-3.5 shrink-0"
          style={color !== undefined ? { color: objectiveColor(color) } : undefined} />}
      </span>
    );
  }
  if (objectiveGlyph) return objectiveGlyph;
  if (color !== undefined) return <HugeiconsIcon icon={Target01Icon} aria-hidden className="size-3.5 shrink-0" style={{ color: objectiveColor(color) }} />;
  if (project) return <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-4 rounded-[4px]" />;
  const Icon = projectId ? Folder01Icon : icons[section as keyof typeof icons] ?? Home01Icon;
  return <HugeiconsIcon icon={Icon} aria-hidden className="size-3.5 shrink-0" />;
}
