"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "mangue-ui";
import { ChevronDown, ListTodo, FolderPlus, Target } from "lucide-react";
import { useProjects } from "@/lib/projects-context";

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

/** Header "Nouveau" primary button → create dropdown (issue / project / objective). */
export function NewMenu() {
  const t = useTranslations("Nav");
  const ti = useTranslations("Issue");
  const pathname = usePathname();
  const router = useRouter();
  const { openCreateProject } = useProjects();

  const projectId = projectIdFromPath(pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="group gap-1.5">
          {t("new")}
          <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          disabled={!projectId}
          onSelect={() => projectId && router.push(`/projects/${projectId}?new=issue`)}
        >
          <ListTodo />
          {t("newIssue", { entity: ti("entity") })}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!projectId}
          onSelect={() =>
            projectId && router.push(`/projects/${projectId}/objectives?new=1`)
          }
        >
          <Target />
          {t("newObjective")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openCreateProject}>
          <FolderPlus />
          {t("newProject")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
