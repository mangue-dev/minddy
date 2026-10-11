import { describe, expect, it, vi } from "vitest";
import { legacyRoutineProposals } from "./legacy-routine-proposals";
import { evaluateRoutineConditions } from "@/lib/routine-triggers";
import type { AutomationRule } from "@/lib/automations";
vi.mock("@/lib/server/routines", () => ({ createRoutine: vi.fn() }));
const rule: AutomationRule = { id: "archived-triage", name: "Archived triage", enabled: true, when: { type: "status_changed", to: ["triage", "in_review"], source: ["web"] }, if: { effort: ["s", "m", "none"], priority: ["high"], assigned: true }, then: [{ type: "await_human" }] };
describe("archived workflow proposals", () => {
  it("keeps stable per-entry identities, delay, checkpoints and original source constraints", () => {
    const first = legacyRoutineProposals([rule], { automation_start_delay_min: 30, automation_efforts: { m: false } });
    expect(first).toHaveLength(2);
    expect(legacyRoutineProposals([rule], { automation_start_delay_min: 30, automation_efforts: { m: false } })).toEqual(first);
    expect(first[0].sourceKey).not.toBe(first[1].sourceKey);
    expect(first[0].trigger).toMatchObject({ delayMinutes: 30, status: "triage" });
    expect(first[0].prompt).toContain('"await_human"');
    expect(first[0].prompt).toContain('"web"');
    expect(first[0].prompt).toContain("15%");
    expect(evaluateRoutineConditions(first[0].trigger.conditions, { effort: null, priority: "high", assignee: "owner" })).toBe(false);
    expect(evaluateRoutineConditions(first[0].trigger.conditions, { effort: "s", priority: "high", assignee: "owner" })).toBe(true);
  });
  it("requires owner review when all original effort sizes are disabled", () => {
    const proposals = legacyRoutineProposals([rule], { automation_efforts: { s: false, m: false } });
    expect(proposals.every(proposal => !proposal.valid)).toBe(true);
    expect(legacyRoutineProposals([{ ...rule, enabled: false }], {})).toEqual([]);
  });
});
