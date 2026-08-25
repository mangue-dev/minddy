/**
 * WHAT COMES FROM THE USER'S MACHINE (MIN-361) — a pure module without
 * imports. It ships in the harness bundle and remains directly testable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE POINT THAT IS NOT REPAIRABLE AFTER THE HOT
 *
 * All the rest of the local site reasons about what **goes down** (the token of
 * run, model key, forge token). This module is the only one to look at this
 * which **goes back**, and this is the only place in the file where the error is not corrected
 * not: what is mounted is mounted.
 *
 * In the cloud, what comes back is the contents of a disposable clone of a repository that
 * the project already has. **On one machine, it's someone's disk** — and
 * `agent_run_events` is persisted for 30 days and read by any member of the project.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO GESTURES, AND THEY DO NOT DO THE SAME WORK
 *
 * 1. **Rewrite machine paths** (`scrubPaths`). The deposit becomes
 * relative, the house becomes `~`. It is the gesture that treats the wearer
 * the most banal and universal identity: `/Users/<first last name>/…`
 * is not in the “suspicious” outputs, it is in **all** — every
 * stack trace, every `pwd`, every compiler error message, y
 * understood for a file that is IN the repository. A rule that would not look
 * that what leaves the deposit would let it pass in full.
 * 2. **Retain an output that speaks about elsewhere** (`foreignPaths`). A tool whose
 * call or exit carries a personal path out of the repository does not publish
 * its overview: it is replaced by an account. What remains visible is the
 * GESTURE — we must be able to read what the agent went to do, especially when
 * he went and did it off the record. What does not rise is the
 *    CONTENU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT “STAFF” MEANS HERE, AND WHY NOT MORE
 *
 * `/Users/x`, `/home/x`, `~`, and mount points (`/Volumes`, `/mnt`,
 * `/media` — the external disk, the NAS, the USB key). **Not `/usr`, not `/opt`,
 * not `/etc`.**
 *
 * It's not timidity, it's the balance of power between the two errors.
 * `/usr/lib/…` and `/opt/homebrew/…` are the same on all Macs: they do not
 * say nothing to anyone, and they are in half of the stack traces. `/etc`
 * is the limiting case which decides the rule — it appears in the CONTENT of the
 * repositories (a Dockerfile, an nginx conf, a README), and including it there would
 * retain perfectly ordinary readings. A guard who empties the thread of his
 * Honest outputs will not be kept for long.
 *
 * The residue is therefore named rather than hidden: `cat /etc/hosts` by the shell
 * mounted. It is of the same order as the “wall of paper” in §2 of the audit — the
 * shell has no read scope, and closing it does not.
 */

/** Which replaces the deposit in a text which goes back. */
export const REPO_MARK = ".";

/** Which replaces the personal folder — and it remains usable as is. */
export const HOME_MARK = "~";

/**
 * The path headers of a personal folder, regardless of ownership.
 *
 * Universal rather than restricted to the user of the lathe, and this is intended: a
 * path `/Users/quelquun-dautre/…` in an output names someone just as much.
 * The segment stops at characters that end a path in a sentence or
 * in a stack trace — otherwise the punctuation would enter the name.
 */
const HOME_HEAD = /\/(?:Users|home)\/[^/\s"'`:;,)\]}]+/g;

/**
 * A PERSONAL path, as recognized in arbitrary text.
 *
 * At least one segment after the root: `/Users` alone is not someone's path,
 * while `/Users/clement` is. Terminators are those of a path quoted in text —
 * quotes, parentheses, the colon in a stack trace (`file.ts:12`), and sentence-
 * ending punctuation.
 */
const PERSONAL_PATH = /(?:~|\/Users|\/home|\/Volumes|\/mnt|\/media)(?:\/[^\s"'`()[\]{}<>|:;,]+)+/g;

/**
 * PERSONAL FOLDER, INFERRED FROM THE REPOSITORY — never read from the environment.
 *
 * `process.env.HOME` would make this module impure for no reason: the run
 * repository is already an absolute path on the machine, and its personal root
 * is inside it. A repository elsewhere (`/srv/code`, a mounted volume) returns
 * `null`, and the rest of the module handles that — there is simply no `~` to
 * substitute.
 */
export function homeOf(repoDir: string): string | null {
  const found = /^(\/(?:Users|home)\/[^/]+)(?:\/|$)/.exec(repoDir);
  return found ? found[1] : null;
}

/** Is `a` `b` or in it? The guardrail prefix comparison, repeated
 * here so that the module remains without import. */
function inside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

/**
 * THE PATHS OF A TEXT WHICH SPEAK ABOUT OTHER THAN THE DEPOSIT.
 *
 * Returns the deduplicated list, not just a boolean: it returns a
 * refusal readable in a test, and a count readable in the thread.
 *
 * `~/x` is developed when we know the house - otherwise a `~/notes` located
 * in the repository (rare but real case: a repository at the root of the personal folder)
 * would be counted as foreign.
 */
export function foreignPaths(text: string, repoDir: string): string[] {
  if (!text) return [];
  const home = homeOf(repoDir);
  const out = new Set<string>();
  for (const raw of text.match(PERSONAL_PATH) ?? []) {
    const path = raw.startsWith("~") ? (home ? `${home}${raw.slice(1)}` : raw) : raw;
    if (!inside(path, repoDir)) out.add(raw);
  }
  return [...out];
}

/**
 * THE TEXT, PATHS OF THE MACHINE REWRITTEN.
 *
 * The deposit FIRST (this is the longest prefix, and it contains the house),
 * then the house. `split`/`join` on the repository rather than an expression
 * regular, for the reason of `SecretRedactor`: it is a literal string, and
 * a regex built on it would silently fail on a special character
 * forget.
 *
 * What this gives remains USABLE: `./lib/x.ts` is a valid path from the
 * repository, `~/Projets/…` is one for the shell. A rewrite that would break the
 * paths would be paid for in the next round, when the model rereads what he has written.
 */
export function scrubPaths(text: string, repoDir: string): string {
  if (!text) return text;
  const withoutRepo = repoDir ? text.split(repoDir).join(REPO_MARK) : text;
  return withoutRepo.replace(HOME_HEAD, HOME_MARK);
}

/**
 * Whether a shell command can resolve text that is absent from its persisted
 * summary. Local runs do not offer a shell tool, but this remains a final
 * uplink boundary if a future adapter or malformed event reintroduces one.
 */
export function hasShellIndirection(command: string): boolean {
  let quote: "single" | "double" | null = null;
  let escaped = false;

  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "single") {
      escaped = true;
      continue;
    }
    if (char === "'" && quote !== "double") {
      quote = quote === "single" ? null : "single";
      continue;
    }
    if (char === '"' && quote !== "single") {
      quote = quote === "double" ? null : "double";
      continue;
    }
    if (quote === "single") continue;

    const next = command[index + 1] ?? "";
    if (char === "`" || ((char === "<" || char === ">") && next === "(")) return true;
    if (char === "$" && /[({A-Za-z_0-9*?#@!$-]/.test(next)) return true;
  }

  return /(?:^|[\s;&|()])(?:eval|source|\.|command|env|bash|dash|ksh|sh|zsh)(?:$|[\s;&|()])/.test(
    command,
  );
}

/** The preview that replaces a held output. In English, like the others
 * messages that the harness writes in a `tool_result` (permission denials,
 * `assertNotGit`): it is read by the model as much as by a human. */
export function withheldOutput(chars: number, paths: number): string {
  return (
    `[minddy kept this output on this machine: it contains ${paths} sensitive path or ` +
    `shell-indirection reference(s) outside the ` +
    `repository, and this turn runs on someone's own computer. ${chars} characters were ` +
    `not uploaded — you saw the output when the tool ran, it is only absent from the thread.]`
  );
}

/** What filtering returns: the rewritten charge, and what it revealed. */
export interface LocalPayloadFilter {
  payload: Record<string, unknown>;
  /** At least one chain carried a personal path out of the depot. */
  foreign: boolean;
  /** How many, all fields combined — this is the COUNT that the thread publishes. */
  foreignCount: number;
}

/**
 * THE LOAD OF AN EVENT, READY TO RISE — thoroughly rewritten, and judged.
 *
 * Same route as `redactDeep` ([redact.ts](../redact.ts)), and for the same
 * reason: opencode payloads are nested by construction, and it is
 * background that a path is hidden. Both gestures are here rather than in the
 * supervisor so that there is only ONE wording of the rule.
 */
export function filterLocalPayload(
  payload: Record<string, unknown>,
  repoDir: string,
): LocalPayloadFilter {
  const name = typeof payload.name === "string" ? payload.name : "";
  const command =
    typeof payload.command === "string"
      ? payload.command
      : payload.state &&
          typeof payload.state === "object" &&
          typeof (payload.state as Record<string, unknown>).command === "string"
        ? String((payload.state as Record<string, unknown>).command)
        : "";
  const shellIndirection =
    (name === "run_command" || name === "run_background") &&
    (payload.shell_indirection === true || hasShellIndirection(command));
  let foreignCount = shellIndirection ? 1 : 0;
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      foreignCount += foreignPaths(value, repoDir).length;
      return scrubPaths(value, repoDir);
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== "object") return value;
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walk(item);
    }
    return out;
  };
  const out = walk(payload) as Record<string, unknown>;
  return { payload: out, foreign: foreignCount > 0, foreignCount };
}
