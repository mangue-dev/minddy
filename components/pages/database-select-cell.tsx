"use client";

import { createUuid } from "@/lib/create-uuid";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem, CommandSeparator } from "mangue-ui";
import { Settings2 } from "lucide-react";
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

import { DatabaseOptionsDialog } from "./database-property-dialogs";

function OptionBadge({
  option,
  single,
}: {
  option: DatabaseSelectOption;
  single: boolean;
}) {
  return (
    <span
      data-database-option-badge
      className={`inline-flex max-w-full shrink-0 items-center px-2 py-0.5 text-xs font-medium text-[color:color-mix(in_oklab,var(--option-color)_75%,black)] dark:text-[color:color-mix(in_oklab,var(--option-color)_80%,white)] ${single ? "rounded-full" : "rounded"}`}
      style={
        {
          "--option-color": option.color,
          backgroundColor: `color-mix(in srgb, ${option.color} 18%, transparent)`,
        } as CSSProperties
      }
    >
      <span className="truncate">{option.name}</span>
    </span>
  );
}

export function DatabaseSelectCell({
  projectId,
  page,
  database,
  property,
  className,
  empty,
}: {
  projectId: string;
  page: PageSummary;
  database: PageSummary;
  property: DatabaseProperty;
  className: string;
  empty?: string;
}) {
  const t = useTranslations("PageDatabase");
  const { saveSchema, saveValue } = usePageDatabase(projectId);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [query, setQuery] = useState("");
  const value = page.property_values?.[property.id] ?? null;
  const expected = useRef(value);
  useEffect(() => { expected.current = value; }, [value]);
  const selected = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const options = property.options ?? [];
  const changeOpen = (next: boolean) => {
    expected.current = value;
    setOpen(next);
    setQuery("");
  };
  const choose = (id: string) => {
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
    expected.current = next;
    if (property.type === "select") setOpen(false);
    setQuery("");
    void saveValue(page, property.id, next, previous);
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
          return option ? (
            <OptionBadge
              key={id}
              option={option}
              single={property.type === "select"}
            />
          ) : null;
        })
      ) : (
        <span className="text-muted-foreground">{empty ?? t("emptyValue")}</span>
      )}
    </button>
  );
  return (
    <>
      <SearchMenu
        contentClassName="[&_[cmdk-item]]:rounded-sm"
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
              {...checkedProps(selected.includes(option.id))}
              onSelect={() => choose(option.id)}
            >
              <OptionBadge
                option={option}
                single={property.type === "select"}
              />
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
                const option = { id: createUuid(), name, color: CATEGORY_COLORS[0] };
                void saveSchema(database, (database.database_schema ?? []).map((p) =>
                  p.id === property.id ? { ...p, options: [...options, option] } : p));
                choose(option.id);
              },
            }}
          />
        )}
        <CommandSeparator alwaysRender />
        <CommandGroup forceMount>
          <CommandItem
            forceMount
            value="__edit_options__"
            onSelect={() => {
              setOpen(false);
              setManage(true);
            }}
          >
            <Settings2 className="size-4" />
            {t("editOptions")}
          </CommandItem>
        </CommandGroup>
      </SearchMenu>
      {manage && (
        <DatabaseOptionsDialog
          projectId={projectId}
          database={database}
          property={property}
          onClose={() => setManage(false)}
        />
      )}
    </>
  );
}
