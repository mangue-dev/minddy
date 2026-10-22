"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, Edit04Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { DndContext, MouseSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/form-dialog";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { cn } from "@/lib/utils";
import {
  MAX_DATABASE_VIEWS,
  MAX_DATABASE_VIEW_NAME,
  type SavedDatabaseView,
} from "@/lib/page-databases";

const PILL_CLASS =
  "flex max-w-40 shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs transition-colors";
const pillTone = (active: boolean) =>
  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted";

function ViewPill({ view, active, sortable, onSelect }: {
  view: SavedDatabaseView; active: boolean; sortable: boolean; onSelect: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: view.id, disabled: !sortable });
  return (
    <button type="button" ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes} {...listeners} onClick={onSelect} aria-pressed={active}
      className={cn(PILL_CLASS, pillTone(active), isDragging && "opacity-50")}>
      <span className="truncate">{view.name}</span>
    </button>
  );
}

function ViewNameDialog({ open, onOpenChange, title, initialName, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialName: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  // `open` is controlled by the parent, so the field is seeded on each opening.
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={title}
      className="sm:max-w-sm" submitLabel={tc("save")} cancelLabel={tc("cancel")}
      submitDisabled={!name.trim()} submitting={busy}
      onSubmit={async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setBusy(true);
        try {
          await onSubmit(trimmed);
          onOpenChange(false);
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
      <Input autoFocus={allowInputAutoFocus()} value={name} maxLength={MAX_DATABASE_VIEW_NAME}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("viewNamePlaceholder")} />
    </FormDialog>
  );
}

/**
 * The views of a page database (MIN-764), shared by the project: members with
 * write access add, rename, delete and drag-reorder them; everyone switches.
 * Without a saved view, the default one stands alone.
 */
export function DatabaseViewStrip({ views, activeId, canWrite, onSelect, onCreate,
  onRename, onDelete, onMove }: {
  views: SavedDatabaseView[];
  activeId: string | null;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, overId: string) => void;
}) {
  const t = useTranslations("PageDatabase");
  const tBoard = useTranslations("Board");
  const tc = useTranslations("Common");
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedDatabaseView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedDatabaseView | null>(null);
  // A plain click selects; only a drag of more than 6px reorders.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
  const active = views.find((view) => view.id === activeId) ?? null;
  const name = active?.name ?? t("defaultView");

  return (
    <div role="group" aria-label={t("views")} className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {views.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragEnd={({ active: dragged, over }) => {
            if (over && dragged.id !== over.id) onMove(String(dragged.id), String(over.id));
          }}>
          <SortableContext items={views.map((view) => view.id)} strategy={horizontalListSortingStrategy}>
            {views.map((view) => (
              <ViewPill key={view.id} view={view} active={view.id === activeId}
                sortable={canWrite && views.length > 1} onSelect={() => onSelect(view.id)} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        <span className={cn(PILL_CLASS, pillTone(true))}>{name}</span>
      )}
      {canWrite && (
        <>
          <AppTooltip label={tBoard("newView")}>
            <Button variant="ghost" size="icon-sm" aria-label={tBoard("newView")}
              disabled={views.length >= MAX_DATABASE_VIEWS}
              onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
          </AppTooltip>
          {active && (
            <DropdownMenu>
              <AppTooltip label={tBoard("viewOptions", { name })}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={tBoard("viewOptions", { name })}>
                    <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </AppTooltip>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setRenameTarget(active)}>
                  <HugeiconsIcon icon={Edit04Icon} />
                  {tBoard("renameView")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* A database keeps at least one view, like the issue board. */}
                <DropdownMenuItem variant="destructive" disabled={views.length <= 1}
                  onSelect={() => setDeleteTarget(active)}>
                  <HugeiconsIcon icon={Delete02Icon} />
                  {tBoard("deleteView")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
      <ViewNameDialog open={createOpen} onOpenChange={setCreateOpen}
        title={tBoard("newView")} initialName="" onSubmit={onCreate} />
      <ViewNameDialog open={renameTarget !== null}
        onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
        title={tBoard("renameViewTitle")} initialName={renameTarget?.name ?? ""}
        onSubmit={(next) => renameTarget ? onRename(renameTarget.id, next) : Promise.resolve()} />
      <ConfirmDeleteDialog open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={tBoard("deleteViewTitle", { name: deleteTarget?.name ?? "" })}
        description={t("deleteViewDescription")}
        confirmLabel={tc("delete")} cancelLabel={tc("cancel")} closeOnConfirm={false}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await onDelete(deleteTarget.id);
            setDeleteTarget(null);
          } catch (error) {
            toast.error((error as Error).message);
          }
        }} />
    </div>
  );
}
