"use client";
import { BarChart3, CreditCard, FileText, Home, Inbox, MessagesSquare, Settings, Shield, Target, LayoutGrid, Trash2, GitPullRequest, CalendarClock, Folder } from "lucide-react";
import { NumoIcon } from "./numo-icon";
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
  /** Set when the tab carries an objective's tickets: the target in ITS
   *  color replaces the project orb, so the tab reads as an objective. */
  objectiveColor?: string | null;
}) {
  if (color !== undefined) return <Target aria-hidden className="size-4 shrink-0" style={{ color: objectiveColor(color) }} />;
  if (project) return <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-4 rounded-[4px]" />;
  if (!projectId && (section === "numo" || section === "agents")) return <NumoIcon animated={false} className="size-4 shrink-0" />;
  const Icon = projectId ? Folder : icons[section as keyof typeof icons] ?? Home;
  return <Icon aria-hidden className="size-4 shrink-0" />;
}
