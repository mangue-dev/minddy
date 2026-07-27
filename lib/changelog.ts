/**
 * Le changelog public (MIN-93) — la liste des livraisons, du plus récent au
 * plus ancien.
 *
 * ## Pourquoi ce fichier et pas les issues `done`
 *
 * Le plan proposait de dériver la page des issues minddy passées à `done` sur
 * le projet lui-même : le produit se documenterait avec lui-même, ce qui est
 * une jolie démonstration. Essayé, écarté, pour trois raisons de fond :
 *
 * 1. **La langue.** Les issues de minddy sont écrites en français. Le site
 *    public est canonique en ANGLAIS. Une page anglaise remplie de « Refondre
 *    les métadonnées de toutes les pages avec i18n » n'est pas une page
 *    anglaise, et rien ne peut la traduire à la volée sans mentir.
 * 2. **L'audience.** Un titre d'issue s'adresse à celui qui va la faire ; une
 *    entrée de changelog à celui qui utilise le produit. « Différer l'import de
 *    posthog-js » et « Dashboard admin doit déclencher le fil d'ariane » sont
 *    de vraies livraisons, et n'ont rien à faire sur une page publique.
 * 3. **Le tri.** Il faudrait un drapeau « public » sur les issues, donc une
 *    migration et une case de plus dans l'UI, pour un besoin qu'une liste de
 *    quinze lignes couvre.
 *
 * D'où : une entrée par livraison, écrite pour un lecteur, dans les deux
 * langues. Le geste reste le même — quand un lot d'issues passe à `done`, on
 * ajoute une entrée — mais on la RÉÉCRIT.
 *
 * ## Ce que contient ce fichier, et ce qu'il ne contient pas
 *
 * Uniquement l'identifiant et la date. Les textes vivent dans le namespace
 * `Changelog` des deux catalogues (`entry_<id>_title`, `entry_<id>_body`), avec
 * tout le reste de la copie du site — donc dans le périmètre d'un audit de
 * copy, et traduisibles comme n'importe quelle autre chaîne.
 *
 * C'est aussi ce qui permet à `lib/public-routes.ts` d'importer ce module pour
 * en tirer le `lastModified` de la page sans alourdir le middleware : même dans
 * cinq ans, ce fichier ne pèsera que des identifiants et des dates.
 *
 * ## Ajouter une entrée
 *
 * En tête de liste : `{ id: "<slug-court>", date: "AAAA-MM-JJ" }`, la date du
 * DÉPLOIEMENT, puis `entry_<id>_title` et `entry_<id>_body` dans `en.json` et
 * `fr.json`. `changelog.test.ts` refuse une entrée sans texte, une date mal
 * formée ou une liste mal triée.
 */

export interface ChangelogEntry {
  /** Slug stable : clé i18n, ancre de l'URL et `guid` du flux RSS. */
  id: string;
  /** Date de déploiement, ISO court. */
  date: string;
}

/** Du plus récent au plus ancien — c'est l'ordre d'affichage ET celui du flux. */
export const CHANGELOG_ENTRIES: ReadonlyArray<ChangelogEntry> = [
  { id: "mcp-page", date: "2026-07-27" },
  { id: "localised-site", date: "2026-07-27" },
  { id: "search-everywhere", date: "2026-07-26" },
  { id: "notebook-agent", date: "2026-07-24" },
  { id: "notifications", date: "2026-07-24" },
];

/**
 * La date de la dernière entrée, telle que la lisent le sitemap et l'en-tête
 * de la page. C'est le seul `lastModified` de la table des routes qui ne soit
 * pas tenu à la main : sur cette page-là, « le contenu a changé » et « une
 * entrée a été ajoutée » sont exactement la même chose.
 */
export const CHANGELOG_LAST_MODIFIED: string = CHANGELOG_ENTRIES[0].date;
