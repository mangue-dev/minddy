"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, NoteEditIcon, Target01Icon, TaskEdit01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlainPreview } from "@/components/typed-mention-chip";
import { useCreate } from "@/lib/create-context";
import { useProjects } from "@/lib/projects-context";
import { plainMarkdownParts } from "@/lib/plain-markdown";
import { useAllDrafts, type DraftEntry } from "@/lib/use-all-drafts";

/**
 * The drafts tray of the bottom chrome bar (MIN-753), between Numo and the
 * task notebook. Issue and objective drafts have their own space here rather
 * than a chip row inside the creation dialogs: the pill shows only while a
 * draft exists, and its popover reopens a draft in its creation dialog or
 * deletes it (after confirmation, like every deletion).
 */
export function DraftsTray() {
  const t = useTranslations("Drafts");
  const tc = useTranslations("Common");
  const { drafts, remove } = useAllDrafts();
  const { openCreateIssue, openCreateObjective } = useCreate();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<DraftEntry | null>(null);

  if (drafts.length === 0 && !deleting) return null;

  const resume = (draft: DraftEntry) => {
    setOpen(false);
    const options = { projectId: draft.projectId, draftId: draft.id };
    if (draft.kind === "issue") openCreateIssue(options);
    else openCreateObjective(options);
  };

  return (
    <>
      {drafts.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("trayAria", { count: drafts.length })}
                  className="h-7 gap-1.5 rounded-full px-2 text-[13px] font-medium text-sidebar-foreground/70 shadow-none transition-transform hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:scale-[0.97] data-[state=open]:bg-sidebar-accent/70 data-[state=open]:text-sidebar-foreground"
                >
                  <HugeiconsIcon icon={NoteEditIcon} className="size-4" />
                  <span className="leading-none">{t("tray")}</span>
                  <span className="tabular-nums leading-none">{drafts.length}</span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={10}>{t("trayTooltip")}</TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="end" sideOffset={8} className="w-80 p-1">
            <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{t("tray")}</p>
            <ul className="flex max-h-80 flex-col overflow-y-auto">
              {drafts.map((draft) => (
                <DraftRow
                  key={`${draft.kind}-${draft.id}`}
                  draft={draft}
                  onOpen={() => resume(draft)}
                  onDelete={() => setDeleting(draft)}
                />
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(next) => { if (!next) setDeleting(null); }}
        title={t("deleteTitle", { name: deleting?.title.trim() || t("untitled") })}
        description={t("deleteDescription")}
        confirmLabel={t("delete")}
        cancelLabel={tc("cancel")}
        closeOnConfirm={false}
        onConfirm={async () => {
          if (deleting && await remove(deleting.kind, deleting.id)) setDeleting(null);
        }}
      />
    </>
  );
}

function DraftRow({ draft, onOpen, onDelete }: { draft: DraftEntry; onOpen: () => void; onDelete: () => void }) {
  const t = useTranslations("Drafts");
  const { projects } = useProjects();
  const project = projects.find((candidate) => candidate.id === draft.projectId);
  // Typed mentions stay apart, so the preview never prints their stored
  // label (MIN-734).
  const description = useMemo(
    () => (draft.description ? plainMarkdownParts(draft.description.slice(0, 400)) : []),
    [draft.description],
  );
  const title = draft.title.trim() || t("untitled");

  return (
    <li className="group/draft relative flex items-start rounded-md hover:bg-accent focus-within:bg-accent">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("resumeAria", { name: title })}
        className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HugeiconsIcon
          icon={draft.kind === "issue" ? TaskEdit01Icon : Target01Icon}
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-7">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-medium">{title}</span>
            {project && (
              <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground/70">{project.key}</span>
            )}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {description.length > 0 ? <PlainPreview parts={description} /> : t("noDescription")}
          </span>
        </span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={t("deleteAria", { name: title })}
            className="absolute top-1 right-1 size-7 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/draft:opacity-100 group-focus-within/draft:opacity-100"
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("delete")}</TooltipContent>
      </Tooltip>
    </li>
  );
}
