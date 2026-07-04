import {
  STATUS_MAP,
  PRIORITY_MAP,
  EFFORT_MAP,
  issueIdentifier,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "./issue-constants";
import type { Category, Issue, IssueEvent, Member, Objective } from "./types";

export interface EventContext {
  members: Member[];
  objectives: Objective[];
  categories: Category[];
  issues: Issue[];
  projectKey: string;
}

function memberName(ctx: EventContext, id: string | null): string {
  if (!id) return "personne";
  const m = ctx.members.find((x) => x.user_id === id);
  return m?.full_name || m?.email || "un utilisateur";
}
function objectiveName(ctx: EventContext, id: string | null): string {
  if (!id) return "aucun";
  return ctx.objectives.find((o) => o.id === id)?.name ?? "un objectif";
}
function categoryName(ctx: EventContext, id: string | null): string {
  if (!id) return "une catégorie";
  return ctx.categories.find((c) => c.id === id)?.name ?? "une catégorie";
}
function issueRef(ctx: EventContext, id: string | null): string {
  if (!id) return "une issue";
  const i = ctx.issues.find((x) => x.id === id);
  return i ? issueIdentifier(ctx.projectKey, i.number) : "une issue";
}
const statusLabel = (v: string | null) =>
  v ? STATUS_MAP[v as IssueStatus]?.label ?? v : "—";
const priorityLabel = (v: string | null) =>
  v ? PRIORITY_MAP[v as IssuePriority]?.label ?? v : "—";
const effortLabel = (v: string | null) =>
  v ? EFFORT_MAP[v as IssueEffort]?.label ?? v : "—";

/** Human-readable French description of an activity event (without the actor). */
export function describeEvent(e: IssueEvent, ctx: EventContext): string {
  if (e.type === "created") return "a créé l'issue";
  if (e.type === "category_added")
    return `a ajouté la catégorie « ${categoryName(ctx, e.to_value)} »`;
  if (e.type === "category_removed")
    return `a retiré la catégorie « ${categoryName(ctx, e.from_value)} »`;
  if (e.type === "sub_issue_added")
    return `a ajouté la sous-issue ${issueRef(ctx, e.to_value)}`;
  if (e.type === "sub_issue_removed")
    return `a retiré la sous-issue ${issueRef(ctx, e.to_value)}`;

  if (e.type === "updated") {
    switch (e.field) {
      case "title":
        return "a renommé l'issue";
      case "description":
        return "a modifié la description";
      case "status":
        return `a changé le statut : ${statusLabel(e.from_value)} → ${statusLabel(e.to_value)}`;
      case "priority":
        return `a changé la priorité : ${priorityLabel(e.from_value)} → ${priorityLabel(e.to_value)}`;
      case "effort":
        return `a changé l'effort : ${effortLabel(e.from_value)} → ${effortLabel(e.to_value)}`;
      case "assignee_id":
        return `a réassigné : ${memberName(ctx, e.from_value)} → ${memberName(ctx, e.to_value)}`;
      case "objective_id":
        return `a changé l'objectif : ${objectiveName(ctx, e.from_value)} → ${objectiveName(ctx, e.to_value)}`;
      case "due_date":
        return `a changé l'échéance : ${e.from_value ?? "—"} → ${e.to_value ?? "—"}`;
      case "parent":
        return e.to_value
          ? `a rattaché l'issue à ${issueRef(ctx, e.to_value)}`
          : "a détaché l'issue de son parent";
      default:
        return "a mis à jour l'issue";
    }
  }
  return "a mis à jour l'issue";
}
