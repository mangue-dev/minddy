/**
 * captures/ — labels of the application, reconstructed from its catalog.
 *
 * A capture that checks visible text must not hardcopy it:
 * copied, it would survive a wording change and the image would continue
 * to pass by showing something else. We therefore read `messages/<langue>.json`, the
 * same source as the app.
 *
 * The catalog is in ICU. This module only implements what the captures
 * need — the plural — and fails loudly on the rest rather than
 * rendre un texte approximatif.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./env.mjs";

const cache = new Map();

/** The catalog of a language, read once per execution. */
export async function catalog(locale) {
  if (!cache.has(locale)) {
    cache.set(
      locale,
      JSON.parse(await readFile(resolve(ROOT, `messages/${locale}.json`), "utf8")),
    );
  }
  return cache.get(locale);
}

/**
 * Returns an ICU pattern for a given `count`: branch `one` to 1, `other`
 * otherwise, `#` replaced by the number.
 *
 * Tolerates a pattern WITHOUT plural (`{count} fichiers`): several keys have it
 * changed form en route — `ToolCall.agentApplyEdits` passed
 * from a simple interpolation to a plural — and a script which was satisfied with a
 * `.replace("{count}", …)` then produced the raw pattern, not found in the
 * page. Accepting both forms avoids repeating this bug on the next switch.
 */
export function icuPlural(pattern, count) {
  if (typeof pattern !== "string") {
    throw new Error(`captures: libellé absent du catalogue (reçu ${typeof pattern}).`);
  }
  if (!/\{\s*\w+\s*,\s*plural\s*,/.test(pattern)) {
    return pattern.replaceAll(/\{\s*\w+\s*\}/g, String(count));
  }
  const branch = count === 1 ? /(?:^|[\s{])one\s*\{([^}]*)\}/ : /(?:^|[\s{])other\s*\{([^}]*)\}/;
  const hit = branch.exec(pattern);
  if (!hit) {
    throw new Error(`captures: pluriel ICU illisible — ${pattern}`);
  }
  return hit[1].replaceAll("#", String(count));
}

/**
 * The label of a tool call, as displayed by the app.
 *
 * await toolCallLabel("fr", "foundIssues", 3) // “3 tickets found”
 */
export async function toolCallLabel(locale, key, count) {
  const messages = await catalog(locale);
  const pattern = messages.ToolCall?.[key];
  if (pattern === undefined) {
    throw new Error(`captures: ToolCall.${key} n'existe pas dans messages/${locale}.json.`);
  }
  return icuPlural(pattern, count);
}
