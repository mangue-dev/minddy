"use client";
import { BarChart3, CreditCard, FileText, Home, Inbox, MessagesSquare, Settings, Shield, Target, LayoutGrid, Trash2, GitPullRequest, CalendarClock, Folder } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { objectiveColor } from "./objective-icon";
import type { Project } from "@/lib/types";

const icons = { home: Home, all: LayoutGrid, tickets: LayoutGrid, inbox: Inbox, routines: CalendarClock,
  "pull-requests": GitPullRequest, statistics: BarChart3, trash: Trash2, settings: Settings, billing: CreditCard,
  admin: Shield, pages: FileText, objectives: Target, feedback: MessagesSquare, triage: Inbox };

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
    const SectionIcon = color !== undefined ? Target : icons[section as keyof typeof icons] ?? Folder;
    return (
      <span className="flex shrink-0 items-center gap-1">
        <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-4 rounded-[4px]" />
        <SectionIcon aria-hidden className="size-3.5 shrink-0"
          style={color !== undefined ? { color: objectiveColor(color) } : undefined} />
      </span>
    );
  }
  if (color !== undefined) return <Target aria-hidden className="size-3.5 shrink-0" style={{ color: objectiveColor(color) }} />;
  if (project) return <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-4 rounded-[4px]" />;
  const Icon = projectId ? Folder : icons[section as keyof typeof icons] ?? Home;
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}
