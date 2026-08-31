"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  cn,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import {
  ChevronDown,
  ListTodo,
  FolderPlus,
  Plus,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { usePlanGates } from "@/lib/use-billing-query";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SIDEBAR_ROW_ACTION_CLASS,
  SIDEBAR_TOOLTIP_DELAY_MS,
} from "@/lib/sidebar-control-styles";

const NEW_ISSUE_TOOLTIP_DELAY_MS = SIDEBAR_TOOLTIP_DELAY_MS * 2;

export interface CreateAction {
  key: string;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  /** Keyboard hint shown on the desktop menu (e.g. "C"). */
  shortcut?: string;
  onWarm?: () => void;
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
  const {
    openCreateIssue,
    openCreateObjective,
    warmCreateIssue,
    warmCreateObjective,
    canCreate,
  } = useCreate();
  const { projectLimitReached } = usePlanGates();

  return [
    {
      key: "new-issue",
      icon: ListTodo,
      label: t("newIssue"),
      disabled: !canCreate,
      shortcut: "C",
      onWarm: warmCreateIssue,
      onSelect: () => openCreateIssue(),
    },
    {
      key: "new-objective",
      icon: Target,
      label: t("newObjective"),
      disabled: !canCreate,
      shortcut: "O",
      onWarm: warmCreateObjective,
      onSelect: () => openCreateObjective(),
    },
    {
      key: "new-project",
      icon: FolderPlus,
      label: t("newProject"),
      // Project ceiling of the plan reached (MIN-72) → action grayed out.
      disabled: projectLimitReached,
      onSelect: openCreateProject,
    },
  ];
}

/** Create dropdown shared by the legacy compact header and the primary sidebar. */
export function NewMenu({
  variant = "header",
  collapsed = false,
}: {
  variant?: "header" | "sidebar";
  collapsed?: boolean;
}) {
  const t = useTranslations("Nav");
  const actions = useCreateActions();
  const sidebar = variant === "sidebar";
  const issueAction = actions[0];

  if (sidebar) {
    return (
      <Tooltip
        delayDuration={NEW_ISSUE_TOOLTIP_DELAY_MS}
        disableHoverableContent
      >
        <TooltipTrigger asChild>
          <Button
            type="button"
            size={collapsed ? "icon-sm" : "sm"}
            variant="ghost"
            disabled={issueAction.disabled}
            aria-label={issueAction.label}
            onPointerEnter={issueAction.onWarm}
            onFocus={issueAction.onWarm}
            onClick={issueAction.onSelect}
            className={cn(
              SIDEBAR_ROW_ACTION_CLASS,
              "min-w-0 justify-start text-sm font-medium text-sidebar-foreground/70 shadow-none",
              collapsed
                ? "w-9 px-[9px]"
                : "flex-1 gap-3 pr-3 pl-[9px]",
            )}
          >
            <Plus className="size-[18px] shrink-0" />
            {!collapsed ? <span className="truncate">{issueAction.label}</span> : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <Kbd size="sm">{issueAction.shortcut}</Kbd>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip open={false}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="group gap-1.5 shadow-none"
            >
              <span className="truncate">{t("new")}</span>
              <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t("newIssue")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align={sidebar ? "start" : "end"} className="w-52">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              disabled={action.disabled}
              onPointerEnter={action.onWarm}
              onFocus={action.onWarm}
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
