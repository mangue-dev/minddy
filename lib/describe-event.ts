import { EFFORT_MAP, issueIdentifier, type IssueEffort } from "./issue-constants";
import { displayName } from "./display-name";
import { forgePrActor } from "./pr-events";
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
  /** Author of the feedback displayed (feedback thread) — the board is only a channel, not
 an actor: when we know the person who wrote, it is them that the
 line “submitted this feedback” names, with the face of the author file. */
  feedbackAuthor?: { label: string; seed: string } | null;
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
  /** "Recurrence" namespace (cadence → label) — for the recurrence events. */
  tRecurrence?: LabelT;
  /** Render a stored due-date value (ISO datetime or legacy date) for display. */
  formatDue: (value: string | null) => string;
}

/**
 * The fields filled by Smart-fill, as the timeline names them. The list
 * arrives in plain text from the base ("priority, effort, category_ids") and is translated
 * here: a wording frozen in writing would have frozen the author's language in the
 * ticket, and an English-speaking reader would read "priority" six months later.
 *
 * Joined to the comma, without final "and": the conjunction does not have the same place
 * depending on the language, and a timeline line is not a dialogue sentence.
 * An unknown field (name since removed) is skipped rather than rendered as is.
 */
const SMART_FILL_LABELS: Record<string, string> = {
  priority: "smartFillPriority",
  effort: "smartFillEffort",
  category_ids: "smartFillCategories",
  objective_id: "smartFillObjective",
};

function smartFilledFields(value: string | null, t: ActivityT): string {
  const labels = (value ?? "")
    .split(",")
    .map((f) => SMART_FILL_LABELS[f.trim()])
    .filter(Boolean)
    .map((key) => t(key));
  return labels.length > 0 ? labels.join(", ") : t("smartFillProperties");
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
 * Activity key for a pull request gesture, according to the forge: GitLab says
 * "merge request!123" where GitHub says "pull request #123".
 *
 * The provider ALWAYS reads `from_value` (cf. `forgeActorValue`), which
 * encodes it both for a webhook gesture — where it accompanies the login of
 * the actor — and for an in-app gesture, where it travels alone. `forgePrActor` falls to
 * on GitHub when the value is zero: this is the historical form.
 */
function prEventKey(
  e: IssueEvent,
  action:
    | "Approved"
    | "Accepted"
    | "Rejected"
    | "ChangesRequested"
    | "Opened"
    | "Reopened"
    | "Committed"
    | "Commented"
    | "CodeCommented"
): string {
  const { provider } = forgePrActor(e.from_value);
  return `${provider === "gitlab" ? "mr" : "pr"}${action}`;
}

const IMPORT_SOURCE_LABELS: Record<string, string> = {
  linear: "Linear",
  jira: "Jira",
  // A minddy export reread by minddy — moving from one project to another.
  minddy: "minddy",
  csv: "CSV",
  // Backfill of the repository linked to the activation of issue sync (MIN-97).
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
  const { t, tStatus, tPriority, tRecurrence, formatDue } = tr;
  if (e.type === "created") return t("created");
  // CSV importers (MIN-45): to_value carries the source.
  // The primer by brief (MIN-172) takes the same writing path, but it
  // doesn't matter about a tool: it's a text that has been cut. The name of a
  // product doesn't render that, so it has its own sentence.
  if (e.type === "imported")
    return e.to_value === "brief"
      ? t("importedFromBrief")
      : t("imported", {
          source: IMPORT_SOURCE_LABELS[e.to_value ?? ""] ?? "CSV",
        });
  if (e.type === "category_added")
    return t("categoryAdded", { name: categoryName(ctx, tr, e.to_value) });
  if (e.type === "category_removed")
    return t("categoryRemoved", { name: categoryName(ctx, tr, e.from_value) });
  // Recurrence (MIN-136): the completed ticket says what it generated —
  // `to_value` carries the following occurrence, `from_value` the cadence.
  if (e.type === "recurrence_spawned")
    return t("recurrenceSpawned", { ref: issueRef(ctx, tr, e.to_value) });
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
  // Life of the PR (to_value = its number): open it, push it, comment on it,
  // reread it. Issued by the agent (Numo), by in-app routes (actor = member)
  // or by GitHub/GitLab webhooks (actor = forge login).
  if (e.type === "pr_opened")
    return t(prEventKey(e, "Opened"), { number: e.to_value ?? "" });
  if (e.type === "pr_reopened")
    return t(prEventKey(e, "Reopened"), { number: e.to_value ?? "" });
  if (e.type === "pr_committed")
    return t(prEventKey(e, "Committed"), { number: e.to_value ?? "" });
  if (e.type === "pr_commented")
    return t(prEventKey(e, "Commented"), { number: e.to_value ?? "" });
  if (e.type === "pr_code_commented")
    return t(prEventKey(e, "CodeCommented"), { number: e.to_value ?? "" });
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
        // Writing from the linked repository: the actor line already says “GitHub”,
        // the sentence therefore says where the change comes from rather than just the diff.
        // Two possible causes — the remote exit closing (MIN-97) or the
        // pull request which merges (MIN-143) — hence the formula which names the
        // DEPOSIT and not one of the two.
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
        // Two sentences, because the two gestures are not the same: or the
        // model has read the attribution rules, or no one has read them and the
        // ticket reverted to the default owner.
        if (e.via_smart_assign)
          return e.smart_assign_ai
            ? t("smartAssignedByRules", { to: memberName(ctx, tr, e.to_value) })
            : t("smartAssigned", { to: memberName(ctx, tr, e.to_value) });
        return t("assigneeChanged", {
          from: memberName(ctx, tr, e.from_value),
          to: memberName(ctx, tr, e.to_value),
        });
      // Smart-fill (MIN-260): ONE event for the four fields, placed one
      // same gesture at creation. The actor's line already says "Smart-fill", the
      // sentence therefore says WHAT he has completed — and only what he really has
      // filled (the server does not include the fields that the author had already entered).
      case "smart_fill":
        return t("smartFilled", { fields: smartFilledFields(e.to_value, t) });
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
      // The cadence is said in full (“Every week”); THE
      // indent has nothing to show other than itself.
      case "recurrence":
        return e.to_value
          ? t("recurrenceSet", { to: tRecurrence?.(e.to_value) ?? e.to_value })
          : t("recurrenceCleared");
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

/**
 * Localized description of a PAGE activity event, without the actor (MIN-278).
 *
 * The shortest of the four describers, and that's the point: a page has no
 * fields to track — no status, no priority, no assigned. What we
 * come to read is WHO happened, and when. The rest is read in the history
 * (MIN-277), which renders the states themselves.
 *
 * Minddy's identity rule does NOT play out here but in the actor: an agent write carries `via_assistant`, and the line therefore names Numo, then
 * that `actor_id` is that of the human account which enabled it. Without this flag,
 * the activity would say "Clément modified this page" of a text that Clément did not
 * write. The sentence is the same in both cases.
 */
export function describePageEvent(
  e: IssueEvent,
  _ctx: EventContext,
  tr: EventTranslators
): string {
  const { t } = tr;
  switch (e.type) {
    case "page_created":
      return t("pageCreated");
    case "page_trashed":
      return t("pageTrashed");
    case "page_restored":
      return t("pageRestored");
    default:
      return t("pageUpdated");
  }
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

  // Entry into the system: the channel is carried by `field`.
  if (e.type === "created") return t(`feedbackCreated_${e.field ?? "board"}`);
  if (e.type === "promoted")
    return t("feedbackPromoted", { ref: issueRef(ctx, tr, e.to_value) });
  if (e.type === "linked")
    return t("feedbackLinked", { ref: issueRef(ctx, tr, e.to_value) });
  if (e.type === "unlinked") return t("feedbackUnlinked");
  // to_value = title of the absorbed duplicate.
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
      // `rejected` has been folded into the `spam` status: the lines before the
      // toggle still carry it, and must continue reading.
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
