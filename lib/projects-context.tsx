"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useProjectsQuery, type UseProjectsResult } from "./use-projects-query";
import {
  CreateProjectWizard,
  type ProjectSetupResumeState,
} from "@/components/create-project-wizard";
import type { Project } from "./types";

interface ProjectsContextValue extends UseProjectsResult {
  /** Opens the shared "new project" wizard (mounted once here). */
  openCreateProject: () => void;
  /** Reopens the wizard at the git step for an existing project — used when a
      provider install/OAuth redirect comes back (`?setup=git`, MIN-62). */
  openProjectSetup: (project: Project, connectionId: string | null) => void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const projects = useProjectsQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [resume, setResume] = useState<ProjectSetupResumeState | null>(null);

  const handleOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) setResume(null);
  };

  return (
    <ProjectsContext.Provider
      value={{
        ...projects,
        openCreateProject: () => {
          setResume(null);
          setCreateOpen(true);
        },
        openProjectSetup: (project, connectionId) => {
          setResume({ project, connectionId });
          setCreateOpen(true);
        },
      }}
    >
      {children}
      <CreateProjectWizard
        open={createOpen}
        onOpenChange={handleOpenChange}
        resume={resume}
      />
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}
