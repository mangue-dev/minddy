import { NextResponse, after, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { isSameOriginRequest } from "@/lib/server/same-origin";
import { getClientIp } from "@/lib/server/request-ip";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getAppConfigValues } from "@/lib/server/app-config";
import { isManagedAiEnabled } from "@/lib/managed-services";
import {
  fetchOpenRouterWithSuffixFallback,
  modelConfigKeys,
  resolveFromValues,
} from "@/lib/server/model-config";
import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiUsageInput,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { getKnowledgeArticles } from "@/lib/server/assistant/knowledge";
import { aiChatProviderHeaders, translateAiChatRequest } from "@/lib/ai-chat";
import {
  buildFaqAnswerPrompt,
  extractFaqAnswer,
  isFaqSection,
  resolveFaqLocale,
  sanitizeFaqQuestion,
  withinFaqDailyBudget,
  type FaqItem,
  type FaqSection,
} from "@/lib/server/faq-answer";
import { FAQ_KEYS, PRICING_FAQ_KEYS, MCP_FAQ_KEYS } from "@/components/marketing/faq-keys";

/**
 * The FAQ ask box (MIN-590): an anonymous visitor types their own question on
 * a page that carries a FAQ section (`/`, `/pricing`, `/mcp`), and gets an
 * answer from one completion grounded on the page's FAQ entries plus the whole
 * product knowledge base (`content/knowledge/*.md`, read inline by
 * `lib/server/faq-answer.ts` — no retrieval step).
 *
 * It is minddy's second AI endpoint open to an anonymous visitor, after the
 * landing dictation demo (`app/api/demo/dictate/route.ts`), and it follows the
 * same four safeguards: a same-origin check, an hourly IP limit, a
 * per-instance daily ceiling, and the `faq_ask_enabled` admin switch. The
 * model is the admin-configured `faq_ask_model`; the call stays on the
 * platform key (BYOK does not exist for an anonymous visitor) and its cost is
 * recorded under the `faq_ask` feature, billed to the platform.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** A question box is a light feature: a few asks per visitor and per hour. */
const IP_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const;
const GLOBAL_DAILY_LIMIT = 1000;
const BILL_TO = { platform: "FAQ ask box" } as const;

const SECTION_KEYS = {
  landing: { namespace: "Landing", keys: FAQ_KEYS },
  pricing: { namespace: "Pricing", keys: PRICING_FAQ_KEYS },
  mcp: { namespace: "Mcp", keys: MCP_FAQ_KEYS },
} as const satisfies Record<FaqSection, { namespace: string; keys: readonly string[] }>;

/** Client answer ceiling — the model's own bound lives in the prompt. */
const MAX_OUTPUT_TOKENS = 600;

type OpenRouterCompletionData = {
  choices?: { message?: { content?: string | null } }[];
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
};

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rate = checkSessionRateLimit(
    `ip:${getClientIp(request)}`,
    "faq-answer",
    IP_RATE_LIMIT,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retry_after: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }
  if (!withinFaqDailyBudget(GLOBAL_DAILY_LIMIT)) {
    return NextResponse.json(
      { error: "rate_limited", retry_after: 3600 },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const apiKey = isManagedAiEnabled() ? process.env.OPENROUTER_API_KEY : undefined;
  if (!apiKey) {
    console.error("[api/faq/answer] OPENROUTER_API_KEY not configured");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  let body: { question?: unknown; section?: unknown; locale?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const question = sanitizeFaqQuestion(body.question);
  const section = isFaqSection(body.section) ? body.section : null;
  if (!question || !section) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const locale = resolveFaqLocale(body.locale);
  const cfg = await getAppConfigValues([
    "faq_ask_enabled",
    ...modelConfigKeys("faq_ask_model"),
  ]);
  if ((cfg.faq_ask_enabled ?? "true").trim() === "false") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const { namespace, keys } = SECTION_KEYS[section];
  const t = await getTranslations({ locale, namespace });
  const items: FaqItem[] = keys.map((key) => ({
    question: t(`faq_${key}_q`),
    answer: t(`faq_${key}_a`),
  }));
  const prompt = buildFaqAnswerPrompt({
    section,
    items,
    articles: getKnowledgeArticles(),
    locale,
  });

  const model = resolveFromValues("faq_ask_model", cfg).model;
  const runId = newRunId();
  const response = await fetchOpenRouterWithSuffixFallback(
    OPENROUTER_URL,
    model,
    (attemptModel) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...aiChatProviderHeaders("openrouter", "minddy FAQ"),
      },
      body: JSON.stringify(
        translateAiChatRequest(
          {
            model: attemptModel,
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: question },
            ],
            // Gemini 3.1 may spend completion tokens on reasoning before it
            // writes the answer; the question box does not need any.
            reasoning: { effort: "minimal" },
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
          "openrouter",
        ),
      ),
      signal: AbortSignal.timeout(45_000),
    }),
    "[api/faq/answer]",
  );
  if (!response.response.ok) {
    console.error(
      "[api/faq/answer] LLM error:",
      response.response.status,
      (await response.response.text()).slice(0, 200),
    );
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }

  let data: OpenRouterCompletionData;
  try {
    data = (await response.response.json()) as OpenRouterCompletionData;
  } catch {
    console.error("[api/faq/answer] unreadable completion body");
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
  const answer = extractFaqAnswer(data.choices?.[0]?.message?.content);
  if (!answer) {
    console.error("[api/faq/answer] empty completion");
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }

  // The Model ACTUALLY Called: Routing Shortcut Fallback (MIN-263)
  // can remove the suffix, and it is this value which goes to the ledger.
  const u = parseOpenRouterUsage(data.usage);
  const usage: AiUsageInput = {
    runId,
    seq: 0,
    feature: "faq_ask",
    model: data.model ?? response.model,
    generationId: data.id ?? null,
    promptTokens: u.promptTokens,
    completionTokens: u.completionTokens,
    totalTokens: u.totalTokens,
    cost: u.cost,
    billTo: BILL_TO,
  };
  after(() => recordAiUsage([usage]));

  return NextResponse.json(
    { answer },
    // A personal, throwaway answer: nothing to cache anywhere.
    { headers: { "Cache-Control": "no-store" } },
  );
}
