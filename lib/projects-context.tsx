"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useProjectsQuery, type UseProjectsResult } from "./use-projects-query";
import { CreateProjectDialog } from "@/components/create-project-dialog";

interface ProjectsContextValue extends UseProjectsResult {
  /** Opens the shared "new project" dialog (mounted once here). */
  openCreateProject: () => void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const projects = useProjectsQuery();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <ProjectsContext.Provider
      value={{ ...projects, openCreateProject: () => setCreateOpen(true) }}
    >
      {children}
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}
