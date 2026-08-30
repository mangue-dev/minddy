// The context of Numo, seen as a LIST of pills.
//
// `AssistantPageContext` is a flat object (an open ticket, a view, a
// cycle…): practical to send, illegible to display. This module makes
// pills — one per context element — and knows how to go back the other way:
// when the user turns off the eye of a pill, we remove the sent context
// EXACTLY the fields that this pill represented. The message therefore persists
// what Numo actually saw, not what the page was posting.

import type { useTranslations } from "next-intl";
import { orbSeedOr } from "@/lib/project-orb-colors";
import type {
  AssistantPageContext,
  AssistantPinnedContext,
} from "@/lib/assistant-types";

export type AssistantContextKind =
  | "project"
  | "issue"
  | "issues"
  | "objective"
  | "feedback"
  | "routine"
  | "inbox"
  | "page"
  | "view"
  | "cycle"
  | "settings"
  | "member";

export interface AssistantContextChip {
  /** Stable identity of the pill — this is what we deselect. */
  key: string;
  kind: AssistantContextKind;
  /** What is written on the pill. */
  label: string;
  /** Tooltip: the detail that the wording left out. */
  tooltip: string;
  /**
   * Members: the seed of the portrait. Projects: the id, seed of the orb.
   * In both cases the pill shows the REAL figure of the thing rather
   * than a generic icon.
   */
  avatarSeed?: string;
  /** Projects: the imported favicon, when the project has one. */
  iconUrl?: string | null;
  /** Objectifs : leur couleur — celle que porte leur cible, ici comme ailleurs. */
  color?: string | null;
  /** Wiki pages: their emoji, when they have one. */
  icon?: string | null;
  /** Hand pinned (@ button) — removeable, where ambient turns off. */
  pinned?: boolean;
}

/** Pill key of a pinned context. */
export function pinnedKey(item: AssistantPinnedContext): string {
  return `pinned:${item.kind}:${item.id}`;
}

/** The Assistant namespace translator. Without the namespace, TypeScript gives up
 (TS2589) and no longer checks anything — see CLAUDE.md. */
type Translate = ReturnType<typeof useTranslations<"Assistant">>;

/**
 * A context's pills, in the order they read: project
 * first (largest), then what's open, then view and cycle,
 * then what the user pinned themselves.
 *
 * `scopeProjectId` is the scope of the conversation: on a page without
 * ambient context, it is still the current project, and it deserves its pill.
 */
export function contextChips(
  ctx: AssistantPageContext | null | undefined,
  opts: {
    t: Translate;
    scopeProjectId?: string | null;
    /** Resolves a project id (name + icon) via the client projects context. */
    project?: (
      id: string,
    ) =>
      | { name: string; icon_url: string | null; orb_seed: string | null }
      | undefined;
  },
): AssistantContextChip[] {
  const { t } = opts;
  const chips: AssistantContextChip[] = [];

  const projectId = ctx?.projectId ?? opts.scopeProjectId ?? undefined;
  if (projectId) {
    const project = opts.project?.(projectId);
    chips.push({
      key: "project",
      kind: "project",
      label: project?.name ?? t("contextProject"),
      tooltip: project
        ? t("contextProjectTooltip", { name: project.name })
        : t("contextProject"),
      avatarSeed: orbSeedOr(projectId, project?.orb_seed),
      iconUrl: project?.icon_url ?? null,
    });
  }

  if (ctx?.issueId) {
    // The identifier alone: ​​short, stable, it is enough to recognize the ticket.
    // The title goes into the tooltip.
    chips.push({
      key: "issue",
      kind: "issue",
      label: ctx.issueIdentifier ?? ctx.issueTitle ?? t("contextIssue"),
      tooltip: ctx.issueTitle ?? t("contextIssue"),
    });
  } else if (ctx?.issueIds && ctx.issueIds.length > 0) {
    // Group selection of a board: the account is enough on the pill, the list
    // identifiers fit in the tooltip.
    chips.push({
      key: "issues",
      kind: "issues",
      label: t("contextIssuesSelected", { count: ctx.issueIds.length }),
      tooltip: ctx.issueIdentifiers?.length
        ? ctx.issueIdentifiers.join(", ")
        : t("contextIssuesSelected", { count: ctx.issueIds.length }),
    });
  }

  if (ctx?.inbox) {
    chips.push({
      key: "inbox",
      kind: "inbox",
      label: t("contextInbox"),
      tooltip: t("contextInboxTooltip"),
    });
  }

  if (ctx?.settings) {
    const label =
      ctx.settings === "account"
        ? t("contextAccountSettings")
        : t("contextProjectSettings");
    chips.push({
      key: "settings",
      kind: "settings",
      label,
      tooltip: label,
    });
  }

  if (ctx?.objectiveId) {
    chips.push({
      key: "objective",
      kind: "objective",
      label: ctx.objectiveName ?? t("contextObjective"),
      tooltip: t("contextObjective"),
      color: ctx.objectiveColor ?? null,
    });
  }

  if (ctx?.feedbackId) {
    chips.push({
      key: "feedback",
      kind: "feedback",
      label: ctx.feedbackTitle ?? t("contextFeedback"),
      tooltip: t("contextFeedback"),
    });
  }

  if (ctx?.pageId) {
    chips.push({
      key: "page",
      kind: "page",
      label: ctx.pageTitle?.trim() || t("contextPage"),
      tooltip: t("contextPage"),
      icon: ctx.pageIcon ?? null,
    });
  }

  if (ctx?.routineId) {
    chips.push({
      key: "routine",
      kind: "routine",
      label: ctx.routineTitle ?? t("contextRoutine"),
      tooltip: t("contextRoutine"),
    });
  }

  if (ctx?.viewId || ctx?.onglet) {
    // The name of the view takes precedence; the tab only concerns persistent messages
    // before v2 views (only one tab since).
    const label =
      ctx.viewName ??
      (ctx.onglet === "my" ? t("contextBoardMy") : t("contextBoardAll"));
    chips.push({
      key: "view",
      kind: "view",
      label,
      tooltip: t("contextBoard"),
    });
  }

  if (ctx?.cycleId) {
    const label = t("contextCycle", { label: ctx.cycleLabel ?? "" });
    chips.push({ key: "cycle", kind: "cycle", label, tooltip: label });
  }

  for (const item of ctx?.pinned ?? []) {
    // Pinned or ambient, a project keeps the same figure: its orb (or its
    // favicon), resolved here as the scope one.
    const project =
      item.kind === "project" ? opts.project?.(item.id) : undefined;
    chips.push({
      key: pinnedKey(item),
      kind: item.kind,
      label: item.label,
      tooltip: item.detail ?? item.label,
      ...(item.kind === "member"
        ? { avatarSeed: item.avatarSeed ?? item.id }
        : item.kind === "project"
          ? { avatarSeed: orbSeedOr(item.id, project?.orb_seed) }
          : {}),
      ...(item.kind === "project"
        ? { iconUrl: project?.icon_url ?? null }
        : {}),
      ...(item.kind === "objective" ? { color: item.color ?? null } : {}),
      ...(item.kind === "page" ? { icon: item.icon ?? null } : {}),
      pinned: true,
    });
  }

  return chips;
}

/** The fields that each ambient pill represents — what turning off the eye removes. */
const FIELDS_BY_KEY: Record<string, (keyof AssistantPageContext)[]> = {
  project: ["projectId"],
  inbox: ["inbox"],
  settings: ["settings"],
  // The PR follows its ticket: it only exists in the prompt attached to it.
  issue: [
    "issueId",
    "issueIdentifier",
    "issueTitle",
    "prNumber",
    "prState",
    "prRunId",
  ],
  issues: ["issueIds", "issueIdentifiers", "issueTitles"],
  objective: ["objectiveId", "objectiveName", "objectiveColor"],
  feedback: ["feedbackId", "feedbackTitle"],
  routine: ["routineId", "routineTitle"],
  page: ["pageId", "pageTitle", "pageIcon"],
  view: ["viewId", "viewName", "onglet"],
  cycle: ["cycleId", "cycleLabel"],
};

/**
 * The context actually sent: that of the page, minus the extinguished pills.
 * Returns `null` when there is nothing left — the API then does not attach any block of
 * context to the prompt.
 */
export function applyContextSelection(
  ctx: AssistantPageContext | null | undefined,
  disabled: ReadonlySet<string>,
): AssistantPageContext | null {
  if (!ctx) return null;
  const next: AssistantPageContext = { ...ctx };

  for (const [key, fields] of Object.entries(FIELDS_BY_KEY)) {
    if (!disabled.has(key)) continue;
    for (const field of fields) delete next[field];
  }

  if (next.pinned) {
    const kept = next.pinned.filter((item) => !disabled.has(pinnedKey(item)));
    if (kept.length > 0) next.pinned = kept;
    else delete next.pinned;
  }

  const hasAnything = Object.values(next).some((v) => v !== undefined);
  return hasAnything ? next : null;
}

/**
 * The context of the page enriched with the scope (the current project) and the
 * pinned elements — the full form, before deselection.
 */
export function withPinnedContext(
  ctx: AssistantPageContext | null | undefined,
  opts: { scopeProjectId?: string | null; pinned: AssistantPinnedContext[] },
): AssistantPageContext | null {
  const projectId = ctx?.projectId ?? opts.scopeProjectId ?? undefined;
  if (!ctx && !projectId && opts.pinned.length === 0) return null;
  return {
    ...ctx,
    ...(projectId ? { projectId } : {}),
    ...(opts.pinned.length > 0 ? { pinned: opts.pinned } : {}),
  };
}
