"use client";

import type { ProjectIconChoice } from "@/components/project-icon-picker";
import type { RepoProviderId } from "./repo-providers";

/**
 * The draft of the project creation wizard.
 *
 * The project is only created at the very last step: everything that the user
 * fills in before is this object. It lives ON THE SERVER SIDE (`project_drafts` table)
 * as soon as the project name is set — that is, as soon as there is something to
 * name in the sidebar, where the draft takes the place of the project it
 * will become. Closing the modal en route is therefore no longer an abandonment: we start again from
 * the step where we stopped, from one session to another and from one device to
 * the other.
 *
 * This module only carries the FORM of the draft and the line ↔ object translation ;
 * the network round trips are in lib/project-drafts-api.ts.
 *
 * There remains one use of `sessionStorage` here, and only one: the step "Connect a
 * repository" can leave the page in full screen (installation of the app GitHub,
 * OAuth GitLab authorization), and the callback returns to `/home?setup=git` without
 * being able to say anything about the draft that we were filling out. We keep
 * so a POINTER — the id, nothing else: the entry is already in the base.
 */

/** The wizard stages, in the order of the complete course. */
export const PROJECT_WIZARD_STEPS = [
  "origin",
  "project",
  "icon",
  "git",
  "seed",
  "members",
  "finish",
] as const;
export type ProjectWizardStep = (typeof PROJECT_WIZARD_STEPS)[number];

/** Where do we start from (MIN-171) — the wizard's first question. */
export type ProjectOrigin = "new" | "existing";

export { MAX_INITIAL_BRIEF_CHARS } from "./project-brief";

/**
 * The route KEPT. The seed depends on the origin — until it is chosen, the step has no content and does not count towards the stepper.
 */
export function stepsFor(origin: ProjectOrigin | null): ProjectWizardStep[] {
  return origin
    ? ["origin", "project", "icon", "git", "seed", "members", "finish"]
    : ["origin", "project", "icon", "git", "members", "finish"];
}

/** The index to reopen the wizard for this draft (0 if the step is unknown). */
export function stepIndexOf(draft: ProjectDraft): number {
  return Math.max(0, stepsFor(draft.origin).indexOf(draft.step));
}

/** The repository chosen in the wizard, not yet linked (the project does not exist). */
export interface DraftRepo {
  connectionId: string;
  provider: RepoProviderId;
  externalRepoId: string;
  fullName: string;
}

/**
 * The retained primer, played AFTER creation (the project does not yet exist).
 *
 * `import` does NOT carry the CSV: the file weighs up to `MAX_IMPORT_CSV_BYTES`
 * (5 MB) and is not serialized. The recovery asks for it again, saying it.
 */
export type DraftSeed =
  | { kind: "brief"; text: string }
  | { kind: "import" };

/** A collaborator queued in the members step (see `ProjectDraft.inviteeUsers`). */
export interface DraftInviteeUser {
  userId: string;
  email: string;
  name: string | null;
  avatarSeed: string;
}

export interface ProjectDraft {
  /** Id of the future project, taken from the client side: this is the seed of the default orb. */
  id: string;
  /**
 * The seed of the orb, if the draw was RESTART during the wizard. `null` =
 * never restarted, and it is the id that is used (see `projectOrbSeed`). It is
 * retained here so that the preview and the created project show the same color.
 */
  orbSeed: string | null;
  name: string;
  key: string;
  keyTouched: boolean;
  /** The step where we stopped, by its id — an index would not survive a
 journey whose steps depend on the answers. */
  step: ProjectWizardStep;
  origin: ProjectOrigin | null;
  seed: DraftSeed | null;
  /**
 * The chosen icon, to be replayed upon creation. A file travels there in data URL
 * WebP already compressed by the server — a few dozen KB.
 */
  icon: ProjectIconChoice;
  repo: DraftRepo | null;
  smartAssignEnabled: boolean;
  autoAssignEnabled: boolean;
  /**
   * Addresses to invite, normalized (trimmed, lowercased, unique). Nothing is
   * sent while the project is a draft: the invitations go out once it exists.
   */
  invitees: string[];
  /**
   * People picked by name among those who joined another of the owner's
   * projects. Only `userId` is sent: the server resolves their address. The
   * name and avatar are kept for display when the draft is resumed.
   */
  inviteeUsers: DraftInviteeUser[];
  /** Last written (ISO) — the order of the sidebar, from most recent. */
  updatedAt: string;
}

/** The row as the table keeps it: two columns read, the rest in jsonb. */
export interface ProjectDraftRow {
  id: string;
  name: string;
  step: string;
  data: Record<string, unknown> | null;
  updated_at: string;
}

/** What the wizard knows about himself — the entire draft except its date. */
export type ProjectDraftInput = Omit<ProjectDraft, "updatedAt">;

/**
 * Rereads a line. End-to-end defensive: a draft written by a previous version
 * of the wizard does not necessarily have all the fields, and the project is worth
 * better without an icon or primer than a wizard which crashes when reopening it.
 */
export function projectDraftFromRow(row: ProjectDraftRow): ProjectDraft {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    orbSeed: typeof data.orbSeed === "string" ? data.orbSeed : null,
    name: typeof row.name === "string" ? row.name : "",
    key: typeof data.key === "string" ? data.key : "",
    keyTouched: data.keyTouched === true,
    step: normalizeStep(row.step),
    origin: normalizeOrigin(data.origin),
    seed: normalizeSeed(data.seed),
    icon: normalizeIconChoice(data.icon),
    repo: normalizeRepo(data.repo),
    // Smart Assign is proposed ACTIVATED by the wizard: a silent draft must
    // fall back on the same default, not on `false`.
    smartAssignEnabled: data.smartAssignEnabled !== false,
    autoAssignEnabled: data.autoAssignEnabled === true,
    invitees: normalizeInvitees(data.invitees),
    inviteeUsers: normalizeInviteeUsers(data.inviteeUsers),
    updatedAt: row.updated_at,
  };
}

/** The opposite: what the road receives. `name` and `step` columned, the rest in jsonb. */
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
      orbSeed: draft.orbSeed,
      key: draft.key,
      keyTouched: draft.keyTouched,
      origin: draft.origin,
      seed: draft.seed,
      icon: draft.icon,
      repo: draft.repo,
      smartAssignEnabled: draft.smartAssignEnabled,
      autoAssignEnabled: draft.autoAssignEnabled,
      invitees: normalizeInvitees(draft.invitees),
      inviteeUsers: normalizeInviteeUsers(draft.inviteeUsers),
    },
  };
}

/** The preview to show in the sidebar: the chosen icon, or nothing. */
export function draftIconUrl(draft: ProjectDraft): string | null {
  return draft.icon.kind === "none" ? null : draft.icon.previewUrl;
}

/** The draft orb seed — the counterpart to `projectOrbSeed`. */
export function draftOrbSeed(draft: ProjectDraft): string {
  return draft.orbSeed || draft.id;
}

/** The form an address is compared and stored in, as the server does. */
export function normalizeInviteEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * A clean invitee list from whatever the draft holds: strings only, normalized,
 * without blanks or duplicates. A draft from before the step reads as empty.
 */
export function normalizeInvitees(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const emails = value
    .filter((email): email is string => typeof email === "string")
    .map(normalizeInviteEmail)
    .filter(Boolean);
  return [...new Set(emails)];
}

/** Picked collaborators from whatever the draft holds: well-formed and unique. */
export function normalizeInviteeUsers(value: unknown): DraftInviteeUser[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const users: DraftInviteeUser[] = [];
  for (const item of value) {
    const user = item as Partial<DraftInviteeUser> | null;
    if (!user || typeof user.userId !== "string" || !user.userId || typeof user.email !== "string") continue;
    if (seen.has(user.userId)) continue;
    seen.add(user.userId);
    users.push({
      userId: user.userId,
      email: normalizeInviteEmail(user.email),
      name: typeof user.name === "string" && user.name.trim() ? user.name : null,
      avatarSeed: typeof user.avatarSeed === "string" && user.avatarSeed ? user.avatarSeed : user.userId,
    });
  }
  return users;
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

/* ─── The git round trip pointer ─────────────────────────────────── */

const PENDING_KEY = "minddy:project-draft-id";

/** The draft that we were filling out before going to the provider. */
export function setPendingDraftId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_KEY, id);
  } catch {
    /* sessionStorage unavailable (private browsing / disabled) — ignore. */
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
