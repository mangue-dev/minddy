import "server-only";

/**
 * Appel OpenRouter à sortie structurée forcée (tools + tool_choice) — le contrat
 * partagé par les passes IA du feedback (merge : analyze.ts, classification :
 * classify.ts) et calqué sur smart-assign. Parse l'unique tool call ; retourne
 * `null` au moindre échec (clé absente, HTTP non-ok, timeout, JSON invalide) pour
 * que la passe appelante puisse retry sans jamais bloquer le board.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function forcedToolCall(
  model: string,
  systemPrompt: string,
  userMessage: string,
  toolName: string,
  parameters: Record<string, unknown>,
  options?: { xTitle?: string; logPrefix?: string }
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const logPrefix = options?.logPrefix ?? "[feedback-llm]";

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": options?.xTitle ?? "Feedback (minddy)",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: toolName,
              description: "Mandatory structured output — you must always call it.",
              parameters,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: toolName } },
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      choices?: {
        message?: {
          tool_calls?: { function?: { name?: string; arguments?: string } }[];
        };
      }[];
    };
    const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (call?.name !== toolName) return null;
    return JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  } catch (err) {
    console.error(`${logPrefix} LLM call failed:`, (err as Error).message);
    return null;
  }
}
