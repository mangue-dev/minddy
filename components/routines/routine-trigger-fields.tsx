"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon, CheckIcon, Clock01Icon, DatabaseIcon, Delete02Icon, FlashIcon } from "@hugeicons/core-free-icons";
import { Button, Checkbox, Command, CommandEmpty, CommandInput, CommandItem, CommandList, Input, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "mangue-ui";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { usePagesQuery } from "@/lib/use-pages-query";
import { fetchPageApi } from "@/lib/pages-api";
import { fetchIssuesApi } from "@/lib/issues-api";
import type { DatabaseProperty } from "@/lib/page-databases";
import { ROUTINE_EVENTS, type RoutineTrigger, type RoutineCondition, type ConditionOperator } from "@/lib/routine-triggers";

const statuses = ["triage", "backlog", "todo", "in_progress", "in_review", "done", "canceled", "duplicate"];
const focusRing = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
type Choice = { id: string; label: string };

function ChoiceField({ label, value, choices, onChange, loading = false, compact = false }: {
  label: string; value: string; choices: Choice[]; onChange: (value: string) => void; loading?: boolean; compact?: boolean;
}) {
  const t = useTranslations("Routines");
  const common = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const unavailable = value && !loading && !choices.some(choice => choice.id === value);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", compact && "sm:flex-row sm:items-center sm:gap-2")}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {choices.length <= 8 ? <Select value={value || "__any__"} onValueChange={next => onChange(next === "__any__" ? "" : next)}>
        <SelectTrigger aria-label={label} size={compact ? "sm" : "default"} className={cn("w-full min-w-0", focusRing, compact && "h-auto! min-h-8 w-auto max-w-full rounded-full whitespace-normal text-left text-xs [&>[data-slot=select-value]]:line-clamp-none! [&>[data-slot=select-value]]:whitespace-normal")}>
          <SelectValue placeholder={loading ? common("loading") : t("chooseTriggerValue")}>
            {unavailable ? t("unavailableSelection") : choices.find(choice => choice.id === value)?.label || (loading ? common("loading") : t("chooseTriggerValue"))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="max-w-[calc(100vw-2rem)]">
          {choices.map(choice => <SelectItem key={choice.id} value={choice.id || "__any__"}>{choice.label}</SelectItem>)}
          {choices.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{loading ? common("loading") : t("noTriggerChoices")}</p>}
        </SelectContent>
      </Select> : <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} className={cn("h-11 w-full min-w-0 justify-between bg-control px-3.5 font-normal md:h-9", focusRing)}>
            <span className="truncate">{unavailable ? t("unavailableSelection") : choices.find(choice => choice.id === value)?.label || (loading ? common("loading") : t("chooseTriggerValue"))}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-48 max-w-[calc(100vw-2rem)] rounded-xl p-0">
          <Command label={label}>
            <CommandInput aria-label={label} placeholder={t("searchTriggerChoices")} />
            <CommandList className="p-1">
              <CommandEmpty>{loading ? common("loading") : t("noTriggerChoices")}</CommandEmpty>
              {choices.map(choice => <CommandItem key={choice.id} value={choice.id || "__any__"} keywords={[choice.label]} onSelect={() => { onChange(choice.id); setOpen(false); }}>
                <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                {choice.id === value && <HugeiconsIcon icon={CheckIcon} aria-hidden className="size-4 shrink-0" />}
              </CommandItem>)}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>}
    </div>
  );
}

function SectionHeading({ title, help, optional = false }: { title: string; help?: string; optional?: boolean }) {
  const t = useTranslations("Routines");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {optional && <span className="text-xs text-muted-foreground">{t("optionalSetting")}</span>}
      </div>
      {help && <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  );
}

export function RoutineTriggerFields({ projectId, value, onChange }: { projectId: string; value: RoutineTrigger; onChange: (value: RoutineTrigger) => void }) {
  const t = useTranslations("Routines");
  const statusT = useTranslations("Status");
  const priorityT = useTranslations("Priority");
  const delayId = useId();
  const conditionsRef = useRef<HTMLDivElement>(null);
  const { members, loading: peopleLoading } = useMembersQuery(projectId, value.type !== "schedule");
  const { categories } = useCategoriesQuery(value.type !== "schedule" ? projectId : null);
  const { pages, loading: pagesLoading, error: pagesError } = usePagesQuery(value.type === "database" ? projectId : null);
  const databaseId = value.type === "database" ? value.databaseId : "";
  const database = useQuery({ queryKey: ["page", databaseId], queryFn: () => fetchPageApi(projectId, databaseId), enabled: !!databaseId && !!projectId });
  const issues = useQuery({ queryKey: ["routine-followed-issues", projectId], queryFn: () => fetchIssuesApi(projectId), enabled: value.type === "event" && value.event === "issue.comment_added" });
  const people = members.map(m => ({ id: m.user_id, label: m.full_name || m.email || m.user_id }));
  const statusChoices = statuses.map(id => ({ id, label: statusT(id as "triage") }));
  const schema = database.data?.database_schema ?? [];
  const isDatabase = value.type === "database";
  const conditionsAllowed = value.type !== "schedule" && (isDatabase || value.event !== "feedback.received");
  const canAddCondition = !isDatabase || schema.length > 0;
  const setConditions = (conditions: RoutineCondition | undefined, restoreFocus = false) => {
    if (value.type !== "schedule") onChange({ ...value, conditions });
    if (restoreFocus) requestAnimationFrame(() => conditionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  };
  const leaf = (): RoutineCondition => isDatabase ? { field: "property", propertyId: schema[0]?.id ?? "", operator: "present" } : { field: "category", operator: "present" };
  const choices = {
    status: statusChoices, assignee: people, category: categories.map(c => ({ id: c.id, label: c.name })),
    priority: ["none", "low", "medium", "high", "urgent"].map(id => ({ id, label: priorityT(id as "none") })),
    effort: ["xs", "s", "m", "l", "xl"].map(id => ({ id, label: id.toUpperCase() })),
  };
  const types = [
    { id: "schedule", icon: Clock01Icon }, { id: "event", icon: FlashIcon }, { id: "database", icon: DatabaseIcon },
  ] as const;
  return (
    <div className="@container flex min-w-0 flex-col gap-6">
      <fieldset className="min-w-0">
        <legend className="mb-3 text-sm font-semibold">{t("triggerLabel")}</legend>
        <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3">
          {types.map(type => (
            <Button key={type.id} type="button" variant="outline" aria-pressed={value.type === type.id}
              className={cn("h-auto min-w-0 items-start justify-start gap-3 whitespace-normal rounded-xl p-3 text-left", focusRing, value.type === type.id && "border-primary bg-primary/5")}
              onClick={() => { if (value.type !== type.id) onChange(type.id === "schedule" ? { type: "schedule" } : type.id === "database" ? { type: "database", databaseId: "" } : { type: "event", event: "issue.created" }); }}>
              <HugeiconsIcon icon={type.icon} aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {t(`trigger_${type.id}`)}
                  {value.type === type.id && <HugeiconsIcon icon={CheckIcon} aria-hidden className="size-4 shrink-0 text-primary" />}
                </span>
                <span className="text-xs font-normal leading-relaxed text-muted-foreground">{t(`triggerDescription_${type.id}`)}</span>
              </span>
            </Button>
          ))}
        </div>
      </fieldset>
      {value.type !== "schedule" && <>
        <section className="flex flex-col gap-3" aria-label={t("triggerWhen")}>
          <SectionHeading title={t("triggerWhen")} />
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            {value.type === "event" ? <>
              <ChoiceField label={t("eventLabel")} value={value.event} choices={ROUTINE_EVENTS.map(id => ({ id, label: t(`event_${id.replaceAll(".", "_")}` as "event_issue_created") }))}
                onChange={event => onChange({ type: "event", event: event as typeof value.event, ...(event === "issue.status_changed" ? { status: "triage" } : {}), ...(event === "issue.comment_added" ? { issueId: "" } : {}), delayMinutes: value.delayMinutes, conditions: event === "feedback.received" ? undefined : value.conditions })} />
              {value.event === "issue.status_changed" && <ChoiceField label={t("targetStatus")} value={value.status ?? "triage"} choices={statusChoices} onChange={status => onChange({ ...value, status })} />}
              {value.event === "issue.assigned" && <ChoiceField label={t("targetPerson")} value={value.assigneeId ?? ""} choices={[{ id: "", label: t("anyPerson") }, ...people]} loading={peopleLoading} onChange={assigneeId => onChange({ ...value, assigneeId: assigneeId || undefined })} />}
              {value.event === "issue.comment_added" && <ChoiceField label={t("followedIssue")} value={value.issueId ?? ""} choices={(issues.data ?? []).map(i => ({ id: i.id, label: i.title }))} loading={issues.isPending} onChange={issueId => onChange({ ...value, issueId })} />}
            </> : <ChoiceField label={t("databaseLabel")} value={value.databaseId} choices={pages.filter(p => p.database_schema != null).map(p => ({ id: p.id, label: p.title }))} loading={pagesLoading} onChange={databaseId => onChange({ type: "database", databaseId, delayMinutes: value.delayMinutes })} />}
          </div>
          {((isDatabase && (pagesError || database.isError)) || (value.type === "event" && value.event === "issue.comment_added" && issues.isError)) && <p role="alert" className="text-xs text-destructive">{t("triggerChoicesError")}</p>}
        </section>
        {conditionsAllowed && <section ref={conditionsRef} className="flex flex-col gap-3 border-t border-border pt-5" aria-label={t("conditionsLabel")}>
          <SectionHeading title={t("conditionsLabel")} help={t("conditionsHelp")} optional />
          {value.conditions ? <ConditionEditor value={"children" in value.conditions ? value.conditions : { operator: "and", children: [value.conditions] }} onChange={setConditions} onRemove={() => setConditions(undefined, true)} restoreFocus={() => requestAnimationFrame(() => conditionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus())}
            depth={0} path="1" schema={schema} database={isDatabase} choices={choices} nodeCount={countNodes(value.conditions) + ("children" in value.conditions ? 0 : 1)} canAdd={canAddCondition} /> : <div className="flex flex-col items-start gap-3 rounded-xl bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">{t("noConditionsHelp")}</p>
            <Button type="button" size="sm" variant="outline" disabled={!canAddCondition} className={focusRing} onClick={() => setConditions({ operator: "and", children: [leaf()] })}>
              <HugeiconsIcon icon={Add01Icon} aria-hidden className="size-4" />{t("addCondition")}
            </Button>
          </div>}
          {isDatabase && !canAddCondition && <p className="text-xs text-muted-foreground">{t(!databaseId ? "chooseDatabaseForConditions" : database.isPending ? "loadingDatabaseProperties" : "noDatabaseProperties")}</p>}
          {value.conditions && <p className="text-xs leading-relaxed text-muted-foreground">{t("triggerWaitingHelp")}{isDatabase ? ` ${t("triggerDatabaseWaitingHelp")}` : value.event === "issue.status_changed" ? ` ${t("triggerStatusWaitingHelp")}` : value.event === "issue.assigned" ? ` ${t("triggerAssignmentWaitingHelp")}` : ""}</p>}
        </section>}
        <section className="flex flex-col gap-3 border-t border-border pt-5" aria-label={t("triggerTiming")}>
          <SectionHeading title={t("triggerTiming")} help={t("triggerDelayHelp")} optional />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={delayId} className="text-xs font-medium text-muted-foreground">{t("triggerDelay")}</label>
            <Input id={delayId} aria-describedby={`${delayId}-help`} type="number" min={0} max={120} step={1} className={cn("max-w-32", focusRing)} value={value.delayMinutes ?? 0} onChange={e => onChange({ ...value, delayMinutes: Number(e.target.value) })} />
            <p id={`${delayId}-help`} className="text-xs text-muted-foreground">{t("triggerDelayRange")}</p>
          </div>
        </section>
      </>}
    </div>
  );
}

function countNodes(value: RoutineCondition): number {
  return "children" in value ? 1 + value.children.reduce((sum, child) => sum + countNodes(child), 0) : 1;
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <AppTooltip label={label}><Button type="button" size="icon" variant="ghost" className={cn("size-9 shrink-0 text-muted-foreground hover:text-destructive", focusRing)} aria-label={label} onClick={onClick}><HugeiconsIcon icon={Delete02Icon} aria-hidden className="size-4" /></Button></AppTooltip>;
}

function ConditionEditor({ value, onChange, onRemove, restoreFocus, depth, path, schema, database, choices, nodeCount, canAdd }: {
  value: RoutineCondition; onChange: (value: RoutineCondition) => void; onRemove: () => void; restoreFocus: () => void; depth: number; path: string;
  schema: DatabaseProperty[]; database: boolean; choices: Record<string, Choice[]>; nodeCount: number; canAdd: boolean;
}) {
  const t = useTranslations("Routines");
  const inputId = useId();
  const remove = () => { onRemove(); restoreFocus(); };
  const leaf = (): RoutineCondition => database ? { field: "property", propertyId: schema[0]?.id ?? "", operator: "present" } : { field: "category", operator: "present" };
  if ("children" in value) {
    return <fieldset className={cn("min-w-0 rounded-xl border border-border", depth > 0 && "bg-muted/30")}>
      <legend className="sr-only">{t("conditionGroupAt", { number: path })}</legend>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <ChoiceField compact label={t("conditionGroup")} value={value.operator} choices={[{ id: "and", label: t("matchAll") }, { id: "or", label: t("matchAny") }]} onChange={operator => onChange({ ...value, operator: operator as "and" | "or" })} />
        <RemoveButton label={t("removeConditionGroupAt", { number: path })} onClick={remove} />
      </div>
      <div className="flex flex-col gap-3 p-3">
        {value.children.map((child, i) => <div key={i} className={cn("min-w-0", "children" in child && "border-l-2 border-primary/25 pl-2")}>
          <ConditionEditor value={child} depth={depth + 1} path={depth === 0 ? String(i + 1) : `${path}.${i + 1}`} schema={schema} database={database} choices={choices} nodeCount={nodeCount} canAdd={canAdd} restoreFocus={restoreFocus}
            onChange={next => onChange({ ...value, children: value.children.map((c, j) => i === j ? next : c) })}
            onRemove={() => value.children.length === 1 ? onRemove() : onChange({ ...value, children: value.children.filter((_, j) => i !== j) })} />
        </div>)}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-border px-2 py-2">
        <Button type="button" size="sm" variant="ghost" className={focusRing} disabled={!canAdd || depth >= 6 || value.children.length >= 16 || nodeCount >= 64} onClick={() => onChange({ ...value, children: [...value.children, leaf()] })}><HugeiconsIcon icon={Add01Icon} aria-hidden className="size-4" />{t("addCondition")}</Button>
        <Button type="button" size="sm" variant="ghost" className={focusRing} disabled={!canAdd || depth >= 5 || value.children.length >= 16 || nodeCount > 62} onClick={() => onChange({ ...value, children: [...value.children, { operator: "or", children: [leaf()] }] })}>{t("addGroup")}</Button>
      </div>
    </fieldset>;
  }
  const property = schema.find(p => p.id === value.propertyId);
  const collection = value.field === "category" || ["people", "multi_select"].includes(property?.type ?? "");
  const operators: ConditionOperator[] = ["present", "absent", ...(collection ? ["contains" as const] : ["eq" as const, "neq" as const, ...(!property || ["text", "url", "select"].includes(property.type) ? ["in" as const] : [])]), ...(["number", "date", "created_at"].includes(property?.type ?? "") ? ["gt" as const, "gte" as const, "lt" as const, "lte" as const] : [])];
  const options = value.field === "property" ? property?.type === "people" ? choices.assignee : property?.type === "checkbox" ? [{ id: "true", label: t("checked") }, { id: "false", label: t("unchecked") }] : property?.options?.map(o => ({ id: o.id, label: o.name })) : choices[value.field];
  const setValue = (raw: string) => onChange({ ...value, value: raw === "" ? undefined : value.operator === "in" ? raw.split(",").map(v => v.trim()).filter(Boolean) : property?.type === "number" ? Number(raw) : property?.type === "checkbox" ? raw === "true" : raw });
  let valueField: ReactNode;
  if (!["present", "absent"].includes(value.operator)) {
    if (options && value.operator === "in") {
      valueField = <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t("conditionValues")}</legend>
        <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-auto p-1">
          {options.map(option => <label key={option.id} className="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox className={focusRing} checked={Array.isArray(value.value) && value.value.includes(option.id)} onCheckedChange={checked => {
              const selected = Array.isArray(value.value) ? value.value : [];
              onChange({ ...value, value: checked === true ? [...selected, option.id] : selected.filter(id => id !== option.id) });
            }} />{option.label}
          </label>)}
        </div>
      </fieldset>;
    } else if (options) {
      valueField = <ChoiceField label={t("conditionValue")} value={String(value.value ?? "")} choices={options} onChange={setValue} />;
    } else {
      valueField = <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">{t(value.operator === "in" ? "conditionValues" : "conditionValue")}</label>
        <Input id={inputId} step={property?.type === "number" ? "any" : undefined} className={focusRing} aria-describedby={value.operator === "in" ? `${inputId}-help` : undefined} type={property?.type === "number" ? "number" : property?.type === "date" ? "date" : "text"} value={Array.isArray(value.value) ? value.value.join(", ") : String(value.value ?? "")} onChange={e => setValue(e.target.value)} />
        {value.operator === "in" && <p id={`${inputId}-help`} className="text-xs text-muted-foreground">{t("conditionValuesHelp")}</p>}
      </div>;
    }
  }
  return <fieldset className="min-w-0">
    <legend className="sr-only">{t("conditionAt", { number: path })}</legend>
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">{t("conditionAt", { number: path })}</span>
      <RemoveButton label={t("removeConditionAt", { number: path })} onClick={remove} />
    </div>
    <div className="flex flex-wrap gap-2 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:basis-36 [&>fieldset]:basis-full">
      {database ? <ChoiceField label={t("conditionField")} value={value.propertyId ?? ""} choices={schema.map(p => ({ id: p.id, label: p.name }))} onChange={propertyId => onChange({ field: "property", propertyId, operator: "present" })} /> : <ChoiceField label={t("conditionField")} value={value.field} choices={Object.keys(choices).map(id => ({ id, label: t(`field_${id}` as "field_status") }))} onChange={field => onChange({ field: field as typeof value.field, operator: "present" })} />}
      <ChoiceField label={t("conditionOperator")} value={value.operator} choices={operators.map(id => ({ id, label: t(`operator_${id}` as "operator_eq") }))} onChange={operator => onChange({ ...value, operator: operator as ConditionOperator, value: undefined })} />
      {valueField}
    </div>
  </fieldset>;
}

export function RoutineTriggerSummary({ trigger, projectId }: { trigger?: RoutineTrigger; projectId?: string }) {
  const t = useTranslations("Routines");
  const statusT = useTranslations("Status");
  const { pages } = usePagesQuery(trigger?.type === "database" ? projectId ?? null : null);
  const target = trigger?.type === "database" ? pages.find(page => page.id === trigger.databaseId)?.title : trigger?.type === "event" && trigger.status ? statusT(trigger.status as "triage") : null;
  if (!trigger || trigger.type === "schedule") return null;
  return <p className="text-xs text-muted-foreground">{trigger.type === "database" ? t("trigger_database") : t(`event_${trigger.event.replaceAll(".", "_")}` as "event_issue_created")}{target ? ` · ${target}` : ""}</p>;
}
