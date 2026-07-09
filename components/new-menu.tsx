"use client";

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
import { useCreate } from "@/lib/create-context";

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
 * sync. Issue/objective open the app-wide create dialogs (MIN-33) — available
 * from anywhere, not just inside a project — targeting the current route's
 * project when there is one, else letting the dialog's split button pick.
 */
export function useCreateActions(): CreateAction[] {
  const t = useTranslations("Nav");
  const { openCreateProject } = useProjects();
  const { openCreateIssue, openCreateObjective, canCreate } = useCreate();

  return [
    {
      key: "new-issue",
      icon: ListTodo,
      label: t("newIssue"),
      disabled: !canCreate,
      shortcut: "C",
      onSelect: () => openCreateIssue(),
    },
    {
      key: "new-objective",
      icon: Target,
      label: t("newObjective"),
      disabled: !canCreate,
      shortcut: "O",
      onSelect: () => openCreateObjective(),
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
