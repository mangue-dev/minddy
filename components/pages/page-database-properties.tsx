"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Checkbox } from "mangue-ui";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchMultiSelect } from "@/components/search-select";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { UserAvatar } from "@/components/user-avatar";
import { useMembersQuery } from "@/lib/use-members-query";
import { displayName } from "@/lib/display-name";
import { usePageDatabase } from "@/lib/use-page-database";
import {
  databasePropertyValue,
  type DatabaseProperty,
  type DatabaseValue,
} from "@/lib/page-databases";
import type { PageSummary } from "@/lib/pages-api";

import { DatabaseCellEditor } from "./database-cell-editor";
import { DatabaseSelectCell } from "./database-select-cell";

const TABLE_CELL_TRIGGER =
  "flex h-10 w-full min-w-0 cursor-pointer items-center overflow-hidden rounded-none px-2 py-0 text-left text-sm whitespace-nowrap outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export { PROPERTY_ICONS } from "./database-property-icons";

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
  const { saveValue, pending } = usePageDatabase(projectId);
  const { members } = useMembersQuery(projectId, property.type === "people");
  const value = databasePropertyValue(page, property);
  const [open, setOpen] = useState(false);
  const [expected, setExpected] = useState<DatabaseValue>(value);
  const changeOpen = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    setExpected(value);
  };
  const save = async (next: DatabaseValue, close = true) => {
    if (pending) return;
    if (await saveValue(page, property.id, next, expected)) {
      setExpected(next);
      if (close) setOpen(false);
    }
  };
  const label = t("editProperty", { name: property.name });
  const emptyValue = table ? "" : t("emptyValue");
  const triggerClass = table ? TABLE_CELL_TRIGGER : `${TRIGGER} min-h-8`;
  if (property.type === "created_at")
    return (
      <span className={triggerClass}>
        {page.created_at
          ? format.dateTime(new Date(page.created_at), {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : emptyValue}
      </span>
    );
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
        label={label}
        className={
          table
            ? triggerClass
            : `${triggerClass} cursor-pointer whitespace-normal text-left [overflow-wrap:anywhere]`
        }
        empty={emptyValue}
        save={(next, base) => saveValue(page, property.id, next, base)}
      />
    );
  if (property.type === "checkbox") {
    const checkbox = (
      <Checkbox
        aria-label={property.name}
        checked={value === true}
        disabled={pending}
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
  if (property.type === "date")
    return (
      <DateTimePicker
        dateOnly
        className={table ? `${TABLE_CELL_TRIGGER} mr-0` : undefined}
        variant="value"
        value={typeof value === "string" ? value : null}
        placeholder={emptyValue}
        ariaLabel={label}
        open={open}
        onOpenChange={changeOpen}
        onChange={(next) => void save(next)}
      />
    );
  if (property.type === "people") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <SearchMultiSelect
        values={selected}
        open={open}
        onOpenChange={changeOpen}
        onChange={(next) => void save(next, false)}
        searchPlaceholder={t("searchPeople")}
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
