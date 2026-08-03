"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ConfirmDeleteDialog, Skeleton, toast } from "mangue-ui";
import {
  GitBranch,
  Import as ImportIcon,
  MessagesSquare,
  Plug,
  Repeat,
  Settings2,
  Tags,
  Users,
  WandSparkles,
} from "lucide-react";
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
import { SettingsAssistantPrompt } from "@/components/settings-assistant-prompt";
import { SettingsGroup } from "@/components/settings/settings-ui";
import {
  PROJECT_SETTINGS_DEFAULT_TAB,
  SETTINGS_SECTIONS,
} from "@/lib/settings-sections";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import {
  SettingsShell,
  SETTINGS_MAX_WIDTH,
  type SettingsTab,
} from "@/components/settings-shell";

export default function ProjectSettingsPage() {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const tRecurrence = useTranslations("Recurrence");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { projects, loading: projectsLoading, deleteProject } = useProjects();
  const project = projects.find((p) => p.id === id);

  // Même clé de cache que la section Smart Assign et l'onglet Membres : la
  // liste est lue ici uniquement pour savoir si un onglet mérite sa pastille,
  // et seulement quand Smart Assign est actif — sinon rien à signaler.
  const { members } = useMembersQuery(id, project?.smart_assign_enabled === true);
  const smartAssignIncomplete =
    members.length > 1 &&
    userIdsWithoutRule(
      members.map((m) => m.user_id),
      project?.smart_assign_rules
    ).length > 0;

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (projectsLoading && !project) {
    return (
      <div className={`mx-auto w-full ${SETTINGS_MAX_WIDTH} p-4 md:p-8`}>
        <Skeleton className="h-8 w-64" />
      </div>
    );
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

  const handleDelete = async () => {
    await deleteProject(project.id);
    toast.success(t("projectDeleted", { name: project.name }));
    router.push("/home");
  };

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
      content: (
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.projectCategories}
          icon={Tags}
          title={t("categoriesTab")}
          description={t("categoriesSectionDesc")}
          variant="block"
        >
          <ProjectCategories projectId={project.id} />
        </SettingsGroup>
      ),
    },
    {
      value: "members",
      label: t("membersTab"),
      icon: Users,
      content: (
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.projectMembers}
          icon={Users}
          title={t("membersTab")}
          description={t("membersSectionDesc")}
          variant="block"
        >
          <ProjectMembers projectId={project.id} enabled />
        </SettingsGroup>
      ),
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
      icon: WandSparkles,
      indicator: smartAssignIncomplete
        ? t("smartAssignIncompleteTab")
        : undefined,
      content: <SmartAssignSection project={project} isOwner={isOwner} />,
    },
    {
      value: "feedback",
      label: t("feedbackTab"),
      icon: MessagesSquare,
      // Pas d'enveloppe : cet onglet rend DÉJÀ ses propres groupes (un par
      // canal). L'envelopper dessinerait une carte dans une carte.
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
      content: (
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.projectIntegrations}
          icon={Plug}
          title={t("integrationsTab")}
          description={t("integrationsSectionDesc")}
          variant="block"
        >
          <ProjectIntegrations projectId={project.id} isOwner={isOwner} />
        </SettingsGroup>
      ),
    },
  ];

  return (
    <>
      <SettingsShell
        title={t("title")}
        defaultTab={PROJECT_SETTINGS_DEFAULT_TAB}
        tabs={tabs}
        topSlot={
          <SettingsAssistantPrompt
            projectId={project.id}
            placeholder={t("assistantPromptPlaceholder")}
          />
        }
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteProjectTitle", { name: project.name })}
        description={t("deleteProjectDescription", { days: TRASH_RETENTION_DAYS })}
        confirmLabel={tc("moveToTrash")}
        cancelLabel={tc("cancel")}
        onConfirm={handleDelete}
      />
    </>
  );
}
