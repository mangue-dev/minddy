import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Architectural guards supplement executable adapter and protocol tests. */

function read(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

describe("createRun freezes the selected harness", () => {
  const source = read("runs.ts");

  it("defaults legacy runs to OpenCode and records the harness", () => {
    expect(source).toContain("const engine = input.engine ?? AGENT_ENGINE");
    expect(source).toContain("agent_engine: engine");
    // No more list of projects to keep: a switch only one person
    // could operate is not worth the surface area it adds.
    expect(source).not.toContain("agentEngineForProject");
    expect(source).not.toContain("loopInVmForProject");
  });

  it("records hosted execution on each run", () => {
    // opencode ONLY runs there: its supervisor controls a server living next door
    // from the repository, there is no version in the function.
    expect(source).toContain("const loopInVm = true");
  });
});

describe("bootstrap passes the harness and input to the VM", () => {
  const source = read("execute.ts");

  it("composes the turn anchor and prompt", () => {
    expect(source).toContain("buildOpencodeAnchor({");
    expect(source).toContain("userPromptFromMessages(messages)");
  });

  it("describes unavailable legacy memory on resume", () => {
    // A conversation written by the home loop lives in `checkpoint.messages`,
    // and no one knows how to play it again. Resumed in silence, she would respond
    // the model has a message of which it does not see the context: the agent would seem
    // amnesiac without anything explaining why.
    expect(source).toContain("function priorConversationLost");
    expect(source).toContain("PRIOR_CONVERSATION_LOST_NOTE");
    expect(source).toContain("priorConversationLost(run)");
  });

  it("does not duplicate OpenCode conversation state", () => {
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
  it("loads a bounded journal and cold-starts when it cannot be replayed", () => {
    expect(source).toContain("await loadRunJournal(run.id, journalPointer.sessionId)");
    expect(source).toContain("const priorMemoryUnavailable =");
    expect(source).toContain("if (canResumeOpencode || canResumeNative)");
    expect(source).toContain(
      "...(opencodeJournal ? { opencode: opencodeJournal } : {})",
    );
  });

  it("does not bootstrap a replayable turn because steering supplies its prompt", () => {
    // Replaying the primer would replay the ticket context and the request from the launcher
    // OVER the restored history — the agent would reread the initial instruction
    // as if she had just arrived. This is what `VmJob.opencodeInput` promises in
    // all letters (“`prompt` is empty on a RESUME round”).
    expect(source).toContain("if (canResumeOpencode || canResumeNative)");
  });

  it("restores the trusted PR base when a resumed review needs a fresh checkout", () => {
    expect(source).toContain("const prBaseShaPromise = prRun");
    expect(source).not.toContain(
      "const prBaseShaPromise =\n      prRun && !run.branch_name",
    );
    expect(source).toContain("await anchorPullRequestBase(");
    expect(source).toContain(
      "...(prRun && prBaseSha ? { checkoutBaseSha: prBaseSha } : {})",
    );
  });
});

describe("VM entrypoint dispatches the frozen harness", () => {
  const source = read("vm/main.ts");

  it("dispatches native and OpenCode supervisors", () => {
    expect(source).toContain("runOpencodeTurn");
    // Legacy jobs default to OpenCode; native jobs explicitly select their adapter.
    expect(source).toContain("isNativeAgentEngine(job.engine)");
    expect(source).toContain("runNativeTurn(job");
    expect(source).not.toContain("runVmTurn");
  });

  it("rejects missing OpenCode turn input", () => {
    expect(source).toContain("job carries no opencodeInput");
    // The global `try` of `main` makes it an error report: this can be seen in the
    // thread instead of starting a turn without instructions.
    expect(source).toContain("await runOpencodeTurnHere(job");
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
      "const committerPromise = resolveCommitterIdentity(target)",
    );
    expect(source).toContain("committer: await committerPromise");
    expect(source).not.toContain(
      "committer: prRun ? defaultCommitterIdentity()",
    );
  });
});
