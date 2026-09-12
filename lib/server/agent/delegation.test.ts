import { describe, expect, it } from "vitest";

import type { AgentRun } from "./runs";
import {
  buildAgentDelegationBrief,
  buildAgentDelegationResult,
  formatAgentDelegationPrompt,
} from "./delegation";
import {
  parseAgentDelegationBrief,
  parseAgentDelegationResult,
} from "./agent-contract";

const brief = buildAgentDelegationBrief({
  parentConversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  parentTurnId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  toolCallId: "call-1",
  repository: {
    projectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    provider: "github",
    externalId: "123",
    fullName: "mangue-dev/minddy",
    defaultBranch: "main",
  },
  objective: "Implement MIN-520 and verify the durable handoff.",
  sourceReferences: [
    { kind: "issue", id: "MIN-520", label: "MIN-520" },
    { kind: "page", id: "page-1", label: "Numo → new", version: "44" },
  ],
  constraints: ["Keep the OpenCode harness."],
  authorizedWork: ["read_repository", "modify_repository", "run_verification"],
});

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    status: "completed",
    outcome: "Implemented the durable handoff.",
    error_message: null,
    awaiting_input: false,
    branch_name: "work/min-520",
    pr_number: 202,
    pr_url: "https://github.com/mangue-dev/minddy/pull/202",
    delegation_brief: brief,
    parent_numo_turn_id: brief.correlation.parentTurnId,
    ...overrides,
  } as AgentRun;
}

describe("code delegation contracts", () => {
  it("validates the versioned brief and renders all worker boundaries", () => {
    expect(parseAgentDelegationBrief(brief)).toEqual(brief);
    const prompt = formatAgentDelegationPrompt(brief, "Implement the issue.");
    expect(prompt).toContain('<numo-delegation version="1">');
    expect(prompt).toContain("Numo → new");
    expect(prompt).toContain("Keep the OpenCode harness.");
    expect(prompt).toContain("modify_repository");
    expect(prompt).toContain("unresolved decision or blocker");
  });

  it("rejects unsupported or incomplete persisted contracts", () => {
    expect(() => parseAgentDelegationBrief({ ...brief, version: 2 })).toThrow(
      /unsupported delegation brief version/i,
    );
    expect(() => parseAgentDelegationResult({ version: 1, status: "completed" })).toThrow();
  });

  it("adapts repository events into a validated completed result", () => {
    const result = buildAgentDelegationResult({
      run: run(),
      events: [
        {
          seq: 0,
          type: "tool_call",
          payload: { id: "tool-1", name: "run_command", command: "npm test" },
        },
        {
          seq: 1,
          type: "tool_result",
          payload: { id: "tool-1", name: "run_command", success: true, exit_code: 0 },
        },
        {
          seq: 2,
          type: "files_changed",
          payload: { files: [{ filename: "lib/a.ts" }, { path: "lib/b.ts" }] },
        },
        {
          seq: 3,
          type: "commit",
          payload: { sha: "abc123" },
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      version: 1,
      status: "completed",
      summary: "Implemented the durable handoff.",
      changedFiles: ["lib/a.ts", "lib/b.ts"],
      verificationPerformed: [{ command: "npm test", status: "passed" }],
      unresolvedDecisions: [],
    }));
    expect(result.artifacts).toEqual(expect.arrayContaining([
      { kind: "branch", ref: "work/min-520" },
      {
        kind: "pull_request",
        ref: "#202",
        url: "https://github.com/mangue-dev/minddy/pull/202",
      },
      { kind: "commit", ref: "abc123" },
    ]));
  });

  it("uses a shell exit code instead of OpenCode tool completion success", () => {
    const result = buildAgentDelegationResult({
      run: run(),
      events: [
        {
          seq: 0,
          type: "tool_call",
          payload: { id: "tool-1", name: "run_command", command: "npm test" },
        },
        {
          seq: 1,
          type: "tool_result",
          payload: { id: "tool-1", name: "run_command", success: true, exit_code: 1 },
        },
      ],
    });

    expect(result.verificationPerformed).toEqual([
      { command: "npm test", status: "failed" },
    ]);
  });

  it("returns structured partial, failure and unresolved-decision outcomes", () => {
    expect(buildAgentDelegationResult({
      run: run({ error_message: "Push was rejected." }),
      events: [],
    }).status).toBe("partial");

    const failed = buildAgentDelegationResult({
      run: run({
        status: "failed",
        outcome: null,
        error_message: "The sandbox stopped unexpectedly.",
      }),
      events: [],
    });
    expect(failed).toMatchObject({
      status: "failed",
      summary: "The sandbox stopped unexpectedly.",
      unresolvedDecisions: ["The sandbox stopped unexpectedly."],
    });

    const needsInput = buildAgentDelegationResult({
      run: run({ awaiting_input: true, outcome: "Which API should be authoritative?" }),
      events: [{
        seq: 0,
        type: "question",
        payload: { question: "Which API should be authoritative?" },
      }],
    });
    expect(needsInput).toMatchObject({
      status: "needs_input",
      unresolvedDecisions: ["Which API should be authoritative?"],
    });
  });
});
