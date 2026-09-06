"use client";

import { useEffect, useMemo, useState } from "react";
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
  Table2,
  ArrowUp,
  Copy,
  Columns3,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchSelect } from "@/components/search-select";
import { UserAvatar } from "@/components/user-avatar";
import { usePagesQuery } from "@/lib/use-pages-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { usePageDatabase } from "@/lib/use-page-database";
import { displayName } from "@/lib/display-name";
import {
  DATABASE_PROPERTY_TYPES,
  MAX_DATABASE_PROPERTIES,
  compareDatabaseValues,
  databaseValueText,
  type DatabaseProperty,
  type DatabasePropertyType,
} from "@/lib/page-databases";
import { positionBetween } from "@/lib/pages";
import type { PageSummary } from "@/lib/pages-api";
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
}: {
  projectId: string;
  database: PageSummary;
}) {
  const t = useTranslations("PageDatabase");
  const { saveSchema, pending } = usePageDatabase(projectId);
  const schema = database.database_schema ?? [];
  const [name, setName] = useState("");
  const [type, setType] = useState<DatabasePropertyType>("text");
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
      <Popover>
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
          <form
            className="space-y-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim())
                void saveSchema(database, [
                  ...schema,
                  { id: crypto.randomUUID(), name: name.trim(), type },
                ]).then((ok) => {
                  if (ok) setName("");
                });
            }}
          >
            <Input
              aria-label={t("propertyName")}
              placeholder={t("propertyName")}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex gap-2">
              <DatabaseSelect
                label={t("propertyType")}
                value={type}
                onChange={(next) => setType(next as DatabasePropertyType)}
                options={DATABASE_PROPERTY_TYPES.map((kind) => ({
                  value: kind,
                  label: t(kind),
                }))}
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  pending ||
                  !name.trim() ||
                  schema.length >= MAX_DATABASE_PROPERTIES
                }
              >
                {t("addProperty")}
              </Button>
            </div>
            {schema.length >= MAX_DATABASE_PROPERTIES && (
              <p className="text-sm text-muted-foreground">
                {t("propertyLimit", { count: MAX_DATABASE_PROPERTIES })}
              </p>
            )}
          </form>
        </PopoverContent>
      </Popover>
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
  const [remove, setRemove] = useState<PageSummary | null>(null);
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
    .sort((a, b) => a.position.localeCompare(b.position));
  const rows = entries
    .filter((entry) => {
      const text = [
        entry.title,
        ...schema.map((p) =>
          databaseValueText(entry.property_values?.[p.id], names),
        ),
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (!text.includes(query.toLocaleLowerCase())) return false;
      if (!filterProperty) return true;
      const value = entry.property_values?.[filter];
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
      return databaseValueText(value, names)
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
          ? a.position.localeCompare(b.position)
          : effectiveSort === "title"
            ? a.title.localeCompare(b.title)
            : compareDatabaseValues(
                a.property_values?.[effectiveSort],
                b.property_values?.[effectiveSort],
                names,
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
  return (
    <div className="mt-5 space-y-1">
      <div className="flex items-center gap-0.5">
        <div className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Table2 className="size-4" />
          {t("table")}
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
                { value: "title", label: t("name") },
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
        <Popover>
          <AppTooltip label={t("visibleProperties")}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("visibleProperties")}
              >
                <Columns3 className="size-4" />
              </Button>
            </PopoverTrigger>
          </AppTooltip>
          <PopoverContent align="end" className="space-y-2">
            {schema.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!hidden.includes(p.id)}
                  onCheckedChange={(checked) =>
                    setHidden((ids) =>
                      checked === true
                        ? ids.filter((id) => id !== p.id)
                        : [...ids, p.id],
                    )
                  }
                />
                {p.name}
              </label>
            ))}
            {!schema.length && (
              <p className="text-sm text-muted-foreground">
                {t("noProperties")}
              </p>
            )}
          </PopoverContent>
        </Popover>
        <PropertySettings projectId={projectId} database={database} />
        <Button size="sm" className="ml-2" disabled={busy} onClick={add}>
          {t("new")}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-muted-foreground">
              <th scope="col" className="min-w-56 px-2 py-1.5 font-normal">
                {t("name")}
              </th>
              {visible.map((property) => {
                const Icon = PROPERTY_ICONS[property.type];
                return (
                  <th
                    scope="col"
                    key={property.id}
                    className="min-w-32 whitespace-nowrap px-2 py-1.5 font-normal"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="size-3.5 shrink-0" />
                      {property.name}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="w-10">
                <span className="sr-only">{t("entryActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                key={entry.id}
                className="group border-b border-border/40 hover:bg-muted/20 [&>td+td]:border-l [&>td+td]:border-border/30"
              >
                <td className="min-w-56 px-2">
                  <button
                    type="button"
                    className="flex min-h-8 w-full items-center gap-2 px-0 text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => onOpen(entry.id)}
                    onMouseEnter={() => prefetchPage(entry.id)}
                    onFocus={() => prefetchPage(entry.id)}
                  >
                    {entry.icon ?? (
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="whitespace-nowrap">
                      {entry.title || tPages("untitled")}
                    </span>
                  </button>
                </td>
                {visible.map((property) => (
                  <td key={property.id} className="px-1.5">
                    <DatabasePropertyCell
                      projectId={projectId}
                      page={entry}
                      property={property}
                    />
                  </td>
                ))}
                <td className="px-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("entryActions")}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() => onOpen(entry.id)}
                      >
                        <FileText className="size-4" />
                        {t("openEntry")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() =>
                          void run(async () => {
                            const copy = await duplicatePage(entry.id);
                            onOpen(copy.id);
                          })
                        }
                      >
                        <Copy className="size-4" />
                        {t("duplicate")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          busy ||
                          sort !== "position" ||
                          descending ||
                          entries[0]?.id === entry.id
                        }
                        onSelect={() => move(entry, -1)}
                      >
                        <ArrowUp className="size-4" />
                        {t("moveUp")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          busy ||
                          sort !== "position" ||
                          descending ||
                          entries.at(-1)?.id === entry.id
                        }
                        onSelect={() => move(entry, 1)}
                      >
                        <ArrowDown className="size-4" />
                        {t("moveDown")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() => setRemove(entry)}
                      >
                        <Trash2 className="size-4" />
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
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
      </div>
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
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteEntry")}</AlertDialogTitle>
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
                if (remove)
                  void run(async () => {
                    await trashPage(remove.id);
                    setRemove(null);
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
