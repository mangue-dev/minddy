import { NextResponse, after, type NextRequest } from "next/server";
import { getLocale } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiUsageInput,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { getAppConfigValues } from "@/lib/server/app-config";
import { aiModelFallback } from "@/lib/ai-model-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { ensureUsageBudget } from "@/lib/server/usage";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import {
  buildCompletionPrompt,
  sanitizeCompletion,
  MAX_CONTEXT_TITLES,
  MAX_PREFIX_CHARS,
  type CompletionField,
} from "@/lib/server/issue-completion";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * TEXTE FANTÔME du formulaire de création de ticket : le client envoie ce qui
 * précède le caret, on rend la suite, il l'affiche en gris et Tab l'accepte.
 *
 * Cette route se juge à UNE chose, la latence — un fantôme qui arrive après la
 * frappe suivante n'existe pas. D'où tout ce qui suit, et qui la distingue de
 * `dictate-issue`, sa voisine de forme :
 *
 * - **un seul appel**, sans tools et sans boucle : la sortie est du texte, pas
 *   un patch de champs, donc rien à valider contre la base ;
 * - **`max_tokens` à deux chiffres** : on ne veut que la fin d'une phrase, et
 *   c'est le plafond qui borne le temps de génération autant que le coût ;
 * - **le contexte projet en UNE requête** (les derniers titres), pas la moisson
 *   complète de `gatherProjectPromptContext` — le modèle n'a ici aucun id à
 *   citer, il n'a besoin que du style de la maison ;
 * - **rien n'est écrit** : ni en base, ni dans le brouillon. Le pire cas d'une
 *   suggestion ratée est un gris qu'on ignore.
 *
 * Le quota est celui de tout le reste (`ensureUsageBudget`), et le drapeau
 * `complete_issue_enabled` la coupe partout d'un coup. Un budget épuisé ou un
 * drapeau baissé ne sont PAS des erreurs ici : on rend `disabled: true`, et le
 * client arrête de demander pour la session. Un formulaire de ticket ne doit
 * pas se mettre à afficher des erreurs parce qu'on y tape.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = aiModelFallback("complete_issue_model");
// Généreux, et il le faut : une frappe soutenue vaut une poignée d'appels par
// minute même avec le debounce. C'est un garde-fou contre la boucle folle
// (un client qui redemande sans debounce), pas un rationnement de l'usage —
// c'est le budget du plan qui joue ce rôle-là.
const RATE_LIMIT = { limit: 240, windowMs: 60 * 60 * 1000 } as const;
const MAX_TOKENS: Record<CompletionField, number> = { title: 24, description: 48 };

/** Réponse « ne redemande pas » : le client la garde pour la session. */
const disabled = () => NextResponse.json({ completion: "", disabled: true });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const rateLimit = checkSessionRateLimit(auth.user.id, "complete-issue", RATE_LIMIT);
  if (!rateLimit.allowed) return disabled();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return disabled();

  let body: {
    field?: unknown;
    prefix?: unknown;
    title?: unknown;
    categories?: unknown;
    objective?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const field: CompletionField = body.field === "description" ? "description" : "title";
  const prefix =
    typeof body.prefix === "string"
      ? sanitizeAssistantMessageContent(body.prefix).slice(-MAX_PREFIX_CHARS)
      : "";
  if (prefix.trim().length < 3) {
    return NextResponse.json({ completion: "" });
  }

  // Contexte du brouillon — purement décoratif pour le prompt : il ne sert qu'à
  // orienter du TEXTE, et rien de ce que le modèle rend n'est réinterprété
  // comme un id. D'où la confiance de niveau prompt, comme pour la dictée.
  const strList = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string")
          .slice(0, max)
          .map((x) => sanitizeAssistantMessageContent(x).slice(0, 80))
      : [];
  const draftTitle =
    typeof body.title === "string"
      ? sanitizeAssistantMessageContent(body.title).slice(0, 300)
      : "";
  const categories = strList(body.categories, 10);
  const objective =
    typeof body.objective === "string"
      ? sanitizeAssistantMessageContent(body.objective).slice(0, 120)
      : "";

  // Tout ce qui touche la base part ensemble : chacun de ces appels est un
  // aller-retour, et les enchaîner tripleraient le temps mort avant le modèle.
  const [budgetOk, projectRes, titlesRes, cfg, locale] = await Promise.all([
    ensureUsageBudget(auth.user.id).then(
      () => true,
      (err: unknown) => {
        if (isPlanLimitError(err)) return false;
        throw err;
      }
    ),
    // RLS porte l'autorisation : un projet inaccessible se lit « introuvable ».
    auth.supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single(),
    auth.supabase
      .from("issues")
      .select("title")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_CONTEXT_TITLES),
    getAppConfigValues(["complete_issue_model", "complete_issue_enabled"]),
    getLocale(),
  ]);

  if (!budgetOk) return disabled();
  if ((cfg["complete_issue_enabled"] ?? "true").trim() === "false") return disabled();
  if (!projectRes.data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const model = cfg["complete_issue_model"]?.trim() || DEFAULT_MODEL;
  const recentTitles = (titlesRes.data ?? [])
    .map((r) => (r as { title: string }).title)
    .filter((t) => typeof t === "string" && t.trim() !== "");

  const system = buildCompletionPrompt(field, {
    projectName: projectRes.data.name,
    recentTitles,
    title: field === "description" ? draftTitle : undefined,
    categories,
    objective: objective || undefined,
    locale,
  });

  const runId = newRunId();
  const usageRows: AiUsageInput[] = [];
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "Numo (minddy)",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prefix },
        ],
        usage: { include: true },
        max_tokens: MAX_TOKENS[field],
        temperature: 0.2,
        // Une suggestion tient sur la ligne du caret : la génération s'arrête
        // au premier saut de ligne plutôt que de payer un paragraphe qu'on
        // jetterait ensuite dans `sanitizeCompletion`.
        stop: ["\n"],
      }),
    });
    if (!response.ok) {
      throw new Error(`LLM error (${response.status})`);
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      id?: string;
      model?: string;
      usage?: OpenRouterUsage;
    };
    const u = parseOpenRouterUsage(data.usage);
    usageRows.push({
      runId,
      seq: 0,
      feature: "issue_autocomplete",
      model: data.model ?? model,
      generationId: data.id ?? null,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
      cost: u.cost,
      billTo: { userId: auth.user.id },
      projectId,
    });
    const completion = sanitizeCompletion(
      data.choices?.[0]?.message?.content ?? "",
      prefix,
      field
    );
    after(() => recordAiUsage(usageRows));
    return NextResponse.json({ completion });
  } catch (err) {
    console.error("[api/complete-issue] failed:", err);
    if (usageRows.length > 0) after(() => recordAiUsage(usageRows));
    // Une panne du modèle ne remonte pas au formulaire : pas de fantôme, et le
    // client peut redemander à la frappe suivante.
    return NextResponse.json({ completion: "" });
  }
}
