"use client";

import type { ProjectIconChoice } from "@/components/project-icon-picker";
import type { RepoProviderId } from "./repo-providers";

/**
 * Le brouillon du wizard de création de projet, gardé le temps d'un aller-retour
 * chez GitHub / GitLab.
 *
 * Le projet n'est créé qu'à la toute dernière étape : tout ce que l'utilisateur
 * remplit avant vit en mémoire. Or l'étape « Relier un dépôt » peut quitter la
 * page en plein écran (installation de l'app GitHub, autorisation OAuth GitLab),
 * ce qui démonte le wizard et perdrait la saisie. On la sérialise donc AVANT de
 * partir, et le callback revient sur `/home?setup=git` où
 * `ProjectDraftResume` la relit.
 *
 * sessionStorage et pas localStorage : un brouillon abandonné ne doit pas
 * ressurgir dans une session suivante — il ne survit qu'à cet aller-retour. Le
 * `savedAt` fait le ménage si l'onglet a passé la journée ailleurs.
 */

const KEY = "minddy:project-draft";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 min — au-delà, l'install n'était plus en cours.

/** Le dépôt choisi dans le wizard, pas encore lié (le projet n'existe pas). */
export interface DraftRepo {
  connectionId: string;
  provider: RepoProviderId;
  externalRepoId: string;
  fullName: string;
}

/** D'où on part (MIN-171) — la première question du wizard. */
export type ProjectOrigin = "new" | "existing";

/**
 * L'amorce retenue, jouée APRÈS la création (le projet n'existe pas encore).
 *
 * `import` ne porte PAS le CSV : le fichier pèse jusqu'à `MAX_IMPORT_CSV_BYTES`
 * (5 Mo) là où sessionStorage plafonne bien plus bas, et il ne survit donc pas
 * au détour chez le provider git. Le retour le redemande, en le disant.
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
  origin: ProjectOrigin | null;
  seed: DraftSeed | null;
  /**
   * L'icône choisie, à rejouer à la création. Un fichier y voyage en data URL
   * WebP déjà compressée par le serveur — quelques dizaines de Ko, largement
   * dans ce que sessionStorage accepte.
   */
  icon: ProjectIconChoice;
  repo: DraftRepo | null;
  feedbackEnabled: boolean;
  smartAssignEnabled: boolean;
  autoAssignEnabled: boolean;
  savedAt: number;
}

export function saveProjectDraft(draft: Omit<ProjectDraft, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() } satisfies ProjectDraft)
    );
  } catch {
    /* sessionStorage indisponible (navigation privée / désactivé) — ignore. */
  }
}

/** Le brouillon sauvé, ou null s'il n'y en a pas / plus (expiré, illisible). */
export function readProjectDraft(): ProjectDraft | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let draft: ProjectDraft;
  try {
    draft = JSON.parse(raw) as ProjectDraft;
  } catch {
    return null;
  }
  if (
    !draft ||
    typeof draft.id !== "string" ||
    typeof draft.name !== "string" ||
    typeof draft.key !== "string" ||
    typeof draft.savedAt !== "number" ||
    Date.now() - draft.savedAt > MAX_AGE_MS
  ) {
    return null;
  }
  // Un brouillon écrit par une version précédente n'a pas ces champs : le
  // projet vaut mieux sans icône ni amorce qu'un wizard qui plante en le
  // relisant.
  return {
    ...draft,
    icon: normalizeIconChoice(draft.icon),
    origin: normalizeOrigin(draft.origin),
    seed: normalizeSeed(draft.seed),
  };
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

export function clearProjectDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
