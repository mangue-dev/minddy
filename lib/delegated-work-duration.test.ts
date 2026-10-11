import { describe, expect, it } from "vitest";
import type { AgentRunEvent } from "./agent-api";
import { delegatedWorkDurationMs } from "./delegated-work-duration";

const iso = (seconds: number) => new Date(Date.UTC(2026, 9, 11, 12, 0, seconds)).toISOString();
const event = (seq: number, seconds: number, type: AgentRunEvent["type"], payload = {}): AgentRunEvent => ({ id: String(seq), seq, type, payload, created_at: iso(seconds) });
const run = { status: "running" as const, awaiting_input: false, created_at: iso(0), started_at: iso(80), completed_at: null, updated_at: iso(80) };

describe("delegated work execution duration", () => {
  it("keeps the initial start across continuation checkpoints", () => {
    const events = [event(1, 0, "status", { status: "running" }), event(2, 80, "status", { status: "running" })];
    expect(delegatedWorkDurationMs(run, events, Date.parse(iso(120)))).toBe(120_000);
  });
  it("excludes input waits and adds resumed execution intervals", () => {
    const events = [event(1, 0, "status", { status: "running" }), event(2, 20, "question"), event(3, 80, "status", { status: "running" })];
    expect(delegatedWorkDurationMs(run, events, Date.parse(iso(100)))).toBe(40_000);
    expect(delegatedWorkDurationMs({ ...run, awaiting_input: true }, events.slice(0, 2), Date.parse(iso(100)))).toBe(20_000);
  });
  it("freezes completed sessions and sorts events by sequence", () => {
    const events = [event(3, 100, "summary"), event(1, 0, "status", { status: "running" }), event(2, 80, "status", { status: "running" })];
    expect(delegatedWorkDurationMs({ ...run, status: "completed", completed_at: iso(100) }, events, Date.parse(iso(160)))).toBe(100_000);
  });
  it("ignores subagent completion and excludes the queue before execution starts", () => {
    const events = [event(1, 0, "status", { status: "running" }), event(2, 20, "summary", { subagent_id: "sub-1" })];
    expect(delegatedWorkDurationMs(run, events, Date.parse(iso(100)))).toBe(100_000);
    expect(delegatedWorkDurationMs({ ...run, status: "queued", started_at: null }, [], Date.parse(iso(100)))).toBe(0);
  });
  it("uses persisted timing before events arrive and handles invalid dates", () => {
    expect(delegatedWorkDurationMs(run, [], Date.parse(iso(100)))).toBe(20_000);
    expect(delegatedWorkDurationMs({ ...run, started_at: "invalid" }, [], Date.parse(iso(100)))).toBe(0);
  });
});
