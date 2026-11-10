import "server-only";

import { isPlanLimitError } from "@/lib/server/plan-limit-error";

import { getAppConfigValues } from "@/lib/server/app-config";
import {
  aiModelFallback,
  categoryKeyOf,
  roleModelKey,
  stripModelSuffix,
} from "@/lib/ai-model-config";

/**
 * Resolving a model setting: the id the administrator chose for the key's
 * role (MIN-954), or the registry default. The dashboard no longer sets
 * OpenRouter routing shortcuts; a stored shortcut row is ignored. An id typed
 * with one (`…:nitro`) is still sent as is, and replayed bare when refused
 * (`withModelSuffixFallback`).
 */

export interface ResolvedModel {
  /** The id to send. */
  model: string;
}

/**
 * The model of a setting. An absent or empty row falls to the `fallback` of
 * the registry (`lib/ai-model-config.ts`), which follows later product
 * changes, unlike a value fixed in the database.
 */
export async function resolveConfiguredModel(key: string): Promise<ResolvedModel> {
  const cfg = await getAppConfigValues(modelConfigKeys(key)).catch(() => ({}) as Record<
    string,
    string | null
  >);
  return resolveFromValues(key, cfg);
}

/**
 * The same resolution, on values ALREADY read with `modelConfigKeys(key)` —
 * for callers who load several keys at once (a flag and its model, for
 * example) and do not have to go through the database again.
 */
export function resolveFromValues(
  key: string,
  values: Record<string, string | null | undefined>,
): ResolvedModel {
  // Every key runs its role's model (MIN-954): a task's own historical row is
  // no longer read. A role row left empty still reads the retired category
  // default of MIN-829, so an instance keeps the model it ran.
  const roleKey = roleModelKey(key);
  const categoryKey = categoryKeyOf(roleKey);
  const model = values[roleKey]?.trim()
    || (categoryKey ? values[categoryKey]?.trim() : "")
    || aiModelFallback(roleKey);
  return { model };
}

/** The keys to request from `getAppConfigValues` to resolve `key` in full. */
export function modelConfigKeys(key: string): string[] {
  const roleKey = roleModelKey(key);
  const categoryKey = categoryKeyOf(roleKey);
  return categoryKey ? [roleKey, categoryKey] : [roleKey];
}

/**
 * A `fetch` to OpenRouter that REPLAYS once on the bare model when the
 * request is refused and the model carried a routing shortcut.
 *
 * `request(model)` rebuilds the request object: this is the only place where the
 * model changes between the two tests, and this avoids having to copy a request body
 * for the second attempt.
 *
 * We ALSO return the model which was used, so that the loops with several rounds
 * (the dictations) stick to the model which worked instead of re-attempt the suffix
 * — and therefore pay two requests each turn.
 */
/**
 * A refusal of the key itself (invalid key, no credit, key limit reached) does
 * not depend on the model: replaying it on the bare model only costs a second
 * refused request.
 */
async function refusesTheKey(response: Response): Promise<boolean> {
  if (response.status === 401 || response.status === 402) return true;
  if (response.status !== 403) return false;
  return /key limit/i.test(await response.clone().text().catch(() => ""));
}

export async function fetchOpenRouterWithSuffixFallback(
  url: string,
  model: string,
  request: (model: string) => RequestInit,
  logPrefix: string,
  http: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<{ response: Response; model: string }> {
  const response = await http(url, request(model));
  const base = stripModelSuffix(model);
  if (response.ok || base === model || (await refusesTheKey(response))) return { response, model };
  console.warn(`${logPrefix} ${model} refused (${response.status}), retrying on ${base}`);
  return { response: await http(url, request(base)), model: base };
}

/**
 * Plays `run` on the suffixed model, and REPLAYS ONCE on the bare model if
 * the call fails.
 *
 * The fallback requested by MIN-263: a routing shortcut may not find any
 * provider (`:exacto` on a pattern that no verified provider serves), and
 * OpenRouter then responds 404 on the entire call. A comfort setting should
 * not turn off a feature — we fall back to the basic model.
 *
 * Replay never doubles a response already started: the refusal occurs at
 * the moment of the request, before the first token. And without a suffix, `run` * is only
 * called once — the fallback is not a generic retry.
 *
 * `ok` is for callers that don't REAR on failure but return a
 * value agreed (`forcedToolCall` returns `null`): without it, their failure passes
 * for a success and the fallback is not triggered.
 */
export async function withModelSuffixFallback<T>(
  model: string,
  run: (model: string) => Promise<T>,
  options?: { ok?: (value: T) => boolean; logPrefix?: string },
): Promise<T> {
  const base = stripModelSuffix(model);
  if (base === model) return run(model);

  const logPrefix = options?.logPrefix ?? "[model-suffix]";
  try {
    const result = await run(model);
    if (!options?.ok || options.ok(result)) return result;
    console.warn(`${logPrefix} ${model} failed, retrying on ${base}`);
  } catch (err) {
    // A budget refusal does not depend on the model: replaying it only costs
    // another refused request.
    if (isPlanLimitError(err)) throw err;
    console.warn(`${logPrefix} ${model} threw, retrying on ${base}:`, (err as Error).message);
  }
  return run(base);
}
