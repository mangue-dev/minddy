"use client";

import type { ProjectIconChoice } from "@/components/project-icon-picker";
import type { RepoProviderId } from "./repo-providers";

/**
 * Le brouillon du wizard de création de projet.
 *
 * Le projet n'est créé qu'à la toute dernière étape : tout ce que l'utilisateur
 * remplit avant est cet objet-là. Il vit CÔTÉ SERVEUR (table `project_drafts`)
 * dès que le nom du projet est posé — c'est-à-dire dès qu'il y a quelque chose à
 * nommer dans la barre latérale, où le brouillon prend la place du projet qu'il
 * deviendra. Fermer la modale en route n'est donc plus un abandon : on repart de
 * l'étape où l'on s'était arrêté, d'une session à l'autre et d'un appareil à
 * l'autre.
 *
 * Ce module ne porte que la FORME du brouillon et la traduction ligne ↔ objet ;
 * les allers-retours réseau sont dans lib/project-drafts-api.ts.
 *
 * Reste ici un usage de `sessionStorage`, et un seul : l'étape « Relier un
 * dépôt » peut quitter la page en plein écran (installation de l'app GitHub,
 * autorisation OAuth GitLab), et le callback revient sur `/home?setup=git` sans
 * rien pouvoir dire du brouillon qu'on était en train de remplir. On y garde
 * donc un POINTEUR — l'id, rien d'autre : la saisie, elle, est déjà en base.
 */

/** Les étapes du wizard, dans l'ordre du parcours complet. */
export const PROJECT_WIZARD_STEPS = [
  "origin",
  "project",
  "icon",
  "git",
  "seed",
  "finish",
] as const;
export type ProjectWizardStep = (typeof PROJECT_WIZARD_STEPS)[number];

/** D'où on part (MIN-171) — la première question du wizard. */
export type ProjectOrigin = "new" | "existing";

/**
 * Le parcours RETENU. L'amorce dépend de l'origine — tant qu'elle n'est pas
 * choisie, l'étape n'a pas de contenu et ne compte pas dans le stepper.
 */
export function stepsFor(origin: ProjectOrigin | null): ProjectWizardStep[] {
  return origin
    ? ["origin", "project", "icon", "git", "seed", "finish"]
    : ["origin", "project", "icon", "git", "finish"];
}

/** L'index où rouvrir le wizard pour ce brouillon (0 si l'étape est inconnue). */
export function stepIndexOf(draft: ProjectDraft): number {
  return Math.max(0, stepsFor(draft.origin).indexOf(draft.step));
}

/** Le dépôt choisi dans le wizard, pas encore lié (le projet n'existe pas). */
export interface DraftRepo {
  connectionId: string;
  provider: RepoProviderId;
  externalRepoId: string;
  fullName: string;
}

/**
 * L'amorce retenue, jouée APRÈS la création (le projet n'existe pas encore).
 *
 * `import` ne porte PAS le CSV : le fichier pèse jusqu'à `MAX_IMPORT_CSV_BYTES`
 * (5 Mo) et ne se sérialise pas. La reprise le redemande, en le disant.
 */
export type DraftSeed =
  | { kind: "brief"; text: string }
  | { kind: "numo" }
  | { kind: "import" };

export interface ProjectDraft {
  /** Id du futur projet, tiré côté client : c'est la graine de l'orbe. */
  id: string;
  name: string;
  key: string;
  keyTouched: boolean;
  /** L'étape où l'on s'est arrêté, par son id — un index ne survivrait pas à un
      parcours dont les étapes dépendent des réponses. */
  step: ProjectWizardStep;
  origin: ProjectOrigin | null;
  seed: DraftSeed | null;
  /**
   * L'icône choisie, à rejouer à la création. Un fichier y voyage en data URL
   * WebP déjà compressée par le serveur — quelques dizaines de Ko.
   */
  icon: ProjectIconChoice;
  repo: DraftRepo | null;
  feedbackEnabled: boolean;
  smartAssignEnabled: boolean;
  autoAssignEnabled: boolean;
  /** Dernière écriture (ISO) — l'ordre de la barre latérale, du plus récent. */
  updatedAt: string;
}

/** La ligne telle que la table la garde : deux colonnes lues, le reste en jsonb. */
export interface ProjectDraftRow {
  id: string;
  name: string;
  step: string;
  data: Record<string, unknown> | null;
  updated_at: string;
}

/** Ce que le wizard sait de lui-même — tout le brouillon sauf sa date. */
export type ProjectDraftInput = Omit<ProjectDraft, "updatedAt">;

/**
 * Relit une ligne. Défensif de bout en bout : un brouillon écrit par une version
 * précédente du wizard n'a pas forcément tous les champs, et le projet vaut
 * mieux sans icône ni amorce qu'un wizard qui plante en le rouvrant.
 */
export function projectDraftFromRow(row: ProjectDraftRow): ProjectDraft {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : "",
    key: typeof data.key === "string" ? data.key : "",
    keyTouched: data.keyTouched === true,
    step: normalizeStep(row.step),
    origin: normalizeOrigin(data.origin),
    seed: normalizeSeed(data.seed),
    icon: normalizeIconChoice(data.icon),
    repo: normalizeRepo(data.repo),
    feedbackEnabled: data.feedbackEnabled === true,
    // Smart Assign est proposé ACTIVÉ par le wizard : un brouillon muet doit
    // retomber sur le même défaut, pas sur `false`.
    smartAssignEnabled: data.smartAssignEnabled !== false,
    autoAssignEnabled: data.autoAssignEnabled === true,
    updatedAt: row.updated_at,
  };
}

/** L'inverse : ce que la route reçoit. `name` et `step` colonnés, le reste en jsonb. */
export function projectDraftToRow(draft: ProjectDraftInput): {
  id: string;
  name: string;
  step: ProjectWizardStep;
  data: Record<string, unknown>;
} {
  return {
    id: draft.id,
    name: draft.name,
    step: draft.step,
    data: {
      key: draft.key,
      keyTouched: draft.keyTouched,
      origin: draft.origin,
      seed: draft.seed,
      icon: draft.icon,
      repo: draft.repo,
      feedbackEnabled: draft.feedbackEnabled,
      smartAssignEnabled: draft.smartAssignEnabled,
      autoAssignEnabled: draft.autoAssignEnabled,
    },
  };
}

/** L'aperçu à montrer dans la barre latérale : l'icône choisie, ou rien. */
export function draftIconUrl(draft: ProjectDraft): string | null {
  return draft.icon.kind === "none" ? null : draft.icon.previewUrl;
}

function normalizeStep(value: unknown): ProjectWizardStep {
  return PROJECT_WIZARD_STEPS.includes(value as ProjectWizardStep)
    ? (value as ProjectWizardStep)
    : "project";
}

function normalizeIconChoice(value: unknown): ProjectIconChoice {
  const choice = value as ProjectIconChoice | undefined;
  if (choice?.kind === "site" && typeof choice.siteUrl === "string") return choice;
  if (choice?.kind === "file" && typeof choice.previewUrl === "string") return choice;
  return { kind: "none" };
}

function normalizeOrigin(value: unknown): ProjectOrigin | null {
  return value === "new" || value === "existing" ? value : null;
}

function normalizeSeed(value: unknown): DraftSeed | null {
  const seed = value as DraftSeed | undefined;
  if (seed?.kind === "brief" && typeof seed.text === "string") return seed;
  if (seed?.kind === "numo") return { kind: "numo" };
  if (seed?.kind === "import") return { kind: "import" };
  return null;
}

function normalizeRepo(value: unknown): DraftRepo | null {
  const repo = value as DraftRepo | undefined;
  if (
    repo &&
    typeof repo.connectionId === "string" &&
    typeof repo.externalRepoId === "string" &&
    typeof repo.fullName === "string"
  ) {
    return repo;
  }
  return null;
}

/* ─── Le pointeur de l'aller-retour git ─────────────────────────────────── */

const PENDING_KEY = "minddy:project-draft-id";

/** Le brouillon qu'on était en train de remplir avant de partir chez le provider. */
export function setPendingDraftId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_KEY, id);
  } catch {
    /* sessionStorage indisponible (navigation privée / désactivé) — ignore. */
  }
}

export function readPendingDraftId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingDraftId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
