"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { Add01Icon, ArrowRight01Icon, ArrowUpDownIcon, Cancel01Icon, Copy01Icon, Delete02Icon, DragDropVerticalIcon, File02Icon, FilterIcon, Search01Icon, Settings02Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { MobileSheetContent } from "@/components/ui/mobile-sheet";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type Modifier } from "@dnd-kit/core";
import { DragCursor } from "@/components/drag-cursor";
import { DRAG_ACTIVATION_DISTANCE } from "@/lib/drag-feel";
import { SortableContext, arrayMove, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { CSS } from "@dnd-kit/utilities";
import { DatabaseColumnName } from "./database-column-name";
import { reorderDatabaseColumns } from "@/lib/page-database-columns";
import { DatabaseTableScroll } from "./database-table-scroll";
import {
  databaseRowPositions,
  selectDatabaseRows,
} from "@/lib/page-database-rows";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { usePagesQuery } from "@/lib/use-pages-query";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { usePromotePage, usePromotePages } from "./page-promotion-context";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { BulkIssueActionsPresence } from "@/components/bulk-issue-actions";
import { BulkEntityActions } from "@/components/bulk-entity-actions";
import type { EntityBulkAction } from "@/lib/bulk-actions-context";
import { selectedItemsPageContext } from "@/lib/assistant-selected-items";
import { NumoIcon } from "@/components/numo-icon";
import { useMembersQuery } from "@/lib/use-members-query";
import { usePageDatabase } from "@/lib/use-page-database";
import { usePageDatabaseViews } from "@/lib/use-page-database-views";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { useDragAnnouncements } from "@/lib/use-drag-announcements";
import { DatabaseViewStrip } from "./database-view-strip";
import { trackRowDrag } from "./database-row-drag";
import { cn } from "@/lib/utils";
import { DatabaseFilterEditor, activeFilterCount } from "./database-filter-editor";
import { matchesDatabaseFilter, type DatabaseViewFilter } from "@/lib/page-database-filters";
import { displayName } from "@/lib/display-name";
import {
  MAX_DATABASE_PROPERTIES,
  compareDatabaseValues,
  databaseValueText,
  databasePropertyValue,
  type DatabaseProperty,
} from "@/lib/page-databases";
import type { PageSummary } from "@/lib/pages-api";
import {
  DatabaseOptionsDialog,
  DatabaseCreatePropertyDialog,
  DatabaseEditPropertyDialog,
} from "./database-property-dialogs";
import {
  DatabasePropertyCell,
  PROPERTY_ICONS,
} from "./page-database-properties";

const horizontalColumnDrag: Modifier = ({ transform }) => ({ ...transform, y: 0 });

/** A row's `+` and handle look like a page block's gutter (block-gutter.tsx):
    the same faint ink, hover surface and plain cursor until a drag starts. */
const ROW_GUTTER_BUTTON =
  "flex size-6 shrink-0 items-center justify-center rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Where dragged entries will land: a line over the whole row, drawn by each
// cell's `::after` above its content. An inset shadow sat UNDER the content,
// so the hovered name cell's background and the sticky selection cell cut it.
const ROW_DROP_LINE =
  "[&>td:not(.sticky)]:relative [&>td]:after:pointer-events-none [&>td]:after:absolute [&>td]:after:inset-x-0 [&>td]:after:z-30 [&>td]:after:h-0.5 [&>td]:after:bg-primary [&>td]:after:content-['']";
const ROW_DROP_LINE_ABOVE = `${ROW_DROP_LINE} [&>td]:after:top-0`;
const ROW_DROP_LINE_BELOW = `${ROW_DROP_LINE} [&>td]:after:bottom-0`;

function SortableDatabaseColumn({ projectId, database, property, disabled, onEdit }: {
  projectId: string; database: PageSummary; property: DatabaseProperty; disabled: boolean;
  onEdit: (property: DatabaseProperty) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: property.id, disabled });
  return <th ref={setNodeRef} scope="col" data-database-column={property.id}
    className={`relative overflow-hidden whitespace-nowrap border-b border-border/50 bg-background p-1 font-normal ${isDragging ? "shadow-md" : ""}`}
    // A translation only: dnd-kit's transform also scales the dragged header
    // to the width of the column under it, which stretched its text.
    style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}>
    <DatabaseColumnName projectId={projectId} database={database} property={property} disabled={disabled}
      dragging={isDragging} onEdit={onEdit} dragHandleProps={{ ...attributes, ...listeners }} />
  </th>;
}

function DatabaseSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      value={value || "__empty__"}
      onValueChange={(next) => onChange(next === "__empty__" ? "" : next)}
    >
      <SelectTrigger aria-label={label} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="[&_[role=option]]:rounded-sm">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value || "__empty__"}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const verticalPropertyDrag: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** One column of the properties popover, reordered by its handle like the
    project's categories. */
function SortablePropertyRow({ property, sortable, children }: {
  property: DatabaseProperty; sortable: boolean; children: ReactNode;
}) {
  const t = useTranslations("PageDatabase");
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: property.id, disabled: !sortable });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex min-h-9 items-center gap-1 rounded-sm bg-popover px-1 hover:bg-muted/50 ${isDragging ? "z-10 shadow-md" : ""}`}
    >
      <AppTooltip label={t("reorderColumnHint")}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={t("reorderColumn", { name: property.name })}
          disabled={!sortable}
          {...attributes}
          {...listeners}
          // A touch on the handle drags; the rest of the list still scrolls.
          style={{ touchAction: "none" }}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" />
        </button>
      </AppTooltip>
      {children}
    </div>
  );
}

/** Places a trigger-less popover against another control: the side panel's
    settings button, which opens it from its menu. */
function AnchorTo({ anchor }: { anchor: RefObject<HTMLElement | null> }) {
  return <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>} />;
}

/** A popover opened from the settings menu has no trigger to give focus back
    to: it returns to the settings button instead of the document's body. */
function returnFocus(event: Event, anchor: RefObject<HTMLElement | null>) {
  event.preventDefault();
  anchor.current?.focus();
}

function PropertySettings({
  projectId,
  database,
  hidden,
  onToggleVisibility,
  onCreate,
  sheet,
  anchored,
}: {
  projectId: string;
  database: PageSummary;
  hidden: string[];
  onToggleVisibility: (id: string) => void;
  onCreate: () => void;
  /** On a phone: a bottom sheet the toolbar's settings open, without a
      trigger of its own. */
  sheet?: { open: boolean; onOpenChange: (open: boolean) => void };
  /** In a side panel: a popover the toolbar's settings menu opens, anchored
      to that menu's button instead of a trigger of its own. */
  anchored?: { open: boolean; onOpenChange: (open: boolean) => void; anchor: RefObject<HTMLElement | null> };
}) {
  const t = useTranslations("PageDatabase");
  const { saveSchema, pending } = usePageDatabase(projectId);
  const schema = database.database_schema ?? [];
  const [popoverOpen, setPopoverOpen] = useState(false);
  const controlled = sheet ?? anchored;
  const open = controlled ? controlled.open : popoverOpen;
  const setOpen = controlled ? controlled.onOpenChange : setPopoverOpen;
  const [manage, setManage] = useState<DatabaseProperty | null>(null);
  const [remove, setRemove] = useState<DatabaseProperty | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [editBase, setEditBase] = useState(database);
  const [removeBase, setRemoveBase] = useState(database);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements = useDragAnnouncements((id) =>
    schema.find((property) => property.id === id)?.name);
  const columnsBody = (
    <>
          {!sheet && <div className="px-2 py-1 text-sm font-medium">{t("properties")}</div>}
          <DndContext
            accessibility={{ announcements, screenReaderInstructions: { draggable: t("reorderColumnHint") } }}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[verticalPropertyDrag]}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return;
              const ids = schema.map((property) => property.id);
              const from = ids.indexOf(String(active.id));
              const to = ids.indexOf(String(over.id));
              if (from === -1 || to === -1) return;
              void saveSchema(database, arrayMove(schema, from, to));
            }}
          >
          <DragCursor />
          <SortableContext items={schema.map((property) => property.id)} strategy={verticalListSortingStrategy}>
          <div className={sheet ? "max-h-[50dvh] space-y-1 overflow-y-auto" : "max-h-72 space-y-1 overflow-y-auto"}>
            {schema.map((property) => {
              const Icon = PROPERTY_ICONS[property.type];
              return (
                <SortablePropertyRow
                  key={property.id}
                  property={property}
                  sortable={!pending && schema.length > 1 && editing !== property.id}
                >
                  <AppIcon icon={Icon} className="mr-1 size-4 shrink-0 text-muted-foreground" />
                  {editing === property.id ? (
                    <form
                      className="flex min-w-0 flex-1 gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (rename.trim())
                          void saveSchema(
                            editBase,
                            (editBase.database_schema ?? []).map((p) =>
                              p.id === property.id
                                ? { ...p, name: rename.trim() }
                                : p,
                            ),
                          );
                        setEditing(null);
                      }}
                    >
                      <Input
                        aria-label={t("propertyName")}
                        maxLength={80}
                        value={rename}
                        onChange={(e) => setRename(e.target.value)}
                        autoFocus
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={pending || !rename.trim()}
                      >
                        {t("save")}
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm"
                      onClick={() => {
                        setEditBase(database);
                        setEditing(property.id);
                        setRename(property.name);
                      }}
                    >
                      {property.name}
                    </button>
                  )}
                  {(property.type === "select" ||
                    property.type === "multi_select") && (
                    <AppTooltip label={t("editOptions")}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editOptions")}
                        onClick={() => {
                          setOpen(false);
                          setManage(property);
                        }}
                      >
                        <HugeiconsIcon icon={Settings02Icon} className="size-3.5" />
                      </Button>
                    </AppTooltip>
                  )}
                  <AppTooltip
                    label={t(
                      hidden.includes(property.id)
                        ? "showProperty"
                        : "hideProperty",
                      { name: property.name },
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(
                        hidden.includes(property.id)
                          ? "showProperty"
                          : "hideProperty",
                        { name: property.name },
                      )}
                      aria-pressed={!hidden.includes(property.id)}
                      onClick={() => onToggleVisibility(property.id)}
                    >
                      {hidden.includes(property.id) ? (
                        <HugeiconsIcon icon={ViewOffIcon} className="size-3.5 text-muted-foreground" />
                      ) : (
                        <HugeiconsIcon icon={ViewIcon} className="size-3.5" />
                      )}
                    </Button>
                  </AppTooltip>
                  <AppTooltip label={t("deleteProperty")}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("deleteProperty")}
                      disabled={pending}
                      onClick={() => {
                        setRemoveBase(database);
                        setRemove(property);
                      }}
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                    </Button>
                  </AppTooltip>
                </SortablePropertyRow>
              );
            })}
          </div>
          </SortableContext>
          </DndContext>
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              className="w-full justify-start rounded-sm"
              disabled={schema.length >= MAX_DATABASE_PROPERTIES}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              {t("addProperty")}
            </Button>
            {schema.length >= MAX_DATABASE_PROPERTIES && (
              <p className="text-sm text-muted-foreground">
                {t("propertyLimit", { count: MAX_DATABASE_PROPERTIES })}
              </p>
            )}
          </div>
    </>
  );
  return (
    <>
      {sheet ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <MobileSheetContent side="bottom" aria-describedby={undefined}
            className="gap-2 p-2 pt-12 [&_button]:rounded-md [&_input]:rounded-md">
            <SheetTitle className="mobile-picker-title truncate">{t("properties")}</SheetTitle>
            {columnsBody}
          </MobileSheetContent>
        </Sheet>
      ) : (
      <Popover open={open} onOpenChange={setOpen}>
        {anchored ? (
          <AnchorTo anchor={anchored.anchor} />
        ) : (
          <AppTooltip label={t("properties")}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("properties")}>
                <HugeiconsIcon icon={Settings02Icon} className="size-4" />
              </Button>
            </PopoverTrigger>
          </AppTooltip>
        )}
        <PopoverContent
          align="end"
          onCloseAutoFocus={anchored ? (event) => returnFocus(event, anchored.anchor) : undefined}
          className="w-[min(380px,calc(100vw-2rem))] gap-2 rounded-xl p-2 [&_input]:rounded-sm [&_button]:rounded-sm"
        >
          {columnsBody}
        </PopoverContent>
      </Popover>
      )}
      {manage && (
        <DatabaseOptionsDialog
          projectId={projectId}
          database={database}
          property={manage}
          onClose={() => setManage(null)}
        />
      )}
      <ConfirmDeleteDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
        title={t("deleteProperty")}
        description={t("deletePropertyBody", { name: remove?.name ?? "" })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        isLoading={pending}
        onConfirm={() => {
          void saveSchema(
            removeBase,
            (removeBase.database_schema ?? []).filter(
              (p) => p.id !== remove?.id,
            ),
          );
        }}
      />
    </>
  );
}

export function PageDatabaseView({
  projectId,
  database,
  onOpen,
  compact = false,
}: {
  projectId: string;
  database: PageSummary;
  onOpen: (pageId: string) => void;
  /** Shown in a side panel: the phone's toolbar (view picker, search and
      settings) at desktop size, with menus and popovers instead of sheets. */
  compact?: boolean;
}) {
  const [createProperty, setCreateProperty] = useState(false);
  const [editProperty, setEditProperty] = useState<DatabaseProperty | null>(
    null,
  );
  const { saveSchema, pending: schemaPending } = usePageDatabase(projectId);
  const columnBase = useRef<PageSummary | null>(null);
  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["F8"], cancel: ["Escape"], end: ["F8", "Enter", "Space"] } }));
  const t = useTranslations("PageDatabase");
  const mobile = useMobileLayout() === true;
  const columnAnnouncements = useDragAnnouncements((id) =>
    database.database_schema?.find((property) => property.id === id)?.name);
  const tPages = useTranslations("Pages");
  const { canWrite } = useProjectCapabilities(projectId);
  const promotePage = usePromotePage(projectId);
  const {
    pages,
    createPage,
    duplicatePage,
    trashPage,
    updatePage,
    prefetchPage,
  } = usePagesQuery(projectId);
  const { members } = useMembersQuery(projectId, true);
  const [query, setQuery] = useState("");
  const databaseViews = usePageDatabaseViews(projectId, database.id, canWrite,
    database.database_schema ?? undefined);
  const { sort, descending, filters, hidden } = databaseViews.config;
  const updateView = databaseViews.update;
  const setSort = (next: string) => updateView({ sort: next });
  const setDescending = (next: boolean) => updateView({ descending: next });
  const setFilters = (next: DatabaseViewFilter) => updateView({ filters: next });
  const filterCount = activeFilterCount(filters);
  // The phone's toolbar: search unfolds in place, the settings sheet leads to
  // the sort, filter and column sheets.
  const [mobileSearch, setMobileSearch] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"settings" | "sort" | "filter" | "columns" | null>(null);
  // The side panel's toolbar: its settings menu sorts in place and opens the
  // filter or column popover against its button once the menu has closed.
  const panelToolbar = compact && !mobile;
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [panelPopover, setPanelPopover] = useState<"filter" | "columns" | null>(null);
  const pendingPopover = useRef<"filter" | "columns" | null>(null);
  const [remove, setRemove] = useState<PageSummary[]>([]);
  const [menuEntry, setMenuEntry] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const selectionAnchor = useRef<string | null>(null);
  const dragging = useRef<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    above: boolean;
  } | null>(null);
  const schema = database.database_schema ?? [];
  const names = useMemo(
    () =>
      new Map(
        members.map((m) => [m.user_id, displayName(m, t("unknownPerson"))]),
      ),
    [members, t],
  );
  const entries = pages
    .filter((p) => p.parent_id === database.id)
    .sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );
  const rows = entries
    .filter((entry) => {
      const text = [
        entry.title,
        ...schema.map((p) =>
          databaseValueText(databasePropertyValue(entry, p), names, p),
        ),
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (!text.includes(query.toLocaleLowerCase())) return false;
      return matchesDatabaseFilter(entry, schema, filters);
    })
    .sort((a, b) => {
      const effectiveSort =
        sort === "position" ||
        sort === "title" ||
        schema.some((p) => p.id === sort)
          ? sort
          : "position";
      const result =
        effectiveSort === "position"
          ? a.position < b.position
            ? -1
            : a.position > b.position
              ? 1
              : 0
          : effectiveSort === "title"
            ? a.title.localeCompare(b.title)
            : compareDatabaseValues(
                databasePropertyValue(
                  a,
                  schema.find((p) => p.id === effectiveSort)!,
                ),
                databasePropertyValue(
                  b,
                  schema.find((p) => p.id === effectiveSort)!,
                ),
                names,
                schema.find((p) => p.id === effectiveSort),
              );
      return (descending ? -result : result) || a.id.localeCompare(b.id);
    });
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    }
  };
  const add = () =>
    void run(async () => {
      const entry = await createPage({ parent_id: database.id });
      onOpen(entry.id);
      await entry.settled;
    });
  const selectedRows = rows.filter((entry) => selected.includes(entry.id));
  const manual = sort === "position" && !descending;
  const targetsFor = (entry: PageSummary) =>
    selected.includes(entry.id) ? selectedRows : [entry];
  const insert = (entry: PageSummary, above: boolean) =>
    void run(async () => {
      const [position] = databaseRowPositions(entries, entry.id, above);
      if (!position) return;
      const created = await createPage({ parent_id: database.id, position });
      // Manual order is already on screen; the new entry must not be filtered out.
      if (filters.conditions.length) setFilters({ ...filters, conditions: [] });
      setQuery("");
      onOpen(created.id);
      await created.settled;
    });
  const [duplicateTargets, setDuplicateTargets] = useState<PageSummary[]>([]);
  // The checked entries act through the same selection bar and ⌘K actions as
  // the page tree (MIN-873); duplicating and trashing keep their dialogs.
  const tBulk = useTranslations("BulkActions");
  const { openIntent: openNumo } = useAssistantPanelActions();
  const promotePages = usePromotePages(projectId);
  const askNumoAboutEntries = () =>
    openNumo({
      source: "page",
      action: "discuss",
      projectId,
      pageContext: { projectId, ...selectedItemsPageContext("page", selectedRows) },
    });
  const entryActions: EntityBulkAction[] = canWrite
    ? [
          {
            id: "entries-promote",
            title: tBulk("promoteEntries", { count: selectedRows.length }),
            icon: <NumoIcon animated={false} className="size-4" />,
            keywords: ["promote", "issue", "ticket", "promouvoir"],
            run: () => void promotePages(selectedRows),
          },
          {
            id: "entries-duplicate",
            title: t("duplicate"),
            icon: Copy01Icon,
            keywords: ["duplicate", "copy", "dupliquer"],
            run: () => setDuplicateTargets(selectedRows),
          },
          {
            id: "entries-trash",
            title: t("moveToTrash"),
            icon: Delete02Icon,
            keywords: ["trash", "delete", "corbeille", "supprimer"],
            // Opens the entries' own confirmation below.
            run: () => setRemove(selectedRows),
          },
        ]
    : [];
  const duplicate = (targets: PageSummary[]) =>
    void run(async () => {
      const copies = await Promise.all(
        targets.map((entry) => duplicatePage(entry.id)),
      );
      if (copies.length === 1) onOpen(copies[0].id);
      else setSelected(copies.map((copy) => copy.id));
      await Promise.all(copies.map((copy) => copy.settled));
    });
  const drop = (targetId: string, above: boolean) => {
    const ids = dragging.current;
    dragging.current = [];
    setIsDragging(false);
    setDropTarget(null);
    if (!manual || ids.includes(targetId)) return;
    const moving = entries.filter((entry) => ids.includes(entry.id));
    const positions = databaseRowPositions(
      entries,
      targetId,
      above,
      ids,
      moving.length,
    );
    if (!positions.length) return;
    void run(async () => {
      await Promise.all(
        moving.map((entry, index) =>
          updatePage(entry.id, { position: positions[index] }),
        ),
      );
    });
  };
  const visible = schema.filter((property) => !hidden.includes(property.id));
  const columnWidths = [
    240,
    ...visible.map(
      (property) =>
        ({
          text: 240,
          number: 160,
          select: 192,
          multi_select: 240,
          created_at: 200,
          date: 176,
          people: 192,
          checkbox: 128,
        })[property.type],
    ),
  ];
  const contentWidth = columnWidths.reduce((total, width) => total + width, 0);
  // The chrome columns around the data: the row gutter (+ and handle), which a
  // touch screen does without, the selection checkbox, and the trailing cell.
  const gutterWidth = mobile ? 0 : 64;
  const selectWidth = mobile ? 44 : 32;
  const chromeWidth = gutterWidth + selectWidth + 56;
  const filterEditor = (
    <DatabaseFilterEditor schema={schema} filter={filters} members={members} onChange={setFilters} />
  );
  const sortOptions = [
    { value: "position", label: t("manualOrder") },
    { value: "title", label: database.database_title_name ?? t("name") },
    ...schema.map((p) => ({ value: p.id, label: p.name })),
  ];
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? t("manualOrder");
  const sorted = sort !== "position" || descending;
  const sortControls = (
    <>
      <DatabaseSelect
        label={t("sort")}
        value={sort}
        onChange={setSort}
        options={sortOptions}
      />
      <DatabaseSelect
        label={t("sortDirection")}
        value={descending ? "descending" : "ascending"}
        onChange={(next) => setDescending(next === "descending")}
        options={[
          { value: "ascending", label: t("sortAscending") },
          { value: "descending", label: t("sortDescending") },
        ]}
      />
    </>
  );
  const propertySettings = (
    sheet?: { open: boolean; onOpenChange: (open: boolean) => void },
    anchored?: { open: boolean; onOpenChange: (open: boolean) => void; anchor: RefObject<HTMLElement | null> },
  ) => (
    <PropertySettings
      projectId={projectId}
      database={database}
      hidden={hidden}
      sheet={sheet}
      anchored={anchored}
      onCreate={() => setCreateProperty(true)}
      onToggleVisibility={(id) =>
        updateView({
          hidden: hidden.includes(id)
            ? hidden.filter((value) => value !== id)
            : [...hidden, id],
        })
      }
    />
  );
  const searchPopover = (
    <Popover>
      <AppTooltip label={t("searchEntries")}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("searchEntries")}
            className={query ? "text-primary" : "text-muted-foreground"}
          >
            <HugeiconsIcon icon={Search01Icon} className="size-4" />
          </Button>
        </PopoverTrigger>
      </AppTooltip>
      <PopoverContent
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)] gap-2 rounded-xl p-2 [&_input]:rounded-sm [&_button]:rounded-sm"
      >
        <Input
          autoFocus
          aria-label={t("searchEntries")}
          placeholder={t("searchEntries")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </PopoverContent>
    </Popover>
  );
  const settingsDetail = "ml-auto max-w-32 truncate pl-4 text-xs text-muted-foreground";
  const panelSettings = (
    <>
      <DropdownMenu>
        <AppTooltip label={t("viewSettings")}>
          <DropdownMenuTrigger asChild>
            <Button
              ref={settingsButton}
              variant="ghost"
              size="icon-sm"
              aria-label={t("viewSettings")}
              className={filterCount || sorted ? "text-primary" : "text-muted-foreground"}
            >
              <HugeiconsIcon icon={Settings02Icon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </AppTooltip>
        <DropdownMenuContent
          align="end"
          className="w-64"
          onCloseAutoFocus={(event) => {
            const next = pendingPopover.current;
            pendingPopover.current = null;
            if (!next) return;
            // Opened only now, so the menu's own focus return does not count
            // as a move outside the popover and close it at once.
            event.preventDefault();
            setPanelPopover(next);
          }}
        >
          <DropdownMenuLabel>{t("viewSettings")}</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={ArrowUpDownIcon} className="size-4 text-muted-foreground" />
              <span className="shrink-0">{t("sort")}</span>
              <span className={settingsDetail}>{sortLabel}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                {sortOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span className="truncate">{option.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={descending ? "descending" : "ascending"}
                onValueChange={(next) => setDescending(next === "descending")}
              >
                <DropdownMenuRadioItem value="ascending">{t("sortAscending")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="descending">{t("sortDescending")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => { pendingPopover.current = "filter"; }}>
            <HugeiconsIcon icon={FilterIcon} className="size-4 text-muted-foreground" />
            <span className="shrink-0">{t("filter")}</span>
            <span className={settingsDetail}>{t("filterCount", { count: filterCount })}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { pendingPopover.current = "columns"; }}>
            <HugeiconsIcon icon={Settings02Icon} className="size-4 text-muted-foreground" />
            <span className="shrink-0">{t("properties")}</span>
            <span className={settingsDetail}>{t("visibleColumns", { count: visible.length + 1 })}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover
        open={panelPopover === "filter"}
        onOpenChange={(open) => setPanelPopover(open ? "filter" : null)}
      >
        <AnchorTo anchor={settingsButton} />
        <PopoverContent
          align="end"
          onCloseAutoFocus={(event) => returnFocus(event, settingsButton)}
          className="max-h-[min(70vh,36rem)] w-[min(380px,calc(100vw-2rem))] gap-2 overflow-y-auto rounded-xl p-2 [&_input]:rounded-sm [&_button]:rounded-sm"
        >
          <div className="px-2 py-1 text-sm font-medium">{t("filter")}</div>
          {filterEditor}
        </PopoverContent>
      </Popover>
      {propertySettings(undefined, {
        open: panelPopover === "columns",
        onOpenChange: (open) => setPanelPopover(open ? "columns" : null),
        anchor: settingsButton,
      })}
    </>
  );
  return (
    <div className="mt-5 space-y-1">
      <div className="flex items-center gap-0.5">
        <div className={`mr-auto flex min-w-0 items-center gap-1 ${mobile || panelToolbar ? "flex-1" : ""}`}>
          <DatabaseViewStrip
            views={databaseViews.views}
            activeId={databaseViews.active?.id ?? null}
            canWrite={canWrite}
            compact={panelToolbar}
            onSelect={databaseViews.select}
            onCreate={databaseViews.create}
            onRename={databaseViews.rename}
            onDelete={databaseViews.remove}
            onMove={databaseViews.move}
          />
        </div>
        {mobile ? (
          <>
            <Button variant="ghost" size="icon" aria-label={t("searchEntries")}
              className={`size-11 ${query ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setMobileSearch(true)}>
              <HugeiconsIcon icon={Search01Icon} className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("viewSettings")}
              className={`size-11 ${filterCount || sorted ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => setMobileSheet("settings")}>
              <HugeiconsIcon icon={Settings02Icon} className="size-5" />
            </Button>
            <Button className="ml-1 h-11" onClick={add}>
              {t("new")}
            </Button>
          </>
        ) : panelToolbar ? (
          <>
            {searchPopover}
            {panelSettings}
            <Button size="sm" className="ml-2" onClick={add}>
              {t("new")}
            </Button>
          </>
        ) : (
          <>
        <Popover>
          <AppTooltip label={t("filter")}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("filter")}
                className={filterCount ? "text-primary" : "text-muted-foreground"}
              >
                <HugeiconsIcon icon={FilterIcon} className="size-4" />
              </Button>
            </PopoverTrigger>
          </AppTooltip>
          <PopoverContent
            align="end"
            className="max-h-[min(70vh,36rem)] w-[min(380px,calc(100vw-2rem))] gap-2 overflow-y-auto rounded-xl p-2 [&_input]:rounded-sm [&_button]:rounded-sm"
          >
            <div className="px-2 py-1 text-sm font-medium">{t("filter")}</div>
            {filterEditor}
          </PopoverContent>
        </Popover>
        <Popover>
          <AppTooltip label={t("sort")}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("sort")}
                className={
                  sort !== "position" || descending
                    ? "text-primary"
                    : "text-muted-foreground"
                }
              >
                <HugeiconsIcon icon={ArrowUpDownIcon} className="size-4" />
              </Button>
            </PopoverTrigger>
          </AppTooltip>
          <PopoverContent
            align="end"
            className="w-72 max-w-[calc(100vw-2rem)] gap-2 rounded-xl p-2 [&_input]:rounded-sm [&_button]:rounded-sm"
          >
            <div className="px-2 py-1 text-sm font-medium">{t("sort")}</div>
            {sortControls}
          </PopoverContent>
        </Popover>
        {searchPopover}
        {propertySettings()}
        <Button size="sm" className="ml-2" onClick={add}>
          {t("new")}
        </Button>
          </>
        )}
      </div>
      {mobile && mobileSearch && (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            aria-label={t("searchEntries")}
            placeholder={t("searchEntries")}
            className="h-11 flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button variant="ghost" size="icon" aria-label={t("closeSearch")}
            onClick={() => { setQuery(""); setMobileSearch(false); }}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </Button>
        </div>
      )}
      {mobile && (
        <>
          <Sheet open={mobileSheet === "settings"} onOpenChange={(open) => setMobileSheet(open ? "settings" : null)}>
            <MobileSheetContent side="bottom" aria-describedby={undefined} className="gap-1 p-2 pt-12">
              <SheetTitle className="mobile-picker-title truncate">{t("viewSettings")}</SheetTitle>
              {([
                { key: "sort", icon: ArrowUpDownIcon, label: t("sort"),
                  detail: sortLabel },
                { key: "filter", icon: FilterIcon, label: t("filter"), detail: t("filterCount", { count: filterCount }) },
                { key: "columns", icon: Settings02Icon, label: t("properties"),
                  detail: t("visibleColumns", { count: visible.length + 1 }) },
              ] as const).map((row) => (
                <button key={row.key} type="button" onClick={() => setMobileSheet(row.key)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm active:bg-control">
                  <HugeiconsIcon icon={row.icon} className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="max-w-[45%] truncate text-muted-foreground">{row.detail}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </MobileSheetContent>
          </Sheet>
          <Sheet open={mobileSheet === "sort"} onOpenChange={(open) => setMobileSheet(open ? "sort" : null)}>
            <MobileSheetContent side="bottom" aria-describedby={undefined} className="gap-2 p-4 pt-12">
              <SheetTitle className="mobile-picker-title truncate">{t("sort")}</SheetTitle>
              {sortControls}
            </MobileSheetContent>
          </Sheet>
          <Sheet open={mobileSheet === "filter"} onOpenChange={(open) => setMobileSheet(open ? "filter" : null)}>
            <MobileSheetContent side="bottom" aria-describedby={undefined} className="gap-2 p-4 pt-12">
              <SheetTitle className="mobile-picker-title truncate">{t("filter")}</SheetTitle>
              <div className="max-h-[60dvh] overflow-y-auto">{filterEditor}</div>
            </MobileSheetContent>
          </Sheet>
          {propertySettings({ open: mobileSheet === "columns", onOpenChange: (open) => setMobileSheet(open ? "columns" : null) })}
        </>
      )}
      <DndContext accessibility={{ announcements: columnAnnouncements, screenReaderInstructions: { draggable: t("dragColumnHint") } }} sensors={columnSensors} collisionDetection={closestCenter} modifiers={[horizontalColumnDrag]}
        onDragStart={() => { columnBase.current = database; }}
        onDragCancel={() => { columnBase.current = null; }}
        onDragEnd={({ active, over }) => {
          const base = columnBase.current;
          columnBase.current = null;
          if (!base || !over || active.id === over.id) return;
          const schema = base.database_schema ?? [];
          const before = schema.findIndex((p) => p.id === active.id) > schema.findIndex((p) => p.id === over.id);
          void saveSchema(base, reorderDatabaseColumns(schema, String(active.id), String(over.id), before));
        }}>
      <DragCursor />
      <SortableContext items={visible.map((property) => property.id)} strategy={horizontalListSortingStrategy}>
      <DatabaseTableScroll panel={compact}>
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ minWidth: contentWidth + chromeWidth }}
        >
          <colgroup>
            {!mobile && <col style={{ width: gutterWidth }} />}
            <col style={{ width: selectWidth }} />
            {columnWidths.map((width, index) => (
              <col
                key={index}
                style={{
                  width: `max(${width}px, calc(${(100 * width) / contentWidth}cqw - ${(chromeWidth * width) / contentWidth}px))`,
                }}
              />
            ))}
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr className="text-left text-muted-foreground">
              {!mobile && <th scope="col" className="w-16 bg-background" />}
              <th scope="col" className="w-8 bg-background">
                {/* The tooltip sits on the wrapper: as the checkbox's own trigger,
                    its `data-state` would replace the checked state. */}
                <AppTooltip label={t(rows.length > 0 && selectedRows.length === rows.length ? "deselectAllEntries" : "selectAllEntries")}>
                <div
                  className={`flex justify-end pr-2 ${selectedRows.length ? "" : "opacity-0 hover:opacity-100 focus-within:opacity-100 touch:opacity-100"}`}
                >
                  <Checkbox
                    className="after:inset-x-0"
                    aria-label={t("selectAllEntries")}
                    disabled={!rows.length}
                    checked={
                      rows.length > 0 && selectedRows.length === rows.length
                        ? true
                        : selectedRows.length
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() =>
                      setSelected(
                        selectedRows.length === rows.length
                          ? []
                          : rows.map((entry) => entry.id),
                      )
                    }
                  />
                </div>
                </AppTooltip>
              </th>
              <th
                scope="col"
                className="overflow-hidden border-b border-border/50 p-1 font-normal"
              >
                <DatabaseColumnName projectId={projectId} database={database} />
              </th>
              {visible.map((property) => <SortableDatabaseColumn key={property.id}
                projectId={projectId} database={database} property={property} disabled={schemaPending} onEdit={setEditProperty} />)}
              <th
                scope="col"
                data-create-property-column
                className="w-14 border-b border-border/50 p-0 font-normal"
              >
                <AppTooltip label={t("addProperty")}>
                  <button
                    type="button"
                    aria-label={t("addProperty")}
                    disabled={schema.length >= MAX_DATABASE_PROPERTIES}
                    className="flex h-10 w-full items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                    onClick={() => setCreateProperty(true)}
                  >
                    <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  </button>
                </AppTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const targets = targetsFor(entry);
              const checked = selected.includes(entry.id);
              return (
                <tr
                  key={entry.id}
                  data-entry-id={entry.id}
                  aria-selected={checked}
                  className={`group h-10 pointer-coarse:h-12 ${checked ? "bg-primary/5" : "hover:bg-muted/20"} ${dropTarget?.id === entry.id ? (dropTarget.above ? ROW_DROP_LINE_ABOVE : ROW_DROP_LINE_BELOW) : ""}`}
                  onDragOver={(event) => {
                    if (
                      !manual ||
                      !dragging.current.length ||
                      dragging.current.includes(entry.id)
                    )
                      return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const box = event.currentTarget.getBoundingClientRect();
                    setDropTarget({
                      id: entry.id,
                      above: event.clientY < box.top + box.height / 2,
                    });
                  }}
                  onDrop={(event) => {
                    if (!dragging.current.length) return;
                    event.preventDefault();
                    const box = event.currentTarget.getBoundingClientRect();
                    drop(entry.id, event.clientY < box.top + box.height / 2);
                  }}
                >
                  {!mobile && (
                  <td className="h-10 w-16 bg-background p-0">
                      <div
                        // Fades in and out with the hover, like a page block's gutter.
                        className="flex h-10 items-center justify-end gap-0 pr-1 opacity-0 transition-opacity duration-[120ms] ease-out group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 motion-reduce:transition-none touch:hidden"
                      >
                        <AppTooltip label={t("insertEntryHint")}>
                          <button
                            type="button"
                            className={ROW_GUTTER_BUTTON}
                            aria-label={t("insertEntryHint")}
                            onClick={(event) => insert(entry, event.altKey)}
                          >
                            <HugeiconsIcon icon={Add01Icon} className="size-5" />
                          </button>
                        </AppTooltip>
                        <DropdownMenu
                          open={menuEntry === entry.id}
                          onOpenChange={(open) =>
                            setMenuEntry(open ? entry.id : null)
                          }
                        >
                          <AppTooltip label={t("entryActions")}>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={t("entryActions")}
                                // A handle: it shows the grab hand before the press.
                                className={cn(ROW_GUTTER_BUTTON, "size-7", manual && "cursor-grab", isDragging && "cursor-grabbing")}
                                onPointerDownCapture={(event) => {
                                  if (event.button === 0) event.stopPropagation();
                                }}
                                onClick={() => setMenuEntry(entry.id)}
                                // The page's gesture (database-row-drag.ts):
                                // the rows themselves follow the pointer, and
                                // below the threshold the press stays a click.
                                onMouseDown={(event) => {
                                  const table = event.currentTarget.closest("table");
                                  if (!manual || event.button !== 0 || !table) return;
                                  event.preventDefault();
                                  const ids = targets.map((target) => target.id);
                                  trackRowDrag({
                                    start: event.nativeEvent,
                                    table,
                                    dragged: ids,
                                    onBegin: () => {
                                      dragging.current = ids;
                                      setIsDragging(true);
                                    },
                                    onTarget: setDropTarget,
                                    onDrop: ({ id, above }) => drop(id, above),
                                    onEnd: () => {
                                      setIsDragging(false);
                                      // `drop` reads the dragged ids after this.
                                      queueMicrotask(() => { dragging.current = []; });
                                    },
                                  });
                                }}
                              >
                                {/* Filled dots, as on a page's handle. */}
                                <HugeiconsIcon icon={DragDropVerticalIcon} className="size-6 [&_path]:fill-current" />
                              </button>
                            </DropdownMenuTrigger>
                          </AppTooltip>
                          <DropdownMenuContent align="start" className="[&_[role=menuitem]]:rounded-sm">
                            {targets.length === 1 && (
                              <DropdownMenuItem onSelect={() => onOpen(entry.id)}>
                                <HugeiconsIcon icon={File02Icon} className="size-4" />
                                {t("openEntry")}
                              </DropdownMenuItem>
                            )}
                            {/* One entry, one issue: a selection is not promoted in bulk. */}
                            {targets.length === 1 && canWrite && (
                              <DropdownMenuItem onSelect={() => void promotePage(entry)}>
                                <NumoIcon animated={false} className="size-4" />
                                {tPages("promoteToIssue")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => setDuplicateTargets(targets)}>
                              <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                              {t("duplicate")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setRemove(targets)}
                            >
                              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                              {t("moveToTrash")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  )}
                  <td
                    className="pointer-events-none sticky left-0 z-20 h-10 w-8 p-0 pointer-coarse:h-12"
                    data-selection-cell
                  >
                    <div
                      className={`absolute inset-0 flex items-center justify-center bg-background ${checked ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100"}`}
                    >
                      <AppTooltip label={t(checked ? "deselectEntryTooltip" : "selectEntryTooltip")}>
                      <div className="pointer-events-auto flex size-6 items-center justify-center">
                        {/* Anchor the checkbox hit area to the full selection container. */}
                        <Checkbox
                          className="static after:inset-x-0 after:inset-y-0"
                          aria-label={t("selectEntry", {
                            name: entry.title || tPages("untitled"),
                          })}
                          checked={checked}
                          onClick={(event) => {
                            if (event.shiftKey && selectionAnchor.current) {
                              event.preventDefault();
                              setSelected((ids) =>
                                selectDatabaseRows(
                                  rows.map((row) => row.id),
                                  ids,
                                  entry.id,
                                  !checked,
                                  selectionAnchor.current,
                                ),
                              );
                            }
                          }}
                          onCheckedChange={(next) => {
                            setSelected((ids) =>
                              selectDatabaseRows(
                                rows.map((row) => row.id),
                                ids,
                                entry.id,
                                next === true,
                              ),
                            );
                            selectionAnchor.current = entry.id;
                          }}
                        />
                      </div>
                      </AppTooltip>
                    </div>
                  </td>
                  <td className="h-10 overflow-hidden border-b border-border/40 p-0 pointer-coarse:h-12">
                    <button
                      type="button"
                      className="flex h-10 w-full min-w-0 items-center gap-2 overflow-hidden px-2 text-left transition-colors pointer-coarse:h-12 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      onClick={() => onOpen(entry.id)}
                      onMouseEnter={() => prefetchPage(entry.id)}
                      onFocus={() => prefetchPage(entry.id)}
                    >
                      {entry.icon ?? (
                        <HugeiconsIcon icon={File02Icon} className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 overflow-hidden whitespace-nowrap text-clip">
                        {entry.title.slice(0, 160) || tPages("untitled")}
                      </span>
                    </button>
                  </td>
                  {visible.map((property) => (
                    <td
                      key={property.id}
                      className="h-10 overflow-hidden border-b border-l border-border/30 p-0 pointer-coarse:h-12"
                    >
                      <DatabasePropertyCell
                        table
                        projectId={projectId}
                        page={entry}
                        database={database}
                        property={property}
                      />
                    </td>
                  ))}
                  <td
                    aria-hidden="true"
                    className="h-10 border-b border-l border-border/30 p-0 pointer-coarse:h-12"
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && entries.length > 0 && (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("noResults")}</p>
          </div>
        )}
      </DatabaseTableScroll>
      </SortableContext></DndContext>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start text-muted-foreground"
        onClick={add}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        {t("newEntry")}
      </Button>
      {editProperty && (
        <DatabaseEditPropertyDialog
          projectId={projectId}
          database={database}
          property={editProperty}
          onClose={() => setEditProperty(null)}
        />
      )}
      {createProperty && (
        <DatabaseCreatePropertyDialog
          projectId={projectId}
          database={database}
          onClose={() => setCreateProperty(false)}
        />
      )}
      <BulkIssueActionsPresence>
        {selectedRows.length > 0 && (
          <BulkEntityActions
            key="bulk-entry-actions"
            surface="database"
            label={tBulk("selectedEntries", { count: selectedRows.length })}
            placeholder={tBulk("entriesPlaceholder", { count: selectedRows.length })}
            count={selectedRows.length}
            actions={entryActions}
            onAskNumo={askNumoAboutEntries}
            onClear={() => setSelected([])}
          />
        )}
      </BulkIssueActionsPresence>
      <AlertDialog open={duplicateTargets.length > 0} onOpenChange={(open) => { if (!open) setDuplicateTargets([]); }}>
        <AlertDialogContent><AlertDialogHeader>
          <AlertDialogTitle>{t("duplicateEntries", { count: duplicateTargets.length })}</AlertDialogTitle>
          <AlertDialogDescription>{t("duplicateEntriesBody", { count: duplicateTargets.length })}</AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { duplicate(duplicateTargets); setDuplicateTargets([]); }}>{t("duplicate")}</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={remove.length > 0}
        onOpenChange={(open) => {
          if (!open) setRemove([]);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {remove.length > 1
                ? t("deleteEntries", { count: remove.length })
                : t("deleteEntry")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteEntryBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void run(async () => {
                  const requests = remove.map((entry) => trashPage(entry.id));
                  setSelected((ids) =>
                    ids.filter(
                      (id) => !remove.some((entry) => entry.id === id),
                    ),
                  );
                  setRemove([]);
                  await Promise.all(requests);
                });
              }}
            >
              {t("moveToTrash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
