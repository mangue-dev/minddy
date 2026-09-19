import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE BRANCH (MIN-565) — the feedback AI review as a two-stage decision.
 *
 * Both engines are doubles, exactly like `runner.test.ts` and
 * `smart-assign.test.ts` mock theirs: what is pinned here is the AGREEMENT —
 * the Jev filter is briefed on the same world the LLM pass reads (the spec
 * carries the post, the kNN candidates, the categories), and ONLY a clean
 * answer at a confident-enough level publishes without the LLM. A junk,
 * sensitive or duplicate verdict — however confident — goes back to the full
 * `review_feedback` LLM pass, which re-decides everything and translates;
 * Jev down, unsure or switched off does the same, and both engines failing
 * leaves the post to human review (fail-closed).
 *
 * Billing is asserted on the engine contexts: ONE run across both stages,
 * `jev_decision` for Jev, `feedback_classify` for the LLM, both billed to the
 * project owner — the economy of the first filter must read in `ai_usage`.
 */

const {
  getAppConfigValuesMock,
  embedTextMock,
  matchFeedbackPostsMock,
  mergePostsMock,
  forcedToolCallMock,
  ownerHasUsageBudgetMock,
  setFeedbackPostCategoriesMock,
  emitFeedbackFieldChangesMock,
  notifyFeedbackTransitionMock,
  runJevDecisionMock,
  newRunIdMock,
  fromMock,
  rpcMock,
} = vi.hoisted(() => ({
  getAppConfigValuesMock: vi.fn<() => Promise<Record<string, string | null>>>(),
  embedTextMock: vi.fn<() => Promise<number[] | null>>(),
  matchFeedbackPostsMock: vi.fn<() => Promise<unknown[]>>(),
  mergePostsMock: vi.fn<() => Promise<{ ok: boolean }>>(),
  forcedToolCallMock: vi.fn<
    (
      model: string,
      systemPrompt: string,
      userMessage: string,
      toolName: string,
      parameters: Record<string, unknown>,
      options?: {
        record?: {
          runId?: string;
          seq?: number;
          feature?: string;
          billTo?: unknown;
          projectId?: unknown;
        };
      }
    ) => Promise<Record<string, unknown> | null>
  >(),
  ownerHasUsageBudgetMock: vi.fn<() => Promise<boolean>>(),
  setFeedbackPostCategoriesMock: vi.fn<
    (input: { projectId: string; postId: string; categoryIds: string[] }) => Promise<{
      ok: boolean;
      categoryIds: string[];
    }>
  >(),
  emitFeedbackFieldChangesMock: vi.fn<() => Promise<void>>(),
  notifyFeedbackTransitionMock: vi.fn<() => Promise<void>>(),
  runJevDecisionMock: vi.fn<
    (
      spec: unknown,
      ctx: { runId: string; seq?: number; billTo: unknown; projectId?: string | null }
    ) => Promise<unknown>
  >(),
  newRunIdMock: vi.fn<() => string>(),
  fromMock: vi.fn<(table: string) => unknown>(),
  rpcMock: vi.fn<(fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: getAppConfigValuesMock,
}));
vi.mock("@/lib/server/model-config", () => ({
  modelConfigKeys: (key: string) => [key],
  resolveFromValues: () => ({ model: "llm-test-model" }),
}));
vi.mock("@/lib/server/embeddings", () => ({
  embedText: embedTextMock,
  matchFeedbackPosts: matchFeedbackPostsMock,
  toVectorLiteral: (embedding: number[]) => JSON.stringify(embedding),
}));
vi.mock("@/lib/server/ai-usage", () => ({ newRunId: newRunIdMock }));
vi.mock("@/lib/server/usage", () => ({ ownerHasUsageBudget: ownerHasUsageBudgetMock }));
vi.mock("@/lib/server/feedback/merge", () => ({ mergePosts: mergePostsMock }));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({
  forcedToolCall: forcedToolCallMock,
}));
vi.mock("@/lib/server/feedback/set-post-categories", () => ({
  setFeedbackPostCategories: setFeedbackPostCategoriesMock,
}));
vi.mock("@/lib/server/feedback/events", () => ({
  emitFeedbackFieldChanges: emitFeedbackFieldChangesMock,
}));
vi.mock("@/lib/server/feedback/notify", () => ({
  notifyFeedbackTransition: notifyFeedbackTransitionMock,
}));
vi.mock("@/lib/server/decisions/jev", () => ({ runJevDecision: runJevDecisionMock }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: fromMock, rpc: rpcMock }),
}));

import { reviewFeedbackPost, feedbackVerdictFromAnswers, isCleanFeedbackVerdict } from "./review";
import type { DecisionAnswers } from "@/lib/server/decisions/types";

const PROJECT_ROW = {
  id: "project-1",
  feedback_review_enabled: true,
  feedback_review_skip_over_budget: false,
  feedback_translate_enabled: true,
  feedback_team_language: "en",
  feedback_no_translate_languages: [],
};

const CLAIMED_POST = {
  id: "post-new",
  project_id: "project-1",
  submitted_title: "Dark mode",
  submitted_body: "Please add a dark theme.",
  is_public: true,
  source: "board",
  review_state: "pending",
  embedding: "[0.1,0.2]",
  analyzed_at: null,
  classified_at: null,
  analysis_failures: 0,
};

const FRESH_ROW = {
  id: "post-new",
  merged_into_id: null,
  is_public: true,
  status: "open",
  review_state: "pending",
  analyzed_at: null,
  classified_at: null,
};

const CANDIDATES = [
  {
    id: "post-1",
    title: "Dark theme",
    body: "A dark theme would be great at night.",
    status: "open",
    vote_count: 3,
    issue_id: null,
    similarity: 0.91,
  },
];

const updatePayloads: unknown[] = [];
/** The `feedback_posts` reads BEFORE the final write, in call order — the
 * default after the queue exhausts is the unmodified post row. */
let feedbackPostsReads: (() => { data: unknown; error: unknown })[] = [];

/** A PostgREST chain reduced to what the pass touches: chained filters are
 * ignored; `maybeSingle()` / the await resolve the next queued result, and
 * `update()` records its payload (what is asserted on). */
function fakeQuery(resolve: () => { data: unknown; error: unknown }): unknown {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "not", "in", "or", "order", "limit"]) {
    query[method] = () => query;
  }
  query.update = (payload: unknown) => {
    updatePayloads.push(payload);
    return query;
  };
  query.maybeSingle = () => Promise.resolve(resolve());
  query.then = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);
  return query;
}

function wireDb() {
  fromMock.mockImplementation((table: string) => {
    if (table === "projects") return fakeQuery(() => ({ data: PROJECT_ROW, error: null }));
    if (table === "feedback_merge_rejections")
      return fakeQuery(() => ({ data: [], error: null }));
    if (table === "categories")
      return fakeQuery(() => ({ data: [{ id: "cat-a", name: "UI" }], error: null }));
    if (table === "feedback_posts") {
      const resolve = feedbackPostsReads.shift() ?? (() => ({ data: FRESH_ROW, error: null }));
      return fakeQuery(resolve);
    }
    return fakeQuery(() => ({ data: null, error: null }));
  });
  rpcMock.mockImplementation(async (fn: string) => {
    if (fn === "claim_feedback_post_for_review") return { data: [CLAIMED_POST], error: null };
    return { data: null, error: null };
  });
}

/** A confident clean Jev answer set: nothing to moderate, nothing to protect,
 * no duplicate, one category — the min confidence across answers is 0.9. */
const jevAnswer = (over: DecisionAnswers = {}): DecisionAnswers => ({
  is_junk: { value: false, probability: 0.03, confidence: 0.97 },
  is_sensitive: { value: false, probability: 0.01, confidence: 0.99 },
  sensitivity_kind: { value: "none", probability: 0.98, confidence: 0.98 },
  duplicate_of: { value: "none", probability: 0.1, confidence: 0.9 },
  category_ids: { value: ["cat-a"], probability: 0.92, confidence: 0.92 },
  ...over,
});

/** A clean full-pass response the LLM fallback may return (already in the
 * team's language, so no translation). */
const llmArgs = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  is_junk: false,
  is_sensitive: false,
  sensitivity_kind: null,
  reason: null,
  confidence: 0.9,
  duplicate_of: null,
  category_ids: ["cat-a"],
  language: "en",
  translated_title: null,
  translated_body: null,
  ...over,
});

const lowConfidence = (answers: DecisionAnswers): DecisionAnswers =>
  Object.fromEntries(
    Object.entries(answers).map(([key, answer]) => [key, { ...answer, confidence: 0.3 }])
  ) as DecisionAnswers;

describe("reviewFeedbackPost — Jev first filter (MIN-565)", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    feedbackPostsReads = [
      // First feedback_posts read: the spam-candidate sweep, never spam here.
      () => ({ data: [], error: null }),
    ];
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    embedTextMock.mockReset().mockResolvedValue([0.1, 0.2]);
    matchFeedbackPostsMock.mockReset().mockResolvedValue(CANDIDATES);
    mergePostsMock.mockReset().mockResolvedValue({ ok: true });
    forcedToolCallMock.mockReset().mockResolvedValue(llmArgs());
    ownerHasUsageBudgetMock.mockReset().mockResolvedValue(true);
    setFeedbackPostCategoriesMock.mockReset().mockResolvedValue({
      ok: true,
      categoryIds: ["cat-a"],
    });
    emitFeedbackFieldChangesMock.mockReset().mockResolvedValue(undefined);
    notifyFeedbackTransitionMock.mockReset().mockResolvedValue(undefined);
    runJevDecisionMock.mockReset().mockResolvedValue(null);
    newRunIdMock.mockReset().mockReturnValue("run-test");
    wireDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("publishes a clean confident Jev verdict WITHOUT paying the LLM", async () => {
    runJevDecisionMock.mockResolvedValue(jevAnswer());

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(forcedToolCallMock).not.toHaveBeenCalled();
    expect(report.posts_reviewed).toBe(1);
    expect(report.posts_categorized).toBe(1);
    expect(setFeedbackPostCategoriesMock).toHaveBeenCalledWith({
      projectId: "project-1",
      postId: "post-new",
      categoryIds: ["cat-a"],
    });
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        review_state: "published",
        sensitivity: null,
        moderation_reason: null,
        suggested_merge_into_id: null,
        // No LLM → no language finding, no translation: written as "none".
        translated_title: null,
        translated_body: null,
        translated_language: null,
        analysis_claimed_at: null,
      })
    );
    // Neither a moderation act nor a language finding happened: the payload
    // must not pretend otherwise.
    expect(updatePayloads[0]).not.toHaveProperty("status");
    expect(updatePayloads[0]).not.toHaveProperty("is_public");
    expect(updatePayloads[0]).not.toHaveProperty("source_language");
  });

  it("briefs Jev on the same world as the LLM pass, billed to the owner", async () => {
    runJevDecisionMock.mockResolvedValue(jevAnswer());

    await reviewFeedbackPost("post-new", "project-1");

    const [spec, ctx] = runJevDecisionMock.mock.calls[0] as [
      {
        useCase: string;
        state: { post: { title: string }; candidates: { id: string }[] };
        questions: { key: string }[];
        llm: { toolName: string; systemPrompt: string };
      },
      { runId: string; seq?: number; billTo: unknown; projectId?: string | null },
    ];
    expect(spec.useCase).toBe("feedback_review");
    expect(spec.state.post).toMatchObject({ title: "Dark mode" });
    expect(spec.state.candidates).toEqual([expect.objectContaining({ id: "post-1" })]);
    expect(spec.questions.map((q) => q.key)).toEqual([
      "is_junk",
      "is_sensitive",
      "sensitivity_kind",
      "duplicate_of",
      "category_ids",
    ]);
    // The fallback recipe rides in the spec, verbatim.
    expect(spec.llm.toolName).toBe("review_feedback");
    expect(spec.llm.systemPrompt).toContain("review_feedback exactly once");
    expect(ctx.billTo).toEqual({ projectOwner: "project-1" });
    expect(ctx.projectId).toBe("project-1");
    expect(ctx.seq).toBe(0);
    expect(ctx.runId).toBe("run-test");
  });

  it("sends a junk verdict to the full LLM pass instead of auto-acting", async () => {
    runJevDecisionMock.mockResolvedValue(
      jevAnswer({ is_junk: { value: true, probability: 0.97, confidence: 0.97 } })
    );
    // The LLM CONFIRMS the junk: the applied verdict is ITS, not Jev's.
    forcedToolCallMock.mockResolvedValue(
      llmArgs({ is_junk: true, reason: "advertising bot" })
    );

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(report.posts_reviewed).toBe(1);
    expect(report.posts_rejected).toBe(1);
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        review_state: "published",
        status: "spam",
        moderation_reason: "advertising bot",
      })
    );
  });

  it("sends a sensitive verdict to the full LLM pass, which translates", async () => {
    runJevDecisionMock.mockResolvedValue(
      jevAnswer({
        is_sensitive: { value: true, probability: 0.96, confidence: 0.96 },
        sensitivity_kind: { value: "security", probability: 0.96, confidence: 0.96 },
      })
    );
    forcedToolCallMock.mockResolvedValue(
      llmArgs({
        is_sensitive: true,
        sensitivity_kind: "security",
        reason: "stack trace with a live token",
        language: "fr",
        translated_title: "Mode sombre",
        translated_body: "Ajoutez un thème sombre.",
      })
    );

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(report.posts_forced_private).toBe(1);
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        review_state: "published",
        is_public: false,
        sensitivity: "security",
        source_language: "fr",
        translated_title: "Mode sombre",
        translated_language: "en",
      })
    );
  });

  it("sends a suspected duplicate to the full LLM pass, which merges", async () => {
    runJevDecisionMock.mockResolvedValue(
      jevAnswer({ duplicate_of: { value: "post-1", probability: 0.93, confidence: 0.93 } })
    );
    forcedToolCallMock.mockResolvedValue(llmArgs({ duplicate_of: "post-1", confidence: 0.95 }));

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(mergePostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ dupId: "post-new", canonicalId: "post-1", performedBy: "ai" })
    );
    expect(report.posts_merged).toBe(1);
  });

  it("falls back to the LLM when Jev answers below the confidence floor", async () => {
    runJevDecisionMock.mockResolvedValue(lowConfidence(jevAnswer()));
    forcedToolCallMock.mockResolvedValue(llmArgs());

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(report.posts_reviewed).toBe(1);
    expect(updatePayloads[0]).toEqual(expect.objectContaining({ review_state: "published" }));
  });

  it("falls back to the LLM when Jev is unavailable", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    forcedToolCallMock.mockResolvedValue(llmArgs());

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(report.posts_reviewed).toBe(1);
  });

  it("skips Jev entirely under the kill switch, behaving like today", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_decisions_enabled: "false" });
    forcedToolCallMock.mockResolvedValue(llmArgs());

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(runJevDecisionMock).not.toHaveBeenCalled();
    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(report.posts_reviewed).toBe(1);
    // No Jev ran: the LLM is the first generation of the run.
    const options = forcedToolCallMock.mock.calls[0]?.[5];
    expect(options?.record?.seq).toBe(0);
    expect(options?.record?.runId).toBe("run-test");
  });

  it("skips Jev for a use case listed LLM-first (MIN-567) — the switch covers the bespoke flow", async () => {
    getAppConfigValuesMock.mockResolvedValue({ jev_llm_first: "feedback_review" });
    forcedToolCallMock.mockResolvedValue(llmArgs());

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(runJevDecisionMock).not.toHaveBeenCalled();
    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(report.posts_reviewed).toBe(1);
    // The LLM pass is the FIRST generation, exactly like a kill-switched run.
    const options = forcedToolCallMock.mock.calls[0]?.[5];
    expect(options?.record?.seq).toBe(0);
  });

  it("bills a mixed decision as ONE run — Jev then the LLM pass", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    forcedToolCallMock.mockResolvedValue(llmArgs());

    await reviewFeedbackPost("post-new", "project-1");

    const [, jevCtx] = runJevDecisionMock.mock.calls[0] as [
      unknown,
      { runId: string; seq?: number },
    ];
    const options = forcedToolCallMock.mock.calls[0]?.[5];
    expect(options?.record?.runId).toBe(jevCtx.runId);
    expect(jevCtx.seq).toBe(0);
    expect(options?.record?.seq).toBe(1);
    expect(options?.record?.feature).toBe("feedback_classify");
    expect(options?.record?.billTo).toEqual({ projectOwner: "project-1" });
  });

  it("fails closed to human review when BOTH engines fail", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    forcedToolCallMock.mockResolvedValue(null);

    const report = await reviewFeedbackPost("post-new", "project-1");

    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
    expect(report.failures).toBe(1);
    expect(report.posts_reviewed).toBe(0);
    // No moderation write happened — only the failure counter.
    expect(updatePayloads).toEqual([{ analysis_failures: 1 }]);
  });
});

describe("feedbackVerdictFromAnswers / isCleanFeedbackVerdict", () => {
  it("maps a clean answer set, folding the none-sentinels to null", () => {
    const verdict = feedbackVerdictFromAnswers(jevAnswer());
    expect(verdict).toEqual({
      duplicateOf: null,
      confidence: 0.1,
      categoryIds: ["cat-a"],
      isJunk: false,
      isSensitive: false,
      sensitivityKind: null,
      reason: null,
    });
    expect(isCleanFeedbackVerdict(verdict)).toBe(true);
  });

  it("maps a duplicate pick to the candidate id with its calibrated certainty", () => {
    const verdict = feedbackVerdictFromAnswers(
      jevAnswer({ duplicate_of: { value: "post-1", probability: 0.93, confidence: 0.9 } })
    );
    expect(verdict.duplicateOf).toBe("post-1");
    expect(verdict.confidence).toBe(0.93);
    expect(isCleanFeedbackVerdict(verdict)).toBe(false);
  });

  it("maps the sensitivity kind and rejects a sensitive verdict as clean", () => {
    const verdict = feedbackVerdictFromAnswers(
      jevAnswer({
        is_sensitive: { value: true, probability: 0.9, confidence: 0.9 },
        sensitivity_kind: { value: "security", probability: 0.9, confidence: 0.9 },
      })
    );
    expect(verdict.isSensitive).toBe(true);
    expect(verdict.sensitivityKind).toBe("security");
    expect(isCleanFeedbackVerdict(verdict)).toBe(false);
  });

  it("rejects junk, and treats missing answers as the safe defaults", () => {
    expect(isCleanFeedbackVerdict(feedbackVerdictFromAnswers({ is_junk: { value: true, probability: 0.9, confidence: 0.9 } }))).toBe(false);
    const empty = feedbackVerdictFromAnswers({});
    expect(empty).toEqual({
      duplicateOf: null,
      confidence: 0,
      categoryIds: [],
      isJunk: false,
      isSensitive: false,
      sensitivityKind: null,
      reason: null,
    });
  });
});
