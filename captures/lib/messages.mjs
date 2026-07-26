/**
 * captures/ — libellés de l'application, reconstruits depuis son catalogue.
 *
 * Une capture qui vérifie un texte visible ne doit pas le recopier en dur :
 * recopié, il survivrait à un changement de formulation et l'image continuerait
 * de passer en montrant autre chose. On lit donc `messages/<langue>.json`, la
 * même source que l'app.
 *
 * Le catalogue est en ICU. Ce module n'en implémente que ce dont les captures
 * ont besoin — le pluriel — et échoue bruyamment sur le reste plutôt que de
 * rendre un texte approximatif.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./env.mjs";

const cache = new Map();

/** Le catalogue d'une langue, lu une fois par exécution. */
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
 * Rend un motif ICU pour un `count` donné : la branche `one` à 1, `other`
 * sinon, `#` remplacé par le nombre.
 *
 * Tolère un motif SANS pluriel (`{count} fichiers`) : plusieurs clés en ont
 * changé de forme en cours de route — `ToolCall.agentApplyEdits` est passée
 * d'une interpolation simple à un pluriel — et un script qui se contentait d'un
 * `.replace("{count}", …)` produisait alors le motif brut, introuvable dans la
 * page. Accepter les deux formes évite de refaire ce bug à la prochaine bascule.
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
 * Le libellé d'un appel d'outil, tel que l'app l'affiche.
 *
 *   await toolCallLabel("fr", "foundIssues", 3)   // « 3 tickets trouvés »
 */
export async function toolCallLabel(locale, key, count) {
  const messages = await catalog(locale);
  const pattern = messages.ToolCall?.[key];
  if (pattern === undefined) {
    throw new Error(`captures: ToolCall.${key} n'existe pas dans messages/${locale}.json.`);
  }
  return icuPlural(pattern, count);
}
