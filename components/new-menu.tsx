"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Kbd,
} from "mangue-ui";
import {
  ChevronDown,
  ListTodo,
  FolderPlus,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { projectIdFromPath } from "@/lib/project-id-from-path";

export interface CreateAction {
  key: string;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  /** Keyboard hint shown on the desktop menu (e.g. "C"). */
  shortcut?: string;
  onSelect: () => void;
}

/**
 * The three "Nouveau" create actions (issue / objective / project), shared by the
 * desktop header {@link NewMenu} and the mobile navbar "+" button so both stay in
 * sync. Issue/objective target the current project (disabled outside one).
 */
export function useCreateActions(): CreateAction[] {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const router = useRouter();
  const { openCreateProject } = useProjects();

  const projectId = projectIdFromPath(pathname);

  return [
    {
      key: "new-issue",
      icon: ListTodo,
      label: t("newIssue"),
      disabled: !projectId,
      shortcut: "C",
      onSelect: () => projectId && router.push(`/projects/${projectId}?new=issue`),
    },
    {
      key: "new-objective",
      icon: Target,
      label: t("newObjective"),
      disabled: !projectId,
      onSelect: () =>
        projectId && router.push(`/projects/${projectId}/objectives?new=1`),
    },
    {
      key: "new-project",
      icon: FolderPlus,
      label: t("newProject"),
      onSelect: openCreateProject,
    },
  ];
}

/** Header "Nouveau" primary button → create dropdown (issue / project / objective). */
export function NewMenu() {
  const t = useTranslations("Nav");
  const actions = useCreateActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="group gap-1.5">
          {t("new")}
          <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              <Icon />
              {action.label}
              {action.shortcut ? (
                <Kbd size="sm" className="ml-auto">
                  {action.shortcut}
                </Kbd>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
