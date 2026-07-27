import { EFFORT_MAP, issueIdentifier, type IssueEffort } from "./issue-constants";
import { displayName } from "./display-name";
import { forgePrActor, isForgePrEvent } from "./pr-events";
import type { Category, Issue, IssueEvent, Member, Objective } from "./types";

/** Translator scoped to the "Activity" namespace (next-intl useTranslations). */
type ActivityT = (key: string, values?: Record<string, string | number>) => string;
/** Translator that maps an enum value to its localized label. */
type LabelT = (value: string) => string;

/** Data the activity feed needs; passed by the caller (issue-side-panel). */
export interface EventContext {
  members: Member[];
  objectives: Objective[];
  categories: Category[];
  issues: Issue[];
  projectKey: string;
}

/** Translators the caller resolves via useTranslations and passes in. */
export interface EventTranslators {
  /** "Activity" namespace. */
  t: ActivityT;
  /** "Status" namespace (value → label). */
  tStatus: LabelT;
  /** "Priority" namespace (value → label). */
  tPriority: LabelT;
  /** "ObjectiveStatus" namespace (value → label) — for objective events. */
  tObjectiveStatus?: LabelT;
  /** "PublicFeedback" status namespace (value → label) — for feedback events. */
  tFeedbackStatus?: LabelT;
  /** Render a stored due-date value (ISO datetime or legacy date) for display. */
  formatDue: (value: string | null) => string;
}

function memberName(ctx: EventContext, tr: EventTranslators, id: string | null): string {
  if (!id) return tr.t("memberNobody");
  const m = ctx.members.find((x) => x.user_id === id);
  return displayName(m, tr.t("memberSomeone"));
}
function objectiveName(ctx: EventContext, tr: EventTranslators, id: string | null): string {
  if (!id) return tr.t("objectiveNone");
  return ctx.objectives.find((o) => o.id === id)?.name ?? tr.t("objectiveSome");
}
function categoryName(ctx: EventContext, tr: EventTranslators, id: string | null): string {
  if (!id) return tr.t("categorySome");
  return ctx.categories.find((c) => c.id === id)?.name ?? tr.t("categorySome");
}
function issueRef(ctx: EventContext, tr: EventTranslators, id: string | null): string {
  if (!id) return tr.t("issueSome");
  const i = ctx.issues.find((x) => x.id === id);
  return i ? issueIdentifier(ctx.projectKey, i.number) : tr.t("issueSome");
}
/**
 * Clé d'activité d'une action de review, selon la forge : GitLab dit « merge
 * request !123 » là où GitHub dit « pull request #123 ». Le provider n'est
 * encodé (dans `from_value`) que pour les actions venues d'un webhook — une
 * action faite in-app porte un acteur minddy et reste sur le vocabulaire PR.
 */
function prEventKey(
  e: IssueEvent,
  action: "Approved" | "Accepted" | "Rejected" | "ChangesRequested"
): string {
  const provider = isForgePrEvent(e) ? forgePrActor(e.from_value).provider : "github";
  return `${provider === "gitlab" ? "mr" : "pr"}${action}`;
}

const IMPORT_SOURCE_LABELS: Record<string, string> = {
  linear: "Linear",
  jira: "Jira",
  csv: "CSV",
  // Backfill du dépôt lié à l'activation de la synchro d'issues (MIN-97).
  github: "GitHub",
  gitlab: "GitLab",
};

const emptyDash = "—";
const effortLabel = (v: string | null) =>
  v ? EFFORT_MAP[v as IssueEffort]?.label ?? v : emptyDash;

/** Localized description of an activity event (without the actor). The caller
    supplies the translators (from useTranslations). */
export function describeEvent(
  e: IssueEvent,
  ctx: EventContext,
  tr: EventTranslators
): string {
  const { t, tStatus, tPriority, formatDue } = tr;
  if (e.type === "created") return t("created");
  // CSV importers (MIN-45): to_value carries the source.
  if (e.type === "imported")
    return t("imported", {
      source: IMPORT_SOURCE_LABELS[e.to_value ?? ""] ?? "CSV",
    });
  if (e.type === "category_added")
    return t("categoryAdded", { name: categoryName(ctx, tr, e.to_value) });
  if (e.type === "category_removed")
    return t("categoryRemoved", { name: categoryName(ctx, tr, e.from_value) });
  if (e.type === "sub_issue_added")
    return t("subIssueAdded", { ref: issueRef(ctx, tr, e.to_value) });
  if (e.type === "sub_issue_removed")
    return t("subIssueRemoved", { ref: issueRef(ctx, tr, e.to_value) });
  // Relations (MIN-25): `field` carries the perspective type (blocks /
  // blocked_by / related), `to_value` the other issue.
  if (e.type === "relation_added")
    return t(`relationAdded_${e.field ?? "related"}`, {
      ref: issueRef(ctx, tr, e.to_value),
    });
  if (e.type === "relation_removed")
    return t(`relationRemoved_${e.field ?? "related"}`, {
      ref: issueRef(ctx, tr, e.to_value),
    });
  // Plan task transitions: to_value carries the task text.
  if (e.type === "agent_launched")
    return t("agentLaunched", { model: e.to_value ?? "" });
  // Review PR (to_value = numéro de la PR). Seules les actions accepter /
  // refuser / approuver / demander des changements sont tracées — pas les
  // commentaires. Émises in-app (acteur = membre) ou par le webhook GitHub.
  if (e.type === "pr_approved")
    return t(prEventKey(e, "Approved"), { number: e.to_value ?? "" });
  if (e.type === "pr_accepted")
    return t(prEventKey(e, "Accepted"), { number: e.to_value ?? "" });
  if (e.type === "pr_rejected")
    return t(prEventKey(e, "Rejected"), { number: e.to_value ?? "" });
  if (e.type === "pr_changes_requested")
    return t(prEventKey(e, "ChangesRequested"), { number: e.to_value ?? "" });
  if (e.type === "plan_task_completed")
    return t("planTaskCompleted", { text: e.to_value ?? "" });
  if (e.type === "plan_task_started")
    return t("planTaskStarted", { text: e.to_value ?? "" });
  if (e.type === "plan_task_cancelled")
    return t("planTaskCancelled", { text: e.to_value ?? "" });
  if (e.type === "plan_task_reopened")
    return t("planTaskReopened", { text: e.to_value ?? "" });

  if (e.type === "updated") {
    switch (e.field) {
      case "title":
        return t("titleChanged");
      case "description":
        return t("descriptionChanged");
      case "plan":
        return t("planChanged");
      case "status":
        // Synchro du dépôt lié (MIN-97) : la ligne d'acteur dit déjà « GitHub »,
        // la phrase dit donc d'où vient le changement plutôt que le seul diff.
        if (e.forge_sync)
          return t("forgeStatusSynced", {
            to: e.to_value ? tStatus(e.to_value) : emptyDash,
          });
        return t("statusChanged", {
          from: e.from_value ? tStatus(e.from_value) : emptyDash,
          to: e.to_value ? tStatus(e.to_value) : emptyDash,
        });
      case "priority":
        return t("priorityChanged", {
          from: e.from_value ? tPriority(e.from_value) : emptyDash,
          to: e.to_value ? tPriority(e.to_value) : emptyDash,
        });
      case "effort":
        return t("effortChanged", {
          from: effortLabel(e.from_value),
          to: effortLabel(e.to_value),
        });
      case "assignee_id":
        // Smart Assign writes a dedicated sentence — the actor line already
        // reads "Smart Assign", so "reassigned: — → X" would be redundant.
        if (e.via_smart_assign)
          return t("smartAssigned", { to: memberName(ctx, tr, e.to_value) });
        return t("assigneeChanged", {
          from: memberName(ctx, tr, e.from_value),
          to: memberName(ctx, tr, e.to_value),
        });
      case "objective_id":
        return t("objectiveChanged", {
          from: objectiveName(ctx, tr, e.from_value),
          to: objectiveName(ctx, tr, e.to_value),
        });
      case "due_date":
        return t("dueDateChanged", {
          from: formatDue(e.from_value),
          to: formatDue(e.to_value),
        });
      case "parent":
        return e.to_value
          ? t("parentAttached", { ref: issueRef(ctx, tr, e.to_value) })
          : t("parentDetached");
      // Cycles (MIN-32): the values are cycle ids — meaningless to a reader,
      // so the sentence only says joined/left the assignee's cycle.
      case "cycle_id":
        return e.to_value ? t("cycleAdded") : t("cycleRemoved");
      default:
        return t("updated");
    }
  }
  return t("updated");
}

/** Localized description of an OBJECTIVE activity event (without the actor).
    Twin of describeEvent for the objective side panel: objective statuses use
    the ObjectiveStatus label set, and the tracked fields differ. */
export function describeObjectiveEvent(
  e: IssueEvent,
  ctx: EventContext,
  tr: EventTranslators
): string {
  const { t, formatDue } = tr;
  const objStatus = (v: string) => tr.tObjectiveStatus?.(v) ?? v;
  if (e.type === "created") return t("objectiveCreated");

  if (e.type === "updated") {
    switch (e.field) {
      case "name":
        return t("objectiveNameChanged");
      case "description":
        return t("descriptionChanged");
      case "status":
        return t("objectiveStatusChanged", {
          from: e.from_value ? objStatus(e.from_value) : emptyDash,
          to: e.to_value ? objStatus(e.to_value) : emptyDash,
        });
      case "lead_user_id":
        return t("objectiveLeadChanged", {
          from: memberName(ctx, tr, e.from_value),
          to: memberName(ctx, tr, e.to_value),
        });
      case "target_date":
        return t("objectiveTargetDateChanged", {
          from: formatDue(e.from_value),
          to: formatDue(e.to_value),
        });
      case "color":
        return t("objectiveColorChanged");
      default:
        return t("objectiveUpdated");
    }
  }
  return t("objectiveUpdated");
}

/** Localized description of a FEEDBACK activity event (without the actor).
    Twin of describeEvent for the feedback detail panel: feedback posts use the
    PublicFeedback status label set, and the tracked actions differ (promotion,
    link, merge, team response). */
export function describeFeedbackEvent(
  e: IssueEvent,
  ctx: EventContext,
  tr: EventTranslators
): string {
  const { t } = tr;
  const fbStatus = (v: string) => tr.tFeedbackStatus?.(v) ?? v;

  // Entrée dans le système : le canal est porté par `field`.
  if (e.type === "created") return t(`feedbackCreated_${e.field ?? "board"}`);
  if (e.type === "promoted")
    return t("feedbackPromoted", { ref: issueRef(ctx, tr, e.to_value) });
  if (e.type === "linked")
    return t("feedbackLinked", { ref: issueRef(ctx, tr, e.to_value) });
  if (e.type === "unlinked") return t("feedbackUnlinked");
  // to_value = titre du doublon absorbé.
  if (e.type === "merged")
    return t("feedbackMerged", { title: e.to_value ?? "" });
  if (e.type === "merge_undone")
    return t("feedbackMergeUndone", { title: e.to_value ?? "" });

  if (e.type === "updated") {
    switch (e.field) {
      case "title":
        return t("feedbackTitleChanged");
      case "body":
        return t("feedbackBodyChanged");
      case "status":
        return t("feedbackStatusChanged", {
          from: e.from_value ? fbStatus(e.from_value) : emptyDash,
          to: e.to_value ? fbStatus(e.to_value) : emptyDash,
        });
      case "team_response":
        return e.to_value === "cleared"
          ? t("feedbackResponseRemoved")
          : t("feedbackResponded");
      case "is_public":
        return e.to_value === "private"
          ? t("feedbackMadePrivate")
          : t("feedbackMadePublic");
      case "review_state":
        return e.to_value === "rejected"
          ? t("feedbackRejected")
          : t("feedbackPublished");
      default:
        return t("feedbackUpdated");
    }
  }
  return t("feedbackUpdated");
}
