"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  toast,
} from "mangue-ui";
import {
  ArrowDown,
  ArrowDownUp,
  Filter,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  X,
  FileText,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { DatabaseColumnName } from "./database-column-name";
import { reorderDatabaseColumns } from "@/lib/page-database-columns";
import { DatabaseTableScroll } from "./database-table-scroll";
import {
  databaseRowPositions,
  selectDatabaseRows,
} from "@/lib/page-database-rows";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchSelect } from "@/components/search-select";
import { UserAvatar } from "@/components/user-avatar";
import { usePagesQuery } from "@/lib/use-pages-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { usePageDatabase } from "@/lib/use-page-database";
import { displayName } from "@/lib/display-name";
import {
  MAX_DATABASE_PROPERTIES,
  compareDatabaseValues,
  databaseValueText,
  databasePropertyValue,
  type DatabaseProperty,
} from "@/lib/page-databases";
import { positionBetween } from "@/lib/pages";
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
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value || "__empty__"}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PropertySettings({
  projectId,
  database,
  hidden,
  onToggleVisibility,
  onCreate,
}: {
  projectId: string;
  database: PageSummary;
  hidden: string[];
  onToggleVisibility: (id: string) => void;
  onCreate: () => void;
}) {
  const t = useTranslations("PageDatabase");
  const { saveSchema, pending } = usePageDatabase(projectId);
  const schema = database.database_schema ?? [];
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState<DatabaseProperty | null>(null);
  const [remove, setRemove] = useState<DatabaseProperty | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [editBase, setEditBase] = useState(database);
  const [removeBase, setRemoveBase] = useState(database);
  const reorder = (index: number, direction: number) => {
    const next = [...schema];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    void saveSchema(database, next);
  };
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <AppTooltip label={t("properties")}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("properties")}>
              <Settings2 className="size-4" />
            </Button>
          </PopoverTrigger>
        </AppTooltip>
        <PopoverContent
          align="end"
          className="w-[min(380px,calc(100vw-2rem))] space-y-4"
        >
          <div className="text-sm font-medium">{t("properties")}</div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {schema.map((property, index) => {
              const Icon = PROPERTY_ICONS[property.type];
              return (
                <div key={property.id} className="flex items-center gap-1">
                  <Icon className="mr-1 size-4 shrink-0 text-muted-foreground" />
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
                          ).then((ok) => {
                            if (ok) setEditing(null);
                          });
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
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("editOptions")}
                      onClick={() => {
                        setOpen(false);
                        setManage(property);
                      }}
                    >
                      <Settings2 className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("moveUp")}
                    disabled={pending || index === 0}
                    onClick={() => reorder(index, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("moveDown")}
                    disabled={pending || index === schema.length - 1}
                    onClick={() => reorder(index, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
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
                        <EyeOff className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                  </AppTooltip>
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
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              className="w-full justify-start"
              disabled={schema.length >= MAX_DATABASE_PROPERTIES}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              <Plus className="size-4" />
              {t("addProperty")}
            </Button>
            {schema.length >= MAX_DATABASE_PROPERTIES && (
              <p className="text-sm text-muted-foreground">
                {t("propertyLimit", { count: MAX_DATABASE_PROPERTIES })}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {manage && (
        <DatabaseOptionsDialog
          projectId={projectId}
          database={database}
          property={manage}
          onClose={() => setManage(null)}
        />
      )}
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteProperty")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deletePropertyBody", { name: remove?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void saveSchema(
                  removeBase,
                  (removeBase.database_schema ?? []).filter(
                    (p) => p.id !== remove?.id,
                  ),
                ).then((ok) => {
                  if (ok) setRemove(null);
                });
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function PageDatabaseView({
  projectId,
  database,
  onOpen,
}: {
  projectId: string;
  database: PageSummary;
  onOpen: (pageId: string) => void;
}) {
  const [createProperty, setCreateProperty] = useState(false);
  const [editProperty, setEditProperty] = useState<DatabaseProperty | null>(
    null,
  );
  const { saveSchema, pending: schemaPending } = usePageDatabase(projectId);
  const columnDrag = useRef<{ id: string; base: PageSummary } | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<{
    id: string;
    before: boolean;
  } | null>(null);
  const endColumnDrag = () => {
    columnDrag.current = null;
    setDraggingColumn(null);
    setColumnDropTarget(null);
  };
  const dropColumn = (targetId: string, before: boolean) => {
    const source = columnDrag.current;
    endColumnDrag();
    if (!source) return;
    const schema = source.base.database_schema ?? [];
    const next = reorderDatabaseColumns(schema, source.id, targetId, before);
    if (next.some((property, index) => property.id !== schema[index]?.id))
      void saveSchema(source.base, next);
  };
  const t = useTranslations("PageDatabase");
  const tPages = useTranslations("Pages");
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
  const [sort, setSort] = useState("position");
  const [descending, setDescending] = useState(false);
  const [filter, setFilter] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const storageKey = `minddy:database-list:${projectId}:${database.id}`;
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (stored && typeof stored === "object") {
        if (typeof stored.sort === "string") setSort(stored.sort);
        if (typeof stored.descending === "boolean")
          setDescending(stored.descending);
        if (typeof stored.filter === "string") setFilter(stored.filter);
        if (typeof stored.filterValue === "string")
          setFilterValue(stored.filterValue);
        if (
          Array.isArray(stored.hidden) &&
          stored.hidden.every((id: unknown) => typeof id === "string")
        )
          setHidden(stored.hidden);
      }
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    setPreferencesReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!preferencesReady) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ sort, descending, filter, filterValue, hidden }),
      );
    } catch {
      /* List controls remain usable without persistence. */
    }
  }, [
    storageKey,
    preferencesReady,
    sort,
    descending,
    filter,
    filterValue,
    hidden,
  ]);
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
  const filterProperty = schema.find((property) => property.id === filter);
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
      if (!filterProperty) return true;
      const value = databasePropertyValue(entry, filterProperty);
      if (filterProperty.type === "checkbox")
        return (value === true) === (filterValue === "true");
      if (!filterValue)
        return (
          value == null ||
          value === "" ||
          (Array.isArray(value) && !value.length)
        );
      if (filterProperty.type === "people")
        return Array.isArray(value)
          ? value.includes(filterValue)
          : value === filterValue;
      return databaseValueText(value, names, filterProperty)
        .toLocaleLowerCase()
        .includes(filterValue.toLocaleLowerCase());
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
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const add = () =>
    void run(async () => {
      const entry = await createPage({ parent_id: database.id });
      await entry.settled;
      onOpen(entry.id);
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
      await created.settled;
      setSort("position");
      setDescending(false);
      setQuery("");
      setFilter("");
      onOpen(created.id);
    });
  const duplicate = (targets: PageSummary[]) =>
    void run(async () => {
      const copies: string[] = [];
      for (const entry of targets) {
        const copy = await duplicatePage(entry.id);
        copies.push(copy.id);
      }
      if (copies.length === 1) onOpen(copies[0]);
      else setSelected(copies);
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
      for (const [index, entry] of moving.entries())
        await updatePage(entry.id, { position: positions[index] });
    });
  };
  const move = (entry: PageSummary, direction: number) =>
    void run(async () => {
      const index = entries.findIndex((p) => p.id === entry.id);
      const before =
        direction < 0
          ? entries[index - 2]?.position
          : entries[index + 1]?.position;
      const after =
        direction < 0
          ? entries[index - 1]?.position
          : entries[index + 2]?.position;
      await updatePage(entry.id, { position: positionBetween(before, after) });
    });
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
  return (
    <div className="mt-5 space-y-1">
      <div className="flex items-center gap-0.5">
        <div className="mr-auto flex items-center gap-1">
          {selectedRows.length > 0 && (
            <>
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {t("selectedCount", { count: selectedRows.length })}
              </span>
              <AppTooltip label={t("duplicate")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("duplicate")}
                  disabled={busy}
                  onClick={() => duplicate(selectedRows)}
                >
                  <Copy className="size-4" />
                </Button>
              </AppTooltip>
              <AppTooltip label={t("delete")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("delete")}
                  disabled={busy}
                  onClick={() => setRemove(selectedRows)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </AppTooltip>
              <AppTooltip label={t("clearSelection")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("clearSelection")}
                  onClick={() => setSelected([])}
                >
                  <X className="size-4" />
                </Button>
              </AppTooltip>
            </>
          )}
        </div>
        <Popover>
          <AppTooltip label={t("filter")}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("filter")}
                className={
                  filterProperty ? "text-primary" : "text-muted-foreground"
                }
              >
                <Filter className="size-4" />
              </Button>
            </PopoverTrigger>
          </AppTooltip>
          <PopoverContent align="end" className="space-y-3">
            <div className="text-sm font-medium">{t("filter")}</div>
            <DatabaseSelect
              label={t("filterProperty")}
              value={filter}
              onChange={(next) => {
                setFilter(next);
                setFilterValue("");
              }}
              options={[
                { value: "", label: t("allEntries") },
                ...schema.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            {filterProperty &&
              (filterProperty.type === "checkbox" ? (
                <DatabaseSelect
                  label={t("filterValue")}
                  value={filterValue}
                  onChange={setFilterValue}
                  options={[
                    { value: "", label: t("unchecked") },
                    { value: "true", label: t("checked") },
                  ]}
                />
              ) : filterProperty.type === "people" ? (
                <SearchSelect
                  value={filterValue || null}
                  onChange={(next) => setFilterValue(next ?? "")}
                  noneOption={{ label: t("emptyValue") }}
                  options={members.map((m) => ({
                    value: m.user_id,
                    label: displayName(m, t("unknownPerson")),
                    icon: (
                      <UserAvatar seed={m.avatar_seed} className="size-5" />
                    ),
                  }))}
                  trigger={
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      aria-label={t("filterValue")}
                    >
                      {names.get(filterValue) ?? t("emptyValue")}
                    </Button>
                  }
                />
              ) : filterProperty.type === "date" ? (
                <DateTimePicker
                  dateOnly
                  value={filterValue || null}
                  onChange={(next) => setFilterValue(next ?? "")}
                  ariaLabel={t("filterValue")}
                  placeholder={t("emptyValue")}
                />
              ) : (
                <Input
                  aria-label={t("filterValue")}
                  placeholder={t("valuePlaceholder")}
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                />
              ))}
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
                <ArrowDownUp className="size-4" />
              </Button>
            </PopoverTrigger>
          </AppTooltip>
          <PopoverContent align="end" className="space-y-3">
            <div className="text-sm font-medium">{t("sort")}</div>
            <DatabaseSelect
              label={t("sort")}
              value={sort}
              onChange={setSort}
              options={[
                { value: "position", label: t("manualOrder") },
                {
                  value: "title",
                  label: database.database_title_name ?? t("name"),
                },
                ...schema.map((p) => ({ value: p.id, label: p.name })),
              ]}
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
          </PopoverContent>
        </Popover>
        <Popover>
          <AppTooltip label={t("searchEntries")}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("searchEntries")}
                className={query ? "text-primary" : "text-muted-foreground"}
              >
                <Search className="size-4" />
              </Button>
            </PopoverTrigger>
          </AppTooltip>
          <PopoverContent align="end" className="p-3">
            <Input
              autoFocus
              aria-label={t("searchEntries")}
              placeholder={t("searchEntries")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </PopoverContent>
        </Popover>
        <PropertySettings
          projectId={projectId}
          database={database}
          hidden={hidden}
          onCreate={() => setCreateProperty(true)}
          onToggleVisibility={(id) =>
            setHidden((ids) =>
              ids.includes(id)
                ? ids.filter((value) => value !== id)
                : [...ids, id],
            )
          }
        />
        <Button size="sm" className="ml-2" disabled={busy} onClick={add}>
          {t("new")}
        </Button>
      </div>
      <DatabaseTableScroll>
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ minWidth: contentWidth + 152 }}
        >
          <colgroup>
            <col style={{ width: 64 }} />
            <col style={{ width: 32 }} />
            {columnWidths.map((width, index) => (
              <col
                key={index}
                style={{
                  width: `max(${width}px, calc(${(100 * width) / contentWidth}cqw - ${(152 * width) / contentWidth}px))`,
                }}
              />
            ))}
            <col style={{ width: 56 }} />
          </colgroup>
          <thead
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setColumnDropTarget(null);
            }}
          >
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="w-16 bg-background" />
              <th scope="col" className="w-8 bg-background">
                <div
                  className={`flex justify-end pr-2 ${selectedRows.length ? "" : "opacity-0 hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"}`}
                >
                  <Checkbox
                    className="after:inset-x-0"
                    aria-label={t("selectAllEntries")}
                    disabled={!rows.length || busy}
                    checked={
                      rows.length > 0 && selectedRows.length === rows.length
                        ? true
                        : selectedRows.length
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked === true ? rows.map((entry) => entry.id) : [],
                      )
                    }
                  />
                </div>
              </th>
              <th
                scope="col"
                className="overflow-hidden border-b border-border/50 p-1 font-normal"
              >
                <DatabaseColumnName projectId={projectId} database={database} />
              </th>
              {visible.map((property) => (
                <th
                  scope="col"
                  key={property.id}
                  data-database-column={property.id}
                  className={`overflow-hidden whitespace-nowrap border-b border-border/50 p-1 font-normal ${columnDropTarget?.id === property.id ? (columnDropTarget.before ? "shadow-[inset_2px_0_0_var(--primary)]" : "shadow-[inset_-2px_0_0_var(--primary)]") : ""}`}
                  onDragOver={(event) => {
                    if (!columnDrag.current) return;
                    if (columnDrag.current.id === property.id) {
                      setColumnDropTarget(null);
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    const box = event.currentTarget.getBoundingClientRect();
                    setColumnDropTarget({
                      id: property.id,
                      before: event.clientX < box.left + box.width / 2,
                    });
                  }}
                  onDrop={(event) => {
                    if (!columnDrag.current) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const box = event.currentTarget.getBoundingClientRect();
                    dropColumn(
                      property.id,
                      event.clientX < box.left + box.width / 2,
                    );
                  }}
                >
                  <DatabaseColumnName
                    projectId={projectId}
                    database={database}
                    property={property}
                    disabled={schemaPending}
                    dragging={draggingColumn === property.id}
                    onEdit={setEditProperty}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      columnDrag.current = { id: property.id, base: database };
                      setDraggingColumn(property.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "application/x-minddy-database-column",
                        property.id,
                      );
                    }}
                    onDragEnd={endColumnDrag}
                  />
                </th>
              ))}
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
                    <Plus className="size-4" />
                  </button>
                </AppTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const targets = targetsFor(entry);
              const checked = selected.includes(entry.id);
              const showGutter = checked || selectedRows.length > 0;
              return (
                <tr
                  key={entry.id}
                  data-entry-id={entry.id}
                  aria-selected={checked}
                  className={`group h-10 ${checked ? "bg-primary/5" : "hover:bg-muted/20"} ${dropTarget?.id === entry.id ? (dropTarget.above ? "[&>td]:shadow-[inset_0_2px_0_var(--primary)]" : "[&>td]:shadow-[inset_0_-2px_0_var(--primary)]") : ""}`}
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
                  <td className="h-10 w-16 bg-background p-0">
                    <div
                      className={`flex h-10 items-center justify-end gap-2 ${showGutter ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100"}`}
                    >
                      <AppTooltip label={t("insertEntryHint")}>
                        <button
                          type="button"
                          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={busy}
                          aria-label={t("insertEntryHint")}
                          onClick={(event) => insert(entry, event.altKey)}
                        >
                          <Plus className="size-4" />
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
                              disabled={busy}
                              draggable={manual && !busy}
                              className={`flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${isDragging ? "cursor-grabbing" : "cursor-pointer"}`}
                              onPointerDownCapture={(event) => {
                                if (event.button === 0) event.stopPropagation();
                              }}
                              onClick={() => setMenuEntry(entry.id)}
                              onDragStart={(event) => {
                                setIsDragging(true);
                                dragging.current = targets.map(
                                  (target) => target.id,
                                );
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData(
                                  "text/plain",
                                  entry.id,
                                );
                              }}
                              onDragEnd={() => {
                                dragging.current = [];
                                setIsDragging(false);
                                setDropTarget(null);
                              }}
                            >
                              <GripVertical className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                        </AppTooltip>
                        <DropdownMenuContent align="start">
                          {targets.length === 1 && (
                            <DropdownMenuItem onSelect={() => onOpen(entry.id)}>
                              <FileText className="size-4" />
                              {t("openEntry")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={busy}
                            onSelect={() => duplicate(targets)}
                          >
                            <Copy className="size-4" />
                            {t("duplicate")}
                          </DropdownMenuItem>
                          {targets.length === 1 && (
                            <>
                              <DropdownMenuItem
                                disabled={
                                  busy || !manual || entries[0]?.id === entry.id
                                }
                                onSelect={() => move(entry, -1)}
                              >
                                <ArrowUp className="size-4" />
                                {t("moveUp")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={
                                  busy ||
                                  !manual ||
                                  entries.at(-1)?.id === entry.id
                                }
                                onSelect={() => move(entry, 1)}
                              >
                                <ArrowDown className="size-4" />
                                {t("moveDown")}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={busy}
                            onSelect={() => setRemove(targets)}
                          >
                            <Trash2 className="size-4" />
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                  <td
                    className="pointer-events-none sticky left-0 z-20 h-10 w-8 p-0"
                    data-selection-cell
                  >
                    <div
                      className={`flex h-10 items-center justify-center ${checked ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
                    >
                      <div
                        className="pointer-events-auto flex size-6 items-center justify-center rounded bg-background"
                      >
                        <Checkbox
                          className="after:inset-x-0 after:inset-y-0"
                          aria-label={t("selectEntry", {
                            name: entry.title || tPages("untitled"),
                          })}
                          checked={checked}
                          disabled={busy}
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
                    </div>
                  </td>
                  <td className="h-10 overflow-hidden border-b border-border/40 p-0">
                    <button
                      type="button"
                      className="flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden px-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      onClick={() => onOpen(entry.id)}
                      onMouseEnter={() => prefetchPage(entry.id)}
                      onFocus={() => prefetchPage(entry.id)}
                    >
                      {entry.icon ?? (
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 overflow-hidden whitespace-nowrap text-clip">
                        {entry.title.slice(0, 160) || tPages("untitled")}
                      </span>
                    </button>
                  </td>
                  {visible.map((property) => (
                    <td
                      key={property.id}
                      className="h-10 overflow-hidden border-b border-l border-border/30 p-0"
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
                    className="h-10 border-b border-l border-border/30 p-0"
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="space-y-3 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {entries.length ? t("noResults") : t("emptyDatabase")}
            </p>
            {!entries.length && (
              <Button variant="ghost" disabled={busy} onClick={add}>
                <Plus className="size-4" />
                {t("newEntry")}
              </Button>
            )}
          </div>
        )}
      </DatabaseTableScroll>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        className="justify-start text-muted-foreground"
        onClick={add}
      >
        <Plus className="size-4" />
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
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void run(async () => {
                  for (const entry of remove) await trashPage(entry.id);
                  setSelected((ids) =>
                    ids.filter(
                      (id) => !remove.some((entry) => entry.id === id),
                    ),
                  );
                  setRemove([]);
                });
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
