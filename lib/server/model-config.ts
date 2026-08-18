import "server-only";

import { getAppConfigValues } from "@/lib/server/app-config";
import {
  aiModelFallback,
  applyModelSuffix,
  modelSuffixKey,
  stripModelSuffix,
} from "@/lib/ai-model-config";

/**
 * Resolving a template setting: the id chosen on the admin side, plus its
 * OpenRouter routing shortcut if it carries one (MIN-263).
 *
 * Only one place reads BOTH lines `app_config` — the template and its suffix —
 * and glue them back together. Callers therefore never have to know the existence of the
 * suffix: they request a model by its key, and receive the id to send.
 *
 * What the suffix changes: nothing to the model, everything to the ORDER of the providers which
 * serve it (`nitro` = the most fast, `floor` = the cheapest, `exacto` = the
 * more reliable in tool-calling). Hence the fallback of `withModelSuffixFallback`:
 * when no provider satisfies the requested order, OpenRouter refuses the entire
 * call — better the bare model than a disabled functionality.
 */

export interface ResolvedModel {
  /** The id to SEND: the base plus its suffix, when there is one. */
  model: string;
  /** The bare id, without suffix — for display or catalog searching. */
  base: string;
  /** The selected shortcut, or `null` when the admin has not set any. */
  suffix: string | null;
}

/**
 * The template for a setting, including the suffix. An absent or empty line falls
 * to the `fallback` of the register (`lib/ai-model-config.ts`) — which follows the
 * changes in the fault produced, unlike a value fixed in base.
 *
 * A single request for the two keys, and the 60 s cache d'`app-config` by
 * above: reading the suffix does not cost an extra round trip.
 */
export async function resolveConfiguredModel(key: string): Promise<ResolvedModel> {
  const suffixKey = modelSuffixKey(key);
  const cfg = await getAppConfigValues([key, suffixKey]).catch(() => ({}) as Record<
    string,
    string | null
  >);
  return resolveFromValues(key, cfg);
}

/**
 * The same resolution, on values ​​ALREADY read — for callers who
 * load several keys at once (a flag and its model, for example) and
 * do not have to go through the base again. Remember to include `modelSuffixKey(key)` in
 * the requested batch, otherwise the suffix will appear absent.
 */
export function resolveFromValues(
  key: string,
  values: Record<string, string | null | undefined>,
): ResolvedModel {
  const base = values[key]?.trim() || aiModelFallback(key);
  const suffix = values[modelSuffixKey(key)]?.trim() || null;
  return { model: applyModelSuffix(base, suffix), base, suffix };
}

/**
 * A CASCADE of settings: the first one to pose wins, with HIS suffix — that of
 * `assistant_model` when it's him who responds, that of `fallback_model`
 * when it's the other. No line installed: the default code of the first key.
 */
export function resolveCascadeFromValues(
  keys: string[],
  values: Record<string, string | null | undefined>,
): ResolvedModel {
  for (const key of keys) {
    if (values[key]?.trim()) return resolveFromValues(key, values);
  }
  return resolveFromValues(keys[0], values);
}

/** The keys to request from `getAppConfigValues` to resolve `key` in full. */
export function modelConfigKeys(key: string): [string, string] {
  return [key, modelSuffixKey(key)];
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
export async function fetchOpenRouterWithSuffixFallback(
  url: string,
  model: string,
  request: (model: string) => RequestInit,
  logPrefix: string,
): Promise<{ response: Response; model: string }> {
  const response = await fetch(url, request(model));
  const base = stripModelSuffix(model);
  if (response.ok || base === model) return { response, model };
  console.warn(`${logPrefix} ${model} refused (${response.status}), retrying on ${base}`);
  return { response: await fetch(url, request(base)), model: base };
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
    console.warn(`${logPrefix} ${model} threw, retrying on ${base}:`, (err as Error).message);
  }
  return run(base);
}
