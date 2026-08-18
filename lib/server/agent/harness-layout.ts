/**
 * WHERE THE HARNESS WORKS — and why it's no longer a constant (MIN-354).
 *
 * All of these paths were module `const` under `/vercel/sandbox`. This was
 * true as long as the only disk in the harness was that of a microVM created for
 * him: one run, one machine, no chance of collision. Two things break
 * this assumption, and you need both to understand the form below.
 *
 * 1. **`/vercel/…` does not exist on a Mac**, and is not createable there without root.
 * Measured: `.agent-vm/main.js` runs as is under the Electron Node and
 * dies on `/vercel/sandbox/harness/job.json` — before any other line.
 * 2. **A machine can carry TWO runs at once.** A microVM is created by
 * run ; a computer, no. Two tickets launched in succession on the same workstation
 * would share the harness job, the SQLite opencode base, the file of
 * tools outputs and ports — with symptoms that bear no resemblance to their cause.
 *
 * Hence an OBJECT, derived from a single root per run, and not an environment variable
 * set once for the process: an environment variable
 * has exactly the fault we are trying to remove, it is global.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * TWO ROOTS, AND THIS IS WANTED
 *
 * `root` is the root OF THE RUN: everything that belongs to a turn and to it alone —
 * the work deposit, the tool outputs, the harness, the `.tsbuildinfo`.
 *
 * `opencodeDir` is not one of them. It's 144 MB of binary, installed one
 * time (10.6 s) and baked in the microVM snapshot
 * ([opencode-host.ts](vm/opencode-host.ts)): placing it under the root of run
 * would mean reinstalling it on each ticket. It is specific to the MACHINE, not
 * to the run, and nothing that one run writes there distinguishes it from another.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * `repoDir` IS THE SECURITY ROOT
 *
 * `resolveWithin`, `assertNotGit`, `resolveReadable` ([repo-path.ts](repo-path.ts))
 * and `absoluteInRepo` ([opencode-permissions.ts](vm/opencode-permissions.ts))
 * all compare to this value. As long as it was a literal, its form was self-evident; it now arrives via JSON written elsewhere. `assertUsableLayout`
 * is what takes over the role of the literal: a relative path or a final slash
 * would make these four functions silent rather than false —
 * `resolveWithin("repo", "../x")` does not come out of anything at all, since "nothing" is
 * what it does compare.
 *
 * PURE module and WITHOUT ANY import: it goes into the microVM bundle, it is
 * read by the snapshot script launched by hand (`tsx`), and by the function.
 */

/** The record of a run, as the harness and guardrails see it. */
export interface HarnessLayout {
  /** The UNIQUE root of the run. Everything that follows derives from it, except `opencodeDir`. */
  root: string;
  /**
 * Where the tower repository lives — and THE SECURITY ROOT (see header). No
 * pattern writing exits here.
 *
 * Cloned for the trick in the current case; in current deposit mode (MIN-358),
 * this is the checkout that the user already had, and it is NOT under `root`
 * (see `layoutForCurrentRepo`).
 */
  repoDir: string;
  /**
 * Where the harness drops tool outputs that are too long for the model
 * (MIN-107). DELIBERATELY out of `repoDir`: the end of round doesn't see it,
 * so none of that lands in a commit or a PR — and, in the user's current
 * repository, none of that appears in their `git status`.
 */
  toolOutputDir: string;
  /**
 * Where the HARNESS itself lives — bundle, tour job, config and opencode state.
 *
 * Outside of `repoDir` for the same reason as `toolOutputDir`, and it's still
 * more true here: the end of the round would carry otherwise the harness code AND the
 * job, which carries the conversation history AND the push URL, in a
 * commit of the user's repository then in his pull request.
 */
  harnessDir: string;
  /**
 * The `.tsbuildinfo` of the delivery type-check ([diagnostics.ts](diagnostics.ts)).
 * Outside the repository (same reason), and it persists with the root of the run: it is this
 * which reduces the following rounds from 22 s to 11 s.
 */
  typecheckDir: string;
  /**
 * Where the opencode binary is INSTALLED. Specific to the machine, NOT to the run
 * (see header): two simultaneous runs share it, and that's what we want.
 */
  opencodeDir: string;
}

/**
 * THE HARNESS BUNDLE AND THE TOUR JOB — two PURE layout functions.
 *
 * They lived in [vm/protocol.ts](vm/protocol.ts), which still re-exports them
 * for its historical readers. They've been here since MIN-293 for a reason of
 * GRAPH: the desktop app launcher needs both of these paths, and
 * `protocol.ts` import-type `../runs`, which is `server-only` — following it there
 * would bring in half of the server in the shell's type-check, which
 * has neither `global.d.ts` nor the same settings, and would break it on files
 * that have nothing to do with it.
 *
 * This module has NO import, and that's exactly why it is the good
 * location: it is already read by the function, by the microVM bundle and by a
 * script `tsx` launched by hand. The shell is the fourth reader, and the last one that could still drop this property.
 */

/** The harness bundle, written before each round next to its job. */
export function vmBundlePath(layout: HarnessLayout): string {
  return `${layout.harnessDir}/main.js`;
}

/**
 * The job of the tour, written next to the bundle.
 *
 * A FUNCTION of the layout, but the harness cannot use it to find
 * its own job: the layout is IN the job. This chicken and egg resolves
 * by the command line argument that the caster passes — it's the only
 * information the harness needs before knowing anything else.
 */
export function vmJobPath(layout: HarnessLayout): string {
  return `${layout.harnessDir}/job.json`;
}

/** The root of the disk of a microVM run. One VM per run: that alone is enough. */
export const CLOUD_SANDBOX_ROOT = "/vercel/sandbox";

/** Where the opencode binary is baked into the microVM's pre-heated image. */
export const CLOUD_OPENCODE_DIR = "/vercel/oc";

/** The layout derived from a run root. The only factory - nowhere else
 * does one glue a harness path by hand. */
export function layoutForRoot(root: string, opencodeDir: string): HarnessLayout {
  const base = trimTrailingSlashes(root);
  return {
    root: base,
    repoDir: `${base}/repo`,
    toolOutputDir: `${base}/tool-output`,
    harnessDir: `${base}/harness`,
    typecheckDir: `${base}/typecheck`,
    opencodeDir: trimTrailingSlashes(opencodeDir),
  };
}

/** The layout of a microVM run — exactly the paths before MIN-354. */
export function cloudLayout(): HarnessLayout {
  return layoutForRoot(CLOUD_SANDBOX_ROOT, CLOUD_OPENCODE_DIR);
}

/**
 * THE CURRENT DEPOSIT MODE LAYOUT (MIN-358) — everything from the run under the run root, but the DEPOSIT elsewhere: where the user has already cloned it.
 *
 * This is the only case where `repoDir` is not `<root>/repo`, and it is not a
 * relaxation of MIN-354 but its first real client: the deposit ceases
 * to be a folder that we create to become a folder that we find. What
 * still holds, and was the REAL reason for the "under the root" rule, is
 * that the harness, its tools outputs and its `.tsbuildinfo` are never
 * IN the repository — otherwise they would appear in the `git status` of the user
 * and, worse, within the scope of the round ([current-repo.ts](current-repo.ts)).
 */
export function layoutForCurrentRepo(
  root: string,
  repoDir: string,
  opencodeDir: string,
): HarnessLayout {
  return { ...layoutForRoot(root, opencodeDir), repoDir: trimTrailingSlashes(repoDir) };
}

/**
 * THE ROOT OF A RUN ON A SHARED MACHINE — a folder per identifier of
 * run, under a common working folder.
 *
 * This is the gesture that the microVM made free and that a computer does not make:
 * without it, two runs launched at the rest write their job, their SQLite base and
 * their tools outputs in the same place, and the second erases the first in
 * silence. The `runId` is passed through the sieve of path characters — it comes from
 * the base, but an identifier carrying an `/` or a `..` would take the root
 * out of its working folder, and it is this which bounds everything else.
 */
export function runScopedRoot(baseDir: string, runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "") || "run";
  return `${trimTrailingSlashes(baseDir)}/${safe}`;
}

/**
 * REFUSES A LAYOUT THAT THE GUARDRAINS CANNOT HOLD.
 *
 * Three requirements, and each corresponds to an assumption that yesterday's literals
 * made obvious:
 *
 * - **absolute** — `resolveWithin` normalizes `<base>/<chemin>` and compares to the
 * prefix. On a relative basis, a `../..` of the model leaves the repository without the comparison seeing it; `${base}/`: a base ending with `/` produces a
 * `//`, which `normalize` erases on one side and not on the other;
 * - **the harness outside the repository** — this is what guarantees that `toolOutputDir`,
 * `harnessDir` and `typecheckDir` are not children of the repository, so the end-of-turn
 * `git add -A` never overrides them.
 *
 * WHAT CHANGED IN MIN-358, and why it's not a relaxation: the rule
 * was written "the repository under the root", which was just a WAY of saying the
 * third — true as long as the repository was a folder that we created. In
 * current deposit mode, the deposit is that of the user and lives where he lives; what we
 * must still refuse is a harness that would be installed INSIDE. The rule is
 * therefore said for what it protects, and the three folders of the run remain,
 * held under the root of the run.
 *
 * RISES, and does not return a boolean: the only caller is the harness at the moment
 * when it reads its job, and a questionable layout has no degraded mode — there is
 * nothing to do with a trick where we don't know where it writes.
 */
export function assertUsableLayout(layout: HarnessLayout): void {
  const dirs: Array<[keyof HarnessLayout, string]> = [
    ["root", layout.root],
    ["repoDir", layout.repoDir],
    ["toolOutputDir", layout.toolOutputDir],
    ["harnessDir", layout.harnessDir],
    ["typecheckDir", layout.typecheckDir],
    ["opencodeDir", layout.opencodeDir],
  ];
  for (const [name, value] of dirs) {
    if (typeof value !== "string" || !value.startsWith("/")) {
      throw new Error(`harness layout: ${name} must be an absolute path, got ${JSON.stringify(value)}`);
    }
    if (value.length > 1 && value.endsWith("/")) {
      throw new Error(`harness layout: ${name} must not end with a slash, got ${JSON.stringify(value)}`);
    }
  }
  for (const [name, value] of dirs) {
    if (name === "root" || name === "opencodeDir" || name === "repoDir") continue;
    if (!value.startsWith(`${layout.root}/`)) {
      throw new Error(`harness layout: ${name} (${value}) must live under root (${layout.root})`);
    }
    if (value === layout.repoDir || value.startsWith(`${layout.repoDir}/`)) {
      throw new Error(
        `harness layout: ${name} (${value}) must live OUTSIDE the repository (${layout.repoDir})`,
      );
    }
  }
}

function trimTrailingSlashes(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}
