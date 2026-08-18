import { posix as posixPath } from "node:path";

import { checkCommand, FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { assertNotGit, resolveWithin } from "../repo-path";
import { isSecretFile } from "../secret-scan";
import {
  fetchHostname,
  fetchPort,
  isPrivateHostname,
  privateFetchMessage,
  PRIVATE_FETCH_REASON,
} from "./private-address";

/**
 * THE SAFEGUARDS, REPRESENTED ON THE OPENCODE PERMISSION REQUEST (MIN-286, lot 2).
 *
 * What the homemade harness did IN the tool (`exec-tool.ts` refused
 * `git reset --hard` before touching the Sandbox, `repo-host.ts` refused a
 * writing outside the repository), opencode requests it: `permission: {bash: "ask",
 * edit: "ask"}` suspends the call and publishes `permission.asked` on the stream. THE
 * supervisor responds — and his response IS the guardrail.
 *
 * A PUR module, therefore: the decision is tested without a server, and
 * [command-guard.ts](../command-guard.ts), like [repo-path.ts](../repo-path.ts),
 * have not changed a single line. They are the same functions, called from elsewhere.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS MEASURED (opencode-ai@1.18.16, fake local provider that scripts
 * tool calls — no model spent)
 *
 * 1. `bash: "ask"` publishes a request**, and `echo hi` publishes it:
 *    `{permission: "bash", patterns: ["echo hi"], metadata: {command: "echo hi"},
 * always: ["echo *"], tool: {messageID, callID}}`. On an ordinary order,
 * the guardrail therefore sees exactly what `run_command` saw.
 *
 * ⚠ **“for ANY order” was wrong** (MIN-362, MIN-363), and the nuance
 * is not school: measured order by order in
 *    [opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts),
 * `cd <elsewhere>` publishes `external_directory` and **never** `bash`, and `cd .`
 * like `popd` publish **nothing at all**. These three NEVER pass
 * in front of `checkCommand`. Out of thirty orders for a non-deposit file,
 *    ten publish `external_directory`, twenty publish only `bash` — including
 *    `grep`, `find`, `sed`, `node`, and `curl`, which `checkCommand` (which only
 * targets git) lets through. **This module is an anti-accident, not a perimeter**;
 * the only perimeter that would hold is at the OS level (§2 of
 *    [the local audit](../../../../docs/audits/agent-local-2026-08-14.md)).
 * 2. **A write publishes `permission: "edit"`** with `metadata.filepath`
 * **ABSOLUTE** (and a `diff`), whatever the tool — `write`, `edit`,
 * `apply_patch`. A write OUTSIDE the repository publishes two: first
 *    `external_directory` (`metadata.parentDir`), puis `edit`.
 * 3. **`.git/` is not protected by anyone at opencode**: `write` on
 * `<repository>/.git/config` was **executed** and overwrote the file. It is
 * precisely what `assertNotGit` keeps (write a hook or a `config` =
 * exfiltration of the installation token), and this is the reason why
 * `edit` is in `ask` rather than `allow` in the tour config.
 * 4. **The response carries a MESSAGE, and the model reads it**:
 * `POST /permission/:id/reply {reply: "reject", message}` → the tool returns to
 * `status: "error"` with “The user rejected permission to use this specific
 * tool call with the following feedback: <message>”. This is what makes a
 * refusal remains what it has always been with us: a **tool error** that
 * the model reads and corrects, never a broken turn.
 */

/** A permission request, as the feed publishes it (`permission.asked`). */
export interface PermissionAsk {
  id: string;
  sessionId: string;
  /** The requested action: `bash`, `edit`, `external_directory`, `webfetch`… */
  permission: string;
  /** The tool call that triggered it — which ties the denial to the thread. */
  callId: string;
  /** `metadata.command` on a `bash`. */
  command?: string;
  /**
   * THE PATH OF WHICH THE REQUEST SPEAKS, and it does not travel to the same place according to
   * the tool (see `permissionPath` in [opencode-events.ts](opencode-events.ts)):
   * `metadata.filepath` on a WRITING, absolute (measurement n°2); `patterns[0]` on
   * a READ, relative to the worktree, because `ReadTool` publishes a `metadata`
   * EMPTY — measured on the binary, and this is the kind of detail that makes you refuse
   * 100% reads when you assume it instead of looking at it.
   */
  filepath?: string;
  /**
   * THE FILES OF A `apply_patch`, ONE BY ONE (`metadata.files`).
   *
   * `write` and `edit` touch a file and publish a `filepath`. `apply_patch`
   * in key N and publishes **only one request**, whose `filepath` is the
   * RECOLLERED list: `resources.join(", ")` (measured on binary). Taken for a
   * path, this string gave a line of "changed files" bearing three to
   * five names separated by commas — and, more serious, a `assertNotGit` which does not
   * sees that a segment `a.ts, .git`: the only guardrail of the depot was passing by
   * a patch that touches `.git/config` second.
   *
   * `metadata.files` carries the real list, with the nature of each gesture. Empty
   * (or absent) on single-file tools: `filepath` is sufficient and binding.
   */
  files?: { path: string; status: "added" | "modified" | "deleted" }[];
  /**
   * `metadata.subagent_type` on a `task`: the requested sub-agent, REQUESTED
   * BEFORE opencode resolves it (measured, cf. `decideTask`).
   */
  subagentType?: string;
  /**
   * The URL of a `webfetch` (MIN-360). It was not read by anyone, for one
   * reason which ceased to be true: `webfetch: "allow"` did not publish any
   * request, so this verdict never saw a single fetch.
   */
  url?: string;
}

/**
 * What the supervisor knows about the subagents at the time of the verdict — the offer of the
 * turn and what is already turning. Absent = no delegation to arbitrate.
 */
export interface SubagentContext {
  /** The `subagent_type` declared in config ([opencode-config.ts](opencode-config.ts)). */
  names: ReadonlySet<string>;
  /** Girls alive right now. */
  running: number;
  /**
   * DELEGATIONS AUTHORIZED AND NOT YET BORN — without them, the ceiling is limited
   * nothing of the only case that he has to limit.
   *
   * A girl only enters `running` at her BIRTH, and the stream only announces her
   * only afterwards (`metadata` from `task`, measured: `opencode-delegation.test.ts`
   * anchors `runningAtAsk === 0`). A round that calls `task` three times therefore saw
   * his three requests arbitrated before any girl existed, and `running`
   * was worth zero to all three — the ceiling always passed. What we are counting here is
   * the credit opened between authorization and birth.
   */
  pending?: number;
  /** Simultaneous ceiling (`app_config`, MIN-112). */
  maxParallel: number;
}

/** What the supervisor should answer, and why. */
export interface PermissionVerdict {
  reply: "once" | "reject";
  /** The word to the model about a refusal — it happens in the tool error (measure no. 4). */
  message?: string;
  /** `tool_result.reason`, so that the refusal remains measurable in the base. */
  reason?: string;
}

const ALLOW: PermissionVerdict = { reply: "once" };

/** `tool_result.reason` of a permission that this module does not know. */
export const UNKNOWN_PERMISSION_REASON = "unknown_permission";

/** `tool_result.reason` of a cut loop (`doom_loop`). */
export const DOOM_LOOP_REASON = "doom_loop";

/** `tool_result.reason` of an ability that the tower config has turned off. */
export const DISABLED_PERMISSION_REASON = "disabled_permission";

/**
 * THE PERMISSIONS THAT WE READ, AND THE VERSION WHERE WE READ THEM (MIN-364, lot 7).
 *
 * ## The fault that it closes: a ratchet
 *
 * `default: reject` is the correct POSTURE on someone's machine — allow
 * what one has never read is no safeguard. But left alone, he makes
 * each increase in opencode a WITHDRAWAL of capacity that no one decides: `lsp`,
 * `plan_enter`/`plan_exit`, `skill`, `doom_loop` were all refused “by
 * construction”, and would have remained so indefinitely (§5.5 of the audit of 08/15).
 *
 * What was missing was not the refusal, it was the gesture that lifted it. Here it is:
 * **this list is what the harness read and decided**, and
 * `REVIEWED_OPENCODE_VERSION` says which version. A test falls as soon as
 * `OPENCODE_VERSION` avance ([opencode-permissions.test.ts](opencode-permissions.test.ts)) :
 * rereading becomes a stage of the version upgrade, not an oversight.
 *
 * ## How to reread it, on the next climb
 *
 * The binary carries its own ruleset by default, and it is this which is authentic:
 * `strings opencode | grep 'doom_loop:"ask"'` gives the complete block
 * (`{"*":"allow", doom_loop:"ask", external_directory:{…}, question:"deny",
 * plan_enter:"deny", plan_exit:"deny", read:{…}}` in 1.18.16), and
 * `GET /experimental/tool` on a bare server gives the tools ids. All
 * permission more is placed here with a verdict and a sentence for the model.
 */
export const REVIEWED_OPENCODE_VERSION = "1.18.16";

/**
 * The permission names that `decidePermission` explicitly processes. Everything that
 * does not fall into the `default` — therefore refused locally, saying so.
 */
export const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set([
  // What really publishes with our (measured) config...
  "bash",
  "edit",
  "read",
  "webfetch",
  "task",
  "external_directory",
  "question",
  "doom_loop",
  // …and what the config serves in `allow` or in `deny`, therefore which does not publish
  // Today. Read and decide anyway: an ACL that changes version should not
  // not break a turn on a leave whose conduct is obvious.
  "glob",
  "grep",
  "websearch",
  "todowrite",
  "skill",
  "plan_enter",
  "plan_exit",
]);

/** `tool_result.reason` of a secrets file read refused. */
export const SECRET_FILE_READ_REASON = "secret_file_read";

/**
 * WHAT THE VERDICT MUST KNOW ABOUT THE WORLD WHERE IT APPLIES (MIN-360).
 *
 * A single field, and it is worth three: on the local path, the machine is no longer
 * a frontier. The repository is that of the user (with its real `.env`), the
 * local loop is its own (with its servers and its model key), and a
 * permission that we do not know can no longer be “without issue by default”.
 */
export interface PermissionScope {
  /** Does the trick play on the user's machine (`isLocalJob`)? */
  local?: boolean;
  /**
   * HARNESS PORTS ON THE LOCAL LOOP (MIN-364, decision D8) — the proxy
   * LLM, the tools bridge, the opencode server of the tour.
   *
   * These are the ONLY ones that `webfetch` still refuses locally. The refusal before
   * concerned all private space, and its collateral damage was exactly
   * the capacity we want: `curl localhost:3000` to go to the page we want
   * just wrote render. Both are distinguished by the port, and the supervisor
   * is the only one to know them — hence the passage through the scope rather than a
   * constante.
   *
   * Empty = we do not know which ports to protect, and we then refuse all
   * local loop: ignorance does not mean authorization.
   */
  harnessPorts?: readonly number[];
}

/**
 * THE LITERAL VERDICT OF A `webfetch` — the PURE half of the guardrail (MIN-360,
 * then MIN-364 for the port).
 *
 * The other half is the RESOLUTION of the name, which requires a resolver and therefore lives
 * in [local-guard.ts](local-guard.ts). Both are necessary: ​​this one
 * refuses `http://127.0.0.1:<harness port>`, the other refuses the public domain
 * that points to it.
 */
export function webfetchLiteralVerdict(
  url: string | undefined,
  harnessPorts: readonly number[] = [],
): PermissionVerdict {
  const hostname = fetchHostname(url);
  if (!hostname) {
    return {
      reply: "reject",
      message: "The harness could not read the URL to fetch, so it refused it.",
      reason: PRIVATE_FETCH_REASON,
    };
  }
  if (isPrivateHostname(hostname) && isHarnessPort(url, harnessPorts)) {
    return { reply: "reject", message: privateFetchMessage(hostname), reason: PRIVATE_FETCH_REASON };
  }
  return ALLOW;
}

/**
 * Is this fetch aimed at a harness service? Without a list, EVERYTHING counts: this is the
 * prudent conduct of ignorance, and it returns the behavior before D8.
 */
export function isHarnessPort(url: string | undefined, harnessPorts: readonly number[]): boolean {
  if (harnessPorts.length === 0) return true;
  return harnessPorts.includes(fetchPort(url));
}

/**
 * THE HARNESS VERDICT. Never lifts: a guardrail that lifts on a form
 * unexpected would stop the trick instead of protecting it, and the only safe path
 * when you do not understand the request is to refuse it by saying so.
 */
export function decidePermission(
  ask: PermissionAsk,
  /**
   * THE RUN DEPOSIT (`job.layout.repoDir`), and it has been passed rather than read since
   * a constant (MIN-354).
   *
   * This is THE parameter that made this verdict unusable outside of microVM:
   * `metadata.filepath` is ABSOLUTE (measure n°2), therefore compared to `/vercel/sandbox/repo`
   * on a machine where the deposit lives elsewhere, it ALWAYS came out — the harness
   * refused 100% of the scriptures, believing he was keeping something.
   */
  repoDir: string,
  subagents?: SubagentContext,
  scope: PermissionScope = {},
): PermissionVerdict {
  switch (ask.permission) {
    case "task":
      return decideTask(ask, subagents);

    case "bash": {
      const command = (ask.command ?? "").trim();
      // A `bash` request without an order does not exist in the measure. If she
      // appeared, we would not know what we were authorizing, so we refuse it.
      if (!command) {
        return {
          reply: "reject",
          message: "The harness could not read the command to run, so it refused it.",
        };
      }
      // The travel scope: `git commit` is refused in microVM (harness commit)
      // and rendered to the model on someone's machine (D6, MIN-364).
      const verdict = checkCommand(command, { local: scope.local === true });
      if (verdict.allowed) return ALLOW;
      return { reply: "reject", message: verdict.reason, reason: FORBIDDEN_COMMAND_REASON };
    }

    case "edit": {
      /**
       * ALL PATHS OF DEMAND, and not just the first: a
       * permission request for `apply_patch` with N entries (see `PermissionAsk.files`). A
       * single path refused denies the entire request — there is no "yes"
       * for these three files, not for the fourth” in the protocol, and
       * This is the prudent sense.
       */
      const targets = editTargets(ask);
      if (targets.length === 0) {
        return {
          reply: "reject",
          message: "The harness could not read the path to write, so it refused the edit.",
        };
      }
      try {
        for (const { path } of targets) {
          /**
           * ⚠ IT IS THIS `case` WHICH MADE THE BORDER, not the config line
           * (MIN-364, decision D5).
           *
           * `absoluteInRepo` LIFTING on any path outside the depot: `external_directory`
           * could go to `allow`, the writing was refused here. THE
           * perimeter therefore opens here, and nowhere else.
           *
           * What remains, and which does not depend on any perimeter decision:
           * ****CODE_0__**. `assertNotGit` refuses a `.git` segment ANYWHERE in
           * the path, agent repository or neighboring repository — a hook written there executes
           * at the next gesture of a human, and a `config` carries
           * identifiers. This is the only remaining scope of §9 of the audit.
           */
          const abs = scope.local ? absoluteOnDisk(repoDir, path) : absoluteInRepo(repoDir, path);
          assertNotGit(repoDir, abs, path);
        }
        return ALLOW;
      } catch (err) {
        return { reply: "reject", message: (err as Error).message };
      }
    }

    /**
     * EXIT THE FILE (MIN-364, decision D5) — and this `case` has changed in nature
     * twice, which is worth writing about.
     *
     * It has been described as "a second curtain" and as "that which holds the model
     * away from the rest of the record”: both were wrong. Our config posed
     * `external_directory: "deny"`, and a config `deny` **short-circuits before
     * any publication** — measured, the request never arrived here
     * ([opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts)).
     * And even published it would have held nothing: twenty of the thirty orders
     * measured reach an external folder without ever publishing anything else
     * as `bash` (measurement n°1 at the head of the file).
     *
     * **Locally, it is now in `ask` and this branch is running — for
     * allow.** The wall before only grabbed the honest tools and pushed
     * work towards `bash`, that is to say towards the place where we no longer see
     * Nothing. Authorize by LEAVING A TRACE (the supervisor publishes an event to
     * each file exit, cf. `supervisor.ts`) is the exact opposite: the
     * verdict does not restrict anything, and the thread keeps the list of excursions.
     *
     * The “ask before writing elsewhere” rule lives in PROMPT, and it
     * is assumed as a courtesy and not as a wall (D5, point 1): a
     * model who doesn't read it writes it elsewhere without asking, and nothing stops her.
     * What would not be acceptable is to describe it elsewhere as a
     * garantie.
     *
     * Apart from the local path, nothing moves: the microVM only has one repository, the config there
     * keeps its `deny`, and this branch is never reached.
     */
    case "external_directory":
      if (scope.local) return ALLOW;
      return {
        reply: "reject",
        message: `The harness only allows work inside the repository (${repoDir}).`,
      };

    /**
     * READING (MIN-360) — a request that never happened, because our
     * config disait `read: "allow"`.
     *
     * What this line erased is a protection that opencode DELIVERS: its
     * ruleset by default sets `*.env` and `*.env.*` to `ask`. Our rules being
     * concatenated after and the last one which matches winner, our `allow`
     * removed the question. No consequence on a disposable clone; in fashion
     * current repository, this is the REAL `.env` of the user, with their real keys,
     * which silently entered the context of the model.
     *
     * ⚠ WHAT THIS REFUSAL DOES NOT CLOSE, and it is better to write it than leave it
     * believe: `bash` remains open, and `cat .env` does not pass through here. This is the
     * “paper wall” of §2 of the audit — a reading scope that would hold
     * really would require keeping the SHELL, which is not from this lot. This
     * This refusal closes the path by which a distracted model gets there alone.
     */
    case "read": {
      const path = (ask.filepath ?? "").trim();
      if (!path) {
        return {
          reply: "reject",
          message: "The harness could not read the path to open, so it refused the read.",
        };
      }
      if (!isSecretFile(path)) return ALLOW;
      return {
        reply: "reject",
        message:
          `Refused reading ${path} — environment files hold this machine's real credentials, ` +
          `and this session runs on someone's own computer. If you need to know which ` +
          `variables exist, read the \`.env.example\` next to it.`,
        reason: SECRET_FILE_READ_REASON,
      };
    }

    /**
     * THE FETCH (MIN-360, then MIN-364). Except local path, it is in `allow` in
     * the config and therefore does not arrive here. Locally, it is the local loop of
     * the user it reaches — see [private-address.ts](private-address.ts).
     *
     * The control is in TWO stages: the literal here, the RESOLUTION in
     * [local-guard.ts](local-guard.ts). Without the second, a public domain which
     * pointing to the proxy port would pass — and this is the form that an attack takes.
     *
     * What has changed with D8: the refusal concerns the PORT, no longer everything
     * private space. An agent who can't go to the page he came from
     * to write no longer has a feedback loop at all, and it is precisely that
     * that the desktop app makes possible for the first time.
     */
    case "webfetch":
      return scope.local ? webfetchLiteralVerdict(ask.url, scope.harnessPorts ?? []) : ALLOW;

    /**
     * READING WITHOUT CHALLENGES (MIN-364, lot 7). `glob` and `grep` are in `allow`
     * in our config and therefore do not publish — but they are READ and decided,
     * and this is what distinguishes them from a `default`: the day when a rise in
     * version puts them in `ask`, they pass, without a turn being broken on them.
     */
    case "glob":
    case "grep":
      return ALLOW;

    /**
     * THE QUESTION (MIN-364, lot 7) — it is NOT consulted: measured, a
     * `ask_user` publishes `question.asked` to the feed and never goes through a
     * request for permission. What really removes `ask_user` from a routine is
     * the agent toolset (`primaryTools`).
     *
     * We still authorize it, rather than leaving it at `default`: if a
     * version started to publish it, a refusal would break `ask_user` silently
     * on 100% of local towers — for a capacity that the config already has
     * trench just above.
     */
    case "question":
      return ALLOW;

    /**
     * THE LOOP (MIN-364, lot 7). `doom_loop` is released when the model replays
     * exactly the same tool call with exactly the same input, multiple
     * times in a row (noted in binary 1.18.16): the question asked is
     * “do we continue despite repeated failures? ".
     *
     * We answer NO, and it is a decision, not ignorance: no one is
     * in front of the screen to arbitrate, and letting a loop run costs
     * money per round to produce the same thing. The message must say
     * what is happening — a refusal that resembled “unknown permission” does not
     * said nothing about the loop, so didn't help getting out of it.
     */
    case "doom_loop":
      return {
        reply: "reject",
        message:
          `You have called the same tool with the same input several times in a row, and it keeps ` +
          `failing. Calling it again will not change the answer: read the error, then either fix ` +
          `what it points at or take another route. If nothing works, say so in your reply — ` +
          `looping costs a round each time and produces the same thing.`,
        reason: DOOM_LOOP_REASON,
      };

    /**
     * WHAT THE CONFIG HAS ALREADY OFF (MIN-364, batch 7) — `websearch` and `todowrite`
     * are in `deny`, `skill` is removed from the toolset, `plan_enter`/`plan_exit`
     * (the opencode plan mode) do not make sense in a tour anchored to a ticket.
     *
     * A `deny` of config bypasses before publication: these branches do not
     * are not running today. They are written so that refusal is a
     * DECISION reread rather than a defect, and for the model to read a pattern
     * rather than “the harness does not know this permission”.
     */
    case "websearch":
    case "todowrite":
    case "skill":
    case "plan_enter":
    case "plan_exit":
      return {
        reply: "reject",
        message:
          `\`${ask.permission}\` is off in this session — minddy serves its own equivalent ` +
          `(\`web_search\` for the web, \`update_plan\` for the checklist, the ticket's plan for ` +
          `the rest). Use those instead.`,
        reason: DISABLED_PERMISSION_REASON,
      };

    /**
     * THE PERMISSION THAT WE DON'T KNOW (MIN-360, then MIN-364 lot 7).
     *
     * `default: return ALLOW` silently allowed any undeclared type to pass.
     * This was tenable in a disposable microVM; on someone's machine,
     * authorizing by default what you have never read is the opposite of a safeguard.
     *
     * ⚠ BUT THE DEFAULT REFUSAL IS A RATCHET, and it is §5.5 of the audit of the
     * 08/15: as it stands, each opencode rise REMOVES capacity instead
     * to add more, without anyone deciding to do so. What was missing is not the
     * refusal — it’s the gesture that lifts it: `KNOWN_PERMISSIONS` name what we have
     * read, `REVIEWED_OPENCODE_VERSION` says when, and a test falls to the next
     * version upgrade until the rereading has taken place.
     *
     * Refusal NAMES permission: that’s what makes it fixable. The first
     * version upgrade which adds one is seen in `agent_run_events` rather
     * rather than opening by itself.
     */
    default:
      if (!scope.local) return ALLOW;
      return {
        reply: "reject",
        message:
          `The harness does not know the permission "${ask.permission}", and this session runs ` +
          `on a real computer — so it refused it rather than allow something it has never ` +
          `checked. Do what you were doing another way.`,
        reason: UNKNOWN_PERMISSION_REASON,
      };
  }
}

/**
 * THE DELEGATION (MIN-286, lot 2, task 12) — the only point where we can still
 * say no to a `task`, and the only one from which the model hears something other than a
 * opencode message.
 *
 * Two refusals, and nothing else:
 *
 * 1. **The simultaneous ceiling** (`maxParallel`, set in `app_config`). This is the
 * same refusal, except for the words, as that of the house register
 * ([subagent.ts](../subagent.ts)): the sandbox is SHARED, and two girls who
 * write at the same time step on each other. At opencode the `task` of first
 * plan BLOCKS the parent, so the simultaneous only comes from a round that calls
 * `task` several times — this is exactly what we limit here.
 * 2. **A subagent that does not exist.** Opencode would respond “Unknown agent type:
 * X", without saying what is offered in the tour (the agents are in the description
 * of the tool, which a model may have lost sight of). We return the offer to him, as
 * `makeSubagentModelResolver` made favorites.
 *
 * The rest passes: the config has already decided what is offered, and a safeguard
 * which restates the config is one more place where the two can diverge.
 */
function decideTask(ask: PermissionAsk, subagents?: SubagentContext): PermissionVerdict {
  if (!subagents) return ALLOW;

  // Alive AND promised: an authorization already given counts, otherwise one round
  // which calls `task` in a burst passes entirely under the ceiling (see `pending`).
  const engaged = subagents.running + (subagents.pending ?? 0);
  if (engaged >= subagents.maxParallel) {
    return {
      reply: "reject",
      message:
        `Too many sub-agents running at once (${engaged}/${subagents.maxParallel}). ` +
        `Wait for one to report back before delegating again.`,
      reason: "subagent_limit",
    };
  }

  const requested = (ask.subagentType ?? "").trim();
  if (!subagents.names.has(requested)) {
    return {
      reply: "reject",
      message:
        `Unknown sub-agent type ${JSON.stringify(requested)}. ` +
        `Available for this session: ${[...subagents.names].join(", ")}.`,
      reason: "unknown_subagent",
    };
  }
  return ALLOW;
}

/**
 * What a write request commits, file by file. `files` is authentic from
 * that it is there (`apply_patch`, which also carries the NATURE of each gesture);
 * otherwise it is `filepath`, which is then a true unique path (`write`, `edit`)
 * of which we can only say “modified” — the git list, at the end of the tour,
 * tranchera.
 */
export function editTargets(ask: PermissionAsk): NonNullable<PermissionAsk["files"]> {
  const files = (ask.files ?? [])
    .map((f) => ({ ...f, path: f.path.trim() }))
    .filter((f) => f.path);
  if (files.length > 0) return files;
  const single = (ask.filepath ?? "").trim();
  return single ? [{ path: single, status: "modified" }] : [];
}

/**
 * The absolute path of a write, RELEASED if it leaves the repository. A relative path
 * passes through `resolveWithin` (the `..` is normalized there, the output is refused there);
 * an absolute is compared to the deposit as is.
 */
function absoluteInRepo(repoDir: string, filepath: string): string {
  if (!filepath.startsWith("/")) return resolveWithin(repoDir, filepath);
  const resolved = posixPath.normalize(filepath);
  if (resolved !== repoDir && !resolved.startsWith(`${repoDir}/`)) {
    throw new Error(`Path escapes the repository: ${filepath}`);
  }
  return resolved;
}

/**
 * THE SAME PATH, WITHOUT THE BORDER (MIN-364, decision D5) — on the machine
 * the user, where the entire disk is within range.
 *
 * No longer LIFTS on the depot exit; it normalizes, and that's it. What
 * still keeps something is `assertNotGit`, called just after by
 * the caller: a `.git` segment, wherever it is on the disk, remains refused.
 *
 * A relative path remains relative to the DEPOSIT, `..` included: it is the cwd of the
 * model, and a `../other-project/x.ts` designates the neighboring folder.
 */
function absoluteOnDisk(repoDir: string, filepath: string): string {
  return posixPath.normalize(filepath.startsWith("/") ? filepath : `${repoDir}/${filepath}`);
}
