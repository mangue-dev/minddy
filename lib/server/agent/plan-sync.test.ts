import { describe, expect, it } from "vitest";
import { parsePlan, setTaskState } from "@/lib/plan";
import {
  normalizeTaskText,
  planStateChanges,
  type AgentPlanStep,
} from "./plan-sync-core";

/**
 * Tests of the PUR core of the agent plane synchronization → outcome plan (MIN-46). We parse a
 * real markdown plan with lib/plan.ts, we match agent steps, and on
 * checks the invariant: ONLY the states of existing boxes switch, never the
 * text. The DB layer (plan-sync.ts, server-only) is not tested here.
 */

const tasksOf = (md: string) => parsePlan(md).tasks;

describe("normalizeTaskText", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeTaskText("  Add   Plan  Sync  ")).toBe("add plan sync");
  });

  it("strips a leading list marker / checkbox", () => {
    expect(normalizeTaskText("- [ ] Build the widget")).toBe("build the widget");
    expect(normalizeTaskText("* Do the thing")).toBe("do the thing");
  });
});

describe("planStateChanges", () => {
  it("flips state on an exact normalized match", () => {
    const md = "- [ ] Add plan sync module\n- [ ] Wire it into the loop";
    const changes = planStateChanges(tasksOf(md), [
      { step: "Add plan sync module", status: "completed" },
    ]);
    expect(changes).toEqual([{ index: 0, state: "completed" }]);
  });

  it("still matches across whitespace and case differences", () => {
    const md = "- [ ] Add   plan  sync module";
    const changes = planStateChanges(tasksOf(md), [
      { step: "  add plan SYNC module  ", status: "in_progress" },
    ]);
    expect(changes).toEqual([{ index: 0, state: "in_progress" }]);
  });

  it("matches even when the agent step keeps a leading checkbox marker", () => {
    const md = "- [ ] Build the widget";
    const changes = planStateChanges(tasksOf(md), [
      { step: "- [ ] Build the widget", status: "completed" },
    ]);
    expect(changes).toEqual([{ index: 0, state: "completed" }]);
  });

  it("returns nothing when no task matches", () => {
    const md = "- [ ] Do the thing";
    const changes = planStateChanges(tasksOf(md), [
      { step: "Something else entirely", status: "completed" },
    ]);
    expect(changes).toEqual([]);
  });

  it("returns nothing when the state is already correct", () => {
    const md = "- [x] Done already\n- [~] In flight";
    const changes = planStateChanges(tasksOf(md), [
      { step: "Done already", status: "completed" },
      { step: "In flight", status: "in_progress" },
    ]);
    expect(changes).toEqual([]);
  });

  it("maps in_progress and cancelled statuses", () => {
    const md = "- [ ] First step\n- [x] Second step";
    const changes = planStateChanges(tasksOf(md), [
      { step: "First step", status: "in_progress" },
      { step: "Second step", status: "cancelled" },
    ]);
    expect(changes).toEqual([
      { index: 0, state: "in_progress" },
      { index: 1, state: "cancelled" },
    ]);
  });

  it("pairs duplicate task texts in order of appearance", () => {
    const md = "- [ ] Repeat\n- [ ] Repeat";
    const changes = planStateChanges(tasksOf(md), [
      { step: "Repeat", status: "completed" },
      { step: "Repeat", status: "in_progress" },
    ]);
    expect(changes).toEqual([
      { index: 0, state: "completed" },
      { index: 1, state: "in_progress" },
    ]);
  });

  it("ignores blank agent steps", () => {
    const md = "- [ ] Real task";
    const changes = planStateChanges(tasksOf(md), [
      { step: "   ", status: "completed" } as AgentPlanStep,
    ]);
    expect(changes).toEqual([]);
  });

  it("only flips checkbox markers, leaving the task text and prose intact", () => {
    // Proof of the safety invariant: the user text is never rewritten.
    const md =
      "## Plan\n\nSome context prose.\n\n- [ ] Add plan-sync module\n- [~] Wire into loop\n- [ ] Add tests";
    const tasks = tasksOf(md);
    const changes = planStateChanges(tasks, [
      { step: "Add plan-sync module", status: "completed" },
      { step: "Wire into loop", status: "completed" },
    ]);
    let out = md;
    for (const c of changes) out = setTaskState(out, tasks[c.index].line, c.state);
    expect(out).toBe(
      "## Plan\n\nSome context prose.\n\n- [x] Add plan-sync module\n- [x] Wire into loop\n- [ ] Add tests"
    );
  });
});
