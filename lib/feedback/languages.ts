/**
 * Les langues que la traduction des retours sait nommer.
 *
 * Un JEU FERMÉ, et pas « toute langue que le modèle voudra bien renvoyer » : ces
 * codes sont stockés en base, comparés à la langue de l'équipe et cochés dans un
 * réglage. Laisser le modèle inventer `pt-BR`, `Portuguese` et `por` pour la
 * même chose ferait trois langues distinctes de la liste blanche, dont deux ne
 * correspondraient jamais à rien.
 *
 * ISO 639-1, deux lettres, sans région : `fr` et non `fr-CA`. Un retour
 * québécois et un retour belge se lisent avec la même équipe.
 *
 * Les NOMS ne sont pas ici : `Intl.DisplayNames` les rend déjà, dans la langue
 * de qui regarde et sans catalogue à tenir — c'est exactement le genre de table
 * qui pourrit dès qu'on ajoute une entrée. Voir {@link languageLabel}.
 */
export const FEEDBACK_LANGUAGES = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "tr",
  "ru",
  "ar",
  "ja",
  "ko",
  "zh",
] as const;

export type FeedbackLanguage = (typeof FEEDBACK_LANGUAGES)[number];

export function isFeedbackLanguage(value: unknown): value is FeedbackLanguage {
  return (
    typeof value === "string" &&
    (FEEDBACK_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Ramène ce qu'un modèle a répondu à un code du jeu, ou `null`.
 *
 * Tolérant à l'entrée, strict à la sortie : `PT-BR`, `pt_BR` et ` pt ` donnent
 * tous `pt`, et `Portuguese` donne `null` — on ne devine pas un code à partir
 * d'un nom, on refuse. Le prompt demande explicitement un code ISO ; ce qui
 * n'en est pas un est une réponse hors contrat, pas une variante à rattraper.
 */
export function normalizeLanguage(value: unknown): FeedbackLanguage | null {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isFeedbackLanguage(base) ? base : null;
}

/**
 * Le nom d'une langue dans la langue de qui lit — « Deutsch » devient
 * « allemand » pour un francophone, « German » pour un anglophone.
 *
 * **Avec une majuscule**, que le français ne met pas. `Intl.DisplayNames` rend
 * le nom tel qu'il s'écrit DANS UNE PHRASE, or il n'apparaît jamais dans une
 * phrase ici : c'est une option de liste, une case à cocher, une étiquette. À
 * côté de « Français » posé par le sélecteur de langue de l'app, un « anglais »
 * en minuscule se lit comme une coquille.
 *
 * La bascule de casse est faite avec la locale (`toLocaleUpperCase`) et non
 * sans : en turc, la majuscule de `i` est `İ`, et `I` serait une autre lettre.
 * Les écritures sans casse (japonais, arabe) traversent inchangées.
 *
 * Le code brut en repli : un environnement sans `Intl.DisplayNames` (ou une
 * locale qu'il ne connaît pas) doit afficher `de`, jamais rien.
 */
export function languageLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    if (!name) return code;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return code;
  }
}
