"use client";

import { useState } from "react";
import { GitBranchIcon as GitBranch, ImportIcon, MessageMultiple01Icon as MessagesSquare, PlugIcon as Plug, RepeatIcon as Repeat, Settings02Icon as Settings2, TagsIcon as Tags, UserGroupIcon as Users } from "@hugeicons/core-free-icons";
import { useParams } from "next/navigation";
import { useAppRouter } from "@/lib/use-app-router";
import Link from "@/components/app-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ProjectTrashDialog } from "@/components/projects/project-trash-dialog";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useMembersQuery } from "@/lib/use-members-query";
import { userIdsWithoutRule } from "@/lib/smart-assign-config";
import { ProjectMembers } from "@/components/project-members";
import { ProjectCategories } from "@/components/project-categories";
import { ProjectIntegrations } from "@/components/project-integrations";
import { ProjectFeedbackSettings } from "@/components/project-feedback-settings";
import { ProjectGeneralSection } from "@/components/settings/project-general-section";
import { ProjectGitSection } from "@/components/settings/project-git-section";
import { ProjectImportSection } from "@/components/settings/project-import-section";
import { ProjectRecurrencesSection } from "@/components/settings/project-recurrences-section";
import { SmartAssignSection } from "@/components/settings/smart-assign-section";
import { SettingsGroup } from "@/components/settings/settings-ui";
import {
  PROJECT_SETTINGS_DEFAULT_TAB,
  SETTINGS_SECTIONS,
} from "@/lib/settings-sections";
import type { SidebarBrowseTarget } from "@/components/secondary-sidebar";
import { SettingsShell, type SettingsTab } from "@/components/settings-shell";
import { SettingsPageSkeleton } from "@/components/route-skeletons";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { SmartAssignIcon } from "@/components/smart-icons";

export default function ProjectSettingsPage({ browse, projectId }: { browse?: SidebarBrowseTarget; projectId?: string } = {}) {
  const t = useTranslations("Settings");
  const tRecurrence = useTranslations("Recurrence");
  const params = useParams<{ id: string }>();
  const id = projectId ?? params.id;
  const router = useAppRouter();
  const { user } = useAuth();
  const { projects, loading: projectsLoading } = useProjects();
  const project = projects.find((p) => p.id === id);
  useAssistantContext(
    !browse && project ? { projectId: project.id, settings: "project" } : null,
  );

  // Same cache key as the Smart Assign section and the Members tab: the
  // list is read here only to know if a tab deserves its badge,
  // and only when Smart Assign is active — otherwise nothing to report.
  const { members } = useMembersQuery(id, project?.smart_assign_enabled === true);
  const smartAssignIncomplete =
    members.length > 1 &&
    userIdsWithoutRule(
      members.map((m) => m.user_id),
      project?.smart_assign_rules
    ).length > 0;

  const [confirmDelete, setConfirmDelete] = useState(false);

  // The SAME template as `loading.tsx`: it mounts a secondary sidebar, therefore the
  // Primary bar stays at the rail and nothing moves when the screen arrives.
  if (projectsLoading && !project) {
    return <SettingsPageSkeleton />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <h1 className="font-display text-xl font-semibold">
          {t("projectNotFound")}
        </h1>
        <Button asChild variant="outline">
          <Link href="/home">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  const isOwner = project.owner_id === user?.id;


  const tabs: SettingsTab[] = [
    {
      value: "general",
      label: t("generalTab"),
      icon: Settings2,
      content: (
        <ProjectGeneralSection
          project={project}
          isOwner={isOwner}
          onRequestDelete={() => setConfirmDelete(true)}
        />
      ),
    },
    {
      value: "categories",
      label: t("categoriesTab"),
      icon: Tags,
      // The section renders its own card: "New category" lives on its
      // title line and opens a row inside the list.
      content: <ProjectCategories projectId={project.id} />,
    },
    {
      value: "members",
      label: t("membersTab"),
      icon: Users,
      // The section renders its own cards: invite, members, pending
      // invitations.
      content: <ProjectMembers projectId={project.id} enabled />,
    },
    {
      value: "recurrences",
      label: t("recurrencesTab"),
      icon: Repeat,
      content: (
        <ProjectRecurrencesSection
          projectId={project.id}
          projectKey={project.key}
          title={tRecurrence("title")}
          description={tRecurrence("description")}
        />
      ),
    },
    {
      value: "smart-assign",
      label: t("smartAssignTab"),
      icon: SmartAssignIcon,
      indicator: smartAssignIncomplete
        ? t("smartAssignIncompleteTab")
        : undefined,
      content: <SmartAssignSection project={project} isOwner={isOwner} />,
    },
    {
      value: "feedback",
      label: t("feedbackTab"),
      icon: MessagesSquare,
      // No envelope: this tab ALREADY renders its own groups (one per
      // channel). Wrapping it would draw a map within a map.
      content: <ProjectFeedbackSettings projectId={project.id} isOwner={isOwner} />,
    },
    {
      value: "git",
      label: t("gitTab"),
      icon: GitBranch,
      content: <ProjectGitSection projectId={project.id} />,
    },
    {
      value: "import",
      label: t("importTab"),
      icon: ImportIcon,
      content: (
        <ProjectImportSection projectId={project.id} isOwner={isOwner} />
      ),
    },
    {
      value: "integrations",
      label: t("integrationsTab"),
      icon: Plug,
      // No envelope: the section returns its OWN card, because “New
      // integration" lives in the group header and that button state
      // depends on the list, which only the section knows.
      content: <ProjectIntegrations projectId={project.id} isOwner={isOwner} />,
    },
  ];

  return (
    <>
      <SettingsShell
        browse={browse}
        title={t("title")}
        defaultTab={PROJECT_SETTINGS_DEFAULT_TAB}
        tabs={tabs}
        filterPlaceholder={(count) => t("filterPlaceholder", { count })}
        // “Hotspot” and “Exit Project” share the General tab
        // and exclude each other: the research must only propose that which is rendered.
        audience={isOwner ? "owner" : "member"}
      />

      <ProjectTrashDialog
        project={project}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onTrashed={() => router.replace("/home")}
      />
    </>
  );
}
