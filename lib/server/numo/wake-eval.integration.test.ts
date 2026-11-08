import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { WakeEvent, WakeInput } from "./wake-decision";

/**
 * Wake decision evaluation (MIN-928) — opt-in, real providers.
 *
 * Runs the production spec and runner on twenty hand-labeled batches (wake
 * or stay asleep, and for which events) and reports accuracy, needless and
 * missed wakes, event recall, latency and the provider-reported cost of each
 * engine. Nothing touches the database: the ledger is captured in memory,
 * configuration falls back to the registry defaults, and no BYOK credential
 * is read.
 *
 *   MINDDY_WAKE_EVAL=true OPENROUTER_API_KEY=… MINDDY_EDITION=cloud MINDDY_MANAGED_AI=1 \
 *     npx vitest run lib/server/numo/wake-eval.integration.test.ts
 *
 * MINDDY_WAKE_EVAL_ENGINE=llm measures the LLM fallback alone (the use case
 * is listed LLM-first), MINDDY_WAKE_EVAL_OUT=<file.json> writes the report.
 * In production the same comparison runs on real traffic through the
 * shadow sampling of the runner (`jev_shadow_sample_rate`). The default suite
 * skips this file; it spends a few cents per run.
 */

const enabled = process.env.MINDDY_WAKE_EVAL === "true";

const ledger = vi.hoisted(() => [] as { feature: string; model?: string | null; cost?: number | null }[]);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai-usage", async (original) => ({
  ...(await original<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: async (input: { feature: string; model?: string | null; cost?: number | null } | object[]) => {
    for (const row of Array.isArray(input) ? input : [input]) ledger.push(row as never);
  },
}));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async () =>
    process.env.MINDDY_WAKE_EVAL_ENGINE === "llm" ? { jev_llm_first: "numo_wake" } : {},
  setAppConfigValue: async () => {},
}));
vi.mock("@/lib/server/agent/model", async (original) => ({
  ...(await original<typeof import("@/lib/server/agent/model")>()),
  getUserByok: async () => null,
}));
vi.mock("@/lib/server/decisions/shadow", () => ({ runShadowComparison: async () => {} }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: () => {} }));

let nextId = 1;
function ev(partial: Partial<WakeEvent> & Pick<WakeEvent, "type" | "object">): WakeEvent {
  const id = nextId++;
  return {
    id,
    project: "MIN",
    actor: "Sam Lee",
    relations: [],
    signals: [],
    at: new Date(Date.UTC(2026, 10, 8, 9, 0, id)).toISOString(),
    ...partial,
  };
}
const issue = (n: number, title: string) => ({ kind: "issue", reference: `MIN-${n}`, title });

interface Case extends WakeInput {
  name: string;
  wake: boolean;
  /** Events a wake must include (by position in `events`). */
  mustInclude?: number[];
}

const CASES: Case[] = [
  { name: "assigned to the user", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "issue.assigned", object: issue(41, "Fix the invite email link"), relations: ["assignee"], details: { assignee: "the user" } })] },
  { name: "teammate moves their own issue", wake: false, memories: [], journal: [],
    events: [ev({ type: "issue.status_changed", object: issue(42, "Refactor the billing worker"), details: { status: "todo → in_progress" } })] },
  { name: "the user's routine failed", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "routine.finished", object: { kind: "routine", title: "Weekly release notes" }, actor: "automation", relations: ["routine_owner"], signals: ["routine_failed"], details: { status: "failed" } })] },
  { name: "mentioned in a comment", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "mention.received", object: issue(43, "Decide the pricing page copy"), relations: ["mentioned"] })] },
  { name: "teammates discuss their own work", wake: false, memories: [], journal: [],
    events: [
      ev({ type: "issue.comment_added", object: issue(44, "Cache the dashboard queries") }),
      ev({ type: "issue.comment_added", object: issue(44, "Cache the dashboard queries"), actor: "Alex Kim" }),
      ev({ type: "issue.comment_added", object: issue(45, "Upgrade the date picker"), actor: "Alex Kim" }),
    ] },
  { name: "security report on the user's board", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "feedback.received", object: { kind: "feedback", title: "Password reset page shows other users' emails" }, actor: "automation", relations: ["board_owner"], signals: ["sensitive_feedback"], details: { sensitivity: "security" } })] },
  { name: "plain feature request, user only wants bugs", wake: false, journal: [],
    memories: [{ scope: "all projects", text: "On the feedback board, only tell me about bug reports." }],
    events: [ev({ type: "feedback.received", object: { kind: "feedback", title: "Add a Gantt view" }, actor: "automation", relations: ["board_owner"] })] },
  { name: "memory asks for new pages in DOC", wake: true, mustInclude: [0], journal: [],
    memories: [{ scope: "DOC", text: "Tell me whenever a new page arrives in the DOC project." }],
    events: [ev({ type: "page.arrived", project: "DOC", object: { kind: "page", title: "Onboarding checklist" } })] },
  { name: "memory ignores DESIGN", wake: false, journal: [],
    memories: [{ scope: "all projects", text: "Ignore everything that happens in the DESIGN project; I only follow it for reference." }],
    events: [ev({ type: "issue.assigned", project: "DESIGN", object: { kind: "issue", reference: "DESIGN-8", title: "Explore new icon set" }, relations: ["assignee"], details: { assignee: "the user" } })] },
  { name: "changes requested on the user's pull request", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "issue.pull_request", object: issue(46, "Paginate the activity feed"), relations: ["assignee"], signals: ["pull_request_changes_requested"], details: { pull_request: "pr_changes_requested" } })] },
  { name: "teammate's pull request approved", wake: false, memories: [], journal: [],
    events: [ev({ type: "issue.pull_request", object: issue(47, "Bump the image library"), details: { pull_request: "pr_approved" } })] },
  { name: "settles an open journal entry", wake: true, mustInclude: [0], memories: [],
    journal: [{ age: "3 days ago", project: "MIN", text: "MIN-12 waits for Sam's review of its pull request." }],
    events: [ev({ type: "issue.pull_request", object: issue(12, "Export issues as CSV"), relations: ["assignee"], details: { pull_request: "pr_approved" } })] },
  { name: "the user's objective slips", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "objective.target_date_changed", object: { kind: "objective", title: "Public API v1" }, relations: ["lead"], details: { target_date: "2026-11-20 → 2026-12-18" } })] },
  { name: "someone else's objective changes status", wake: false, memories: [], journal: [],
    events: [ev({ type: "objective.status_changed", object: { kind: "objective", title: "Marketing site refresh" }, details: { status: "planned → active" } })] },
  { name: "urgent issue created", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "issue.created", object: issue(48, "Checkout returns 500 for every card payment"), signals: ["urgent_priority"], details: { priority: "urgent" } })] },
  { name: "low-priority issue created", wake: false, memories: [], journal: [],
    events: [ev({ type: "issue.created", object: issue(49, "Typo in the settings tooltip"), details: { priority: "low" } })] },
  { name: "one assignment among noise", wake: true, mustInclude: [3], memories: [], journal: [],
    events: [
      ev({ type: "issue.updated", object: issue(50, "Clean up old feature flags"), changed: ["description"] }),
      ev({ type: "issue.comment_added", object: issue(51, "Investigate slow search"), actor: "Alex Kim" }),
      ev({ type: "page.updated", object: { kind: "page", title: "Team rituals" }, changed: ["content"] }),
      ev({ type: "issue.assigned", object: issue(52, "Review the GDPR export"), relations: ["assignee"], details: { assignee: "the user" } }),
      ev({ type: "issue.status_changed", object: issue(53, "Rename the API tokens page"), actor: "Alex Kim", details: { status: "in_review → done" } }),
    ] },
  { name: "the user's issue closed by a teammate", wake: true, mustInclude: [0], memories: [], journal: [],
    events: [ev({ type: "issue.status_changed", object: issue(54, "Write the migration guide"), relations: ["assignee"], details: { status: "in_review → done" } })] },
  { name: "memory: no wake for comments", wake: false, journal: [],
    memories: [{ scope: "all projects", text: "Don't bother me about comments, I read them in my inbox." }],
    events: [ev({ type: "issue.comment_added", object: issue(55, "Improve the empty states"), relations: ["assignee"] })] },
  { name: "French memory on urgent issues", wake: true, mustInclude: [0], journal: [],
    memories: [{ scope: "MIN", text: "Préviens-moi dès qu'un ticket passe en urgent dans MIN." }],
    events: [ev({ type: "issue.updated", object: issue(56, "Webhook deliveries stuck"), changed: ["priority"], signals: ["urgent_priority"], details: { priority: "urgent" } })] },
];

describe.skipIf(!enabled)("Wake decision evaluation (MIN-928)", () => {
  it("measures wake accuracy, latency and cost on hand-labeled batches", async () => {
    const { runDecision } = await import("@/lib/server/decisions/runner");
    const { buildNumoWakeSpec, numoWakeVerdict, selectWakeEvents } = await import("./wake-decision");

    const report: Record<string, unknown>[] = [];
    let correct = 0, needless = 0, missed = 0, wakes = 0, included = 0, decisionMs = 0;
    const engines: Record<string, number> = {};
    for (const testCase of CASES) {
      const spec = buildNumoWakeSpec(testCase)!;
      const started = performance.now();
      const outcome = await runDecision(spec, { billTo: { platform: true } as never, projectId: null });
      decisionMs += performance.now() - started;
      const engine = outcome?.engine ?? "none";
      engines[engine] = (engines[engine] ?? 0) + 1;
      const verdict = outcome ? numoWakeVerdict(outcome.answers, selectWakeEvents(testCase.events).shown) : { wake: false as const };
      if (verdict.wake === testCase.wake) correct++;
      else if (verdict.wake) needless++;
      else missed++;
      if (testCase.wake && verdict.wake) {
        wakes++;
        const expected = (testCase.mustInclude ?? []).map((i) => testCase.events[i].id);
        if (expected.every((id) => verdict.eventIds.includes(id))) included++;
      }
      report.push({
        case: testCase.name,
        expected: testCase.wake,
        engine,
        confidence: outcome ? Number(outcome.confidence.toFixed(3)) : null,
        verdict,
      });
    }
    const cost = (feature: string) =>
      ledger.filter((row) => row.feature === feature).reduce((sum, row) => sum + (row.cost ?? 0), 0);
    const summary = {
      cases: CASES.length,
      accuracy: correct / CASES.length,
      needlessWakes: needless,
      missedWakes: missed,
      wakesWithExpectedEvents: `${included}/${wakes}`,
      engines,
      meanDecisionLatencyMs: Math.round(decisionMs / CASES.length),
      decisionModelCostUsd: cost("jev_decision"),
      llmFallbackCostUsd: cost("numo_wake"),
      ledgerRows: ledger.length,
    };
    console.log(JSON.stringify({ summary, report }, null, 2));
    if (process.env.MINDDY_WAKE_EVAL_OUT) {
      writeFileSync(process.env.MINDDY_WAKE_EVAL_OUT, JSON.stringify({ summary, report }, null, 2));
    }
    expect(correct).toBeGreaterThan(0);
  }, 300_000);
});
