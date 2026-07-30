/**
 * L'option `analyze` de `POST /api/v1/feedback` (MIN-106) — partagé, pur.
 *
 * Un client qui fait tourner son propre classifier doit pouvoir dire, retour par
 * retour, que Numo ne regarde pas celui-là. Le drapeau est optionnel et vaut
 * `true` par défaut : les intégrations déjà en place ne changent pas de
 * comportement du jour au lendemain.
 *
 * La lecture est STRICTE, comme le reste de l'API publique : `"false"`, `0` ou
 * `null` ne valent pas `false`. Sur une option qui décide si un retour est
 * modéré avant d'apparaître sur un board public, deviner l'intention d'une
 * valeur mal typée serait le pire des deux mondes — silencieux, et faux dans le
 * sens dangereux une fois sur deux. Mieux vaut un 422 que l'intégrateur voit.
 */

export type AnalyzeOption =
  | { ok: true; analyze: boolean }
  | { ok: false; error: "invalid_analyze" };

export function readAnalyzeOption(value: unknown): AnalyzeOption {
  if (value === undefined) return { ok: true, analyze: true };
  if (typeof value !== "boolean") return { ok: false, error: "invalid_analyze" };
  return { ok: true, analyze: value };
}
