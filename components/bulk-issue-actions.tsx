"use client";

import { useState } from "react";
import { cn } from "mangue-ui";
import { EFFORTS, PRIORITIES, STATUSES, type IssueEffort, type IssuePriority, type IssueStatus } from "@/lib/issue-constants";
import type { IssueUpdateInput, Member } from "@/lib/types";

/** Compact action strip shown while one or more cards are Shift-selected. */
export function BulkIssueActions({
  count,
  members,
  onUpdate,
  onDelete,
  onClear,
}: {
  count: number;
  members: Member[];
  onUpdate: (patch: IssueUpdateInput) => void;
  onDelete?: () => void;
  onClear: () => void;
}) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [effort, setEffort] = useState("");
  const [assignee, setAssignee] = useState("");
  const apply = (kind: "status" | "priority" | "effort" | "assignee", value: string) => {
    if (!value) return;
    if (kind === "status") onUpdate({ status: value as IssueStatus });
    if (kind === "priority") onUpdate({ priority: value as IssuePriority });
    if (kind === "effort") onUpdate({ effort: value as IssueEffort });
    if (kind === "assignee") onUpdate({ assignee_id: value === "unassigned" ? null : value });
  };
  const selectClass = "h-8 rounded-md border border-border bg-background px-2 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 desktop:px-6">
      <span className="text-sm font-medium">{count} sélectionné(s)</span>
      <select className={selectClass} value={status} onChange={(e) => { setStatus(e.target.value); apply("status", e.target.value); }} aria-label="Changer le statut">
        <option value="">Statut</option>
        {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
      </select>
      <select className={selectClass} value={priority} onChange={(e) => { setPriority(e.target.value); apply("priority", e.target.value); }} aria-label="Changer la priorité">
        <option value="">Priorité</option>
        {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
      </select>
      <select className={selectClass} value={effort} onChange={(e) => { setEffort(e.target.value); apply("effort", e.target.value); }} aria-label="Changer l'effort">
        <option value="">Effort</option>
        {EFFORTS.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
      </select>
      <select className={selectClass} value={assignee} onChange={(e) => { setAssignee(e.target.value); apply("assignee", e.target.value); }} aria-label="Changer l'assigné">
        <option value="">Assigné</option>
        <option value="unassigned">Non assigné</option>
        {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name ?? member.user_id}</option>)}
      </select>
      {onDelete && <button type="button" className={cn(selectClass, "text-destructive")} onClick={onDelete}>Supprimer</button>}
      <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={onClear}>Désélectionner</button>
    </div>
  );
}
