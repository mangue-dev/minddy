import { describe, expect, it } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import type { Step } from "@tiptap/pm/transform";

import {
  diffDocSteps,
  pageBodySchema,
  rebaseDocSteps,
} from "./page-collaboration-document";

const schema = pageBodySchema();
const p = (id: string, text: string, marks?: unknown[]) => ({
  type: "paragraph",
  attrs: { blockId: id },
  content: text ? [{ type: "text", text, ...(marks ? { marks } : {}) }] : [],
});
const list = (items: string[]) => ({
  type: "bulletList",
  attrs: { blockId: "list" },
  content: items.map((text, i) => ({ type: "listItem", attrs: { blockId: `item-${i}` }, content: [p(`p-${i}`, text)] })),
});
const doc = (...content: unknown[]) => PMNode.fromJSON(schema, { type: "doc", content });

function apply(base: PMNode, steps: readonly Step[]): PMNode {
  let current = base;
  for (const step of steps) {
    const result = step.apply(current);
    if (!result.doc) throw new Error(result.failed ?? "step failed");
    current = result.doc;
  }
  return current;
}

describe("diffDocSteps — edits as a person makes them (MIN-688)", () => {
  it("turns two separate corrections into two word-sized steps", () => {
    const from = doc(p("a", "The quick brown fox jumps over the lazy dog."), p("b", "Untouched."));
    const to = doc(p("a", "The slow brown fox jumps over the sleepy dog."), p("b", "Untouched."));
    const steps = diffDocSteps(from, to);
    expect(steps).toHaveLength(2);
    expect(apply(from, steps).eq(to)).toBe(true);
    // Neither step covers "brown fox jumps over the", which stays untouched.
    for (const step of steps) {
      const { from: start, to: end } = step.toJSON() as { from: number; to: number };
      expect(end - start).toBeLessThanOrEqual(6);
    }
  });

  it("edits inside a nested list item without replacing the list", () => {
    const from = doc(list(["one", "two", "three"]));
    const to = doc(list(["one", "deux", "three"]));
    const steps = diffDocSteps(from, to);
    expect(steps).toHaveLength(1);
    expect(apply(from, steps).eq(to)).toBe(true);
  });

  it("inserts, removes and reorders whole blocks only where needed", () => {
    const cases: Array<[PMNode, PMNode]> = [
      [doc(p("a", "One"), p("b", "Two")), doc(p("a", "One"), p("n", "New"), p("b", "Two"))],
      [doc(p("a", "One"), p("b", "Two"), p("c", "Three")), doc(p("a", "One"), p("c", "Three"))],
      [doc(p("a", "One"), p("b", "Two")), doc(p("b", "Two"), p("a", "One"))],
      [doc(p("a", "Plain")), doc(p("a", "Plain", [{ type: "bold" }]))],
      [doc(p("a", "Text")), doc({ type: "heading", attrs: { level: 2, blockId: "a" }, content: [{ type: "text", text: "Text" }] })],
      [doc(p("a", "")), doc(p("a", "Typed into an empty paragraph"))],
    ];
    for (const [from, to] of cases) expect(apply(from, diffDocSteps(from, to)).eq(to)).toBe(true);
  });
});

describe("rebaseDocSteps — an agent's steps after a person's", () => {
  it("keeps what a person typed between the agent's two corrections", () => {
    const base = doc(p("a", "The quick brown fox jumps over the lazy dog."));
    const agent = diffDocSteps(base, doc(p("a", "The slow brown fox jumps over the sleepy dog.")));
    const person = diffDocSteps(base, doc(p("a", "The quick brown, red fox jumps over the lazy dog.")));
    const rebased = rebaseDocSteps(base, agent, person);
    expect(apply(apply(base, person), rebased).textContent)
      .toBe("The slow brown, red fox jumps over the sleepy dog.");
  });

  it("keeps a person's typing in another block intact", () => {
    const base = doc(p("a", "Agent edits here."), p("b", "Person types here."));
    const agent = diffDocSteps(base, doc(p("a", "Agent edited here."), p("b", "Person types here.")));
    const person = diffDocSteps(base, doc(p("a", "Agent edits here."), p("b", "Person types here, live.")));
    const result = apply(apply(base, person), rebaseDocSteps(base, agent, person));
    expect(result.child(0).textContent).toBe("Agent edited here.");
    expect(result.child(1).textContent).toBe("Person types here, live.");
  });

  it("merges two edits of the same sentence like two people would", () => {
    const base = doc(p("a", "Ship it on Monday."));
    const agent = diffDocSteps(base, doc(p("a", "Ship it on Tuesday.")));
    const person = diffDocSteps(base, doc(p("a", "Please ship it on Monday.")));
    expect(apply(apply(base, person), rebaseDocSteps(base, agent, person)).textContent)
      .toBe("Please ship it on Tuesday.");
  });
});
