import {
  layoutForRoot,
  layoutForCurrentRepo,
  runScopedRoot,
  type HarnessLayout,
} from "@/lib/server/agent/harness-layout";

/**
 * A ROUND THAT PLAYS ON THIS MACHINE (MIN-293) — the half that is decided without
 * disk.
 *
 * ## The sharing invariant, and all this file results from it
 *
 * **The server has everything related to RUN; the machine has everything that
 * which concerns the DISK.** The server does not know any path of this
 * computer - a home path means nothing other than on the machine
 * which carries it, and storing it on the base side would publish it, falsely, to all members of the
 * project ([local-repo.ts](local-repo.ts)). The app, symmetrically, does not manufacture
 * any job fields: the model, the anchor, the budget, the `authUrl`, the opencode journal
 * and the lease are decisions that it does not have the means to make.
 *
 * The contract which connects them is therefore exactly one `VmJob` **amputated from its
 * `layout`** — the only field that talks about disk — and from its `bootstrapMs`, which
 * measures a microVM compute which does not exist here.
 *
 * ## Four fields that the machine sets, and two that it REWRITE
 *
 * `layout` and `bootstrapMs` are its own by construction. The other two are
 * values that the server has set and which it replaces, and these are not
 * exceptions to the invariant — they are disk facts disguised as run fields:
 *
 * - **`appOrigin`**: the server resolves it by `agentControlOrigin()`, which
 * falls on production outside Vercel. A typo in preview or dev
 * would then speak to `www.minddy.app` with a lease signed elsewhere. The rule is
 * simpler than any arbitration: **the machine only speaks to
 * the origin which gave it its work.** It knows which one, it is that of the
 * active channel; the server does not know where it is called from.
 * - **`repoMode`**: the server only knows how to produce one `clone` — it is he who
 * creates the microVM and clones it into it. The `current` mode (D2 decision: the agent
 * works in the repository that the human already has) belongs to who OPENS this repository,
 * and it is the machine. Set as VALUE, never deducted: a silent job played like
 * a clone would do a `git add -A` and a `git checkout -b` in the checkout of
 * someone.
 *
 * And `bootstrapMs` is worth zero, not "what the download cost":
 * `billableSandboxMs` ([vm-rest.ts](../server/agent/vm-rest.ts)) terminal already on the side
 * server, and charging for Mac minutes would amount to charging for a machine
 * that the user has himself provided.
 *
 * ## The layout: the repository is elsewhere, everything else is under the root of the run
 *
 * `layoutForCurrentRepo` ([harness-layout.ts](../server/agent/harness-layout.ts))
 * says the rule: the harness, its tools outputs and its `.tsbuildinfo` are
 * NEVER in the repository — otherwise they would appear in the `git status` of
 * the user and within the perimeter of the tour. The root of the run is a
 * folder by identifier: two tickets launched in succession on the same workstation
 * would otherwise share the job, the opencode SQLite base and the tools output.
 *
 * ## Why the job is NOT typed `VmJob` here
 *
 * We would like to import it — it is the contract, it is checked by the compiler,
 * and it is the whole value of [vm/protocol.ts](../server/agent/vm/protocol.ts).
 * But this file type-imports `../runs`, which is `server-only`: following it
 * would bring half of the server into the type-check of the shell, which has
 * neither `global.d.ts` nor the same settings, and which would then come across around forty
 * files having nothing to see with it (measured).
 *
 * The shell therefore only READS from the job the four fields it uses, and
 * **follows the rest without touching it** — which is exactly the invariant
 * above, written a second time by the types. The contract verification,
 * is not lost: it lives in
 * [local-turn.test.ts](local-turn.test.ts), which runs under the root tsconfig and
 * asserts that what `assignmentToJob` produces satisfies `VmJob`. This is the
 * only place where the two graphs are allowed to meet.
 *
 * Decisions here, `fork` and `fs` in
 * [desktop/src/launcher.ts](../../desktop/src/launcher.ts).
 */

/**
 * WHAT THE MACHINE READS FROM THE JOB — four fields, and the rest travels as is.
 *
 * The signature index is not a waiver: it SAYS that everything else in the job
 * is opaque to the shell, and it refuses by construction just one more field
 * be read there without being declared here.
 */
export interface AssignedJob {
  /** Must be that of the harness that we are going to execute (see `bundleDecision`). */
  readonly protocolVersion: number;
  readonly runId: string;
  /** The lease. Its presence IS what makes a job a local job (`isLocalJob`). */
  readonly controlToken: string;
  /** L'URL de push, token de forge compris — un secret du journal. */
  readonly authUrl?: string;
  /** Readable run reference (`MIN-293`), to name the turn in the ⌘Q box. */
  readonly commitRef?: string;
  readonly [key: string]: unknown;
}

/** The FULL job, as the harness will read it. The three fields of the machine
 * are added to its own; the rest is intact. */
export interface LocalJob extends AssignedJob {
  readonly layout: HarnessLayout;
  readonly appOrigin: string;
  readonly repoMode: "clone" | "current";
  readonly localProjects?: readonly LocalProject[];
  readonly bootstrapMs: 0;
}

/** The runs folder, under `userData`. */
export const LOCAL_RUNS_DIR_NAME = "agent-runs";

/** And the one where opencode is installed — specific to the MACHINE, not to the run. */
export const LOCAL_OPENCODE_DIR_NAME = "opencode";

/**
 * WHAT THE SERVER DELIVERS TO THE MACHINE.
 *
 * `job` already carries the lease (`controlToken`): a local job is, by definition,
 * a job that carries a token — that's what it says `isLocalJob`, and a flag of
 * further next to it would be a second truth about the same fact.
 */
export interface LocalTurnAssignment {
  readonly runId: string;
  readonly projectId: string;
  /**
 * The `owner/repo` of the project, to revalidate the attached folder **at the time of the
 * round**. The attachment could have been made a month ago, the repository moved, the
 * disk unmounted, the project re-linked elsewhere: responding based on the file de
 * settings would send a run to a folder that no longer exists.
 */
  readonly repoFullName: string;
  /** The isolated checkout is a decision fixed at the start of the session. */
  readonly localWorktree: boolean;
  /**
   * Projects that the launcher can read. The server does not put ANY path here:
   * the shell joins them with its own local attachments before placing the job.
   * This list lets a local agent resolve "project X" without asking where it is
   * located on the Mac.
   */
  readonly projects: readonly LocalTurnProject[];
  /** The job, minus the three fields that only the machine can fill. */
  readonly job: AssignedJob;
}

/** Non-sensitive identity of a project, transmitted by the server to the machine. */
export interface LocalTurnProject {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  /** Necessary to revalidate the file that the machine has retained. */
  readonly repoFullName: string | null;
}

/** Project handed over to local harness; only this type can carry a disk path. */
export interface LocalProject extends LocalTurnProject {
  readonly localPath: string | null;
}

/**
 * Why a turn cannot go on this machine.
 *
 * None are user errors in the sense that there would be nothing to do:
 * each has a repair gesture, and that's what makes them useful in a
 * log. `bundle` and `opencode` carry their own, more precise pattern
 * ([harness-bundle.ts](harness-bundle.ts), [opencode-install.ts](opencode-install.ts)).
 */
export type LocalTurnRefusal =
  /** The assignment does not have the expected form, or speaks another protocol. */
  | "assignment_invalid"
  /** No folders attached to this project on this machine. */
  | "no_repo"
  /** An attached folder, but which is no longer the project repository. */
  | "repo_invalid"
  /** The harness could not be obtained or verified. */
  | "bundle"
  /** The opencode binary is missing and cannot be installed. */
  | "opencode"
  /** One lap of this run is ALREADY running here. */
  | "already_running";

/**
 * The assignment read back from what the origin responded — or `null`.
 *
 * The protocol is checked HERE, first of all, and this is deliberate: the harness le
 * would also refuse (`parseVmJob`), but after the fork, when it does not remains more
 * than a newspaper to talk about it. The rest of the fields are not revalidated one by
 * one — they come from our own server, on our own origin, and the
 * rechecking here would mean holding a second copy of the contract which would end up
 * diverging from `protocol.ts`. What we check is what the MACHINE uses
 *: the identity of the run, the deposit to validate, and the lease without which the round would not
 * could mean anything.
 */
export function parseLocalTurnAssignment(raw: unknown): LocalTurnAssignment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { runId, projectId, repoFullName, localWorktree, projects, job } = raw as Record<string, unknown>;
  if (!isNonEmptyString(runId) || !isNonEmptyString(projectId)) return null;
  if (!isRepoFullName(repoFullName)) return null;
  // A server deployed just before migration does not yet know this field.
  // Its absence falls on historical, safe behavior (current checkout);
  // only a value present but poorly formed is an inconsistent contract.
  if (localWorktree !== undefined && typeof localWorktree !== "boolean") return null;
  if (typeof job !== "object" || job === null) return null;

  const typed = job as Partial<AssignedJob>;
  // The version is READ here and compared to the harness that we are going to execute, not to a
  // constant compiled in the app: the shell does not speak the protocol, it
  // relays it (see `bundleDecision`).
  if (typeof typed.protocolVersion !== "number" || !Number.isInteger(typed.protocolVersion)) {
    return null;
  }
  // The lease: without it, the tower cannot talk to the control plane, so it
  // cannot report — and a run would remain `running` until
  // the guard dog notices it, two hours later.
  if (!isNonEmptyString(typed.controlToken)) return null;
  // `layout` is NOT a value that the server has the right to set: it does not
  // knows no path to this machine, and a layout from elsewhere
  // would designate a folder that no one has chosen.
  if ("layout" in (job as object)) return null;
  if (typed.runId !== runId) return null;

  const parsedProjects = parseLocalTurnProjects(projects);
  if (!parsedProjects) return null;

  return {
    runId,
    projectId,
    repoFullName,
    localWorktree: localWorktree === true,
    projects: parsedProjects,
    job: job as AssignedJob,
  };
}

function parseLocalTurnProjects(value: unknown): readonly LocalTurnProject[] | null {
  // An older app can still talk to a server that doesn't return the
  // catalog: the run remains usable, only without this discovery tool.
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const projects: LocalTurnProject[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const row = item as Record<string, unknown>;
    if (!isNonEmptyString(row.id) || !isNonEmptyString(row.name) || !isNonEmptyString(row.key)) {
      return null;
    }
    if (row.repoFullName !== null && !isRepoFullName(row.repoFullName)) return null;
    projects.push({
      id: row.id,
      name: row.name,
      key: row.key,
      repoFullName: row.repoFullName ?? null,
    });
  }
  return projects;
}

/** The folder that has the roots of run — the only one the household browses. */
export function localRunsDir(userDataPath: string): string {
  return `${trimSlashes(userDataPath)}/${LOCAL_RUNS_DIR_NAME}`;
}

/** The root of the run on this machine: one folder per identifier. */
export function localRunRoot(userDataPath: string, runId: string): string {
  return runScopedRoot(localRunsDir(userDataPath), runId);
}

/** Where opencode is installed on this machine — shared by all runs. */
export function localOpencodeDir(userDataPath: string): string {
  return `${trimSlashes(userDataPath)}/${LOCAL_OPENCODE_DIR_NAME}`;
}

/**
 * The layout of this round. `repoDir` is the folder that the human attached; everything
 * remains lives under the run root, outside the repository.
 *
 * RISK if the layout is unusable (`assertUsableLayout`, called by
 * `layoutForCurrentRepo` via the harness) — a relative path or a trailing slash
 * would make `resolveWithin` and `absoluteInRepo` silent rather than false, and it is
 * `repoDir` which is the security root of all writes to the model.
 */
export function localLayout(opts: {
  userDataPath: string;
  runId: string;
  repoPath: string;
  isolated?: boolean;
}): HarnessLayout {
  const root = localRunRoot(opts.userDataPath, opts.runId);
  if (opts.isolated) return layoutForRoot(root, localOpencodeDir(opts.userDataPath));
  return layoutForCurrentRepo(
    root,
    opts.repoPath,
    localOpencodeDir(opts.userDataPath),
  );
}

/**
 * THE JOB, COMPLETE — the only factory, and the only place where the three fields of
 * the machine are set.
 *
 * `repoMode: "current"` is not deduced: it is a VALUE, and the server does not set it
 * not. Decision D2 makes it the default of a local conversation (the agent
 * works in the current repository, the dedicated worktree is an option), but it
 * belongs to the machine because it knows which repository it opens.
 * Writing it here rather than on the server side closes the case where a silent job would be played
 * as a clone in the someone's checkout.
 */
export function assignmentToJob(
  assignment: LocalTurnAssignment,
  machine: {
    layout: HarnessLayout;
    appOrigin: string;
    isolated?: boolean;
    localProjects?: readonly LocalProject[];
  },
): LocalJob {
  return {
    ...assignment.job,
    layout: machine.layout,
    // The machine only speaks to the origin that gave it its work (see header).
    appOrigin: machine.appOrigin,
    // `clone` means “checkout belonging to the round”. A local worktree is
    // exactly that: it is not a network clone, but the harness can
    // commit and push without carrying the WIP of the attached checkout.
    repoMode: machine.isolated ? "clone" : "current",
    // Paths come exclusively from the desktop app. They don't go back
    // never to the server and are therefore never shared with the team.
    ...(machine.localProjects?.length ? { localProjects: machine.localProjects } : {}),
    // No microVM, therefore no boot compute to charge (see header).
    bootstrapMs: 0,
  };
}

/** Secrets that this round's journal should not keep. */
export function localTurnSecrets(job: AssignedJob): string[] {
  const secrets = [job.controlToken, job.authUrl];
  return secrets.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * How long the root of a run survives its last turn.
 *
 * It is NOT disposable at the end of a turn: `typecheckDir` carries the
 * `.tsbuildinfo` which reduces the following turns from 22 s to 11 s
 * ([harness-layout.ts](../server/agent/harness-layout.ts)), and a conversation
 * resumes days later. Seven days is longer than the useful life of an agent conversation and short enough that a disk won't fill up.
 */
export const RUN_ROOT_KEEP_DAYS = 7;

/** A run root found on disk, as household sees it. */
export interface RunRootEntry {
  readonly name: string;
  /** Last written, in epoch milliseconds. */
  readonly modifiedMs: number;
}

/**
 * THE RUN ROOTS TO BE DELETED — the function does not touch anything, it names
 * (same pattern as `pruneRunLogs` and `staleBundles`).
 *
 * `live` is the set of runs which run EN THIS MOMENT on this machine, and
 * this is not a theoretical precaution: the housework runs at the start of the app
 * AND at the end of each round, or a second round may very well be in flight.
 * Deleting its root would take away its job, its tools outputs and the base
 * Opencode SQLite under the feet.
 */
export function staleRunRoots(
  entries: readonly RunRootEntry[],
  opts: { nowMs: number; live?: ReadonlySet<string>; keepDays?: number },
): string[] {
  const cutoff = opts.nowMs - (opts.keepDays ?? RUN_ROOT_KEEP_DAYS) * 24 * 60 * 60 * 1000;
  const live = opts.live ?? new Set<string>();
  return entries
    .filter((entry) => !live.has(entry.name))
    // An illegible date does not delete ANYTHING: we do not conclude on ignorance,
    // especially on the side that erases.
    .filter((entry) => Number.isFinite(entry.modifiedMs) && entry.modifiedMs < cutoff)
    .map((entry) => entry.name);
}

/**
 * The log phrase for pre-fork denial. In English, like the menu and
 * the diagnostic report — it's the same text, and it ends up pasted into a support thread.
 */
export function localTurnRefusalMessage(reason: LocalTurnRefusal, repoFullName: string): string {
  switch (reason) {
    case "assignment_invalid":
      return "minddy sent a turn this version of the app cannot read. Update the app.";
    case "no_repo":
      return `No local folder is attached to ${repoFullName} on this Mac. Attach one in the project settings.`;
    case "repo_invalid":
      return `The folder attached to ${repoFullName} is no longer that repository — it may have moved, or the disk may be unmounted.`;
    case "bundle":
      return "The agent harness could not be obtained or verified, so no turn was started.";
    case "opencode":
      return "The opencode binary is missing and could not be installed on this Mac.";
    case "already_running":
      return "A turn for this run is already going on this Mac.";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A `owner/repo` (or GitLab path) is never an absolute Mac path. */
function isRepoFullName(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const trimmed = value.trim();
  return !trimmed.startsWith("/") && trimmed.split("/").length >= 2 && !trimmed.includes("\\");
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}
