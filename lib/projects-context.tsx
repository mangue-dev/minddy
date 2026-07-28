"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useProjectsQuery, type UseProjectsResult } from "./use-projects-query";
import {
  CreateProjectWizard,
  type ProjectSetupResumeState,
} from "@/components/create-project-wizard";
import type { ProjectDraft } from "./project-draft";

interface ProjectsContextValue extends UseProjectsResult {
  /** Opens the shared "new project" wizard (mounted once here). */
  openCreateProject: () => void;
  /** Reopens the wizard at the git step from a saved draft — used when a
      provider install/OAuth redirect comes back (`?setup=git`, MIN-62). */
  resumeProjectDraft: (draft: ProjectDraft, connectionId: string | null) => void;
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

  // Stable : `ProjectDraftResume` l'a en dépendance d'effet.
  const resumeProjectDraft = useCallback(
    (draft: ProjectDraft, connectionId: string | null) => {
      setResume({ draft, connectionId });
      setCreateOpen(true);
    },
    []
  );

  return (
    <ProjectsContext.Provider
      value={{
        ...projects,
        openCreateProject: () => {
          setResume(null);
          setCreateOpen(true);
        },
        resumeProjectDraft,
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
