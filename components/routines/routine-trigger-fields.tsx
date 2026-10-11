"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "mangue-ui";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { usePagesQuery } from "@/lib/use-pages-query";
import { fetchPageApi } from "@/lib/pages-api";
import { fetchIssuesApi } from "@/lib/issues-api";
import type { DatabaseProperty } from "@/lib/page-databases";
import { ROUTINE_EVENTS, type RoutineTrigger, type RoutineCondition, type ConditionOperator } from "@/lib/routine-triggers";

const selectClass = "h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const statuses = ["triage", "backlog", "todo", "in_progress", "in_review", "done", "canceled", "duplicate"];
type Choice = { id: string; label: string };
function Select({ label, value, choices, onChange, empty = false }: { label: string; value: string; choices: Choice[]; onChange: (value: string) => void; empty?: boolean }) {
  const t = useTranslations("Routines");
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{label}<select aria-label={label} className={selectClass} value={value} onChange={e => onChange(e.target.value)}>{empty ? <option value="">{t("chooseTriggerValue")}</option> : null}{choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>;
}
export function RoutineTriggerFields({ projectId, value, onChange }: { projectId: string; value: RoutineTrigger; onChange: (value: RoutineTrigger) => void }) {
  const t = useTranslations("Routines");
  const statusT = useTranslations("Status");
  const priorityT = useTranslations("Priority");
  const { members } = useMembersQuery(projectId, value.type !== "schedule");
  const { categories } = useCategoriesQuery(value.type !== "schedule" ? projectId : null);
  const { pages } = usePagesQuery(value.type === "database" ? projectId : null);
  const databaseId = value.type === "database" ? value.databaseId : "";
  const database = useQuery({ queryKey: ["page", databaseId], queryFn: () => fetchPageApi(projectId, databaseId), enabled: !!databaseId && !!projectId });
  const issues = useQuery({ queryKey: ["routine-followed-issues", projectId], queryFn: () => fetchIssuesApi(projectId), enabled: value.type === "event" && value.event === "issue.comment_added" });
  const people = members.map(m => ({ id: m.user_id, label: m.full_name || m.email || m.user_id }));
  const statusChoices = statuses.map(id => ({ id, label: statusT(id as "triage") }));
  const setType = (type: string) => onChange(type === "schedule" ? { type } : type === "database" ? { type, databaseId: "" } : { type: "event", event: "issue.created" });
  const schema = database.data?.database_schema ?? [];
  const setConditions = (conditions: RoutineCondition | undefined) => { if (value.type !== "schedule") onChange({ ...value, conditions }); };
  return <div className="flex flex-col gap-4">
    <Select label={t("triggerLabel")} value={value.type} choices={["schedule", "event", "database"].map(id => ({ id, label: t(`trigger_${id}` as "trigger_schedule") }))} onChange={setType} />
    {value.type === "event" ? <>
      <Select label={t("eventLabel")} value={value.event} choices={ROUTINE_EVENTS.map(id => ({ id, label: t(`event_${id.replaceAll(".", "_")}` as "event_issue_created") }))} onChange={event => onChange({ type: "event", event: event as typeof value.event, ...(event === "issue.status_changed" ? { status: "triage" } : {}), ...(event === "issue.comment_added" ? { issueId: "" } : {}) })} />
      {value.event === "issue.status_changed" ? <Select label={t("targetStatus")} value={value.status ?? "triage"} choices={statusChoices} onChange={status => onChange({ ...value, status })} /> : null}
      {value.event === "issue.assigned" ? <Select label={t("targetPerson")} value={value.assigneeId ?? ""} choices={[{ id: "", label: t("anyPerson") }, ...people]} onChange={assigneeId => onChange({ ...value, assigneeId: assigneeId || undefined })} /> : null}
      {value.event === "issue.comment_added" ? <Select empty label={t("followedIssue")} value={value.issueId ?? ""} choices={(issues.data ?? []).map(i => ({ id: i.id, label: i.title }))} onChange={issueId => onChange({ ...value, issueId })} /> : null}
    </> : null}
    {value.type === "database" ? <Select empty label={t("databaseLabel")} value={value.databaseId} choices={pages.filter(p => p.database_schema != null).map(p => ({ id: p.id, label: p.title }))} onChange={databaseId => onChange({ type: "database", databaseId })} /> : null}
    {value.type !== "schedule" ? <>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("triggerWaitingHelp")}{value.type === "database" ? ` ${t("triggerDatabaseWaitingHelp")}` : value.event === "issue.status_changed" ? ` ${t("triggerStatusWaitingHelp")}` : value.event === "issue.assigned" ? ` ${t("triggerAssignmentWaitingHelp")}` : ""}</p>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("triggerDelay")}<Input type="number" min={0} max={120} value={value.delayMinutes ?? 0} onChange={e => onChange({ ...value, delayMinutes: Number(e.target.value) })} /></label>
      {value.type !== "event" || value.event !== "feedback.received" ? <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("conditionsLabel")}</h4>
        {value.conditions ? <ConditionEditor value={value.conditions} onChange={setConditions} onRemove={() => setConditions(undefined)} depth={0} schema={schema} database={value.type === "database"} choices={{ status: statusChoices, assignee: people, category: categories.map(c => ({ id: c.id, label: c.name })), priority: ["none", "low", "medium", "high", "urgent"].map(id => ({ id, label: priorityT(id as "none") })), effort: ["xs", "s", "m", "l", "xl"].map(id => ({ id, label: id.toUpperCase() })) }} /> : <Button type="button" size="sm" variant="outline" onClick={() => setConditions({ operator: "and", children: [value.type === "database" ? { field: "property", propertyId: schema[0]?.id ?? "", operator: "present" } : { field: "category", operator: "present" }] })}>{t("addCondition")}</Button>}
      </div> : null}
    </> : null}
  </div>;
}
function ConditionEditor({ value, onChange, onRemove, depth, schema, database, choices }: { value: RoutineCondition; onChange: (value: RoutineCondition) => void; onRemove: () => void; depth: number; schema: DatabaseProperty[]; database: boolean; choices: Record<string, Choice[]> }) {
  const t = useTranslations("Routines");
  const leaf = (): RoutineCondition => database ? { field: "property", propertyId: schema[0]?.id ?? "", operator: "present" } : { field: "category", operator: "present" };
  let content: ReactNode;
  if ("children" in value) {
    content = <>
      <Select label={t("conditionGroup")} value={value.operator} choices={[{ id: "and", label: t("matchAll") }, { id: "or", label: t("matchAny") }]} onChange={operator => onChange({ ...value, operator: operator as "and" | "or" })} />
      {value.children.map((child, i) => <ConditionEditor key={i} value={child} depth={depth + 1} schema={schema} database={database} choices={choices} onChange={next => onChange({ ...value, children: value.children.map((c, j) => i === j ? next : c) })} onRemove={() => value.children.length === 1 ? onRemove() : onChange({ ...value, children: value.children.filter((_, j) => i !== j) })} />)}
      <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={value.children.length >= 16} onClick={() => onChange({ ...value, children: [...value.children, leaf()] })}>{t("addCondition")}</Button><Button type="button" size="sm" variant="outline" disabled={depth >= 5 || value.children.length >= 16} onClick={() => onChange({ ...value, children: [...value.children, { operator: "or", children: [leaf()] }] })}>{t("addGroup")}</Button></div>
    </>;
  } else {
    const property = schema.find(p => p.id === value.propertyId);
    const collection = value.field === "category" || ["people", "multi_select"].includes(property?.type ?? "");
    const operators: ConditionOperator[] = ["present", "absent", ...(collection ? ["contains" as const] : ["eq" as const, "neq" as const, ...(!property || ["text", "url", "select"].includes(property.type) ? ["in" as const] : [])]), ...(["number", "date", "created_at"].includes(property?.type ?? "") ? ["gt" as const, "gte" as const, "lt" as const, "lte" as const] : [])];
    const options = value.field === "property" ? property?.type === "people" ? choices.assignee : property?.type === "checkbox" ? [{ id: "true", label: t("checked") }, { id: "false", label: t("unchecked") }] : property?.options?.map(o => ({ id: o.id, label: o.name })) : choices[value.field];
    const setValue = (raw: string) => onChange({ ...value, value: value.operator === "in" ? raw.split(",").map(v => v.trim()).filter(Boolean) : property?.type === "number" ? Number(raw) : property?.type === "checkbox" ? raw === "true" : raw });
    content = <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {database ? <Select empty label={t("conditionField")} value={value.propertyId ?? ""} choices={schema.map(p => ({ id: p.id, label: p.name }))} onChange={propertyId => onChange({ field: "property", propertyId, operator: "present" })} /> : <Select label={t("conditionField")} value={value.field} choices={Object.keys(choices).map(id => ({ id, label: t(`field_${id}` as "field_status") }))} onChange={field => onChange({ field: field as typeof value.field, operator: "present" })} />}
      <Select label={t("conditionOperator")} value={value.operator} choices={operators.map(id => ({ id, label: t(`operator_${id}` as "operator_eq") }))} onChange={operator => onChange({ ...value, operator: operator as ConditionOperator, value: undefined })} />
      {!["present", "absent"].includes(value.operator) ? options && value.operator === "in" ? <fieldset className="flex flex-col gap-1"><legend className="text-xs text-muted-foreground">{t("conditionValues")}</legend>{options.map(option => <label key={option.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Array.isArray(value.value) && value.value.includes(option.id)} onChange={e => { const selected = Array.isArray(value.value) ? value.value : []; onChange({ ...value, value: e.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id) }); }} />{option.label}</label>)}</fieldset> : options ? <Select empty label={t("conditionValue")} value={String(value.value ?? "")} choices={options} onChange={setValue} /> : <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t(value.operator === "in" ? "conditionValues" : "conditionValue")}<Input type={property?.type === "number" ? "number" : property?.type === "date" ? "date" : "text"} value={Array.isArray(value.value) ? value.value.join(", ") : String(value.value ?? "")} onChange={e => setValue(e.target.value)} /></label> : null}
    </div>;
  }
  return <fieldset className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">{content}<Button type="button" size="sm" variant="ghost" className="self-end" onClick={onRemove}>{t("removeCondition")}</Button></fieldset>;
}
export function RoutineTriggerSummary({ trigger, projectId }: { trigger?: RoutineTrigger; projectId?: string }) {
  const t = useTranslations("Routines");
  const statusT = useTranslations("Status");
  const { pages } = usePagesQuery(trigger?.type === "database" ? projectId ?? null : null);
  const target = trigger?.type === "database" ? pages.find(page => page.id === trigger.databaseId)?.title : trigger?.type === "event" && trigger.status ? statusT(trigger.status as "triage") : null;
  if (!trigger || trigger.type === "schedule") return null;
  return <p className="text-xs text-muted-foreground">{trigger.type === "database" ? t("trigger_database") : t(`event_${trigger.event.replaceAll(".", "_")}` as "event_issue_created")}{target ? ` · ${target}` : ""}</p>;
}
