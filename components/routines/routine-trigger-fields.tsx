"use client";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon, CheckIcon, Clock01Icon, DatabaseIcon, Delete02Icon, FlashIcon, CircleDotDashedIcon, MessageMultiple01Icon, SignalHighIcon, Tag01Icon, TriangleIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { HelpHint } from "@/components/settings/help-hint";
import { StatusIndicator, PriorityIndicator } from "@/components/issue-indicators";
import { Dot } from "@/components/ui/color-dot";
import { UserAvatar } from "@/components/user-avatar";
import { PROPERTY_ICONS } from "@/components/pages/database-property-icons";
import { ALL_STATUSES, PRIORITIES, EFFORTS } from "@/lib/issue-constants";
import { routineEditorGroup, type RoutineEditorGroup, type RoutineEditorCondition } from "@/lib/routine-editor-conditions";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { usePagesQuery } from "@/lib/use-pages-query";
import { fetchPageApi } from "@/lib/pages-api";
import { fetchIssuesApi } from "@/lib/issues-api";
import type { DatabaseProperty } from "@/lib/page-databases";
import { ROUTINE_EVENTS, type RoutineTrigger, type RoutineCondition, type ConditionOperator } from "@/lib/routine-triggers";

const databaseEntryEvent = "database.entry_added";
const focusRing = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
/** A value the trigger still needs before it can be saved: an amber outline, not an error. */
const missingRing = "ring-2 ring-amber-500/70 dark:ring-amber-400/70";
/** Whether the fields outline the values the trigger still lacks (the routine's page saves as you go). */
const HighlightMissingContext = createContext(false);
type Choice = { id: string; label: string; icon?: ReactNode };
const icon = (value: typeof Clock01Icon) => <HugeiconsIcon icon={value} aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
const fieldIcons: Record<string, ReactNode> = {
  status: icon(CircleDotDashedIcon), assignee: icon(UserCircleIcon), category: icon(Tag01Icon), priority: icon(SignalHighIcon), effort: icon(TriangleIcon),
};

function ChoiceLabel({ label, icon: leading, wrap = false }: { label: string; icon?: ReactNode; wrap?: boolean }) {
  return <span className="flex min-w-0 items-center gap-2">
    {leading && <span aria-hidden className="flex shrink-0 items-center justify-center">{leading}</span>}
    <span className={wrap ? "whitespace-normal" : "truncate"}>{label}</span>
  </span>;
}

function ChoiceField({ label, value, choices, onChange, loading = false, compact = false, icon: fallbackIcon, help, missing = false }: {
  label: string; value: string; choices: Choice[]; onChange: (value: string) => void; loading?: boolean; compact?: boolean; icon?: ReactNode; help?: string;
  /** The trigger needs this value before it can be saved. */
  missing?: boolean;
}) {
  const t = useTranslations("Routines");
  const common = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const selected = choices.find(choice => choice.id === value);
  const unavailable = value && !loading && !choices.some(choice => choice.id === value);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", compact && "sm:flex-row sm:items-center sm:gap-2")}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{label}{help && <HelpHint label={t("triggerHelpLabel", { label })}>{help}</HelpHint>}</span>
      {choices.length <= 8 ? <Select value={value || "__any__"} onValueChange={next => onChange(next === "__any__" ? "" : next)}>
        <SelectTrigger aria-label={label} data-missing={missing ? "" : undefined} size={compact ? "sm" : "default"} className={cn("w-full min-w-0", focusRing, missing && missingRing, compact && "h-auto! min-h-8 w-auto max-w-full rounded-full whitespace-normal text-left text-xs [&>[data-slot=select-value]]:line-clamp-none! [&>[data-slot=select-value]]:whitespace-normal")}>
          <SelectValue placeholder={loading ? common("loading") : t("chooseTriggerValue")}>
            <ChoiceLabel icon={selected?.icon ?? fallbackIcon} label={unavailable ? t("unavailableSelection") : selected?.label || (loading ? common("loading") : t("chooseTriggerValue"))} wrap={compact} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="max-w-[calc(100vw-2rem)]">
          {choices.map(choice => <SelectItem key={choice.id} value={choice.id || "__any__"}><ChoiceLabel icon={choice.icon} label={choice.label} /></SelectItem>)}
          {choices.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{loading ? common("loading") : t("noTriggerChoices")}</p>}
        </SelectContent>
      </Select> : <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} data-missing={missing ? "" : undefined} className={cn("h-11 w-full min-w-0 justify-between bg-control px-3.5 font-normal md:h-9", focusRing, missing && missingRing)}>
            <ChoiceLabel icon={selected?.icon ?? fallbackIcon} label={unavailable ? t("unavailableSelection") : selected?.label || (loading ? common("loading") : t("chooseTriggerValue"))} />
            <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-48 max-w-[calc(100vw-2rem)] rounded-xl p-0">
          <Command label={label}>
            <CommandInput aria-label={label} placeholder={t("searchTriggerChoices")} />
            <CommandList className="p-1">
              <CommandEmpty>{loading ? common("loading") : t("noTriggerChoices")}</CommandEmpty>
              {choices.map(choice => <CommandItem key={choice.id} value={choice.id || "__any__"} keywords={[choice.label]} onSelect={() => { onChange(choice.id); setOpen(false); }}>
                <span className="min-w-0 flex-1"><ChoiceLabel icon={choice.icon} label={choice.label} /></span>
                {choice.id === value && <HugeiconsIcon icon={CheckIcon} aria-hidden className="size-4 shrink-0" />}
              </CommandItem>)}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>}
    </div>
  );
}

function SectionHeading({ title, help }: { title: string; help?: string }) {
  const t = useTranslations("Routines");
  return <div className="flex items-center gap-1.5">
    <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    {help && <HelpHint label={t("triggerHelpLabel", { label: title })}>{help}</HelpHint>}
  </div>;
}

export function RoutineTriggerFields({ projectId, value, onChange, hideLegend = false, highlightMissing = false }: {
  projectId: string;
  value: RoutineTrigger;
  onChange: (value: RoutineTrigger) => void;
  /** Under a row that already names the trigger (the routine's page): kept for screen readers only. */
  hideLegend?: boolean;
  /** Outline the values the trigger still lacks (the routine's page, which saves as you go). */
  highlightMissing?: boolean;
}) {
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
  const people = members.map(m => ({ id: m.user_id, label: m.full_name || m.email || m.user_id, icon: <UserAvatar seed={m.avatar_seed} className="size-4" /> }));
  const statusChoices = ALL_STATUSES.map(({ value: id }) => ({ id, label: statusT(id), icon: <StatusIndicator status={id} className="size-4" /> }));
  const schema = database.data?.database_schema ?? [];
  const isDatabase = value.type === "database";
  const conditionsAllowed = value.type !== "schedule" && (isDatabase || value.event !== "feedback.received");
  const canAddCondition = !isDatabase || schema.length > 0;
  const restoreConditionsFocus = () => requestAnimationFrame(() => {
    const container = conditionsRef.current;
    const control = container?.querySelector<HTMLButtonElement>("button[role='combobox']") ?? container?.querySelector<HTMLButtonElement>("button[data-add-condition]");
    control?.focus();
  });
  const setConditions = (conditions: RoutineCondition | undefined, restoreFocus = false) => {
    if (value.type !== "schedule") onChange({ ...value, conditions });
    if (restoreFocus) restoreConditionsFocus();
  };
  const leaf = (): RoutineCondition => isDatabase ? { field: "property", propertyId: schema[0]?.id ?? "", operator: "present" } : { field: "category", operator: "present" };
  const choices = {
    status: statusChoices, assignee: people, category: categories.map(c => ({ id: c.id, label: c.name, icon: <Dot color={c.color} /> })),
    priority: PRIORITIES.map(({ value: id }) => ({ id, label: priorityT(id), icon: <PriorityIndicator priority={id} className="size-4" /> })),
    effort: EFFORTS.map(({ value: id, label }) => ({ id, label, icon: icon(TriangleIcon) })),
  };
  const types = [
    { id: "schedule", icon: Clock01Icon }, { id: "event", icon: FlashIcon },
  ] as const;
  const mode = value.type === "schedule" ? "schedule" : "event";
  const eventIcons = {
    "issue.created": icon(Add01Icon), "issue.status_changed": fieldIcons.status, "issue.assigned": fieldIcons.assignee,
    "issue.comment_added": icon(MessageMultiple01Icon), "feedback.received": icon(MessageMultiple01Icon),
  };
  const eventChoices = [...ROUTINE_EVENTS.map(id => ({ id, label: t(`event_${id.replaceAll(".", "_")}` as "event_issue_created"), icon: eventIcons[id] })), { id: databaseEntryEvent, label: t("trigger_database"), icon: icon(DatabaseIcon) }];
  const group = value.type !== "schedule" && value.conditions ? routineEditorGroup(value.conditions) : null;
  const changeEvent = (event: string) => {
    if (value.type === "schedule" || event === (value.type === "database" ? databaseEntryEvent : value.event)) return;
    if (event === databaseEntryEvent) { onChange({ type: "database", databaseId: "", delayMinutes: value.delayMinutes }); return; }
    onChange({ type: "event", event: event as typeof ROUTINE_EVENTS[number], ...(event === "issue.status_changed" ? { status: "triage" } : {}), ...(event === "issue.comment_added" ? { issueId: "" } : {}), delayMinutes: value.delayMinutes, conditions: value.type === "event" && event !== "feedback.received" ? value.conditions : undefined });
  };
  const conditionsHelp = `${t("conditionsHelp")} ${t("triggerWaitingHelp")}`;
  const delay = value.type === "schedule" ? 0 : value.delayMinutes ?? 0;
  const delayMissing = highlightMissing && (!Number.isInteger(delay) || delay < 0 || delay > 120);
  return (
    <HighlightMissingContext.Provider value={highlightMissing}>
    <div className="@container flex min-w-0 flex-col gap-6">
      <fieldset className="min-w-0">
        <legend className={hideLegend ? "sr-only" : "mb-2"}><span className="flex items-center gap-1.5 text-sm font-semibold">{t("triggerLabel")}<HelpHint label={t("triggerHelpLabel", { label: t("triggerLabel") })}>{t("triggerChooseHelp")}</HelpHint></span></legend>
        <div className="grid grid-cols-2 gap-2">
          {types.map(type => (
            <Button key={type.id} type="button" variant={mode === type.id ? "default" : "outline"} aria-pressed={mode === type.id}
              className={cn("h-auto min-w-0 items-start justify-start gap-3 whitespace-normal rounded-xl p-3 text-left", focusRing)}
              onClick={() => { if (mode !== type.id) onChange(type.id === "schedule" ? { type: "schedule" } : { type: "event", event: "issue.created" }); }}>
              <HugeiconsIcon icon={type.icon} aria-hidden className={cn("mt-0.5 size-4 shrink-0", mode !== type.id && "text-muted-foreground")} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {t(`trigger_${type.id}`)}
                  {mode === type.id && <HugeiconsIcon icon={CheckIcon} aria-hidden className="size-4 shrink-0" />}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </fieldset>
      {value.type !== "schedule" && <>
        <section className="flex flex-col gap-3" aria-label={t("triggerWhen")}>
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <ChoiceField label={t("eventLabel")} value={value.type === "database" ? databaseEntryEvent : value.event} choices={eventChoices} onChange={changeEvent} />
            {value.type === "event" && value.event === "issue.status_changed" && <ChoiceField label={t("targetStatus")} help={t("triggerStatusWaitingHelp")} value={value.status ?? "triage"} choices={statusChoices} icon={fieldIcons.status} onChange={status => onChange({ ...value, status })} />}
            {value.type === "event" && value.event === "issue.assigned" && <ChoiceField label={t("targetPerson")} help={t("triggerAssignmentWaitingHelp")} value={value.assigneeId ?? ""} choices={[{ id: "", label: t("anyPerson"), icon: fieldIcons.assignee }, ...people]} loading={peopleLoading} onChange={assigneeId => onChange({ ...value, assigneeId: assigneeId || undefined })} />}
            {value.type === "event" && value.event === "issue.comment_added" && <ChoiceField label={t("followedIssue")} missing={highlightMissing && !value.issueId} value={value.issueId ?? ""} choices={(issues.data ?? []).map(i => ({ id: i.id, label: i.title, icon: <StatusIndicator status={i.status} className="size-4" /> }))} icon={fieldIcons.status} loading={issues.isPending} onChange={issueId => onChange({ ...value, issueId })} />}
            {value.type === "database" && <ChoiceField label={t("databaseLabel")} help={t("triggerDatabaseWaitingHelp")} missing={highlightMissing && !value.databaseId} value={value.databaseId} choices={pages.filter(p => p.database_schema != null).map(p => ({ id: p.id, label: p.title, icon: icon(DatabaseIcon) }))} icon={icon(DatabaseIcon)} loading={pagesLoading} onChange={databaseId => { if (databaseId !== value.databaseId) onChange({ type: "database", databaseId, delayMinutes: value.delayMinutes }); }} />}
          </div>
          {((isDatabase && (pagesError || database.isError)) || (value.type === "event" && value.event === "issue.comment_added" && issues.isError)) && <p role="alert" className="text-xs text-destructive">{t("triggerChoicesError")}</p>}
        </section>
        {conditionsAllowed && <section ref={conditionsRef} className="flex flex-col gap-3 border-t border-border pt-5" aria-label={t("conditionsLabel")}>
          <SectionHeading title={t("conditionsLabel")} help={conditionsHelp} />
          {value.conditions && !group ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <p className="flex-1 text-xs text-muted-foreground">{t("nestedConditionsNotice")}</p>
            <Button type="button" size="sm" variant="outline" className={focusRing} disabled={!canAddCondition} onClick={() => setConditions({ operator: "and", children: [leaf()] }, true)}>{t("replaceConditions")}</Button>
          </div> : group ? <ConditionGroup value={group} onChange={setConditions} onRemove={() => setConditions(undefined, true)} restoreFocus={restoreConditionsFocus} schema={schema} database={isDatabase} choices={choices} canAdd={canAddCondition} /> : <Button type="button" size="sm" variant="outline" className={cn("self-start", focusRing)} disabled={!canAddCondition} data-add-condition onClick={() => setConditions({ operator: "and", children: [leaf()] })}>
            <HugeiconsIcon icon={Add01Icon} aria-hidden className="size-4" />{t("addCondition")}
          </Button>}
          {isDatabase && !canAddCondition && <p className="text-xs text-muted-foreground">{t(!databaseId ? "chooseDatabaseForConditions" : database.isPending ? "loadingDatabaseProperties" : "noDatabaseProperties")}</p>}
        </section>}
        <section className="flex flex-col gap-3 border-t border-border pt-5" aria-label={t("triggerTiming")}>
          <SectionHeading title={t("triggerTiming")} help={`${t("triggerDelayHelp")} ${t("triggerDelayRange")}`} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={delayId} className="text-xs font-medium text-muted-foreground">{t("triggerDelay")}</label>
            <Input id={delayId} aria-describedby={`${delayId}-help`} type="number" min={0} max={120} step={1} className={cn("max-w-32", focusRing, delayMissing && missingRing)} data-missing={delayMissing ? "" : undefined} value={value.delayMinutes ?? 0} onChange={e => onChange({ ...value, delayMinutes: Number(e.target.value) })} />
            <p id={`${delayId}-help`} className="sr-only">{t("triggerDelayRange")}</p>
          </div>
        </section>
      </>}
    </div>
    </HighlightMissingContext.Provider>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <AppTooltip label={label}><Button type="button" size="icon" variant="ghost" className={cn("size-9 shrink-0 text-muted-foreground hover:text-destructive", focusRing)} aria-label={label} onClick={onClick}><HugeiconsIcon icon={Delete02Icon} aria-hidden className="size-4" /></Button></AppTooltip>;
}

function ConditionGroup({ value, onChange, onRemove, restoreFocus, schema, database, choices, canAdd }: {
  value: RoutineEditorGroup; onChange: (value: RoutineCondition) => void; onRemove: () => void; restoreFocus: () => void;
  schema: DatabaseProperty[]; database: boolean; choices: Record<string, Choice[]>; canAdd: boolean;
}) {
  const t = useTranslations("Routines");
  const leaf = (): RoutineEditorCondition => database ? { field: "property", propertyId: schema[0]?.id ?? "", operator: "present" } : { field: "category", operator: "present" };
  return <fieldset className="min-w-0 rounded-xl border border-border">
    <legend className="sr-only">{t("conditionsLabel")}</legend>
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <ChoiceField compact label={t("conditionGroup")} value={value.operator} choices={[{ id: "and", label: t("matchAll") }, { id: "or", label: t("matchAny") }]} onChange={operator => onChange({ ...value, operator: operator as "and" | "or" })} />
      <RemoveButton label={t("clearConditions")} onClick={onRemove} />
    </div>
    <div className="flex flex-col gap-3 p-3">
      {value.children.map((child, i) => <ConditionRow key={i} value={child} path={String(i + 1)} schema={schema} database={database} choices={choices}
        onChange={next => onChange({ ...value, children: value.children.map((c, j) => i === j ? next : c) })}
        onRemove={() => { if (value.children.length === 1) onRemove(); else onChange({ ...value, children: value.children.filter((_, j) => i !== j) }); restoreFocus(); }} />)}
    </div>
    <div className="border-t border-border px-2 py-2">
      <Button type="button" size="sm" variant="ghost" className={focusRing} disabled={!canAdd || value.children.length >= 16} data-add-condition onClick={() => onChange({ ...value, children: [...value.children, leaf()] })}><HugeiconsIcon icon={Add01Icon} aria-hidden className="size-4" />{t("addCondition")}</Button>
    </div>
  </fieldset>;
}

function ConditionRow({ value, onChange, onRemove, path, schema, database, choices }: {
  value: RoutineEditorCondition; onChange: (value: RoutineEditorCondition) => void; onRemove: () => void; path: string;
  schema: DatabaseProperty[]; database: boolean; choices: Record<string, Choice[]>;
}) {
  const t = useTranslations("Routines");
  const inputId = useId();
  const property = schema.find(p => p.id === value.propertyId);
  const collection = value.field === "category" || ["people", "multi_select"].includes(property?.type ?? "");
  const operators: ConditionOperator[] = ["present", "absent", ...(collection ? ["contains" as const] : ["eq" as const, "neq" as const, ...(!property || ["text", "url", "select"].includes(property.type) ? ["in" as const] : [])]), ...(["number", "date", "created_at"].includes(property?.type ?? "") ? ["gt" as const, "gte" as const, "lt" as const, "lte" as const] : [])];
  const options = value.field === "property" ? property?.type === "people" ? choices.assignee : property?.type === "checkbox" ? [{ id: "true", label: t("checked"), icon: icon(PROPERTY_ICONS.checkbox) }, { id: "false", label: t("unchecked"), icon: icon(PROPERTY_ICONS.checkbox) }] : property?.options?.map(o => ({ id: o.id, label: o.name, icon: <Dot color={o.color} /> })) : choices[value.field];
  const highlightMissing = useContext(HighlightMissingContext);
  const valueMissing = highlightMissing && !["present", "absent"].includes(value.operator) && (
    value.value === undefined || value.value === "" || (Array.isArray(value.value) && value.value.length === 0) ||
    (typeof value.value === "number" && !Number.isFinite(value.value)));
  const setValue = (raw: string) => onChange({ ...value, value: raw === "" ? undefined : value.operator === "in" ? raw.split(",").map(v => v.trim()).filter(Boolean) : property?.type === "number" ? Number(raw) : property?.type === "checkbox" ? raw === "true" : raw });
  let valueField: ReactNode;
  if (!["present", "absent"].includes(value.operator)) {
    if (options && value.operator === "in") {
      valueField = <fieldset data-missing={valueMissing ? "" : undefined} className={cn("flex min-w-0 flex-col gap-2 rounded-lg", valueMissing && missingRing)}>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t("conditionValues")}</legend>
        <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-auto p-1">
          {options.map(option => <label key={option.id} className="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox className={focusRing} checked={Array.isArray(value.value) && value.value.includes(option.id)} onCheckedChange={checked => {
              const selected = Array.isArray(value.value) ? value.value : [];
              onChange({ ...value, value: checked === true ? [...selected, option.id] : selected.filter(id => id !== option.id) });
            }} /><ChoiceLabel label={option.label} icon={option.icon} />
          </label>)}
        </div>
      </fieldset>;
    } else if (options) {
      valueField = <ChoiceField label={t("conditionValue")} missing={valueMissing} value={String(value.value ?? "")} choices={options} icon={database && property ? icon(PROPERTY_ICONS[property.type]) : fieldIcons[value.field]} onChange={setValue} />;
    } else {
      valueField = <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">{t(value.operator === "in" ? "conditionValues" : "conditionValue")}</label>
        <Input id={inputId} step={property?.type === "number" ? "any" : undefined} className={cn(focusRing, valueMissing && missingRing)} data-missing={valueMissing ? "" : undefined} aria-describedby={value.operator === "in" ? `${inputId}-help` : undefined} type={property?.type === "number" ? "number" : property?.type === "date" ? "date" : "text"} value={Array.isArray(value.value) ? value.value.join(", ") : String(value.value ?? "")} onChange={e => setValue(e.target.value)} />
        {value.operator === "in" && <p id={`${inputId}-help`} className="text-xs text-muted-foreground">{t("conditionValuesHelp")}</p>}
      </div>;
    }
  }
  return <fieldset className="min-w-0">
    <legend className="sr-only">{t("conditionAt", { number: path })}</legend>
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">{t("conditionAt", { number: path })}</span>
      <RemoveButton label={t("removeConditionAt", { number: path })} onClick={onRemove} />
    </div>
    <div className="flex flex-wrap gap-2 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:basis-36 [&>fieldset]:basis-full">
      {database ? <ChoiceField label={t("conditionField")} value={value.propertyId ?? ""} choices={schema.map(p => ({ id: p.id, label: p.name, icon: icon(PROPERTY_ICONS[p.type]) }))} onChange={propertyId => onChange({ field: "property", propertyId, operator: "present" })} /> : <ChoiceField label={t("conditionField")} value={value.field} choices={Object.keys(choices).map(id => ({ id, label: t(`field_${id}` as "field_status"), icon: fieldIcons[id] }))} onChange={field => onChange({ field: field as typeof value.field, operator: "present" })} />}
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
