import {
  typeErrorsForTurn,
  TYPECHECK_MIN_BUDGET_MS,
  testFailuresForTurn,
  TEST_MIN_BUDGET_MS,
  TEST_RELATED_MIN_BUDGET_MS,
  newVerificationSink,
  type TestScope,
  type VerificationSink,
} from "./diagnostics";
import {
  formatSelfReview,
  overwriteSitesForTurn,
  SELF_REVIEW_MIN_BUDGET_MS,
} from "./self-review";
import { planReviewForTurn, PLAN_REVIEW_MIN_BUDGET_MS } from "./plan-review";
import { planClosureForTurn, PLAN_CLOSURE_MIN_BUDGET_MS } from "./plan-closure";
import { turnDiff, turnDiffStat, type RepoHost } from "./repo-host";
import type { PlanWriteSink } from "./plan-closure";
import type { PlatformToolHandler } from "./agent-contract";
import type { EmitAgentEvent } from "./agent-contract";

/**
 * THE DELIVERY DOOR — the only place the harness checks anything
 * (MIN-263).
 *
 * WHAT THIS MODULE WAS, AND WHY IT CHANGED ITS NATURE. He held the controls
 * END OF TOUR: the model wrote his response, the harness spoke again
 * (type-check, tests, rereading of the diff), the tour started again, and the model responded
 * a second time. Three successive tickets attempted to make this mechanism
 * livable — the rule that prohibits responding to the test (MIN-256), then the
 * draft returned to the model because the rule alone was not enough (MIN-249 bis),
 * then the reduction of the controls themselves (MIN-262). None attacked the cause:
 * **we reopened a completed round**, and everything else flowed from there.
 *
 * WHAT THE OTHER TWO ARE DOING. Codex does not execute anything: its “Validating your
 * work” is PROMPT, and it even says to postpone the tests until the time of
 * finalize, because they cost time and slow down the iteration. OpenCode
 * executes, but always IN the result of a tool (the LSP diagnostics glued
 * to the editing result). Neither reopens a round.
 *
 * HENCE TODAY’S FORM, which takes from each person what is right:
 *
 * - **During work, the harness does NOTHING.** No type-check, no
 * tests, no proofreading. The model iterates without taxes, and the doctrine of
 * verification lives in the prompt (“from the most specific to the broadest”).
 * - **On delivery, it executes everything at once.** The first `create_pr` of a turn
 * who edited does not push anything: it returns typing errors, test failures
 * and the diff, in the `followUp` of a tool result. Zero response again, zero
 * declassified message — it is the OpenCode form applied to the gesture that counts at
 * us, and the moment that Codex itself designates.
 * - **The plan keeps its door** (`gateWritePlan`), for the same reason: a return
 * attached to the gesture costs nothing.
 *
 * THE RULE TO KEEP, if a control is added one day: **it clings to a gesture or
 * it does not exist.** A control that needs to reopen a turn to speak is a
 * control that we pay in model response, and the history of this file says what that
 * costs.
 *
 * WHAT WE ASSUME. A tour that does not open a pull request no longer sees any
 * harness control — that's the price of stability, and that's exactly the regime
 * of Codex. The guarantee of MIN-251 (the model concluded “*that's working as expected
 * since type checks are passing*" on a broken feature) therefore no longer holds by the
 * harness during the iteration: it is held by the prompt, and it is RESUMED hard
 * when the code goes to a human.
 */

/**
 * WHAT MAKES A “LITTLE” TOUR (MIN-262) — the one who does not have to pay for the sequel
 * entire when the model has not launched anything itself.
 *
 * Deliberately low, and not based on a theory: the case which opened the ticket
 * is “a line to withdraw” paid for four minutes. Three files and forty
 * lines cover a targeted correction and its test, not a feature. Above,
 * the entire suite takes over without discussion — and the NEW file comes out of
 * lot quelle que soit sa taille (`untracked`, cf. `turnDiffStat`).
 */
export const SMALL_TURN_MAX_FILES = 3;
export const SMALL_TURN_MAX_LINES = 40;

export interface DeliveryGateDeps {
  host: RepoHost;
  emit: EmitAgentEvent;
  /** Files edited since the last type-check. VOID by type-check. */
  editedPaths: Set<string>;
  /** The written plan for this round, noted in passing the tools ticket (`watchPlanWrites`). */
  planWrites: PlanWriteSink;
  /**
   * What the MODEL itself verified this round, noted in passing `run_command`
   * (MIN-262). Optional: a caller who does not find the cable finds the hook
   * from before, which restarts everything — the default is prudent behavior.
   */
  verification?: VerificationSink;
  /** Baseline of the turn diff (`lastFilesSha` of the checkpoint, or the original head). */
  filesFromSha: string;
  /** Seed of the lock “the depot has been hit” — comes from the checkpoint. */
  repoTouched: boolean;
  /**
   * THE PERIMETER OF THE TOUR, when the deposit is not ours (MIN-358).
   *
   * The two readings below which compare a reference to the TREE OF
   * WORK — testing scope and self-proofing — would otherwise see it as WIP
   * of the user: the model would proofread someone else's work as
   * if it were his, and `vitest related` would go to his files.
   *
   * ABSENT in clone mode, and this is the common case: there, the working tree has no
   * never contained anything other than the work of the agent.
   */
  scopePaths?: () => Promise<readonly string[]>;
  /** Calling engine log prefix (`[agent-vm]`, `[agent-execute]`). */
  logPrefix: string;
}

export interface DeliveryGate {
  /**
   * DELIVERY CONTROLS, requested by the `create_pr` gate: errors
   * typing, test failures and round diff, in ONE block. A single pass through
   * round — the second `create_pr` opens for good. `null` = nothing to say, or already said.
   */
  checkBeforeSubmit: (budgetMs: number) => Promise<string | null>;
  /**
   * Control of the plan CLAIMED ON THE GESTURE, for `write_issue_plan` (cf.
   * `gateWritePlan`). Only one passage, so the question is never asked twice
   * times. `null` = nothing to say, or already said.
   */
  checkPlanAfterWrite: (budgetMs: number) => Promise<string | null>;
  /** `repoTouched` UPDATED — the caller writes it down at the checkpoint. */
  repoTouched: () => boolean;
  /**
   * Note pending editions as “deposit affected”: the caller does so once
   * last time before the push, where the door may never have been passed
   * (tour sans pull request, interrompu, suspendu).
   */
  noteEdits: () => void;
  /**
   * THE DEPOSIT WAS AFFECTED OTHERWISE THAN BY AN EDITING TOOL (MIN-286).
   *
   * `noteEdits` latches on `editedPaths`, which comes from the writing tools. Below
   * opencode il n'y a plus de `delete_file` ni de `move_file` : un `rm`, un `mv`,
   * a `sed -i` or a codemod goes through the SHELL, fills nothing, and the
   * door then remained silent on a turn which nevertheless changed the deposit - neither
   * type-check, neither tests, nor rereading the diff before the pull request. The caller
   * who noticed the difference (the state of the working tree) says it here.
   */
  noteRepoTouched: () => void;
}

/**
 * The delivery gate of a chunk (function) or a round (microVM). All his state
 * is BY CHUNK and does not travel through the checkpoint — except `repoTouched`, which carries
 * on the TOUR and therefore arrives seeded.
 */
export function makeDeliveryGate(deps: DeliveryGateDeps): DeliveryGate {
  const { host, emit, editedPaths, planWrites, filesFromSha, logPrefix } = deps;
  const verification = deps.verification ?? newVerificationSink();
  /** The perimeter, or `undefined` when nothing limits (clone mode). A perimeter
   * which LIFTS limits nothing either: better a diff too wide than a door
   *  de livraison en panne. */
  const scope = async (): Promise<readonly string[] | undefined> => {
    if (!deps.scopePaths) return undefined;
    return await deps.scopePaths().catch(() => undefined);
  };

  /** Did the tour publish the repository? LATCHED lock, where `editedPaths` empties at
   * each type-check: after a restart, the round has always edited, even if the
   * model hasn't touched anything since. */
  let repoTouched = deps.repoTouched;
  /**
   * THE ONLY TWO LOCKS REMAINING (MIN-263). Each control carried its own,
   * from the time when the end of the tour could call them back indefinitely; they are
   * now claimed by a door that only opens once, and three locks
   * moreover would not limit anything that this one does not already limit.
   */
  let submitChecked = false;
  let planChecked = false;

  const noteEdits = () => {
    if (editedPaths.size > 0) repoTouched = true;
  };

  /**
   * End of turn type-check (MIN-110). Keeps silent — and then costs a round trip
   * shell of ~1 ms — as soon as a condition is missing: no more passage available, nothing
   * edited, no `tsconfig.json`, no `node_modules/.bin/tsc`, or not enough
   * wall budget to absorb a cold check (measured 22 s). Best-end effort
   * in the end: a checker failure never prevents a round from ending.
   */
  const typeCheckBlock = async (budgetMs: number): Promise<string | null> => {
    if (editedPaths.size === 0 || budgetMs < TYPECHECK_MIN_BUDGET_MS) return null;
    const touched = [...editedPaths];
    editedPaths.clear();
    const startedAt = Date.now();
    const block = await typeErrorsForTurn(host, touched).catch((err) => {
      console.error(`${logPrefix} turn-end typecheck failed:`, (err as Error).message);
      return null;
    });
    // Event `status` (neutral: invisible in the thread, countable in base) — it's him
    // which answers "how many rounds end with typing errors
    // introduced by the agent? ". `errorsShown` counts SERVIES errors (the block
    // is capped): what the model read, not what tsc found.
    await emit("status", {
      phase: "type_check",
      durationMs: Date.now() - startedAt,
      files: touched.length,
      errorsShown: block ? block.split("\n").filter((l) => /error TS\d+/.test(l)).length : 0,
    });
    return block;
  };

  /**
   * End of turn tests (MIN-251), at the range that the TURN justifies (MIN-262).
   * Same guards as type-check: a single pass, nothing without editing, nothing without
   * budget — and the same best-effort from start to finish (no `test` script, no
   * binary installed, runner broken → silence, never a turn blocked).
   *
   * The lock is `repoTouched`, not `editedPaths`: type-check empties this list
   * in passing, and it goes BEFORE. A tour that has edited must see its tests, even
   * when the model has not touched anything since the check.
   *
   * THREE OUTCOME, AND THE ORDER IS THE POINT.
   *
   * 1. **The model has already done this.** If it has run the repository tests itself and
   * that they came out green without him having re-edited behind, the harness is silent.
   * It's not confidence: it's a fact that he read (`VerificationSink`).
   * Raising over would cost 80s of wall and an entire response for
   * learning what you already know — that’s exactly the tax this ticket raises.
   * 2. **Short tour, targeted passage.** A few lines on two or three files,
   * nothing new: the `related` mode of the runner goes up the import graph and
   * covers the “it breaks elsewhere” wherever it is traceable, in a few
   *    secondes au lieu de 80.
   * 3. **Otherwise, the entire sequence**, unchanged. This is the case for a new file, a
   * big diff, of a turn whose size we were unable to measure: doubt pays
   *    plein tarif, il ne se solde pas en silence.
   */
  const testBlock = async (budgetMs: number): Promise<string | null> => {
    if (!repoTouched) return null;

    // (1) The gesture of the model is authentic. No budget required: we don't launch anything.
    if (verification.greenCommand) {
      await emit("status", {
        phase: "tests",
        scope: "model",
        durationMs: 0,
        command: verification.greenCommand,
        failuresShown: 0,
      });
      return null;
    }

    if (budgetMs < TEST_RELATED_MIN_BUDGET_MS) return null;
    const scope = await testScopeForTurn(budgetMs);
    if (!scope) return null;
    const startedAt = Date.now();
    const out = await testFailuresForTurn(host, scope).catch((err) => {
      console.error(`${logPrefix} turn-end tests failed:`, (err as Error).message);
      return null;
    });
    const block = out?.block ?? null;
    // Event `status` (neutral: invisible in the thread, countable in base) — it's him
    // who will answer “how many rounds end in red?” », and since MIN-262
    // to “who paid the entire suite”. `failuresShown` counts failures
    // SERVIS (the block is capped): what the model read, not what the runner found.
    await emit("status", {
      phase: "tests",
      scope: out?.scope ?? "none",
      durationMs: Date.now() - startedAt,
      failuresShown: block ? block.split("\n").filter((l) => l.startsWith("FAIL ")).length : 0,
    });
    return block;
  };

  /**
   * The scope this trick warrants, or `null` if there isn't the budget to pay for it.
   *
   * An UNKNOWN size measurement (mute git, baseline outside the shallow history) is
   * treated as a big trick: the measure is used to save work, not to avoid it
   * dispense on a doubt.
   */
  const testScopeForTurn = async (budgetMs: number): Promise<TestScope | null> => {
    const stat = await turnDiffStat(host, filesFromSha, await scope()).catch(() => null);
    const small =
      stat !== null &&
      stat.untracked === 0 &&
      stat.files.length > 0 &&
      stat.files.length <= SMALL_TURN_MAX_FILES &&
      stat.lines <= SMALL_TURN_MAX_LINES;
    if (small) {
      // `allowFullFallback`: a runner without a targeted mode charges for the entire suite,
      // but only if the budget covers it. Otherwise we don’t launch anything — trigger
      // 80 s of tests with 90 s on the clock would kill the chunk on the control
      // supposed to lighten it.
      return {
        related: stat.files,
        allowFullFallback: budgetMs >= TEST_MIN_BUDGET_MS,
      };
    }
    return budgetMs >= TEST_MIN_BUDGET_MS ? "full" : null;
  };

  /**
   * Self-review: the difference of the tour, served before delivery (see self-review.ts).
   *
   * He's the ONLY one of the three who speaks even when everything is going well — a diff is a
   * question, not a verdict. This is also why he can ONLY live HERE: in
   * end of turn, it cost an entire response each turn that edits, including
   * for three lines that the model had just written (MIN-262). On the door, he
   * costs nothing — the model reads it, corrects, and recalls `create_pr`.
   *
   * During the iteration, rereading is a gesture of the model, measured by the prompt
   * selon ce qu'il vient de faire (`git diff`, il l'a).
   *
   * READ-ONLY git commands — index is never touched, end of turn
   * remains alone to stage.
   *
   * The diff is followed, since MIN-252, by the other writings of the states it
   * written — `git grep`, therefore always read-only, and always
   * best-effort: their breakdown costs the second block, never the rereading.
   */
  const selfReviewBlock = async (budgetMs: number): Promise<string | null> => {
    if (!repoTouched || budgetMs < SELF_REVIEW_MIN_BUDGET_MS) return null;
    const startedAt = Date.now();
    const { diff, porcelain } = await turnDiff(host, filesFromSha, await scope()).catch(() => ({
      diff: "",
      porcelain: "",
    }));
    const overwrites = await overwriteSitesForTurn(host, diff).catch(() => []);
    const block = formatSelfReview({ diff, porcelain, overwrites });
    // `overwrites` counts the SYMBOLS reported: it is he who will say if the block
    // of MIN-252 speaks, and how often.
    await emit("status", {
      phase: "self_review",
      at: "create_pr",
      durationMs: Date.now() - startedAt,
      chars: block?.length ?? 0,
      overwrites: overwrites.length,
    });
    return block;
  };

  /**
   * CONTROL OF THE PLAN, IN A SINGLE BLOCK AND ON GESTURE (MIN-236, MIN-237, then
   * MIN-256 for merging and moving).
   *
   * Two things, inseparable and placed together because the model responds to them
   * with a single gesture: the plan he has just written, reread (`planReviewForTurn`), and
   * the files that his identifiers touch without him naming them
   * (`planClosureForTurn`). The proofreading always speaks, the closure only
   * when she found something.
   *
   * WHY MERGED. Separated, they cost TWO end-of-turn reinjections,
   * so two more answers — and on a plan run, the last one, the one that
   * the user reads, only talking about the control. The price of the merger is
   * known and assumed: the grep closure the plan as it was WRITTEN, no longer as
   * replay left it, so it can name a file as the template
   * was about to add. One more false “forgotten” in a block that is coming
   * already as an observation, against a final response which becomes readable again.
   *
   * Mute as long as no `write_issue_plan` has succeeded, therefore free on the overwhelming
   * majority of rounds. The trigger is the TOOL, not `run.intent === "plan"`: the
   * common case is an ordinary run who is asked for a plan along the way.
   */
  const planBlock = async (budgetMs: number): Promise<string | null> => {
    const floor = Math.max(PLAN_REVIEW_MIN_BUDGET_MS, PLAN_CLOSURE_MIN_BUDGET_MS);
    if (planChecked || !planWrites.wrote || budgetMs < floor) return null;
    planChecked = true;
    const startedAt = Date.now();
    const [review, closure] = await Promise.all([
      planReviewForTurn(host, planWrites.markdown).catch(() => null),
      planClosureForTurn(host, planWrites.markdown).catch(() => null),
    ]);
    const block = [review, closure].filter(Boolean).join("\n\n---\n\n") || null;
    await emit("status", {
      phase: "plan_check",
      at: "write_plan",
      durationMs: Date.now() - startedAt,
      chars: block?.length ?? 0,
    });
    return block;
  };

  /**
   * ALL THREE CHECKS, SERVED TOGETHER, AT THE TIME OF DELIVERY (MIN-263).
   *
   * THE ORDER MAKES SENSE, and it's the same as before: typing errors
   * first — they are concrete and blocking, and test failures on a repository
   * which does not compile does not even read. Test failures next: a failure
   * is a fact, a diff is a question. The diff brings up the rear.
   *
   * They leave in ONE block, where the end of the tour served them one by one: she
   * had no choice (each block cost a response, so they had to be
   * spread), the door has it — a tool `followUp` costs nothing, and the model processes
   * all three with the same gesture before recalling `create_pr`.
   *
   * ONLY ONE PASS PER LAP: the second `create_pr` opens for good, even if the
   * model didn't fix anything. It's deliberate — a door that re-checks every time
   * attempt is a door that can refuse to open, and an agent that cannot
   * over delivering is worse than an agent who delivers red by saying so.
   */
  const submitChecks = async (budgetMs: number): Promise<string | null> => {
    noteEdits();
    if (submitChecked || !repoTouched) return null;
    submitChecked = true;
    const blocks = [
      await typeCheckBlock(budgetMs),
      await testBlock(budgetMs),
      await selfReviewBlock(budgetMs),
    ].filter(Boolean);
    return blocks.length > 0 ? blocks.join("\n\n---\n\n") : null;
  };

  return {
    repoTouched: () => repoTouched,
    noteEdits,
    noteRepoTouched: () => {
      repoTouched = true;
    },
    checkBeforeSubmit: submitChecks,
    checkPlanAfterWrite: async (budgetMs: number) => await planBlock(budgetMs),
  };
}

/**
 * CONTROL OF THE PLAN OVER THE GESTURE, NOT AFTER THE RESPONSE (MIN-256).
 *
 * Same boss as `gateCreatePr`, and for one more reason. Served at the end of
 * turn, the check arrived after the model had written its answer: the turn
 * left again, he answered a second time, and it was this answer — “I
 * verified, the plan holds” — which the user was reading, the real summary being
 * moved back down to the step rank in the thread. Hooked to `write_issue_plan`, the same
 * control arrives BEFORE any response: the model corrects, then writes its unique
 * final message, which tells the story.
 *
 * Unlike `gateCreatePr`, the door DOES NOT HOLD anything — the plan is indeed
 * well written, and it must be: it is the document that we reread. Only the return
 * is added, in `followUp`, because a result of tool is elided by the middle and
 * that a plan cut off from its middle cannot be reread.
 *
 * Best effort: A failure of control should never prevent a plan from being written.
 */
export function gateWritePlan(
  handler: PlatformToolHandler,
  hook: Pick<DeliveryGate, "checkPlanAfterWrite">,
  remainingMs: () => number,
): PlatformToolHandler {
  return async (name, args) => {
    const out = await handler(name, args);
    if (name !== "write_issue_plan" || !out.success) return out;
    const followUp = await hook.checkPlanAfterWrite(remainingMs()).catch(() => null);
    return followUp ? { ...out, followUp } : out;
  };
}

/**
 * THE FIRST `create_pr` DOES NOT SUBMIT — it returns the controls (MIN-247 for the
 * diff, borrowed from `review_on_submit` of SWE-agent; MIN-263 for the other two).
 *
 * `create_pr` pushes and opens the pull request AT THE TIME OF CALL. Without a door,
 * the actual order would be: PR open, body drafted, reviewer notified, *then*
 * verification — what the replay catches (the JOIN error between two
 * files, cf. self-review.ts) would arrive after delivery.
 *
 * The door does not add a round: it MOVES the one we already paid, and since then
 * that the end of the turn no longer executes anything, this is the ONLY place where the harness
 * check the code. The second `create_pr` opens for good, even if the model has no
 * nothing corrected: a door that can refuse indefinitely is a door that prevents
 * to deliver. A lathe that didn't hit anything — a PR on some advanced lathe work
 * previous — passes on the first try: there is nothing from this round to check.
 */
export function gateCreatePr<A, R extends { result: unknown; success: boolean }>(
  handler: (args: A) => Promise<R>,
  hook: Pick<DeliveryGate, "checkBeforeSubmit">,
  remainingMs: () => number,
): (args: A) => Promise<{ result: unknown; success: boolean; followUp?: string }> {
  return async (args) => {
    const checks = await hook.checkBeforeSubmit(remainingMs()).catch(() => null);
    if (!checks) return await handler(args);
    // The controls leave in `followUp`, NOT in the result: a result of
    // tool is capped at `TOOL_RESULT_MAX_CHARS` with the middle elided, and a diff
    // amputated from his middle cannot be reread — it is exactly the rereading that we
    // trying to make it happen. The result only says the fact.
    //
    // `success: true`: Nothing failed. The model has requested delivery, the
    // harness first gives him back what he delivers — a refusal would push him to
    // rephrase your arguments rather than reading.
    return {
      result: {
        opened: false,
        note: "Nothing has been pushed and no pull request has been opened yet: the harness is handing you this turn's checks first — type errors, failing tests and the diff. Read them, fix what you find, then call create_pr again — the next call goes through.",
      },
      success: true,
      followUp: checks,
    };
  };
}
