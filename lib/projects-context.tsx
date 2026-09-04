"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
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
import { useTranslations } from "next-intl";
import { ServerUnavailableState } from "@/components/server-unavailable-state";
import { isBackendUnavailableError } from "./backend-availability";

interface ProjectsContextValue extends UseProjectsResult {
  /** Opens the shared "new project" wizard (mounted once here). */
  openCreateProject: () => void;
  /** My creative drafts, from newest to oldest. They take a
 line in the sidebar, in place of the project they will become. */
  projectDrafts: ProjectDraft[];
  saveProjectDraft: UseProjectDraftsResult["saveDraft"];
  deleteProjectDraft: UseProjectDraftsResult["deleteDraft"];
  /** Reopens the wizard on a draft, at the stage where it left off. */
  openProjectDraft: (draft: ProjectDraft) => void;
  /** Reopens the wizard at the git step from a saved draft — used when a
      provider install/OAuth redirect comes back (`?setup=git`, MIN-62). */
  resumeProjectDraft: (draft: ProjectDraft, connectionId: string | null) => void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const tUnavailable = useTranslations("ServerUnavailable");
  const projects = useProjectsQuery();
  const { drafts, saveDraft, deleteDraft } = useProjectDrafts();
  const [createOpen, setCreateOpen] = useState(false);
  const [resume, setResume] = useState<ProjectSetupResumeState | null>(null);

  const handleOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) setResume(null);
  };

  // Stable: `ProjectDraftResume` has it as an effect dependency.
  const resumeProjectDraft = useCallback(
    (draft: ProjectDraft, connectionId: string | null) => {
      setResume({ draft, connectionId, fromGit: true });
      setCreateOpen(true);
    },
    []
  );

  // New object every time, including on the same draft: this is what
  // retriggers the initialization of the wizard (reopen the same draft twice
  // must return it to its stage, not leave the state of the previous time).
  const openProjectDraft = useCallback((draft: ProjectDraft) => {
    setResume({ draft, connectionId: null });
    setCreateOpen(true);
  }, []);

  /**
 * ⚠ Stable, and not an inline arrow (MIN-315).
 *
 * Its identity is in the dependencies of `commandGroups` AND `sections`
 * in components/app-shell-chrome.tsx, so `paletteGroups`: a new arrow
 * each time it is rendered rebuilds all three. This is the trap that
 * components/mobile-account.tsx already documents verbatim.
 */
  const openCreateProject = useCallback(() => {
    setResume(null);
    setCreateOpen(true);
  }, []);

  // Stored Value: a literal would re-render all the consumers each time
  // rendered, and this provider is re-rendered by `AuthProvider` above it.
  const value = useMemo(
    () => ({
      ...projects,
      openCreateProject,
      projectDrafts: drafts,
      saveProjectDraft: saveDraft,
      deleteProjectDraft: deleteDraft,
      openProjectDraft,
      resumeProjectDraft,
    }),
    [
      projects,
      openCreateProject,
      drafts,
      saveDraft,
      deleteDraft,
      openProjectDraft,
      resumeProjectDraft,
    ]
  );

  if (isBackendUnavailableError(projects.error)) {
    return (
      <ServerUnavailableState
        title={tUnavailable("title")}
        description={tUnavailable("description")}
        retryLabel={tUnavailable("retry")}
        onRetry={projects.refetch}
      />
    );
  }

  return (
    <ProjectsContext.Provider value={value}>
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
