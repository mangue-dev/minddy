import {
  newVerificationSink,
  noteVerificationCommand,
  noteVerificationStale,
  type VerificationSink,
} from "../diagnostics";
import {
  gateCreatePr,
  gateWritePlan,
  makeDeliveryGate,
  type DeliveryGate,
  type DeliveryGateDeps,
} from "../delivery-gate";
import { newPlanWriteSink, watchPlanWrites } from "../plan-closure";
import { turnDiffStat, turnTouchedPaths, type RepoHost } from "../repo-host";
import type { PlatformToolHandler } from "../agent-contract";

/**
 * DELIVERY RULES, HELD ABOVE OPENCODE (MIN-286, lot 2, task 14).
 *
 * What the harness checks has not changed one line: the validation gate
 * ([delivery-gate.ts](../delivery-gate.ts)), l'auto-relecture du diff
 * ([self-review.ts](../self-review.ts)), the closing of the plan
 * ([plan-closure.ts](../plan-closure.ts)) and diagnostics
 * ([diagnostics.ts](../diagnostics.ts)) are the SAME functions, with their
 * tests unchanged. This module is the wiring: it gives them, in the world
 * of opencode, the three facts that they read in our tools.
 *
 * | What the ruler reads | Where the homemade harness took it | Where we take it here |
 * | --- | --- | --- |
 * | `editedPaths` | the tool `edit_file` / `write_file` / `apply_patch` | the **permission request** `edit`, authorized (`metadata.filepath`) |
 * | `verification` (has the model tested?) | the exit code of `run_command` | `state.metadata.exit` of tool `bash` |
 * | `planWrites` | `watchPlanWrites` on ticket tools | the same `watchPlanWrites`, placed on the deck hatch |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY HERE, AND NOT IN OPENCODE PLUGIN AS THE PLAN ANNOUNCED
 *
 * The framing said “reimplemented as an opencode plugin
 * (`tool.execute.before/after`, `session.idle`)”. Two things measured since
 * made it useless, and expensive:
 *
 * - **the tools that trigger the rules ALREADY go through us.**
 * `write_issue_plan` is a domain tool, while `validate_changes` is the explicit
 * supervisor preflight and `create_pr` is the publishing operation: they arrive at
 * bridge ([tool-bridge.ts](tool-bridge.ts)), which is exactly the
 *   `tool.execute.after` qu'un plugin aurait offert, sans second processus ni
 *   second vocabulaire ;
 * - **the two facts which come from the INTEGRATED tools (editing, shell) arrive
 * on stream `/event`**, which the supervisor is already reading — permission to
 * one, the part of the tool for the other.
 *
 * A plugin would therefore have added a third place where the harness speaks to the
 * model, in a generated file running *in* opencode, without rendering anything other than
 * these two paths do not yield. The construction site rule holds: **we do not redeclare
 * never what the only source already says.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WE ASSUME, AND WHAT IS SEEN
 *
 * 1. **Editing is noted at AUTHORIZATION, not at execution.** A writing
 * authorized then failed (disk full, `oldString` not found) leaves its
 * path in `editedPaths`: the trick pays a type-check that it did not have to
 * pay. This is the prudential direction — the opposite (missing an actual edition) would make
 * the silent door on the code that goes to a human.
 * 2. **The shell only fills the check register if its exit code
 * is READABLE** (`metadata.exit`, a number — the opencode source sets it to
 * each command, `null` on an abort or a timeout). Without him, we
 * concludes nothing, and the door restarts the entire sequence: a false “it’s green”
 * would SILENCE the harness on a trick that no one has checked (`diagnostics.ts`).
 */

/** What a tool renders to the bridge, the voice of the harness included. */
export interface DeliveryToolOutcome {
  result: unknown;
  success: boolean;
  /**
   * What the harness has LONG to say about this call. The deck sticks it AFTER it
   * result, in the text that the tool renders to the model: at opencode a
   * tool result IS text, there is no `user` message to insert
   * after the round like the house loop did.
   */
  followUp?: string;
}

/** A tool that the supervisor runs himself — `create_pr` today. */
export type DeliveryTool = (args: Record<string, unknown>) => Promise<DeliveryToolOutcome>;

/**
 * Edit paths guarded at the checkpoint. The same value as
 * [turn.ts](turn.ts): what we keep is used to highlight the errors of
 * typing the tour, not keeping a diary.
 */
export const CHECKPOINT_EDITED_PATHS_MAX = 200;

export interface OpencodeDeliveryDeps {
  host: RepoHost;
  emit: DeliveryGateDeps["emit"];
  /** Baseline of the turn diff (`lastFilesSha` of the checkpoint, or the original head). */
  filesFromSha: string;
  /** Files edited by PREVIOUS tours, such as the checkpoint carries them. */
  editedPaths?: readonly string[];
  /** Seed of the lock “the depot has been hit” — comes from the checkpoint. */
  repoTouched?: boolean;
  /**
   * THE PERIMETER OF THE TOUR in current depot mode (MIN-358) — cf.
   * `DeliveryGateDeps.scopePaths`. Absent en mode clone.
   *
   * It is the supervisor who calculates it, because he alone has the snapshot taken
   * at the START of the round; this module returns the editions of this tour in exchange
   * (`turnEditedPaths`), which are the other half.
   */
  scopePaths?: () => Promise<readonly string[]>;
  /** What's left of the wall budget in the round, so that the door shuts up in time. */
  remainingMs: () => number;
}

export interface OpencodeDelivery {
  /**
   * The hatch of the domain tools, wrapped: it notes the written plan
   * (`watchPlanWrites`) and returns control of the plan to `followUp`
   * (`gateWritePlan`).
   */
  wrapDomainTool(handler: PlatformToolHandler): PlatformToolHandler;
  /** Legacy compatibility wrapper for callers that still request delivery checks. */
  wrapCreatePr(handler: DeliveryTool): DeliveryTool;
  /** Explicit repository validation, separate from publishing a pull request. */
  wrapValidateChanges(handler: DeliveryTool): DeliveryTool;
  /** A write has just been AUTHORIZED — absolute or relative path to the repository. */
  noteEdit(filepath: string): void;
  /** A model command has completed, with its exit code. */
  noteShell(command: string, exit: number): void;
  /** Note pending edits as "repository touched", before pushing. */
  noteEdits(): void;
  /**
   * LOOK AT THE WORK TREE, and open the door if it has moved. The only way to
   * see what has not gone through any writing tool (see `noteRepoTouched`).
   */
  probeRepoTouched(): Promise<void>;
  repoTouched(): boolean;
  /** What the checkpoint should carry — capped, and empty when there is nothing. */
  checkpointEditedPaths(): string[];
  /**
   * THE EDITIONS OF THIS ROUND, without those he inherited from the checkpoint
   * (MIN-358) — the “tools” half of the perimeter of the lathe.
   *
   * The distinction was of no use as long as the depot was ours. She decides
   * of everything in current deposit mode: after a round, the agent's work remains
   * "modified" in the working tree (our commits live on a ref, not on
   * the HEAD of the user), so confusing it with his own would make
   * each file of the agent for human work carried away.
   */
  turnEditedPaths(): string[];
}

export function makeOpencodeDelivery(deps: OpencodeDeliveryDeps): OpencodeDelivery {
  const editedPaths = new Set<string>(deps.editedPaths ?? []);
  /**
   * The allocation log never empties during the run. `editedPaths`
   * is a work queue for type-check and the gate consumes it; THE
   * reuse for diff would lose the identity of the files right after
   * their verification. Above all, only `noteEdit` and the checkpoint power this
   * log: Git global delta cannot know which agent wrote.
   */
  const attributedPaths = new Set<string>(deps.editedPaths ?? []);
  /** CE tour editions (see `turnEditedPaths`). `editedPaths`, he starts from
   * checkpoint AND empties at each type-check: neither can say
   * what the current tour wrote. */
  const turnEdited = new Set<string>();
  const planWrites = newPlanWriteSink();
  const verification: VerificationSink = newVerificationSink();

  const gate: DeliveryGate = makeDeliveryGate({
    host: deps.host,
    emit: deps.emit,
    editedPaths,
    planWrites,
    verification,
    filesFromSha: deps.filesFromSha,
    repoTouched: deps.repoTouched ?? false,
    ...(deps.scopePaths ? { scopePaths: deps.scopePaths } : {}),
    logPrefix: "[supervisor]",
  });

  /**
   * WHAT THE SHELL DID AT THE DEPOSIT, READ IN THE DEPOSIT (MIN-286).
   *
   * Under opencode, delete and rename are commands, not tools: neither
   * `rm`, neither `mv`, nor `sed -i`, nor a codemod goes through a request for
   * permission `edit`, so nothing filled `editedPaths` — and a turn that does not
   * caused it to pass through the delivery door without a check, whereas
   * the home loop saw it through its tools `delete_file` / `move_file`.
   *
   * Two gestures, and they don't say the same thing: the files still there
   * enter `editedPaths` (this is what the targeted type-check should look at),
   * and the lock is set as soon as the tree differs — a deletion leaves no
   * path to note, but it counts just as much.
   *
   * End-to-end best effort: a crashed git read should never
   * prevent a trick from delivering.
   */
  const probeRepoTouched = async (): Promise<void> => {
    // A tour which has edited by its tools has nothing to learn from git: `noteEdits`
    // latch already, and replacing its list with the ENTIRE diff of the round would expand the
    // type-check targeted at anything that has changed since the first round. The survey
    // is a REMEDY, for the only case where there is nothing else.
    if (gate.repoTouched() || editedPaths.size > 0) return;
    // The perimeter of the TERMINAL tower survey in current deposition mode (MIN-358):
    // without it, the user's WIP would make a round say purely
    // conversational that he touched the deposit, and would make him pay for a type-check
    // and a suite of tests on files he's never heard of.
    const scope = await deps.scopePaths?.().catch(() => undefined);
    const stat = await turnDiffStat(deps.host, deps.filesFromSha, scope).catch(() => null);
    if (!stat) return;
    if (stat.files.length === 0 && stat.untracked === 0 && stat.lines === 0) return;
    /**
     * THE COMPLETE LIST, and not that of `turnDiffStat`: it EXCLUDES the
     * deletions and only counts new files in number. A tour that has
     * fact that `rm lib/x.ts` therefore left `editedPaths` empty — and the type-check
     * end of turn is silent on an empty list (`delivery-gate.ts`), while
     * this is exactly the change that breaks the typing elsewhere. The loop
     * house, she noted the deleted path (`delete_file` → `noteEdited`).
     */
    for (const path of await turnTouchedPaths(deps.host, deps.filesFromSha, scope)) {
      editedPaths.add(path);
    }
    for (const path of stat.files) editedPaths.add(path);
    /**
     * …AND WHAT THE MODEL CHECKED IS NO LONGER WORTH. Same rule as
     * `noteEdit`: a green `npm test` launched BEFORE these changes says nothing
     * of them, and leaving it standing would SILENCE the delivery door on a turn
     * of which no one has seen the code running. The house loop also expired,
     * from its editing and deletion tools.
     */
    noteVerificationStale(verification);
    gate.noteRepoTouched();
  };

  return {
    wrapDomainTool: (handler) =>
      gateWritePlan(watchPlanWrites(handler, planWrites), gate, deps.remainingMs),

    wrapCreatePr: (handler) => {
      const gated = gateCreatePr(handler, gate, deps.remainingMs);
      // Surveyed BEFORE the door: it is she who decides to return the controls or
      // to push, and she decides on `repoTouched`.
      return async (args) => {
        await probeRepoTouched();
        return await gated(args);
      };
    },

    wrapValidateChanges: (handler) => async (args) => {
      await probeRepoTouched();
      const checks = await gate.checkChanges(deps.remainingMs()).catch(() => null);
      const out = await handler(args);
      return checks
        ? { ...out, followUp: checks }
        : {
            ...out,
            result: {
              ...(typeof out.result === "object" && out.result !== null ? out.result : {}),
              note: "No automated validation output was produced for the current worktree.",
            },
          };
    },

    probeRepoTouched,

    noteEdit(filepath: string) {
      const relative = repoRelative(deps.host.layout.repoDir, filepath);
      if (!relative) return;
      editedPaths.add(relative);
      attributedPaths.add(relative);
      turnEdited.add(relative);
      // Any edition expires what the model had checked: green BEFORE the
      // latest edition means nothing (`diagnostics.ts`).
      noteVerificationStale(verification);
    },

    noteShell(command: string, exit: number) {
      noteVerificationCommand(verification, command, exit);
    },

    noteEdits: () => gate.noteEdits(),
    repoTouched: () => gate.repoTouched(),
    checkpointEditedPaths: () => [...attributedPaths].slice(-CHECKPOINT_EDITED_PATHS_MAX),
    turnEditedPaths: () => [...turnEdited],
  };
}

/**
 * The path RELATIVE to the repository, or `""` if the path is not in it.
 *
 * `metadata.filepath` from OpenCode is absolute, while the type-check and the
 * targeted test runner speak in repository paths. Paths outside the repository
 * are irrelevant to delivery diagnostics and are omitted.
 */
export function repoRelative(repoDir: string, filepath: string): string {
  const trimmed = filepath.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("/")) return trimmed.replace(/^\.\//, "");
  if (trimmed === repoDir) return "";
  return trimmed.startsWith(`${repoDir}/`) ? trimmed.slice(repoDir.length + 1) : "";
}
