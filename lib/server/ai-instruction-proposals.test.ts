import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Instructions proposed from corrections (MIN-988): what counts as a
 * correction, when a project is past the threshold, what is kept of the
 * model's draft, and the owner's answer checked again on the server.
 */

const { updateProjectSettings } = vi.hoisted(() => ({ updateProjectSettings: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: vi.fn() }));
vi.mock("@/lib/server/update-project", () => ({ updateProjectSettings }));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({ forcedToolCall: vi.fn() }));
vi.mock("@/lib/server/model-config", () => ({ resolveConfiguredModel: vi.fn() }));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: vi.fn() }));
vi.mock("@/lib/server/ai-instructions", () => ({ readAiInstructions: vi.fn() }));
vi.mock("@/lib/server/project-content", () => ({
  decodeProjectName: vi.fn(),
  shouldProtectProjects: vi.fn(async () => false),
}));
vi.mock("@/lib/server/issue-event-store", () => ({
  listAiFieldWrites: vi.fn(),
  listManualFieldChanges: vi.fn(),
  readIssueEvents: vi.fn(),
}));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: vi.fn(), loadIssueTitles: vi.fn() }));
vi.mock("@/lib/server/category-store", () => ({ categoryStore: vi.fn() }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: vi.fn() }));
vi.mock("@/lib/server/auth-users", () => ({ fetchAuthUsersById: vi.fn(), toNamed: vi.fn() }));
vi.mock("@/lib/server/encryption/row-codec", () => ({ EncryptedRowCodec: class {} }));
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldEventMark, ReadEvent } from "@/lib/server/issue-event-store";
import {
  CORRECTION_THRESHOLD,
  correctionInEvents,
  resolveAiInstructionProposal,
  sanitizeProposalDraft,
  selectCandidates,
  tallyCorrections,
} from "./ai-instruction-proposals";

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-01T10:00:00Z");
const at = (days: number) => new Date(T0 + days * DAY).toISOString();

const mark = (issue: string, over: Partial<FieldEventMark>): FieldEventMark => ({
  issue_id: issue, type: "updated", field: "priority", created_at: at(0),
  via_smart_fill: false, smart_assign_ai: false, ...over,
});

describe("tallyCorrections", () => {
  const projectOf = new Map([["i1", "p1"], ["i2", "p1"], ["i3", "p1"], ["i4", "p2"]]);

  it("counts a manual change that follows what the AI wrote, once per issue and field", () => {
    const candidates = tallyCorrections({
      projectOf,
      automated: [
        mark("i1", { field: "smart_fill", via_smart_fill: true, created_at: at(0) }),
        mark("i2", { field: "priority", via_smart_fill: true, created_at: at(0) }),
      ],
      manual: [
        mark("i1", { created_at: at(1) }),
        mark("i1", { created_at: at(2) }),
        mark("i2", { created_at: at(3) }),
      ],
    });
    expect(candidates).toEqual([
      { projectId: "p1", field: "priority", useCase: "properties", issueIds: ["i2", "i1"] },
    ]);
  });

  it("ignores a change with no AI write before it, one made too late, and another field's write", () => {
    const candidates = tallyCorrections({
      projectOf,
      automated: [
        // Written AFTER the manual change: nothing was corrected.
        mark("i1", { field: "smart_fill", via_smart_fill: true, created_at: at(5) }),
        mark("i2", { field: "smart_fill", via_smart_fill: true, created_at: at(0) }),
        // A re-evaluation of the effort says nothing about the priority.
        mark("i3", { field: "effort", via_smart_fill: true, created_at: at(0) }),
      ],
      manual: [
        mark("i1", { created_at: at(1) }),
        mark("i2", { created_at: at(8) }),
        mark("i3", { created_at: at(1) }),
        mark("i4", { created_at: at(1) }),
      ],
    });
    expect(candidates).toEqual([]);
  });

  it("reads a reassignment as a correction only when Smart Assign's model chose", () => {
    const candidates = tallyCorrections({
      projectOf,
      automated: [
        mark("i1", { field: "assignee_id", smart_assign_ai: true }),
        // Smart Fill never sets an assignee.
        mark("i2", { field: "smart_fill", via_smart_fill: true }),
      ],
      manual: [
        mark("i1", { field: "assignee_id", created_at: at(1) }),
        mark("i2", { field: "assignee_id", created_at: at(1) }),
      ],
    });
    expect(candidates).toEqual([
      { projectId: "p1", field: "assignee_id", useCase: "assign", issueIds: ["i1"] },
    ]);
  });

  it("groups category changes under the properties instruction", () => {
    const [candidate] = tallyCorrections({
      projectOf,
      automated: [mark("i1", { field: "smart_fill", via_smart_fill: true })],
      manual: [
        mark("i1", { type: "category_removed", field: null, created_at: at(1) }),
        mark("i1", { type: "category_added", field: null, created_at: at(1) }),
      ],
    });
    expect(candidate).toMatchObject({ field: "categories", useCase: "properties", issueIds: ["i1"] });
  });
});

describe("selectCandidates", () => {
  const issues = (count: number) => Array.from({ length: count }, (_, index) => `i${index}`);
  const candidate = (projectId: string, field: "priority" | "effort" | "title", count: number) => ({
    projectId, field, useCase: field === "title" ? "title" as const : "properties" as const, issueIds: issues(count),
  });
  const none = { pendingProjects: new Set<string>(), quietUseCases: new Set<string>() };

  it("keeps a project only past the threshold, with its most corrected field", () => {
    expect(selectCandidates([
      candidate("p1", "priority", CORRECTION_THRESHOLD - 1),
      candidate("p2", "priority", CORRECTION_THRESHOLD),
      candidate("p2", "title", CORRECTION_THRESHOLD + 3),
    ], none).map((c) => `${c.projectId}:${c.field}`)).toEqual(["p2:title"]);
  });

  it("leaves a project with a waiting proposal, and a use case in its quiet period", () => {
    const selected = selectCandidates([
      candidate("p1", "priority", 9),
      candidate("p2", "effort", 9),
      candidate("p2", "title", 6),
    ], { pendingProjects: new Set(["p1"]), quietUseCases: new Set(["p2:properties"]) });
    // The dismissed use case stays quiet; another use case may still be proposed.
    expect(selected.map((c) => `${c.projectId}:${c.field}`)).toEqual(["p2:title"]);
  });
});

describe("correctionInEvents", () => {
  const event = (over: Record<string, unknown>) => ({
    issue_id: "i1", actor_id: "user-1", type: "updated", created_at: at(0), ...over,
  }) as unknown as ReadEvent;

  it("reads the value a person set over what Smart Fill filled at creation", () => {
    expect(correctionInEvents([
      event({ field: "smart_fill", to_value: "priority,effort", via_smart_fill: true }),
      event({ field: "priority", from_value: "medium", to_value: "high", created_at: at(1) }),
    ], "priority")).toEqual({ before: ["medium"], after: ["high"] });
  });

  it("finds no correction when Smart Fill did not fill that field", () => {
    expect(correctionInEvents([
      event({ field: "smart_fill", to_value: "effort", via_smart_fill: true }),
      event({ field: "priority", from_value: "none", to_value: "high", created_at: at(1) }),
    ], "priority")).toBeNull();
  });

  it("does not count Smart Fill's own re-evaluation, Numo, or a late change", () => {
    const filled = event({ field: "smart_fill", to_value: "priority", via_smart_fill: true });
    expect(correctionInEvents([
      filled,
      event({ field: "priority", from_value: "low", to_value: "medium", via_smart_fill: true, created_at: at(1) }),
      event({ field: "priority", from_value: "medium", to_value: "high", via_assistant: true, created_at: at(2) }),
    ], "priority")).toBeNull();
    expect(correctionInEvents([
      filled,
      event({ field: "priority", from_value: "medium", to_value: "high", created_at: at(9) }),
    ], "priority")).toBeNull();
  });

  it("reads one category gesture as what was removed and what was added", () => {
    expect(correctionInEvents([
      event({ field: "smart_fill", to_value: "category_ids", via_smart_fill: true }),
      event({ type: "category_removed", from_value: "cat-bug", created_at: at(1) }),
      event({ type: "category_added", to_value: "cat-billing", created_at: at(1) }),
    ], "categories")).toEqual({ before: ["cat-bug"], after: ["cat-billing"] });
  });

  it("reads a reassignment after Smart Assign's model", () => {
    expect(correctionInEvents([
      event({ field: "assignee_id", actor_id: null, to_value: "user-a", via_smart_assign: true, smart_assign_ai: true }),
      event({ field: "assignee_id", from_value: "user-a", to_value: "user-b", created_at: at(1) }),
    ], "assignee_id")).toEqual({ before: ["user-a"], after: ["user-b"] });
  });
});

describe("sanitizeProposalDraft", () => {
  it("writes nothing when the model found no pattern or said nothing usable", () => {
    expect(sanitizeProposalDraft(null, null)).toBeNull();
    expect(sanitizeProposalDraft({ pattern_found: false, instruction: "x", observation: "y" }, null)).toBeNull();
    expect(sanitizeProposalDraft({ pattern_found: true, instruction: " ", observation: "y" }, null)).toBeNull();
  });

  it("does not propose the instruction the project already has", () => {
    expect(sanitizeProposalDraft(
      { pattern_found: true, instruction: "Payment bugs are high", observation: "Seen." },
      "Payment bugs are high")).toBeNull();
  });

  it("keeps a capped instruction and a one-line observation", () => {
    expect(sanitizeProposalDraft({
      pattern_found: true,
      instruction: "p".repeat(900),
      observation: "You often raise\npayment bugs to High.",
    }, null)).toEqual({
      instruction: "p".repeat(500),
      observation: "You often raise payment bugs to High.",
    });
  });
});

describe("resolveAiInstructionProposal", () => {
  let proposal: Record<string, unknown> | null;
  let ownerId: string | null;
  let updates: Record<string, unknown>[];

  function service(): SupabaseClient {
    return {
      from: (table: string) => {
        const query: Record<string, unknown> = {};
        let payload: Record<string, unknown> | null = null;
        for (const method of ["eq", "is"]) query[method] = () => query;
        query.select = () => query;
        query.update = (next: Record<string, unknown>) => { payload = next; updates.push(next); return query; };
        query.maybeSingle = async () => ({
          data: table === "projects" ? (ownerId ? { owner_id: ownerId } : null) : proposal,
          error: null,
        });
        query.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: payload ? [{ id: "proposal-1" }] : [], error: null }).then(resolve);
        return query;
      },
    } as unknown as SupabaseClient;
  }
  const now = new Date("2026-11-14T12:00:00Z");
  const resolve = (userId: string, answer: Record<string, unknown>) =>
    resolveAiInstructionProposal(service(), userId, "proposal-1", answer, now);

  beforeEach(() => {
    proposal = { id: "proposal-1", project_id: "p1", use_case: "properties", status: "pending" };
    ownerId = "user-owner";
    updates = [];
    updateProjectSettings.mockReset().mockResolvedValue({ ok: true, project: {} });
  });

  it("writes the text the owner validated, possibly edited, then closes the proposal", async () => {
    await expect(resolve("user-owner", { action: "accept", instruction: " Payment bugs are urgent " }))
      .resolves.toEqual({ ok: true, status: "accepted" });
    expect(updateProjectSettings).toHaveBeenCalledWith({
      projectId: "p1",
      actorId: "user-owner",
      input: { ai_instructions: { properties: "Payment bugs are urgent" } },
    });
    expect(updates[0]).toMatchObject({ status: "accepted", dismissed_until: null, resolved_by: "user-owner" });
  });

  it("sets a dismissed proposal aside for thirty days and writes no instruction", async () => {
    await expect(resolve("user-owner", { action: "dismiss" })).resolves.toEqual({ ok: true, status: "dismissed" });
    expect(updateProjectSettings).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "dismissed", dismissed_until: "2026-12-14T12:00:00.000Z" });
  });

  it("refuses anyone but the project's current owner", async () => {
    await expect(resolve("user-member", { action: "accept", instruction: "x" }))
      .resolves.toMatchObject({ ok: false, status: 403, code: "owner_only" });
    ownerId = null;
    await expect(resolve("user-owner", { action: "dismiss" }))
      .resolves.toMatchObject({ ok: false, status: 404 });
    expect(updateProjectSettings).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("refuses an answered proposal, an empty instruction and an unknown action", async () => {
    await expect(resolve("user-owner", { action: "accept", instruction: "  " }))
      .resolves.toMatchObject({ ok: false, code: "invalid" });
    await expect(resolve("user-owner", { action: "apply" })).resolves.toMatchObject({ ok: false, code: "invalid" });
    proposal = { ...proposal, status: "dismissed" };
    await expect(resolve("user-owner", { action: "accept", instruction: "x" }))
      .resolves.toMatchObject({ ok: false, status: 409, code: "already_resolved" });
    expect(updateProjectSettings).not.toHaveBeenCalled();
  });

  it("keeps the proposal waiting when the instruction could not be written", async () => {
    updateProjectSettings.mockResolvedValue({ ok: false, status: 500, errorKey: "databaseError" });
    await expect(resolve("user-owner", { action: "accept", instruction: "x" }))
      .resolves.toMatchObject({ ok: false, code: "unavailable" });
    expect(updates).toEqual([]);
  });
});
