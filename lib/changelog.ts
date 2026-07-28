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

import type { Locale } from "@/i18n/config";

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

/** Combien de temps une livraison reste « nouvelle » pour la pastille du menu. */
export const RECENT_CHANGELOG_DAYS = 5;

/**
 * Y a-t-il une livraison de moins de cinq jours ? C'est ce que signale la
 * pastille bleue du menu de compte, dans l'app.
 *
 * Pas d'état « lu » derrière : la pastille dit « quelque chose est sorti cette
 * semaine », pas « vous ne l'avez pas vu ». Rien à stocker, rien à
 * synchroniser entre appareils, et elle s'éteint toute seule.
 *
 * Aucune borne basse volontairement : les dates sont écrites à la main, en
 * UTC-minuit, et publiées le jour même. Un utilisateur à Paris qui ouvre l'app
 * à 1 h du matin est encore la veille en UTC — exiger `age >= 0` éteindrait la
 * pastille précisément le jour de la sortie.
 */
export function hasRecentChangelog(now: number = Date.now()): boolean {
  const [year, month, day] = CHANGELOG_LAST_MODIFIED.split("-").map(Number);
  const age = now - Date.UTC(year, month - 1, day);
  return age < RECENT_CHANGELOG_DAYS * 24 * 60 * 60 * 1000;
}

/** Le nom de format Intl de la langue servie. */
function intlLocale(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-GB";
}

/** Date lisible dans la langue servie, sans dépendre du fuseau du serveur. */
export function formatChangelogDate(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * « Il y a deux jours » plutôt que « 26 juillet 2026 » : ce qu'on cherche en
 * ouvrant un changelog n'est pas la date, c'est la fraîcheur. La date exacte
 * reste dans l'attribut `datetime`, que lisent les analyseurs, et en infobulle.
 *
 * **Au jour près, jamais à l'heure.** Une entrée ne porte qu'une date : dire
 * « il y a 20 heures » lui prêterait une précision qu'elle n'a pas. Le plancher
 * à zéro règle au passage le décalage horaire, qui annoncerait sinon une
 * livraison du jour « dans quatre heures » à un lecteur à l'est de l'UTC.
 */
export function formatChangelogAge(
  iso: string,
  locale: Locale,
  now: number = Date.now(),
): string {
  const published = Date.parse(`${iso}T00:00:00Z`);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });

  const days = Math.max(0, Math.floor((now - published) / 86_400_000));
  if (days < 30) return format.format(-days, "day");
  const months = Math.floor(days / 30.44);
  if (months < 12) return format.format(-months, "month");
  return format.format(-Math.floor(days / 365.25), "year");
}
