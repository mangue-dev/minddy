import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

// The controls are mocked: this file does not test what they SAY (each has
// its test), it tests WHO SPEAKS, WHEN, and HOW MANY TIMES.
vi.mock("./diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./diagnostics")>()),
  typeErrorsForTurn: vi.fn(async () => "TYPES"),
  testFailuresForTurn: vi.fn(async () => ({ block: "TESTS", scope: "full" as const })),
}));
vi.mock("./self-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./self-review")>()),
  formatSelfReview: vi.fn(() => "DIFF"),
}));
vi.mock("./plan-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-review")>()),
  planReviewForTurn: vi.fn(async () => "PLAN_REVIEW"),
}));
// `turnDiffStat` measures the SIZE of the tower, and it is she who chooses the range of the
// passing tests (MIN-262). Mocked here so that each test tells its size; THE
// default is a BIG trick, one that pays off the entire suite.
vi.mock("./repo-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./repo-host")>()),
  turnDiffStat: vi.fn(async () => ({
    files: ["lib/a.ts", "lib/b.ts", "lib/c.ts", "lib/d.ts"],
    lines: 400,
    untracked: 0,
  })),
}));
vi.mock("./plan-closure", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-closure")>()),
  planClosureForTurn: vi.fn(async () => "PLAN_CLOSURE"),
}));

import { gateCreatePr, gateWritePlan, makeDeliveryGate } from "./delivery-gate";
import { testFailuresForTurn, typeErrorsForTurn } from "./diagnostics";
import { turnDiffStat } from "./repo-host";
import { newPlanWriteSink } from "./plan-closure";
import type { AgentChatMessage } from "./agent-contract";
import type { RepoHost } from "./repo-host";
import { cloudLayout } from "./harness-layout";

/**
 * MIN-263 — HARNESS ONLY CHECKS UPON DELIVERY.
 *
 * There is no longer any end-of-turn control: when the model responds without a tool-call,
 * the round ends, period. Everything the harness performs is claimed by a
 * tool DOOR — `create_pr` for all three code checks, `write_issue_plan`
 * for the plan — therefore in a `followUp`, without ever reopening a completed round or
 * cost one more response.
 *
 * This file tests the two levels: the door (who speaks, when, only once) and
 * the loop (that it no longer reopens anything, which is the only invariant that protects
 * everything else).
 */

/** Host inert: the four controls are mocked, `turnDiff` can render empty. */
function fakeHost(): RepoHost {
  return {
    layout: cloudLayout(),
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
}

interface HookOpts {
  edited?: string[];
  wrotePlan?: boolean;
  repoTouched?: boolean;
  /** What the model launched itself and saw go green (MIN-262). */
  greenCommand?: string;
}

function gateFor(opts: HookOpts = {}) {
  const editedPaths = new Set<string>(opts.edited ?? []);
  const planWrites = newPlanWriteSink();
  if (opts.wrotePlan) {
    planWrites.wrote = true;
    planWrites.markdown = "- [ ] Faire la chose dans `lib/x.ts`";
  }
  const phases: string[] = [];
  const verification = { greenCommand: opts.greenCommand ?? null };
  const gate = makeDeliveryGate({
    host: fakeHost(),
    emit: async (_type, payload) => {
      if (typeof payload.phase === "string") phases.push(payload.phase);
    },
    editedPaths,
    planWrites,
    verification,
    filesFromSha: "abc123",
    repoTouched: opts.repoTouched ?? false,
    logPrefix: "[test]",
  });
  return { gate, editedPaths, phases, verification };
}

/** Large budget: no block is prevented by the remaining time. */
const ROOMY = 600_000;

/** The two plane controls are MERGED into one block since MIN-256: the
 * model responds with a single gesture, and it costs one response less. */
const PLAN = "PLAN_REVIEW\n\n---\n\nPLAN_CLOSURE";

describe("la porte de livraison", () => {
  // The call counters are the assertion of several tests (“the harness has not
  // NOTHING launched"): without that, they would read the calls from the previous test.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sert les trois contrôles en UN bloc, dans l'ordre", async () => {
    // The order makes sense: types first — test failures on a repository
    // which does not compile are not even read -, the failures then (a failure is
    // a fact), the diff last (it's a question).
    const { gate, phases } = gateFor({ edited: ["lib/x.ts"] });

    const said = await gate.checkBeforeSubmit(ROOMY);

    expect(said).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");
    expect(phases).toEqual(["type_check", "tests", "self_review"]);
  });

  it("ne s'ouvre qu'UNE fois : le second create_pr livre", async () => {
    // A door that re-checks on each attempt is a door that can refuse to
    // open up — and an agent who can no longer deliver is worse than an agent who delivers
    // red when saying it.
    const { gate } = gateFor({ edited: ["lib/x.ts"] });

    expect(await gate.checkBeforeSubmit(ROOMY)).toContain("TYPES");
    expect(await gate.checkBeforeSubmit(ROOMY)).toBeNull();
  });

  it("se tait sur un tour qui n'a rien touché", async () => {
    const { gate, phases } = gateFor();
    expect(await gate.checkBeforeSubmit(ROOMY)).toBeNull();
    expect(phases).toEqual([]);
  });

  it("ne rend que le diff quand types et tests sont verts", async () => {
    // The silence of the first two is the good return; the difference always speaks
    // — this is a question asked before delivery, not a verdict.
    vi.mocked(typeErrorsForTurn).mockResolvedValueOnce(null);
    vi.mocked(testFailuresForTurn).mockResolvedValueOnce({ block: null, scope: "full" });
    const { gate } = gateFor({ edited: ["lib/x.ts"] });

    expect(await gate.checkBeforeSubmit(ROOMY)).toBe("DIFF");
  });

  it("laisse passer les contrôles qui n'ont pas le budget de tourner", async () => {
    // 50 s: under the type-check floor (60 s), even a test pass
    // targeted (90 s) and self-replay (75 s). The door should not, however,
    // hold delivery.
    const { gate, phases } = gateFor({ edited: ["lib/x.ts"] });

    expect(await gate.checkBeforeSubmit(50_000)).toBeNull();
    expect(phases).toEqual([]);
  });

  it("latche `repoTouched`, y compris hors de la porte", async () => {
    // A turn that doesn't open a pull request never gets through the door: it's
    // `noteEdits` which should then tell the checkpoint that the depot has moved.
    const { gate, editedPaths } = gateFor();
    expect(gate.repoTouched()).toBe(false);
    editedPaths.add("lib/x.ts");
    gate.noteEdits();
    expect(gate.repoTouched()).toBe(true);
  });

  /**
   * MIN-262 — THE GESTURE OF THE MODEL IS AUTHENTIC, and it also applies to delivery: this
   * which he saw go green without a reissue behind it is not relaunched.
   */
  it("ne relance pas les tests que le modèle a lancés verts lui-même", async () => {
    const { gate, phases } = gateFor({
      edited: ["lib/x.ts"],
      greenCommand: "npx vitest run lib/x.test.ts",
    });

    const said = await gate.checkBeforeSubmit(ROOMY);

    expect(said).toBe("TYPES\n\n---\n\nDIFF");
    expect(testFailuresForTurn).not.toHaveBeenCalled();
    // Counted anyway: this will tell you how many deliveries the model checks
    // himself, therefore if the doctrine of the prompt carries.
    expect(phases).toEqual(["type_check", "tests", "self_review"]);
  });

  it("lance la suite entière quand le modèle n'a rien lancé", async () => {
    const { gate } = gateFor({ edited: ["lib/x.ts"] });
    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), "full");
  });

  it("paie un passage CIBLÉ sur un petit tour", async () => {
    vi.mocked(turnDiffStat).mockResolvedValueOnce({
      files: ["lib/x.ts"],
      lines: 1,
      untracked: 0,
    });
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), {
      related: ["lib/x.ts"],
      allowFullFallback: true,
    });
  });

  it("fait payer la suite entière dès qu'un fichier NEUF apparaît", async () => {
    // A new file is new behavior: this is exactly what none of
    // test existant ne parle (MIN-251), quelle que soit sa taille en lignes.
    vi.mocked(turnDiffStat).mockResolvedValueOnce({
      files: ["lib/x.ts"],
      lines: 2,
      untracked: 1,
    });
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), "full");
  });

  it("traite un tour de taille INCONNUE comme un gros tour", async () => {
    // git silent, baseline outside the shallow history: the measurement is used to save yourself
    // work, not to dispense with it due to doubt.
    vi.mocked(turnDiffStat).mockResolvedValueOnce(null);
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), "full");
  });

  it("ne retombe PAS sur la suite entière quand le budget ne la couvre pas", async () => {
    // Short turn, 100 s on the clock: above the floor of a targeted passage
    // (90 s), below that of the entire sequence (180 s). A runner without a targeted mode
    // must not trigger, through the tape, the 80 s that we were trying to avoid.
    vi.mocked(turnDiffStat).mockResolvedValueOnce({
      files: ["lib/x.ts"],
      lines: 1,
      untracked: 0,
    });
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(100_000);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), {
      related: ["lib/x.ts"],
      allowFullFallback: false,
    });
  });
});

// ── The loop no longer reopens after a completed turn ──────────────────────── ────────────────────────

interface Choice {
  delta?: Record<string, unknown>;
  finish_reason?: string | null;
}

function sse(choices: Choice[]): string {
  const chunks: Array<Record<string, unknown>> = choices.map((c) => ({
    id: "gen_1",
    model: "test/model",
    choices: [c],
  }));
  chunks.push({
    id: "gen_1",
    model: "test/model",
    choices: [{ delta: {} }],
    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cost: 0.001 },
  });
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

function sseText(text: string): string {
  return sse([{ delta: { content: text } }, { delta: {}, finish_reason: "stop" }]);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(sseText("Done."))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function _seed(): AgentChatMessage[] {
  return [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Do the thing." },
  ];
}

/**
 * MIN-247, then MIN-263 — THE FIRST `create_pr` DOES NOT SUBMIT, AND THAT’S WHERE IT’S ALL
 * IS CHECKED.
 *
 * `create_pr` pushes and opens the pull request AT THE TIME OF THE CALL: without door,
 * the actual order would be PR open, body drafted, reviewer notified, then proofread.
 * The gate moves control just before delivery — and since there is no longer
 * nothing at the end of the turn, this is the only place where the harness does anything
 * on the code.
 */
describe("la porte de create_pr", () => {
  const opener = () => {
    const calls: Array<{ title: string }> = [];
    return {
      calls,
      handler: async (args: { title: string; body?: string }) => {
        calls.push({ title: args.title });
        return { result: { url: "https://forge/pr/1" }, success: true };
      },
    };
  };

  it("rend les contrôles au premier appel, ouvre au second", async () => {
    const { gate } = gateFor({ edited: ["lib/x.ts"], repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => ROOMY);

    const first = await gated({ title: "MIN-1: faire la chose" });
    expect(first.success).toBe(true);
    // All three at once, in the `followUp` and not in the result: this one is
    // capped at 6,000 characters with the MIDDLE elided, which of a diff would cut this
    // that we give to read. The result only says the fact.
    expect(first.followUp).toContain("TYPES");
    expect(first.followUp).toContain("TESTS");
    expect(first.followUp).toContain("DIFF");
    expect(first.result).toMatchObject({ opened: false });
    expect(String((first.result as { note: string }).note)).toContain("call create_pr again");
    expect(calls).toEqual([]); // NOTHING was pushed.

    const second = await gated({ title: "MIN-1: faire la chose" });
    expect(second.result).toEqual({ url: "https://forge/pr/1" });
    expect(calls).toHaveLength(1);
  });

  it("ne vérifie qu'une fois, même si le modèle enchaîne les tentatives", async () => {
    const { gate, phases } = gateFor({ edited: ["lib/x.ts"], repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => ROOMY);

    expect((await gated({ title: "t" })).followUp).toContain("TYPES");
    await gated({ title: "t" });
    await gated({ title: "t" });

    // Two openings for three calls: the first served the controls, the
    // following deliver. And the controls only turned ONE time.
    expect(calls).toHaveLength(2);
    expect(phases).toEqual(["type_check", "tests", "self_review"]);
  });

  it("ouvre du premier coup quand le tour n'a rien touché", async () => {
    // A PR on extensive work in the previous round: there is no CE difference
    // turn to reread, so nothing to wait.
    const { gate } = gateFor({ repoTouched: false });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => ROOMY);

    expect((await gated({ title: "t" })).success).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("ouvre du premier coup quand il ne reste plus de budget pour relire", async () => {
    const { gate } = gateFor({ edited: ["lib/x.ts"], repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => 1_000);

    expect((await gated({ title: "t" })).success).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

/**
 * The channel through which the door speaks: a `user` message, not a tool result.
 * A result passes through `headTail(…, 6 000)`, which elides the MIDDLE — of a diff, that
 * cuts exactly what is given to read.
 */
describe("la porte de write_issue_plan", () => {
  const writer = () => {
    const calls: string[] = [];
    return {
      calls,
      handler: async (name: string) => {
        calls.push(name);
        return { result: { ok: true }, success: true };
      },
    };
  };

  it("rend le contrôle du plan en followUp, sans retenir l'écriture", async () => {
    const { gate } = gateFor({ wrotePlan: true });
    const { calls, handler } = writer();
    const gated = gateWritePlan(handler, gate, () => ROOMY);

    const out = await gated("write_issue_plan", { plan: "- [ ] faire" });
    // Unlike `create_pr`, the door retains NOTHING: the plan is written,
    // and it must be — it is the document that we reread.
    expect(calls).toEqual(["write_issue_plan"]);
    expect(out.success).toBe(true);
    expect(out.followUp).toBe(PLAN);
  });

  it("ne pose la question qu'une fois", async () => {
    const { gate, phases } = gateFor({ wrotePlan: true });
    const gated = gateWritePlan(writer().handler, gate, () => ROOMY);

    expect((await gated("write_issue_plan", {})).followUp).toBe(PLAN);
    // A second write does not ask for anything again: the control rereads a plan, it does not comment
    // not the correction that follows.
    expect((await gated("write_issue_plan", {})).followUp).toBeUndefined();
    expect(phases).toEqual(["plan_check"]);
  });

  it("laisse passer les autres tools ticket, et un write raté", async () => {
    const { gate } = gateFor({ wrotePlan: true });
    const failing = gateWritePlan(
      async (name) => ({ result: {}, success: name !== "write_issue_plan" }),
      gate,
      () => ROOMY,
    );

    expect((await failing("append_to_plan", {})).followUp).toBeUndefined();
    // A refused `write_issue_plan` has not written anything: rereading his plan would make people talk
    // the harness of a document that does not exist.
    expect((await failing("write_issue_plan", {})).followUp).toBeUndefined();
    // And the lock has not been consumed: the next successful write will be reread.
    const ok = gateWritePlan(writer().handler, gate, () => ROOMY);
    expect((await ok("write_issue_plan", {})).followUp).toBe(PLAN);
  });

  it("se tait quand le budget manque, sans consommer le verrou", async () => {
    // There is no more end of turn to catch up: this control is simply
    // skipped. But the lock remains free, so a second write later in the
    // turn is read again.
    const { gate, phases } = gateFor({ wrotePlan: true });
    const poor = gateWritePlan(writer().handler, gate, () => 1_000);

    expect((await poor("write_issue_plan", {})).followUp).toBeUndefined();
    expect(phases).toEqual([]);

    const rich = gateWritePlan(writer().handler, gate, () => ROOMY);
    expect((await rich("write_issue_plan", {})).followUp).toBe(PLAN);
  });
});
