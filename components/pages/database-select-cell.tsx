"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "mangue-ui";
import { ArrowLeft, Settings2 } from "lucide-react";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps, PickerCreateRow } from "@/components/search-select";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { usePageDatabase } from "@/lib/use-page-database";
import {
  MAX_DATABASE_OPTIONS,
  type DatabaseProperty,
  type DatabaseSelectOption,
} from "@/lib/page-databases";
import type { PageSummary } from "@/lib/pages-api";

function OptionBadge({ option }: { option: DatabaseSelectOption }) {
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs"
      style={{
        backgroundColor: `color-mix(in srgb, ${option.color} 18%, transparent)`,
      }}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: option.color }}
      />
      <span className="truncate">{option.name}</span>
    </span>
  );
}

export function DatabaseOptionSettings({
  database,
  property,
  projectId,
}: {
  database: PageSummary;
  property: DatabaseProperty;
  projectId: string;
}) {
  const t = useTranslations("PageDatabase");
  const tObjectives = useTranslations("Objectives");
  const { saveSchema, pending } = usePageDatabase(projectId);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState(database);
  const update = async (
    option: DatabaseSelectOption,
    patch: Partial<DatabaseSelectOption>,
    snapshot = database,
  ) => {
    const ok = await saveSchema(
      snapshot,
      (snapshot.database_schema ?? []).map((p) =>
        p.id === property.id
          ? {
              ...p,
              options: (p.options ?? []).map((o) =>
                o.id === option.id ? { ...o, ...patch } : o,
              ),
            }
          : p,
      ),
    );
    if (ok && patch.name !== undefined) setEditing(null);
  };
  return (
    <div className="max-h-80 space-y-2 overflow-auto">
      {(property.options ?? []).map((option) => (
        <div key={option.id} className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={pending}
                aria-label={tObjectives("colorFieldLabel") + ": " + option.name}
                className="size-6 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: option.color }}
              />
            </PopoverTrigger>
            <PopoverContent className="flex w-56 flex-wrap gap-2 p-3">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={tObjectives("colorAria", { color })}
                  aria-pressed={color === option.color}
                  disabled={pending}
                  className="size-6 rounded-full border border-border aria-pressed:ring-2 aria-pressed:ring-ring"
                  style={{ backgroundColor: color }}
                  onClick={() => void update(option, { color })}
                />
              ))}
            </PopoverContent>
          </Popover>
          {editing === option.id ? (
            <form
              className="flex min-w-0 flex-1 gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim())
                  void update(option, { name: name.trim() }, base);
              }}
            >
              <Input
                autoFocus
                aria-label={t("optionName")}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button size="sm" disabled={pending || !name.trim()}>
                {t("save")}
              </Button>
            </form>
          ) : (
            <button
              type="button"
              disabled={pending}
              className="min-w-0 flex-1 truncate text-left text-sm"
              onClick={() => {
                setBase(database);
                setEditing(option.id);
                setName(option.name);
              }}
            >
              {option.name}
            </button>
          )}
        </div>
      ))}
      {!property.options?.length && (
        <p className="text-sm text-muted-foreground">{t("noOptions")}</p>
      )}
    </div>
  );
}

export function DatabaseSelectCell({
  projectId,
  page,
  database,
  property,
  className,
}: {
  projectId: string;
  page: PageSummary;
  database: PageSummary;
  property: DatabaseProperty;
  className: string;
}) {
  const t = useTranslations("PageDatabase");
  const { saveSchema, saveValue, pending } = usePageDatabase(projectId);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [query, setQuery] = useState("");
  const busy = useRef(false);
  const value = page.property_values?.[property.id] ?? null;
  const expected = useRef(value);
  const selected = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const options = property.options ?? [];
  const changeOpen = (next: boolean) => {
    if (busy.current || pending) return;
    expected.current = value;
    setOpen(next);
    setManage(false);
    setQuery("");
  };
  const choose = async (id: string) => {
    const previous = expected.current;
    const ids = Array.isArray(previous)
      ? previous
      : typeof previous === "string"
        ? [previous]
        : [];
    const next =
      property.type === "select"
        ? ids.includes(id)
          ? null
          : id
        : ids.includes(id)
          ? ids.filter((v) => v !== id)
          : [...ids, id];
    if (await saveValue(page, property.id, next, previous)) {
      expected.current = next;
      if (property.type === "select") setOpen(false);
      setQuery((current) => (current === query ? "" : current));
    }
  };
  const trigger = (
    <button
      type="button"
      aria-label={t("editProperty", { name: property.name })}
      className={`${className} gap-1`}
    >
      {selected.length ? (
        selected.map((id) => {
          const option = options.find((o) => o.id === id);
          return option ? <OptionBadge key={id} option={option} /> : null;
        })
      ) : (
        <span className="text-muted-foreground">{t("emptyValue")}</span>
      )}
    </button>
  );
  if (manage)
    return (
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <button
            type="button"
            className="flex items-center gap-2 text-sm"
            onClick={() => {
              setManage(false);
              setQuery("");
            }}
          >
            <ArrowLeft className="size-4" />
            {t("editOptions")}
          </button>
          <DatabaseOptionSettings
            projectId={projectId}
            database={database}
            property={property}
          />
        </PopoverContent>
      </Popover>
    );
  return (
    <SearchMenu
      open={open}
      onOpenChange={changeOpen}
      trigger={trigger}
      searchPlaceholder={t("searchOptions")}
      searchValue={query}
      onSearchValueChange={setQuery}
      emptyText={t("noOptions")}
      hideEmpty={!!query.trim()}
    >
      <CommandGroup>
        {options.map((option) => (
          <CommandItem
            key={option.id}
            value={option.id}
            keywords={[option.name]}
            disabled={pending || busy.current}
            {...checkedProps(selected.includes(option.id))}
            onSelect={() => {
              if (!busy.current) {
                busy.current = true;
                void choose(option.id).finally(() => {
                  busy.current = false;
                });
              }
            }}
          >
            <OptionBadge option={option} />
          </CommandItem>
        ))}
      </CommandGroup>
      {options.length < MAX_DATABASE_OPTIONS && query.trim().length <= 80 && (
        <PickerCreateRow
          query={query}
          takenLabels={options.map((o) => o.name)}
          onDone={() =>
            setQuery((current) => (current === query ? "" : current))
          }
          create={{
            labelFor: (name) => t("createOption", { name }),
            onCreate: async (name) => {
              if (busy.current || pending) return;
              busy.current = true;
              try {
                const option = {
                  id: crypto.randomUUID(),
                  name,
                  color: CATEGORY_COLORS[0],
                };
                if (
                  await saveSchema(
                    database,
                    (database.database_schema ?? []).map((p) =>
                      p.id === property.id
                        ? { ...p, options: [...options, option] }
                        : p,
                    ),
                  )
                )
                  await choose(option.id);
              } finally {
                busy.current = false;
              }
            },
          }}
        />
      )}
      <CommandSeparator alwaysRender />
      <CommandGroup forceMount>
        <CommandItem
          forceMount
          value="__edit_options__"
          onSelect={() => setManage(true)}
        >
          <Settings2 className="size-4" />
          {t("editOptions")}
        </CommandItem>
      </CommandGroup>
    </SearchMenu>
  );
}
