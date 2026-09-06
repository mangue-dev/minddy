"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "mangue-ui";
import { CalendarDays, CheckSquare, Type, Users } from "lucide-react";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchMultiSelect } from "@/components/search-select";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { UserAvatar } from "@/components/user-avatar";
import { useMembersQuery } from "@/lib/use-members-query";
import { displayName } from "@/lib/display-name";
import { usePageDatabase } from "@/lib/use-page-database";
import {
  type DatabaseProperty,
  type DatabaseValue,
} from "@/lib/page-databases";
import type { PageSummary } from "@/lib/pages-api";

export const PROPERTY_ICONS = {
  text: Type,
  date: CalendarDays,
  people: Users,
  checkbox: CheckSquare,
};

export function DatabasePropertyCell({
  projectId,
  page,
  property,
}: {
  projectId: string;
  page: PageSummary;
  property: DatabaseProperty;
}) {
  const t = useTranslations("PageDatabase");
  const { saveValue, pending } = usePageDatabase(projectId);
  const { members } = useMembersQuery(projectId, property.type === "people");
  const value = page.property_values?.[property.id] ?? null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [expected, setExpected] = useState<DatabaseValue>(value);
  const changeOpen = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    setExpected(value);
    setDraft(typeof value === "string" ? value : "");
  };
  const save = async (next: DatabaseValue, close = true) => {
    if (pending) return;
    if (await saveValue(page, property.id, next, expected)) {
      setExpected(next);
      if (close) setOpen(false);
    }
  };
  const label = t("editProperty", { name: property.name });
  if (property.type === "checkbox")
    return (
      <div className="flex min-h-8 items-center px-1.5">
        <Checkbox
          aria-label={property.name}
          checked={value === true}
          disabled={pending}
          onCheckedChange={(checked) =>
            void saveValue(page, property.id, checked === true)
          }
        />
      </div>
    );
  if (property.type === "date")
    return (
      <DateTimePicker
        dateOnly
        variant="value"
        value={typeof value === "string" ? value : null}
        placeholder={t("emptyValue")}
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
            className={`${TRIGGER} min-h-8 flex-wrap`}
          >
            {selected.length ? (
              selected.map((id) => {
                const member = members.find((m) => m.user_id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1.5">
                    <UserAvatar seed={member?.avatar_seed} className="size-5" />
                    {member
                      ? displayName(member, t("unknownPerson"))
                      : t("unknownPerson")}
                  </span>
                );
              })
            ) : (
              <span className="text-muted-foreground">{t("emptyValue")}</span>
            )}
          </button>
        }
      />
    );
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`${TRIGGER} min-h-8 whitespace-normal text-left [overflow-wrap:anywhere]`}
        >
          {typeof value === "string" && value ? (
            value
          ) : (
            <span className="text-muted-foreground">{t("emptyValue")}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft || null);
          }}
          className="space-y-3"
        >
          <label className="block space-y-2 text-sm font-medium">
            <span>{property.name}</span>
            <Input
              placeholder={t("valuePlaceholder")}
              maxLength={2000}
              value={draft}
              disabled={pending}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
          </label>
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => void save(null)}
            >
              {t("clearValue")}
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
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
            property={property}
          />
        </PropertyRow>
      ))}
    </div>
  );
}
