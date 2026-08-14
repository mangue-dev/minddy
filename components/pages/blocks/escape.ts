import { normalizePageUrl } from "@/lib/page-content-schema";

/**
 * L'ÉCHAPPEMENT de la projection markdown (MIN-350).
 *
 * Deux blocs écrivent autre chose que du markdown ordinaire, et les deux le
 * faisaient nu :
 *
 * - le dépliant projette du HTML (`<summary>…</summary>`), parce que markdown
 *   n'a pas de repliable et que `<details>` est le seul que GitHub, Notion et
 *   Obsidian rendent tous les trois (cf. blocks/details.ts). Un résumé qui
 *   contient `<b>` ou `</summary>` sortait donc DANS la balise, où il n'est plus
 *   du texte ;
 * - le bloc fichier et le bloc image interpolent leur `src` dans la destination
 *   d'un lien (`[nom](src)`). Une parenthèse y ferme le lien une syllabe trop
 *   tôt, et le reste de l'adresse retombe en texte.
 *
 * Aucun des deux n'était un XSS dans minddy — la projection est lue par Numo,
 * par la recherche et par les exports, jamais rendue en HTML par l'application.
 * Mais un markdown exporté est fait pour être rendu AILLEURS, et un aller-retour
 * qui ne rend pas le texte qu'on lui a donné est un aller-retour qui perd du
 * contenu, ce que lib/pages-markdown.ts promet précisément de ne pas faire.
 */

/**
 * Le texte tel qu'il peut vivre DANS une balise HTML.
 *
 * Symétrique à la lecture sans rien de plus : le chemin de lecture est
 * markdown-it → HTML → `parseHTML`, et le parseur décode les entités. `&amp;`
 * revient donc `&`, et `&lt;b&gt;` revient `<b>`, en texte.
 */
export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Idem, plus le guillemet : une valeur d'attribut est délimitée par lui. */
export function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

/**
 * L'adresse telle qu'elle peut vivre dans la destination d'un lien markdown, ou
 * `null` quand il ne faut PAS écrire de lien du tout.
 *
 * `null` couvre deux cas, et le second est le sujet du ticket : une adresse
 * vide, et une adresse dont le protocole est refusé
 * ({@link normalizePageUrl}). Un `javascript:` rangé dans un corps avant ce
 * garde-fou — ou entré par un chemin qui l'aurait contourné — ne doit pas
 * ressortir en lien cliquable dans un markdown qu'on exporte.
 *
 * Les parenthèses sont échappées comme le fait prosemirror-markdown lui-même :
 * elles ferment la destination. Les blancs, eux, sont déjà tombés à la
 * normalisation — une adresse n'en porte pas.
 */
export function markdownLinkDestination(src: unknown): string | null {
  const url = normalizePageUrl(src);
  if (!url) return null;
  return url.replace(/[()]/g, "\\$&");
}
