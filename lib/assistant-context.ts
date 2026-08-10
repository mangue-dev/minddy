// Le contexte de Numo, vu comme une LISTE de pilules.
//
// `AssistantPageContext` est un objet plat (un ticket ouvert, une vue, un
// cycle…) : pratique à envoyer, illisible à afficher. Ce module en fait des
// pilules — une par élément de contexte — et sait refaire le chemin inverse :
// quand l'utilisateur éteint l'œil d'une pilule, on retire du contexte envoyé
// EXACTEMENT les champs que cette pilule représentait. Le message persiste donc
// ce que Numo a réellement vu, pas ce que la page publiait.

import type { useTranslations } from "next-intl";
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
  | "page"
  | "view"
  | "cycle"
  | "member";

export interface AssistantContextChip {
  /** Identité stable de la pilule — c'est elle qu'on désélectionne. */
  key: string;
  kind: AssistantContextKind;
  /** Ce qui est écrit sur la pilule. */
  label: string;
  /** Infobulle : le détail que le libellé a laissé de côté. */
  tooltip: string;
  /**
   * Membres : la graine du portrait. Projets : l'id, graine de l'orbe.
   * Dans les deux cas la pilule montre la VRAIE figure de la chose plutôt
   * qu'une icône générique.
   */
  avatarSeed?: string;
  /** Projets : le favicon importé, quand le projet en a un. */
  iconUrl?: string | null;
  /** Objectifs : leur couleur — celle que porte leur cible, ici comme ailleurs. */
  color?: string | null;
  /** Épinglé à la main (bouton @) — retirable, là où l'ambiant s'éteint. */
  pinned?: boolean;
}

/** Clé de pilule d'un contexte épinglé. */
export function pinnedKey(item: AssistantPinnedContext): string {
  return `pinned:${item.kind}:${item.id}`;
}

/** Le traducteur du namespace Assistant. Sans le namespace, TypeScript renonce
    (TS2589) et ne vérifie plus rien — voir CLAUDE.md. */
type Translate = ReturnType<typeof useTranslations<"Assistant">>;

/**
 * Les pilules d'un contexte, dans l'ordre où elles se lisent : le projet
 * d'abord (le plus large), puis ce qui est ouvert, puis la vue et le cycle,
 * puis ce que l'utilisateur a épinglé lui-même.
 *
 * `scopeProjectId` est la portée de la conversation : sur une page sans
 * contexte ambiant, c'est encore le projet courant, et il mérite sa pilule.
 */
export function contextChips(
  ctx: AssistantPageContext | null | undefined,
  opts: {
    t: Translate;
    scopeProjectId?: string | null;
    /** Résout un id de projet (nom + icône) via le contexte projets du client. */
    project?: (id: string) => { name: string; icon_url: string | null } | undefined;
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
      avatarSeed: projectId,
      iconUrl: project?.icon_url ?? null,
    });
  }

  if (ctx?.issueId) {
    // L'identifiant seul : court, stable, il suffit à reconnaître le ticket.
    // Le titre part dans l'infobulle.
    chips.push({
      key: "issue",
      kind: "issue",
      label: ctx.issueIdentifier ?? ctx.issueTitle ?? t("contextIssue"),
      tooltip: ctx.issueTitle ?? t("contextIssue"),
    });
  } else if (ctx?.issueIds && ctx.issueIds.length > 0) {
    // Sélection groupée d'un board : le compte suffit sur la pilule, la liste
    // des identifiants tient dans l'infobulle.
    chips.push({
      key: "issues",
      kind: "issues",
      label: t("contextIssuesSelected", { count: ctx.issueIds.length }),
      tooltip: ctx.issueIdentifiers?.length
        ? ctx.issueIdentifiers.join(", ")
        : t("contextIssuesSelected", { count: ctx.issueIds.length }),
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
    // Le nom de la vue prime ; l'onglet ne concerne que les messages persistés
    // avant les vues v2 (un seul onglet depuis).
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
    // Épinglé ou ambiant, un projet garde la même figure : son orbe (ou son
    // favicon), résolu ici comme celui de la portée.
    const project = item.kind === "project" ? opts.project?.(item.id) : undefined;
    chips.push({
      key: pinnedKey(item),
      kind: item.kind,
      label: item.label,
      tooltip: item.detail ?? item.label,
      ...(item.kind === "member"
        ? { avatarSeed: item.avatarSeed ?? item.id }
        : item.kind === "project"
          ? { avatarSeed: item.id }
          : {}),
      ...(item.kind === "project" ? { iconUrl: project?.icon_url ?? null } : {}),
      ...(item.kind === "objective" ? { color: item.color ?? null } : {}),
      pinned: true,
    });
  }

  return chips;
}

/** Les champs que chaque pilule ambiante représente — ce qu'éteindre l'œil retire. */
const FIELDS_BY_KEY: Record<string, (keyof AssistantPageContext)[]> = {
  project: ["projectId"],
  // La PR suit son ticket : elle n'existe dans le prompt que rattachée à lui.
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
 * Le contexte réellement envoyé : celui de la page, moins les pilules éteintes.
 * Rend `null` quand il ne reste rien — l'API n'attache alors aucun bloc de
 * contexte au prompt.
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
 * Le contexte de la page enrichi de la portée (le projet courant) et des
 * éléments épinglés — la forme complète, avant désélection.
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
