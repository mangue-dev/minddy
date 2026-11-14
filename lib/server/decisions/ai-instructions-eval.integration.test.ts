import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SmartAssignMember } from "@/lib/server/smart-assign";
import type { DecisionAnswers, DecisionSpec } from "./types";

/**
 * Project AI instructions evaluation (MIN-988) — opt-in, real providers.
 *
 * Answers one question: when a project owner writes an instruction, does each
 * engine follow it? Every case is a pair built by the production spec
 * builders: the same issue without the instruction, then with it. A case
 * passes on an engine when the instructed answer is the expected one; a
 * control case, whose instruction does not concern the issue, passes when
 * the answer stays out of what the instruction would have forced.
 *
 * Both engines are called directly, on the same specs: the configured
 * decision model (`jev_model`) through `runModelDecision`, and the LLM pass
 * through `runLlmDecision`. `production` is what the runner would keep: the
 * decision model's answer when its confidence reaches the default floor, the
 * LLM's otherwise. The writing passes (issue title, objective name) run on
 * the LLM alone: their production prompts are checked on the working
 * language and on one instruction each.
 *
 * Nothing touches the database: the ledger is captured in memory,
 * configuration falls back to the registry defaults, and no BYOK credential
 * is read.
 *
 *   MINDDY_AI_INSTRUCTIONS_EVAL=true OPENROUTER_API_KEY=… MINDDY_EDITION=cloud MINDDY_MANAGED_AI=1 \
 *     npx vitest run lib/server/decisions/ai-instructions-eval.integration.test.ts
 *
 * MINDDY_AI_INSTRUCTIONS_EVAL_OUT=<file.json> writes the report. The default
 * suite skips this file; it spends a few cents per run. Run it again after
 * changing the decision model, the instruction wording in `prepare.ts` or
 * `lib/ai-instructions.ts`, or a prompt that carries an instruction.
 */

const enabled = process.env.MINDDY_AI_INSTRUCTIONS_EVAL === "true";

const ledger = vi.hoisted(() => [] as { feature: string; model?: string | null; cost?: number | null }[]);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai-usage", async (original) => ({
  ...(await original<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: async (input: { feature: string; model?: string | null; cost?: number | null } | object[]) => {
    for (const row of Array.isArray(input) ? input : [input]) ledger.push(row as never);
  },
}));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async () => ({}),
  setAppConfigValue: async () => {},
}));
vi.mock("@/lib/server/agent/model", async (original) => ({
  ...(await original<typeof import("@/lib/server/agent/model")>()),
  getUserByok: async () => null,
}));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => true }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: () => {} }));
const CTX = {
  categories: [
    { id: "cat-bug", name: "Bug" },
    { id: "cat-feature", name: "Feature" },
    { id: "cat-support", name: "Support" },
    { id: "cat-docs", name: "Documentation" },
  ],
  objectives: [
    { id: "obj-revenue", name: "Q4 revenue", status: "in_progress" },
    { id: "obj-mobile", name: "Mobile app", status: "in_progress" },
    { id: "obj-onboarding", name: "Onboarding redesign", status: "planned" },
  ],
};

const TEAM: SmartAssignMember[] = [
  { id: "user-owner", name: "Clément", owner: true, rule: "Product decisions and planning" },
  { id: "user-ada", name: "Ada", owner: false, rule: "Backend, API and database work" },
  { id: "user-grace", name: "Grace", owner: false, rule: "Frontend and interface work" },
];
const NO_RULES = TEAM.map((member) => ({ ...member, rule: null }));

type Answer = string | string[] | boolean | number | undefined;

interface DecisionCase {
  name: string;
  /** A control: the instruction does not concern this issue. */
  control?: boolean;
  question: string;
  build: (withInstruction: boolean) => Promise<DecisionSpec>;
  /** Whether the instructed answer is the one the instruction asks for (or, for a control, avoids). */
  expect: (answer: Answer) => boolean;
}

async function fill(input: { title: string; description: string | null; instructions?: Record<string, string> }) {
  const { buildSmartFillSpec } = await import("./prepare");
  return buildSmartFillSpec({ projectName: "Lumen", ctx: CTX, ...input });
}
async function assign(input: {
  title: string; description: string | null; members: SmartAssignMember[]; instruction?: string;
  priority?: string; categories?: string;
}) {
  const { buildSmartAssignSpec } = await import("./prepare");
  return buildSmartAssignSpec({
    projectName: "Lumen",
    issue: {
      title: input.title, description: input.description,
      categories: input.categories ?? "", priority: input.priority ?? null, effort: null,
    },
    members: input.members,
    instruction: input.instruction,
  });
}

const PAYMENTS = "Anything about payments, refunds or invoices is at least high priority.";
const DOCS_XS = "Documentation-only work is always effort xs, however long the text is.";
const SUPPORT = "An issue that quotes a customer ticket number gets the Support category.";
const BILLING = "Anything about invoices or billing belongs to the Q4 revenue objective.";
const SECURITY = "Security issues always go to Grace, whatever the area of the code.";
const BY_KIND = "Bugs go to Ada. Feature requests go to Grace.";
const includes = (answer: Answer, value: string) => Array.isArray(answer) && answer.includes(value);

const DECISION_CASES: DecisionCase[] = [
  {
    name: "properties: a payment typo is raised to high",
    question: "priority",
    build: (on) => fill({
      title: "Typo in the refund confirmation email footer",
      description: "The footer says 'refund proccessed'. Purely cosmetic.",
      instructions: on ? { properties: PAYMENTS } : undefined,
    }),
    expect: (answer) => answer === "high" || answer === "urgent",
  },
  {
    name: "properties: an invoice layout glitch is raised to high",
    question: "priority",
    build: (on) => fill({
      title: "Invoice PDF: company logo is slightly off-center",
      description: "Minor visual glitch on the invoice header, nothing blocks.",
      instructions: on ? { properties: PAYMENTS } : undefined,
    }),
    expect: (answer) => answer === "high" || answer === "urgent",
  },
  {
    name: "properties: the payment rule leaves an unrelated typo alone",
    control: true,
    question: "priority",
    build: (on) => fill({
      title: "Dark mode toggle label is misspelled",
      description: "It reads 'Drak mode' in the settings. Cosmetic.",
      instructions: on ? { properties: PAYMENTS } : undefined,
    }),
    expect: (answer) => answer !== "high" && answer !== "urgent",
  },
  {
    name: "properties: a large documentation rewrite is sized xs",
    question: "effort",
    build: (on) => fill({
      title: "Rewrite the whole API reference documentation for v2",
      description: "Every endpoint page needs new examples and updated parameters. Documentation only, no code.",
      instructions: on ? { properties: DOCS_XS } : undefined,
    }),
    expect: (answer) => answer === "xs",
  },
  {
    name: "properties: a quoted customer ticket adds the Support category",
    question: "category_ids",
    build: (on) => fill({
      title: "CSV export fails with more than 10,000 rows",
      description: "Reported in customer ticket #48213: the export times out and downloads an empty file.",
      instructions: on ? { properties: SUPPORT } : undefined,
    }),
    expect: (answer) => includes(answer, "cat-support"),
  },
  {
    name: "properties: no ticket number, no Support category",
    control: true,
    question: "category_ids",
    build: (on) => fill({
      title: "CSV export fails with more than 10,000 rows",
      description: "Found while testing: the export times out and downloads an empty file.",
      instructions: on ? { properties: SUPPORT } : undefined,
    }),
    expect: (answer) => !includes(answer, "cat-support"),
  },
  {
    name: "objectives: an invoice bug goes to Q4 revenue",
    question: "objective_id",
    build: (on) => fill({
      title: "Invoice PDF shows the wrong VAT rate for Belgian customers",
      description: "The rate printed is 20% instead of 21%.",
      instructions: on ? { objectives: BILLING } : undefined,
    }),
    expect: (answer) => answer === "obj-revenue",
  },
  {
    name: "objectives: the billing rule leaves a mobile bug alone",
    control: true,
    question: "objective_id",
    build: (on) => fill({
      title: "Push notifications arrive twice on Android",
      description: "Since the last release of the mobile app, every notification is duplicated.",
      instructions: on ? { objectives: BILLING } : undefined,
    }),
    expect: (answer) => answer !== "obj-revenue",
  },
  {
    name: "assign: a backend security issue goes to Grace against her rule",
    question: "user_id",
    build: (on) => assign({
      title: "SQL injection possible in the search API endpoint",
      description: "The q parameter is concatenated into the query. Security vulnerability.",
      members: TEAM,
      instruction: on ? SECURITY : undefined,
    }),
    expect: (answer) => answer === "user-grace",
  },
  {
    name: "assign: the security rule leaves a slow query to Ada",
    control: true,
    question: "user_id",
    build: (on) => assign({
      title: "Slow query on the issues list endpoint",
      description: "The list takes 4 seconds with 5,000 issues. Needs an index.",
      members: TEAM,
      instruction: on ? SECURITY : undefined,
    }),
    expect: (answer) => answer === "user-ada",
  },
  {
    name: "assign: no member rule, a bug goes to Ada",
    question: "user_id",
    build: (on) => assign({
      title: "Crash when saving an empty comment",
      description: "Bug: the editor throws when the comment has no text.",
      members: NO_RULES,
      instruction: on ? BY_KIND : undefined,
    }),
    expect: (answer) => answer === "user-ada",
  },
  {
    name: "assign: no member rule, a feature request goes to Grace",
    question: "user_id",
    build: (on) => assign({
      title: "Let users pin a comment at the top of an issue",
      description: "Feature request from several teams.",
      members: NO_RULES,
      instruction: on ? BY_KIND : undefined,
    }),
    expect: (answer) => answer === "user-grace",
  },
];

const FRENCH = /[àâçéèêëîïôùûü]|\b(le|la|les|des|une|de|du|est|sur|dans|pour|avec)\b|\b[dl]'/i;

/** Both tests report to the console and, when asked, to one JSON file. */
const output: Record<string, unknown> = {};
function emit(section: string, data: unknown): void {
  output[section] = data;
  console.log(JSON.stringify({ [section]: data }, null, 2));
  const file = process.env.MINDDY_AI_INSTRUCTIONS_EVAL_OUT;
  if (file) writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
}

describe.skipIf(!enabled)("Project AI instructions evaluation (MIN-988)", () => {
  it("measures whether each decision engine follows an owner instruction", async () => {
    const { runModelDecision } = await import("./decision-model");
    const { runLlmDecision } = await import("./llm");
    const { DEFAULT_DECISION_CONFIDENCE_FLOOR } = await import("./runner");
    const { decisionConfidence } = await import("./types");
    const { newRunId } = await import("@/lib/server/ai-usage");
    const billing = () => ({ runId: newRunId(), billTo: { platform: true } as never, projectId: null });

    const report: Record<string, unknown>[] = [];
    const tally = { model: 0, llm: 0, production: 0 };
    const followed = { model: 0, llm: 0, production: 0 };
    const controls = { model: 0, llm: 0, production: 0 };
    let modelConfident = 0;
    for (const testCase of DECISION_CASES) {
      const [plain, guided] = await Promise.all([testCase.build(false), testCase.build(true)]);
      const [modelPlain, modelGuided, llmPlain, llmGuided] = await Promise.all([
        runModelDecision(plain, billing()),
        runModelDecision(guided, billing()),
        runLlmDecision(plain, billing()),
        runLlmDecision(guided, billing()),
      ]);
      const value = (answers: DecisionAnswers | null | undefined): Answer => answers?.[testCase.question]?.value;
      const confidence = modelGuided ? decisionConfidence(guided, modelGuided.answers) : null;
      const confident = confidence !== null && confidence >= DEFAULT_DECISION_CONFIDENCE_FLOOR;
      if (confident) modelConfident++;
      const results = {
        model: testCase.expect(value(modelGuided?.answers)),
        llm: testCase.expect(value(llmGuided)),
        production: testCase.expect(confident ? value(modelGuided?.answers) : value(llmGuided)),
      };
      for (const engine of ["model", "llm", "production"] as const) {
        tally[engine] += results[engine] ? 1 : 0;
        (testCase.control ? controls : followed)[engine] += results[engine] ? 1 : 0;
      }
      report.push({
        case: testCase.name,
        control: testCase.control === true,
        model: {
          without: value(modelPlain?.answers) ?? null,
          with: value(modelGuided?.answers) ?? null,
          confidence: confidence === null ? null : Number(confidence.toFixed(3)),
          ok: results.model,
        },
        llm: { without: value(llmPlain) ?? null, with: value(llmGuided) ?? null, ok: results.llm },
        productionOk: results.production,
      });
    }
    const instructed = DECISION_CASES.filter((testCase) => !testCase.control).length;
    const controlCount = DECISION_CASES.length - instructed;
    const cost = (features: string[]) =>
      ledger.filter((row) => features.includes(row.feature)).reduce((sum, row) => sum + (row.cost ?? 0), 0);
    const summary = {
      cases: DECISION_CASES.length,
      instructionFollowed: {
        decisionModel: `${followed.model}/${instructed}`,
        llm: `${followed.llm}/${instructed}`,
        production: `${followed.production}/${instructed}`,
      },
      controlsUnaffected: {
        decisionModel: `${controls.model}/${controlCount}`,
        llm: `${controls.llm}/${controlCount}`,
        production: `${controls.production}/${controlCount}`,
      },
      decisionModelConfidentWithInstruction: `${modelConfident}/${DECISION_CASES.length}`,
      decisionModel: ledger.find((row) => row.feature === "jev_decision")?.model ?? null,
      decisionModelCostUsd: cost(["jev_decision"]),
      llmCostUsd: cost(["smart_fill", "smart_assign"]),
    };
    emit("decisions", { summary, report });
    // The LLM pass is the reference engine: it must follow most instructions.
    // The decision model's score is the measurement, not a gate.
    expect(followed.llm).toBeGreaterThanOrEqual(instructed - 1);
  }, 600_000);

  it("writes titles and objective names in the working language and follows an instruction", async () => {
    const { forcedToolCall } = await import("@/lib/server/feedback/forced-tool-call");
    const { resolveConfiguredModel } = await import("@/lib/server/model-config");
    const {
      buildIssueTitlePrompt, cleanIssueTitle, issueTitleParameters, SMART_FILL_TITLE_MODEL_KEY,
    } = await import("@/lib/server/smart-fill-title");
    const {
      buildObjectiveFillPrompt, buildObjectiveFillUserMessage, cleanObjectiveName,
      objectiveFillClock, objectiveFillParameters,
    } = await import("@/lib/server/smart-fill-objective");
    // The production prompts and schemas, on the platform key: the passes
    // themselves bill a real account, which this evaluation does not have.
    const call = async (modelKey: "smart_fill_title_model" | "smart_fill_model", prompt: string,
      message: string, tool: string, parameters: Record<string, unknown>) => {
      const { model } = await resolveConfiguredModel(modelKey);
      return forcedToolCall(model, prompt, message, tool, parameters, {
        modelKey, maxTokens: 2_048, reasoning: "low", preferNonReasoning: true, timeoutMs: 30_000,
        record: { feature: "smart_fill", billTo: { platform: true } as never, projectId: null },
      });
    };
    const french = "Quand je glisse une carte sur mobile, les colonnes du tableau perdent leur ordre après le rechargement de la page.";
    const english = "When I drag a card on mobile, the board columns lose their order after the page reloads.";
    const BRACKETS = "Start every title with the product area in square brackets, like [Billing].";

    const title = async (description: string, language: "en" | "fr" | null, instruction?: string) => {
      const args = await call(SMART_FILL_TITLE_MODEL_KEY,
        buildIssueTitlePrompt("Lumen", null, { language, instruction }),
        `## Description\n${description}`, "set_issue_title", issueTitleParameters());
      return typeof args?.title === "string" ? cleanIssueTitle(args.title) : null;
    };
    const objective = async (language: "fr" | null, instruction?: string) => {
      const args = await call("smart_fill_model",
        buildObjectiveFillPrompt("Lumen", objectiveFillClock("Europe/Paris"), { language, instruction }),
        buildObjectiveFillUserMessage("", "Ship the redesigned onboarding flow to all new accounts."),
        "fill_objective", objectiveFillParameters());
      return typeof args?.name === "string" ? cleanObjectiveName(args.name) : null;
    };
    const [frenchAutomatic, frenchToEnglish, englishToFrench, englishBracketed, frenchToEnglishBracketed,
      objectivePrefixed, ...objectiveFrench] = await Promise.all([
      title(french, null),
      title(french, "en"),
      title(english, "fr"),
      title(english, null, BRACKETS),
      title(french, "en", BRACKETS),
      objective(null, "Prefix every objective name with the quarter, like 'Q4 · '."),
      // Translating a name is the least obvious of these: measured on five runs.
      ...Array.from({ length: 5 }, () => objective("fr")),
    ]);
    const report = {
      titles: { frenchAutomatic, frenchToEnglish, englishToFrench, englishBracketed, frenchToEnglishBracketed },
      objectiveFrench, objectivePrefixed,
    };
    emit("writing", report);

    expect(frenchAutomatic).toMatch(FRENCH);
    expect(frenchToEnglish).not.toMatch(FRENCH);
    expect(englishToFrench).toMatch(FRENCH);
    expect(englishBracketed).toMatch(/^\[[^\]]+\]/);
    expect(frenchToEnglishBracketed).toMatch(/^\[[^\]]+\]/);
    expect(frenchToEnglishBracketed).not.toMatch(FRENCH);
    expect(objectiveFrench.filter((name) => name && FRENCH.test(name)).length).toBeGreaterThanOrEqual(4);
    expect(objectivePrefixed).toMatch(/^Q[1-4]/);
  }, 300_000);
});
