import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * Smart Fill relations evaluation (MIN-717) — opt-in, real providers.
 *
 * Runs the production retrieval and decision path on a fixed corpus of
 * representative cases (paraphrased positives, explicit dependencies in both
 * directions, topical-but-unrelated negatives, near-duplicates and French/
 * English pairs) and reports precision, direction accuracy, recall, latency
 * and the provider-reported cost. Nothing touches the database: the ledger is
 * captured in memory, configuration falls back to the registry defaults, and
 * no BYOK credential is read.
 *
 *   MINDDY_RELATION_EVAL=true OPENROUTER_API_KEY=… MINDDY_EDITION=cloud MINDDY_MANAGED_AI=1 \
 *     npx vitest run lib/server/issue-relation-eval.integration.test.ts
 *
 * Optional: MINDDY_RELATION_EVAL_OUT=<file.json> writes the full report, and
 * MINDDY_RELATION_EVAL_ENGINE=llm measures the LLM fallback alone.
 * The default suite skips this file; it spends a few cents per run.
 */

const enabled = process.env.MINDDY_RELATION_EVAL === "true";

const ledger = vi.hoisted(() => [] as { feature: string; model?: string | null; cost?: number | null }[]);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai-usage", async (original) => ({
  ...(await original<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: async (input: { feature: string; model?: string | null; cost?: number | null } | object[]) => {
    for (const row of Array.isArray(input) ? input : [input]) ledger.push(row as never);
  },
}));
// MINDDY_RELATION_EVAL_ENGINE=llm turns the decision model off, measuring the LLM fallback alone.
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async () =>
    process.env.MINDDY_RELATION_EVAL_ENGINE === "llm" ? { jev_decisions_enabled: "false" } : {},
  setAppConfigValue: async () => {},
}));
vi.mock("@/lib/server/agent/model", async (original) => ({
  ...(await original<typeof import("@/lib/server/agent/model")>()),
  getUserByok: async () => null,
}));
// No shadow replay during the evaluation: it would only add cost.
vi.mock("@/lib/server/decisions/shadow", () => ({ runShadowComparison: async () => {} }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: () => {} }));

interface Case {
  id: string;
  title: string;
  description: string;
}

/** Existing issues of the fictional project. */
const CORPUS: Case[] = [
  { id: "auth-provider", title: "Migrate authentication to the new identity provider", description: "Replace the legacy session login with OIDC through the company identity provider. Every sign-in flow must go through it." },
  { id: "billing-export", title: "Export invoices as CSV", description: "Finance wants a monthly CSV export of paid invoices with tax columns." },
  { id: "dark-mode", title: "Dark mode for the dashboard", description: "Add a dark theme toggle and make every dashboard widget readable on dark backgrounds." },
  { id: "rate-limit", title: "Rate limit the public API", description: "Throttle requests per API key to protect the database during traffic spikes." },
  { id: "search-index", title: "Rebuild the search index nightly", description: "The search index drifts from the database; schedule a nightly full rebuild job." },
  { id: "mobile-crash", title: "App crashes when opening a notification on Android 15", description: "Tapping a push notification crashes the Android app before the screen renders." },
  { id: "webhooks-v2", title: "Webhooks v2 payload format", description: "Define the new versioned JSON payload for outgoing webhooks, with signatures." },
  { id: "onboarding-tour", title: "Interactive onboarding tour", description: "Guide new accounts through creating their first project with a step-by-step tour." },
  { id: "pdf-invoice", title: "Facture PDF avec logo de l'entreprise", description: "Les clients veulent télécharger leurs factures en PDF avec le logo et l'adresse de leur entreprise." },
  { id: "db-upgrade", title: "Upgrade Postgres to version 18", description: "Plan and run the major Postgres upgrade with a maintenance window." },
  { id: "email-digest", title: "Weekly email digest", description: "Send each member a weekly summary of the issues they follow." },
  { id: "theme-tokens", title: "Introduce color design tokens", description: "Move hard-coded colors to semantic tokens so themes can be switched." },
];

/**
 * New issues and the relation each one SHOULD get, from the new issue's side.
 * Any candidate not listed must receive no relation.
 */
const SUBJECTS: (Case & { expected: Record<string, "related" | "blocks" | "blocked_by"> })[] = [
  { id: "s-sso", title: "SAML single sign-on for enterprise workspaces",
    description: "Enterprise customers need SAML SSO. This builds on the OIDC identity provider migration, which must be finished first.",
    expected: { "auth-provider": "blocked_by" } },
  { id: "s-dark-charts", title: "Charts unreadable in dark theme",
    description: "Since the dark mode toggle shipped, chart axis labels stay black on the dark dashboard background.",
    expected: { "dark-mode": "related" } },
  { id: "s-tokens-first", title: "Audit hard-coded hex colors in components",
    description: "List every hard-coded color so they can be replaced; the design tokens work cannot start before this audit is done.",
    expected: { "theme-tokens": "blocks" } },
  { id: "s-fr-export", title: "Exporter les factures payées pour la comptabilité",
    description: "La comptabilité demande un export mensuel des factures payées, en CSV, avec la TVA.",
    expected: { "billing-export": "related" } },
  { id: "s-en-pdf", title: "Company logo missing on downloaded invoices",
    description: "The invoice PDF download does not show the customer's company logo and address.",
    expected: { "pdf-invoice": "related" } },
  { id: "s-api-keys", title: "Rotate API keys from the settings page",
    description: "Let owners revoke and regenerate their API keys without contacting support.",
    expected: {} },
  { id: "s-search-ui", title: "Search results page redesign",
    description: "New layout for search results with filters on the left. Purely visual.",
    expected: {} },
  { id: "s-android-push", title: "Android 15: crash after tapping a push",
    description: "Opening the app from a notification on Android 15 crashes immediately.",
    expected: { "mobile-crash": "related" } },
  { id: "s-webhook-retry", title: "Retry failed webhook deliveries",
    description: "Deliveries that fail should retry with backoff. Unrelated to the payload format.",
    expected: {} },
  { id: "s-pg-ext", title: "Enable pgvector after the database upgrade",
    description: "pgvector 0.9 requires Postgres 18, so this can only happen once the major upgrade is done.",
    expected: { "db-upgrade": "blocked_by" } },
];

describe.skipIf(!enabled)("Smart Fill relations evaluation (MIN-717)", () => {
  it("measures precision, direction, latency and cost on representative cases", async () => {
    const { requestEmbeddings } = await import("@/lib/server/embeddings");
    const { runDecision } = await import("@/lib/server/decisions/runner");
    const { buildRelationSpec, relationVerdicts, MAX_RELATION_CANDIDATES } = await import(
      "@/lib/server/issue-relation-decision"
    );
    const { rankVectorNeighbours, embeddingText } = await import("@/lib/server/issue-relation-inference");

    const all = [...CORPUS, ...SUBJECTS];
    const started = performance.now();
    const batch = await requestEmbeddings(all.map((c) => embeddingText(c.title, c.description)), {
      modelKey: "issue_embedding_model",
      surface: "automations",
      feature: "issue_embedding",
      billedUserId: null,
      allowPlatformWithoutUser: true,
      record: { billTo: { platform: true } as never },
      dimensions: "any",
      xTitle: "Smart-fill relation eval",
    });
    const embedMs = Math.round(performance.now() - started);
    expect(batch).not.toBeNull();
    const vectors = new Map(all.map((c, i) => [c.id, batch!.vectors[i]!]));
    const corpusRows = CORPUS.map((c) => ({ issue_id: c.id, embedding: vectors.get(c.id)! }));

    const report: Record<string, unknown>[] = [];
    let proposed = 0, correctType = 0, expectedTotal = 0, found = 0, falsePositive = 0, decisionMs = 0;
    for (const subject of SUBJECTS) {
      const ranked = rankVectorNeighbours(vectors.get(subject.id)!, corpusRows, subject.id)
        .slice(0, MAX_RELATION_CANDIDATES);
      const candidates = ranked.map((r, i) => {
        const c = CORPUS.find((x) => x.id === r.id)!;
        return { id: c.id, reference: `#${i + 100}`, title: c.title, description: c.description, status: "todo" };
      });
      const expectedIds = Object.keys(subject.expected);
      expectedTotal += expectedIds.length;
      let verdicts = new Map<string, string>();
      let engine: string | null = null;
      if (candidates.length > 0) {
        const t0 = performance.now();
        const outcome = await runDecision(
          buildRelationSpec({ projectName: "Eval", subject, candidates }),
          { billTo: { platform: true } as never, projectId: null },
        );
        decisionMs += performance.now() - t0;
        engine = outcome?.engine ?? null;
        verdicts = outcome ? relationVerdicts(outcome.answers, candidates) : new Map();
      }
      for (const [id, verdict] of verdicts) {
        if (verdict === "none") continue;
        proposed++;
        if (subject.expected[id] === verdict) correctType++;
        else if (!subject.expected[id]) falsePositive++;
      }
      for (const id of expectedIds) if (verdicts.get(id) === subject.expected[id]) found++;
      report.push({
        subject: subject.id,
        engine,
        candidates: ranked.map((r) => ({ id: r.id, similarity: Number(r.score.toFixed(3)) })),
        verdicts: Object.fromEntries(verdicts),
        expected: subject.expected,
        missedExpected: expectedIds.filter((id) => !ranked.some((r) => r.id === id)),
      });
    }

    const cost = (feature: string) =>
      ledger.filter((row) => row.feature === feature).reduce((sum, row) => sum + (row.cost ?? 0), 0);
    const summary = {
      embeddingModel: batch!.model,
      dimensions: vectors.get(CORPUS[0].id)!.length,
      subjects: SUBJECTS.length,
      proposedRelations: proposed,
      exactMatches: correctType,
      precision: proposed ? correctType / proposed : 1,
      falsePositivesOnUnrelatedPairs: falsePositive,
      recall: expectedTotal ? found / expectedTotal : 1,
      embeddingLatencyMs: embedMs,
      embeddingCostUsd: cost("issue_embedding"),
      embeddedTexts: all.length,
      meanDecisionLatencyMs: Math.round(decisionMs / SUBJECTS.length),
      decisionModelCostUsd: cost("jev_decision"),
      llmFallbackCostUsd: cost("issue_relation"),
      ledgerRows: ledger.length,
    };
    console.log(JSON.stringify({ summary, report }, null, 2));
    if (process.env.MINDDY_RELATION_EVAL_OUT) {
      writeFileSync(process.env.MINDDY_RELATION_EVAL_OUT, JSON.stringify({ summary, report }, null, 2));
    }
    // A conservative pass: no relation on a pair that should have none.
    expect(falsePositive).toBe(0);
  }, 180_000);
});
