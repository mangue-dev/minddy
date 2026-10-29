"use client";

// The FILTERS of a database view: several conditions, all of them or at least
// one (lib/page-database-filters.ts), the way a routine's conditions are
// combined. Each condition names a property, an operator that property's type
// allows, and a value control that fits the type. The same editor sits in the
// toolbar's popover on a desktop and in a bottom sheet on a phone.

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchSelect } from "@/components/search-select";
import { UserAvatar } from "@/components/user-avatar";
import { createUuid } from "@/lib/create-uuid";
import { displayName } from "@/lib/display-name";
import type { DatabaseProperty } from "@/lib/page-databases";
import {
  MAX_DATABASE_FILTER_CONDITIONS,
  databaseFilterNeedsValue,
  databaseFilterOperators,
  type DatabaseFilterCondition,
  type DatabaseFilterOperator,
  type DatabaseViewFilter,
} from "@/lib/page-database-filters";
import type { Member } from "@/lib/types";

const OPERATOR_LABEL = {
  contains: "filterOperatorContains",
  not_contains: "filterOperatorNotContains",
  eq: "filterOperatorEq",
  neq: "filterOperatorNeq",
  gt: "filterOperatorGt",
  lt: "filterOperatorLt",
  empty: "filterOperatorEmpty",
  not_empty: "filterOperatorNotEmpty",
} as const;

/** Dates read as days: “is on”, “is after”, “is before”. */
const DATE_OPERATOR_LABEL = {
  eq: "filterOperatorDateEq",
  gt: "filterOperatorAfter",
  lt: "filterOperatorBefore",
} as const;

function operatorLabelKey(property: DatabaseProperty | undefined, operator: DatabaseFilterOperator) {
  if ((property?.type === "date" || property?.type === "created_at") && operator in DATE_OPERATOR_LABEL) {
    return DATE_OPERATOR_LABEL[operator as keyof typeof DATE_OPERATOR_LABEL];
  }
  return OPERATOR_LABEL[operator];
}

function Choice({ value, onChange, label, options, className }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value || "__empty__"} onValueChange={(next) => onChange(next === "__empty__" ? "" : next)}>
      <SelectTrigger aria-label={label} className={className ?? "w-full min-w-0"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="[&_[role=option]]:rounded-sm">
        {options.map((option) => (
          <SelectItem key={option.value || "__empty__"} value={option.value || "__empty__"}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A new condition on `property`, with the first operator its type allows. */
function conditionFor(property: DatabaseProperty): DatabaseFilterCondition {
  const operator = databaseFilterOperators(property.type)[0];
  return {
    id: createUuid(),
    propertyId: property.id,
    operator,
    ...(property.type === "checkbox" ? { value: "true" } : {}),
  };
}

export function DatabaseFilterEditor({
  schema,
  filter,
  members,
  onChange,
}: {
  schema: readonly DatabaseProperty[];
  filter: DatabaseViewFilter;
  members: Member[];
  onChange: (next: DatabaseViewFilter) => void;
}) {
  const t = useTranslations("PageDatabase");
  const conditions = filter.conditions;
  const change = (index: number, next: DatabaseFilterCondition) =>
    onChange({ ...filter, conditions: conditions.map((c, i) => (i === index ? next : c)) });
  if (!schema.length) {
    return <p className="px-2 py-1 text-sm text-muted-foreground">{t("noFilterableProperty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {conditions.length > 1 && (
        <Choice
          label={t("filterMatch")}
          value={filter.match}
          onChange={(match) => onChange({ ...filter, match: match === "or" ? "or" : "and" })}
          options={[
            { value: "and", label: t("filterMatchAnd") },
            { value: "or", label: t("filterMatchOr") },
          ]}
        />
      )}
      {conditions.map((condition, index) => {
        const property = schema.find((p) => p.id === condition.propertyId);
        const operators = property ? databaseFilterOperators(property.type) : [];
        return (
          <div
            key={condition.id}
            data-database-filter-condition
            className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <Choice
                label={t("filterProperty")}
                value={condition.propertyId}
                className="min-w-0 flex-1"
                onChange={(id) => {
                  const next = schema.find((p) => p.id === id);
                  if (next) change(index, { ...conditionFor(next), id: condition.id });
                }}
                options={schema.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("removeFilterCondition")}
                onClick={() => onChange({ ...filter, conditions: conditions.filter((_, i) => i !== index) })}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </Button>
            </div>
            {property && (
              <Choice
                label={t("filterOperator")}
                value={condition.operator}
                onChange={(operator) => {
                  const next = operator as DatabaseFilterOperator;
                  change(index, {
                    ...condition,
                    operator: next,
                    ...(databaseFilterNeedsValue(next) ? {} : { value: undefined }),
                  });
                }}
                options={operators.map((operator) => ({
                  value: operator,
                  label: t(operatorLabelKey(property, operator)),
                }))}
              />
            )}
            {property && databaseFilterNeedsValue(condition.operator) && (
              <ConditionValue
                property={property}
                value={condition.value ?? ""}
                members={members}
                onChange={(value) => change(index, { ...condition, value })}
              />
            )}
          </div>
        );
      })}
      <Button
        variant="ghost"
        className="justify-start text-muted-foreground"
        disabled={conditions.length >= MAX_DATABASE_FILTER_CONDITIONS}
        onClick={() => onChange({ ...filter, conditions: [...conditions, conditionFor(schema[0])] })}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        {t("addFilterCondition")}
      </Button>
    </div>
  );
}

function ConditionValue({ property, value, members, onChange }: {
  property: DatabaseProperty;
  value: string;
  members: Member[];
  onChange: (value: string) => void;
}) {
  const t = useTranslations("PageDatabase");
  if (property.type === "checkbox") {
    return (
      <Choice
        label={t("filterValue")}
        value={value || "true"}
        onChange={onChange}
        options={[
          { value: "true", label: t("checked") },
          { value: "false", label: t("unchecked") },
        ]}
      />
    );
  }
  if (property.type === "select" || property.type === "multi_select") {
    return (
      <Choice
        label={t("filterValue")}
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: t("chooseOption") },
          ...(property.options ?? []).map((option) => ({ value: option.id, label: option.name })),
        ]}
      />
    );
  }
  if (property.type === "people") {
    const member = members.find((m) => m.user_id === value);
    return (
      <SearchSelect
        value={value || null}
        onChange={(next) => onChange(next ?? "")}
        options={members.map((m) => ({
          value: m.user_id,
          label: displayName(m, t("unknownPerson")),
          icon: <UserAvatar seed={m.avatar_seed} className="size-5" />,
        }))}
        trigger={
          <Button variant="outline" className="w-full justify-start" aria-label={t("filterValue")}>
            {member ? (
              <>
                <UserAvatar seed={member.avatar_seed} className="size-5" />
                <span className="truncate">{displayName(member, t("unknownPerson"))}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{t("choosePerson")}</span>
            )}
          </Button>
        }
      />
    );
  }
  if (property.type === "date" || property.type === "created_at") {
    return (
      <DateTimePicker
        dateOnly
        value={value || null}
        onChange={(next) => onChange(next ?? "")}
        ariaLabel={t("filterValue")}
        placeholder={t("chooseDate")}
      />
    );
  }
  return (
    <Input
      aria-label={t("filterValue")}
      placeholder={t("valuePlaceholder")}
      inputMode={property.type === "number" ? "decimal" : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** How many conditions a filter really applies — drafts without a value
    do not filter anything yet. */
export function activeFilterCount(filter: DatabaseViewFilter): number {
  return filter.conditions.filter((condition) =>
    !databaseFilterNeedsValue(condition.operator) || (condition.value ?? "") !== "").length;
}
