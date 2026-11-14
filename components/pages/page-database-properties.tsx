"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchMultiSelect } from "@/components/search-select";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { UserAvatar } from "@/components/user-avatar";
import { useMembersQuery } from "@/lib/use-members-query";
import { displayName } from "@/lib/display-name";
import { usePageDatabase } from "@/lib/use-page-database";
import {
  DATABASE_AGENT_AUTHOR,
  databaseDateOccurrence,
  databasePropertyValue,
  formatDatabaseDate,
  isDatabaseAuthorType,
  parseDatabaseDate,
  type DatabaseProperty,
  type DatabaseValue,
} from "@/lib/page-databases";
import { detectDatabaseNumberFormat, formatDatabaseNumber } from "@/lib/page-database-number";
import { useUndoHistory } from "@/lib/undo/undo-context";
import { DATE_ONLY, dueDateHasTime, parseDueDate } from "@/lib/due-date";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { NumoIcon } from "@/components/numo-icon";
import type { PageSummary } from "@/lib/pages-api";

import { DatabaseCellEditor } from "./database-cell-editor";
import { DatabaseSelectCell } from "./database-select-cell";

const TABLE_CELL_TRIGGER =
  "flex h-10 w-full min-w-0 items-center overflow-hidden rounded-none px-2 py-0 text-left text-sm whitespace-nowrap outline-none transition-colors pointer-coarse:h-12 hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export { PROPERTY_ICONS } from "./database-property-icons";

/**
 * The recurrence controls hand back a timestamp; a date without a time stays
 * a calendar day, as the date editor stores it.
 */
function calendarDay(value: string): string {
  const date = parseDueDate(value);
  if (!date || DATE_ONLY.test(value) || dueDateHasTime(date)) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DatabasePropertyCell({
  projectId,
  page,
  database,
  property,
  table = false,
}: {
  projectId: string;
  page: PageSummary;
  database: PageSummary;
  property: DatabaseProperty;
  table?: boolean;
}) {
  const t = useTranslations("PageDatabase");
  const format = useFormatter();
  const { saveValue, saveSchema } = usePageDatabase(projectId);
  const undo = useUndoHistory();
  const locale = useLocale();
  const { siteName } = useRuntimeConfig();
  const { members } = useMembersQuery(projectId,
    property.type === "people" || isDatabaseAuthorType(property.type));
  const value = databasePropertyValue(page, property);
  const [open, setOpen] = useState(false);
  const expected = useRef<DatabaseValue>(value);
  useEffect(() => {
    expected.current = value;
  }, [value]);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    expected.current = value;
  };
  const save = (next: DatabaseValue, close = true) => {
    const previous = expected.current;
    expected.current = next;
    if (close) setOpen(false);
    void saveValue(page, property.id, next, previous);
  };
  const label = t("editProperty", { name: property.name });
  const emptyValue = table ? "" : t("emptyValue");
  const triggerClass = table ? TABLE_CELL_TRIGGER : `${TRIGGER} min-h-8 min-w-0 overflow-hidden`;
  if (property.type === "created_at" || property.type === "updated_at")
    return (
      <span className={triggerClass}>
        {typeof value === "string"
          ? format.dateTime(new Date(value), {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : emptyValue}
      </span>
    );
  if (isDatabaseAuthorType(property.type)) {
    // An agent writes under a human account: the gesture is named minddy's.
    const agent = value === DATABASE_AGENT_AUTHOR;
    const member = typeof value === "string"
      ? members.find((m) => m.user_id === value) : undefined;
    return (
      <span className={`${triggerClass} gap-1.5`}>
        {value == null ? emptyValue : agent ? (
          <>
            <NumoIcon animated={false} className="size-5 shrink-0" />
            <span className="min-w-0 truncate">{siteName}</span>
          </>
        ) : (
          <>
            <UserAvatar seed={member?.avatar_seed ?? null} className="size-5 shrink-0" />
            <span className="min-w-0 truncate">
              {member ? displayName(member, t("unknownPerson")) : t("unknownPerson")}
            </span>
          </>
        )}
      </span>
    );
  }
  if (property.type === "select" || property.type === "multi_select")
    return (
      <DatabaseSelectCell
        projectId={projectId}
        page={page}
        database={database}
        property={property}
        className={triggerClass}
        empty={emptyValue}
      />
    );
  if (property.type === "text" || property.type === "number")
    return (
      <DatabaseCellEditor
        value={value}
        numeric={property.type === "number"}
        // A number reads through its column's format; it is edited as typed.
        display={typeof value === "number"
          ? formatDatabaseNumber(value, property, locale) : undefined}
        label={label}
        // In the table, figures line up on the right edge of their column,
        // digits of equal width, so amounts compare at a glance.
        className={
          table
            ? property.type === "number"
              ? `${triggerClass} justify-end text-right tabular-nums`
              : triggerClass
            : `${triggerClass} text-right`
        }
        empty={emptyValue}
        save={(next, base, typed) => {
          // The column adapts to what is typed: "12 €" makes it a currency,
          // "25 %" a percentage. A plain figure leaves its format alone.
          const format = property.type === "number" ? detectDatabaseNumberFormat(typed) : null;
          const changed = format && (format.number_format !== property.number_format ||
            ("currency" in format ? format.currency : undefined) !== property.currency);
          // One ⌘Z reverts the value and the format it brought.
          undo.linked(() => {
            if (changed)
              void saveSchema(database, (database.database_schema ?? []).map((p) => {
                if (p.id !== property.id) return p;
                const { number_format: _format, currency: _currency, ...rest } = p;
                return { ...rest, ...format };
              }));
            if (next !== base) void saveValue(page, property.id, next, base);
          });
        }}
      />
    );
  if (property.type === "checkbox") {
    const checkbox = (
      <Checkbox
        aria-label={property.name}
        checked={value === true}
        className={table ? "after:inset-x-0 after:inset-y-0" : undefined}
        onCheckedChange={(checked) =>
          void saveValue(page, property.id, checked === true)
        }
      />
    );
    return table ? (
      <label
        className={`${TABLE_CELL_TRIGGER} focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring`}
      >
        {checkbox}
      </label>
    ) : (
      <div className="flex min-h-8 items-center px-1.5">{checkbox}</div>
    );
  }
  if (property.type === "date") {
    const recurrence = parseDatabaseDate(value)?.recurrence ?? null;
    return (
      <DateTimePicker
        preserveDateOnly
        className={table ? `${TABLE_CELL_TRIGGER} mr-0 gap-1.5` : undefined}
        variant="value"
        // A recurring date shows its next occurrence; the cell keeps the day
        // the rhythm starts from until another one is picked.
        value={databaseDateOccurrence(value)}
        placeholder={emptyValue}
        ariaLabel={label}
        open={open}
        onOpenChange={changeOpen}
        onChange={(next) =>
          void save(next ? formatDatabaseDate(next, recurrence) : null, false)}
        recurrence={recurrence}
        onRecurrenceChange={(next) =>
          void save(next.due_date
            ? formatDatabaseDate(calendarDay(next.due_date), next.recurrence)
            : null, false)}
      />
    );
  }
  if (property.type === "people") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <SearchMultiSelect
        values={selected}
        open={open}
        onOpenChange={changeOpen}
        onChange={(next) => void save(next, false)}
        searchPlaceholder={t("searchPeople")}
        // Wide enough for its search placeholder, whatever the cell's width.
        contentClassName="min-w-72"
        emptyText={t("noPeople")}
        options={[
          ...members.map((member) => ({
            value: member.user_id,
            label: displayName(member, t("unknownPerson")),
            keywords: member.email ? [member.email] : undefined,
            icon: <UserAvatar seed={member.avatar_seed} className="size-5" />,
          })),
          ...selected
            .filter((id) => !members.some((member) => member.user_id === id))
            .map((id) => ({
              value: id,
              label: t("unknownPerson"),
              icon: <UserAvatar seed={null} className="size-5" />,
            })),
        ]}
        trigger={
          <button
            type="button"
            aria-label={label}
            className={table ? triggerClass : `${triggerClass} flex-wrap`}
          >
            {selected.length ? (
              table && selected.length > 1 ? (
                <>
                  <span
                    className="flex min-w-0 items-center -space-x-1.5 overflow-hidden"
                    data-avatar-stack
                  >
                    {selected.slice(0, 12).map((id) => {
                      const member = members.find((m) => m.user_id === id);
                      return (
                        <UserAvatar
                          key={id}
                          seed={member?.avatar_seed}
                          title={
                            member
                              ? displayName(member, t("unknownPerson"))
                              : t("unknownPerson")
                          }
                          className="size-5 ring-2 ring-background"
                        />
                      );
                    })}
                  </span>
                  <span className="sr-only">
                    {selected.length} {t("people")}
                  </span>
                </>
              ) : (
                selected.map((id) => {
                  const member = members.find((m) => m.user_id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden"
                    >
                      <UserAvatar
                        seed={member?.avatar_seed}
                        className="size-5"
                      />
                      <span
                        className={
                          table
                            ? "overflow-hidden whitespace-nowrap text-clip"
                            : undefined
                        }
                      >
                        {member
                          ? displayName(member, t("unknownPerson"))
                          : t("unknownPerson")}
                      </span>
                    </span>
                  );
                })
              )
            ) : (
              <span className="text-muted-foreground">{emptyValue}</span>
            )}
          </button>
        }
      />
    );
  }
  return null;
}

export function PageDatabaseProperties({
  projectId,
  page,
  database,
}: {
  projectId: string;
  page: PageSummary;
  database: PageSummary;
}) {
  if (!database.database_schema?.length) return null;
  return (
    <div className="my-5 border-y border-border/60 py-3">
      {(database.database_schema ?? []).map((property) => (
        <PropertyRow key={property.id} label={property.name}>
          <DatabasePropertyCell
            projectId={projectId}
            page={page}
            database={database}
            property={property}
          />
        </PropertyRow>
      ))}
    </div>
  );
}
