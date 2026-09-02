import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-286 lot 3 — MOTOR WIRING, checked in SOURCE.
 *
 * Why lexically and not at runtime: the three points below live
 * on a path that requires a base, a microVM and a template
 * ([execute.ts](execute.ts), [vm/main.ts](vm/main.ts)) — the same reasoning as
 * [vm-launch.test.ts](vm-launch.test.ts), which similarly keeps an invariant
 * that the compiler will never see. Each of these three types perfectly en
 * being false, and each, false, makes the toggle lie rather than breaking it:
 *
 * 1. **The engine is written on the line, and the microVM with it.** The column
 * `loop_in_vm` is read by the watchdog (`reapDeadVmRuns` wants it true):
 * a line that would say `false` when playing in the VM would never be found
 * dead.
 * 2. **The function composes the opencode entry** — anchor and prompt — and
 * gathers the memory of the previous round since `agent_run_journal`.
 * 3. **`vm/main.ts` raises** rather than posting a round without its entry.
 *
 * Since the removal of the home loop (2026-08-14), there is no longer any engine
 * to choose: `agent_engine` remains written on the line to SAY who played a
 * run, it no longer decides anything.
 */

function read(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

describe("createRun écrit le moteur du run, sans drapeau", () => {
  const source = read("runs.ts");

  it("part sur opencode et l'inscrit sur la ligne", () => {
    expect(source).toContain("const engine = AGENT_ENGINE");
    expect(source).toContain("agent_engine: engine");
    // No more list of projects to keep: a switch only one person
    // could operate is not worth the surface area it adds.
    expect(source).not.toContain("agentEngineForProject");
    expect(source).not.toContain("loopInVmForProject");
  });

  it("dit aussi que le run tourne dans la microVM", () => {
    // opencode ONLY runs there: its supervisor controls a server living next door
    // from the repository, there is no version in the function.
    expect(source).toContain("const loopInVm = true");
  });
});

describe("execute.ts passe le moteur et son entrée à la microVM", () => {
  const source = read("execute.ts");

  it("compose l'ancrage et le prompt du tour", () => {
    expect(source).toContain("buildOpencodeAnchor({");
    expect(source).toContain("userPromptFromMessages(messages)");
  });

  it("DIT au tour repris ce qu'il a perdu quand la boucle l'avait mené", () => {
    // A conversation written by the home loop lives in `checkpoint.messages`,
    // and no one knows how to play it again. Resumed in silence, she would respond
    // the model has a message of which it does not see the context: the agent would seem
    // amnesiac without anything explaining why.
    expect(source).toContain("function priorConversationLost");
    expect(source).toContain("PRIOR_CONVERSATION_LOST_NOTE");
    expect(source).toContain("priorConversationLost(run)");
  });

  it("n'envoie plus de conversation du tout à la microVM", () => {
    // Opencode's history is its event log. A `messages` field
    // on the job would pay the ticket context twice, once in prompt and
    // once in conversation dead.
    expect(source).not.toContain("messages: opencodeInput");
  });

  /**
   * MIN-286 — THE MEMORY OF AN OPENCODE RUN GOES DOWN INTO THE VM.
   *
   * The event log is ALL the memory of a run run by opencode, and
   * it did not go down: `job.opencode` remained `undefined`, the supervisor
   * created a new session, and each turn left without a line of his
   * conversation. The writing path was complete from start to finish - the
   * supervisor exports, the control plan stamps, `AgentCheckpoint` the
   * declares -, so nothing was visible: no error, no guy protesting, just an amnesiac agent from one turn to the next. the other.
   */
  /**
   * MIN-286 (2026-08-13) — the log no longer goes down from the LINE of the run: it
   * is gathered from `agent_run_journal`, where the supervisor writes it as an append.
   * The line only keeps the pointer, because it is reread on each call du
   * control plane and that the log carries the complete output of each tool.
   */
  it("rassemble le journal du tour précédent depuis sa table", () => {
    expect(source).toContain(
      "events: await loadRunJournal(run.id, pointer.sessionId)",
    );
    expect(source).toContain(
      "...(opencodeJournal ? { opencode: opencodeJournal } : {})",
    );
  });

  it("n'amorce pas un tour REPRIS : sa demande arrive par le steering", () => {
    // Replaying the primer would replay the ticket context and the request from the launcher
    // OVER the restored history — the agent would reread the initial instruction
    // as if she had just arrived. This is what `VmJob.opencodeInput` promises in
    // all letters (“`prompt` is empty on a RESUME round”).
    expect(source).toContain("if (run.checkpoint?.opencode?.sessionId)");
  });
});

describe("vm/main.ts ne connaît plus qu'un moteur", () => {
  const source = read("vm/main.ts");

  it("appelle le superviseur, sans aiguillage", () => {
    expect(source).toContain("runOpencodeTurn");
    // The switch left with the loop: no more `job.engine`, no more
    // second path to maintain in the microVM.
    expect(source).not.toContain("job.engine");
    expect(source).not.toContain("runVmTurn");
  });

  it("lève plutôt que de poster un tour vide", () => {
    expect(source).toContain("job carries no opencodeInput");
    // The global `try` of `main` makes it an error report: this can be seen in the
    // fil, au lieu d'un tour qui tourne sans savoir ce qu'on lui demande.
    expect(source).toContain("report = await runOpencodeTurnHere");
  });
});

describe("sub-agent capacity is anchor-independent", () => {
  const source = read("execute.ts");

  it("passes the configured resource ceiling to every run", () => {
    expect(source).toContain("maxParallel: subagentMaxParallel");
    expect(source).not.toContain(
      "maxParallel: writesToRepo ? subagentMaxParallel : 0",
    );
  });
});

describe("commit identity is capability-independent", () => {
  const source = read("execute.ts");

  it("resolves the forge-backed identity for every repository run", () => {
    expect(source).toContain(
      "const committerPromise = target\n      ? resolveCommitterIdentity(target)",
    );
    expect(source).toContain("committer: await committerPromise");
    expect(source).not.toContain(
      "committer: prRun ? defaultCommitterIdentity()",
    );
  });
});
