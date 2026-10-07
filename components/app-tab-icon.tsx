"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Analytics01Icon, BubbleChatDelayIcon, CircleDotDashedIcon, CreditCardIcon, Delete02Icon, File02Icon, Folder01Icon, GitPullRequestIcon, Home01Icon, InboxIcon, Layout3ColumnIcon, MessageMultiple01Icon, Settings01Icon, Shield01Icon, Target01Icon } from "@hugeicons/core-free-icons";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { objectiveColor } from "./objective-icon";
import type { Project } from "@/lib/types";

const icons = { home: Home01Icon, all: Layout3ColumnIcon, tickets: Layout3ColumnIcon, inbox: InboxIcon, routines: BubbleChatDelayIcon,
  "pull-requests": GitPullRequestIcon, statistics: Analytics01Icon, trash: Delete02Icon, settings: Settings01Icon, billing: CreditCardIcon,
  admin: Shield01Icon, pages: File02Icon, objectives: Target01Icon, feedback: MessageMultiple01Icon, triage: CircleDotDashedIcon };

export function AppTabIcon({ section, project, projectId, objectiveColor: color }: {
  section: string;
  project?: Project;
  projectId: string | null;
  /** Set when the tab carries an objective's tickets: the OBJECTIVE icon takes
   *  ITS color, so the tab reads as an objective. */
  objectiveColor?: string | null;
}) {
  // EXPERIMENT (to revert): a project tab pairs the project orb with the
  // screen's own icon — the orb says WHERE the tab lives, the section icon
  // (the objective's target, in its color, when it carries an objective)
  // says WHAT it shows.
  if (projectId && project) {
    const SectionIcon = color !== undefined ? Target01Icon : icons[section as keyof typeof icons] ?? Folder01Icon;
    return (
      <span className="flex shrink-0 items-center gap-1">
        <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-4 rounded-[4px]" />
        <HugeiconsIcon icon={SectionIcon} aria-hidden className="size-3.5 shrink-0"
          style={color !== undefined ? { color: objectiveColor(color) } : undefined} />
      </span>
    );
  }
  if (color !== undefined) return <HugeiconsIcon icon={Target01Icon} aria-hidden className="size-3.5 shrink-0" style={{ color: objectiveColor(color) }} />;
  if (project) return <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-4 rounded-[4px]" />;
  const Icon = projectId ? Folder01Icon : icons[section as keyof typeof icons] ?? Home01Icon;
  return <HugeiconsIcon icon={Icon} aria-hidden className="size-3.5 shrink-0" />;
}
