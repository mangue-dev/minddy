import {
  normalizeLanguage,
  type FeedbackLanguage,
} from "@/lib/feedback/languages";

/**
 * Faut-il traduire ce retour — la règle, en pur, hors base et hors LLM.
 *
 * Elle est écrite ici plutôt que dans le prompt parce qu'un modèle à qui l'on
 * demande « traduis si nécessaire » traduit trop : il rend une version française
 * d'un texte déjà français dès qu'il y voit trois mots anglais. Le modèle
 * répond donc à une question factuelle — dans quelle langue est ce texte — et
 * c'est ce fichier qui décide quoi en faire.
 */

/** Les réglages de traduction d'un projet, tels que la revue les lit. */
export interface FeedbackTranslationSettings {
  /** `feedback_translate_enabled` — l'interrupteur du projet. */
  enabled: boolean;
  /** La langue de l'équipe, celle vers laquelle on traduit. */
  teamLanguage: FeedbackLanguage;
  /** Les langues qu'on lit sans aide (`feedback_no_translate_languages`). */
  skipLanguages: readonly string[];
}

/**
 * Traduire, oui ou non, sachant la langue détectée.
 *
 * `sourceLanguage` null veut dire « la revue n'a pas su » : dans le doute on ne
 * traduit pas — une traduction fausse coûte plus cher qu'une traduction absente,
 * puisque l'équipe la lira sans savoir qu'elle est fausse.
 */
export function shouldTranslateFeedback(
  settings: FeedbackTranslationSettings,
  sourceLanguage: string | null
): boolean {
  if (!settings.enabled) return false;
  const source = normalizeLanguage(sourceLanguage);
  if (!source) return false;
  // Traduire vers sa propre langue n'a pas de sens, et c'est le cas le plus
  // fréquent : la plupart des retours arrivent déjà dans la langue de l'équipe.
  if (source === settings.teamLanguage) return false;
  return !settings.skipLanguages.some(
    (skipped) => normalizeLanguage(skipped) === source
  );
}

/**
 * La liste blanche telle qu'elle est RÉELLEMENT appliquée.
 *
 * La langue de l'équipe en fait partie d'office — elle n'a pas à être cochée
 * pour ne pas être traduite, et l'afficher comme un choix laisserait croire
 * qu'on peut demander l'inverse. Le reste est normalisé et dédoublonné : deux
 * façons d'écrire `pt` ne font pas deux entrées.
 */
export function effectiveSkipLanguages(
  settings: FeedbackTranslationSettings
): FeedbackLanguage[] {
  const skipped = new Set<FeedbackLanguage>([settings.teamLanguage]);
  for (const raw of settings.skipLanguages) {
    const code = normalizeLanguage(raw);
    if (code) skipped.add(code);
  }
  return [...skipped];
}
