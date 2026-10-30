"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon, Delete02Icon, Edit04Icon } from "@hugeicons/core-free-icons";
import { DndContext, MouseSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { DragCursor } from "@/components/drag-cursor";
import { DRAG_ACTIVATION_DISTANCE } from "@/lib/drag-feel";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { FormDialog } from "@/components/form-dialog";
import { SearchSelect } from "@/components/search-select";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { cn } from "@/lib/utils";
import { useDragAnnouncements } from "@/lib/use-drag-announcements";
import {
  MAX_DATABASE_VIEWS,
  MAX_DATABASE_VIEW_NAME,
  type SavedDatabaseView,
} from "@/lib/page-databases";

// The issue board's tab pills, so both kinds of views read the same.
const PILL_CLASS =
  "flex max-w-48 shrink-0 items-center rounded-full px-3 py-1 text-sm transition-colors";
const pillTone = (active: boolean) =>
  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted";

function ViewPill({ view, active, sortable, onSelect, onContextMenu }: {
  view: SavedDatabaseView; active: boolean; sortable: boolean; onSelect: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: view.id, disabled: !sortable });
  return (
    <button type="button" ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes} {...listeners} onClick={onSelect} onContextMenu={onContextMenu}
      aria-pressed={active}
      className={cn(PILL_CLASS, pillTone(active), isDragging && "relative z-10 shadow-md")}>
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
export function DatabaseViewStrip({ views, activeId, canWrite, compact = false, onSelect, onCreate,
  onRename, onDelete, onMove }: {
  views: SavedDatabaseView[];
  activeId: string | null;
  canWrite: boolean;
  /** A database shown in a side panel: the phone's picker, at desktop size. */
  compact?: boolean;
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
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }));
  const announcements = useDragAnnouncements((id) => views.find((view) => view.id === id)?.name);
  const active = views.find((view) => view.id === activeId) ?? null;
  const name = active?.name ?? t("defaultView");
  // Rename and delete live on the pill's right-click menu, like the board's.
  // `view: null` is the default view of a database that has no saved one yet.
  const [menu, setMenu] = useState<{ view: SavedDatabaseView | null; x: number; y: number } | null>(null);
  const [renameDefault, setRenameDefault] = useState(false);
  const menuActions: ContextMenuAction[] = menu ? [
    {
      id: "rename",
      label: tBoard("renameView"),
      icon: <HugeiconsIcon icon={Edit04Icon} className="size-4" />,
      onSelect: () => (menu.view ? setRenameTarget(menu.view) : setRenameDefault(true)),
    },
    {
      id: "delete",
      label: tBoard("deleteView"),
      icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
      variant: "destructive",
      separatorBefore: true,
      // A database keeps at least one view, like the issue board.
      disabled: views.length <= 1 || !menu.view,
      onSelect: () => setDeleteTarget(menu.view),
    },
  ] : [];

  const mobile = useMobileLayout() === true;
  const dialogs = (
    <>
      <IssueContextMenu position={menu ? { x: menu.x, y: menu.y } : null}
        onClose={() => setMenu(null)} actions={menuActions} searchable={false} />
      <ViewNameDialog open={createOpen} onOpenChange={setCreateOpen}
        title={tBoard("newView")} initialName="" onSubmit={onCreate} />
      <ViewNameDialog open={renameDefault} onOpenChange={setRenameDefault}
        title={tBoard("renameViewTitle")} initialName={name} onSubmit={onCreate} />
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
    </>
  );

  // A phone has no room for a strip of pills and no right-click: one picker,
  // like the issue board's, whose menu creates, renames and deletes. A side
  // panel is just as narrow, so it uses the same picker.
  if (mobile || compact) {
    const actions = canWrite ? [
      ...(views.length < MAX_DATABASE_VIEWS ? [{
        id: "create-view", label: tBoard("newView"),
        icon: <HugeiconsIcon icon={Add01Icon} className="size-4" />, onSelect: () => setCreateOpen(true),
      }] : []),
      { id: "rename-view", label: tBoard("renameView"),
        icon: <HugeiconsIcon icon={Edit04Icon} className="size-4" />,
        onSelect: () => (active ? setRenameTarget(active) : setRenameDefault(true)) },
      ...(active && views.length > 1 ? [{ id: "delete-view", label: tBoard("deleteView"),
        icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />, onSelect: () => setDeleteTarget(active) }] : []),
    ] : undefined;
    // The picker takes the row's free width, so a long view name only
    // truncates once the toolbar buttons leave it no more room.
    return (
      <div className="flex min-w-0 flex-1 items-center">
        <SearchSelect
          value={active?.id ?? "__default__"}
          onChange={(id) => { if (id && id !== "__default__") onSelect(id); }}
          options={views.length
            ? views.map((view) => ({ value: view.id, label: view.name }))
            : [{ value: "__default__", label: name }]}
          menuActions={actions}
          trigger={
            <Button variant="ghost" aria-label={t("views")}
              className={mobile
                ? "-ml-3 h-11 min-w-0 max-w-full justify-start gap-2 px-3 text-base"
                : "-ml-2 h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 text-sm"}>
              <span className="truncate">{name}</span>
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
            </Button>
          }
        />
        {dialogs}
      </div>
    );
  }

  return (
    <div role="group" aria-label={t("views")} className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {views.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} accessibility={{ announcements }}
          onDragEnd={({ active: dragged, over }) => {
            if (over && dragged.id !== over.id) onMove(String(dragged.id), String(over.id));
          }}>
          <DragCursor />
          <SortableContext items={views.map((view) => view.id)} strategy={horizontalListSortingStrategy}>
            {views.map((view) => (
              <ViewPill key={view.id} view={view} active={view.id === activeId}
                sortable={canWrite && views.length > 1} onSelect={() => onSelect(view.id)}
                onContextMenu={canWrite ? (event) => {
                  event.preventDefault();
                  setMenu({ view, x: event.clientX, y: event.clientY });
                } : undefined} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        // The default view: renaming it saves it under that name, with the
        // settings on screen; it cannot be deleted.
        <span className={cn(PILL_CLASS, pillTone(true))}
          onContextMenu={canWrite ? (event) => {
            event.preventDefault();
            setMenu({ view: null, x: event.clientX, y: event.clientY });
          } : undefined}>{name}</span>
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
        </>
      )}
      {dialogs}
    </div>
  );
}
