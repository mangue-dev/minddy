"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useProjectsQuery, type UseProjectsResult } from "./use-projects-query";
import {
  useProjectDrafts,
  type UseProjectDraftsResult,
} from "./use-project-drafts-query";
import {
  CreateProjectWizard,
  type ProjectSetupResumeState,
} from "@/components/create-project-wizard";
import type { ProjectDraft } from "./project-draft";

interface ProjectsContextValue extends UseProjectsResult {
  /** Opens the shared "new project" wizard (mounted once here). */
  openCreateProject: () => void;
  /** Mes brouillons de création, du plus récent au plus ancien. Ils prennent une
      ligne dans la barre latérale, à la place du projet qu'ils deviendront. */
  projectDrafts: ProjectDraft[];
  saveProjectDraft: UseProjectDraftsResult["saveDraft"];
  deleteProjectDraft: UseProjectDraftsResult["deleteDraft"];
  /** Rouvre le wizard sur un brouillon, à l'étape où il s'était arrêté. */
  openProjectDraft: (draft: ProjectDraft) => void;
  /** Reopens the wizard at the git step from a saved draft — used when a
      provider install/OAuth redirect comes back (`?setup=git`, MIN-62). */
  resumeProjectDraft: (draft: ProjectDraft, connectionId: string | null) => void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const projects = useProjectsQuery();
  const { drafts, saveDraft, deleteDraft } = useProjectDrafts();
  const [createOpen, setCreateOpen] = useState(false);
  const [resume, setResume] = useState<ProjectSetupResumeState | null>(null);

  const handleOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) setResume(null);
  };

  // Stable : `ProjectDraftResume` l'a en dépendance d'effet.
  const resumeProjectDraft = useCallback(
    (draft: ProjectDraft, connectionId: string | null) => {
      setResume({ draft, connectionId, fromGit: true });
      setCreateOpen(true);
    },
    []
  );

  // Objet neuf à chaque fois, y compris sur le même brouillon : c'est ce qui
  // redéclenche l'initialisation du wizard (rouvrir deux fois le même brouillon
  // doit le remettre à son étape, pas laisser l'état de la fois précédente).
  const openProjectDraft = useCallback((draft: ProjectDraft) => {
    setResume({ draft, connectionId: null });
    setCreateOpen(true);
  }, []);

  return (
    <ProjectsContext.Provider
      value={{
        ...projects,
        openCreateProject: () => {
          setResume(null);
          setCreateOpen(true);
        },
        projectDrafts: drafts,
        saveProjectDraft: saveDraft,
        deleteProjectDraft: deleteDraft,
        openProjectDraft,
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
