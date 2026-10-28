/**
 * Phrases speech-to-text models invent on silence or noise (MIN-831), removed
 * deterministically from every transcript before vocabulary replacement and the
 * cleanup pass, so they disappear even with cleanup off.
 *
 * Whisper-family models learned them from subtitled videos: credit lines
 * ("Sous-titrage Société Radio-Canada", "Subtitles by the Amara.org
 * community") and video sign-offs ("Thanks for watching!", "Merci."). The
 * ICASSP 2025 "Bag of Hallucinations" study
 * (github.com/DSP-AGH/ICASSP2025_Whisper_Hallucination) measures the same
 * families, and warns that a raw list of hallucinated outputs also holds
 * ordinary speech. Two narrow rules therefore apply, sentence by sentence:
 *
 * - A credit names a credit AND a known source; it is removed wherever it
 *   appears. Mentioning Amara.org or subtitles alone keeps the sentence.
 * - A sign-off is an exact closing formula; it is removed only at the start or
 *   end of the take, where the silence that triggers it sits.
 *
 * Matching ignores case, accents and punctuation. The phrases below are data
 * in the languages the models hallucinate in, not interface copy.
 */

// Characters of scripts written without spaces each count as a word, so
// "字幕由Amara.org社区提供" still holds the word "amara".
const UNSPACED_CHAR = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu;

/** Lowercase words without diacritics, separated by single spaces. */
function normalizePhrase(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    // Recompose what is not a diacritic, such as Hangul syllables.
    .normalize("NFC")
    .toLowerCase()
    .replace(UNSPACED_CHAR, " $1 ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words that open a credit line, matched at the start of a word. */
const CREDIT_WORDS = [
  "sous titr", "soustitr", "subtit", "untertitel", "sottotitol", "legenda",
  "ondertitel", "napisy", "titulky", "caption", "transcri", "traduc",
  "copyright", "субтитр", "редактор", "字幕", "자막",
].map(normalizePhrase);

/** Who the hallucinated credit lines name. */
const CREDIT_SOURCES = [
  "Amara.org", "Radio-Canada", "ST' 501", "ST501", "MFP", "ZDF", "funk",
  "WDR", "SWR", "NDR", "QTSS", "otter.ai",
].map(normalizePhrase);

/** Names that only ever occur in hallucinated credits: enough on their own. */
const CREDIT_MARKERS = [
  "Stephanie Geiges", "SteamTeamExtra", "Imperial News Network",
  "А.Синецкая", "А.Егорова", "明镜与点点栏目",
].map(normalizePhrase);

/** Closing formulas, matched against a whole sentence. */
const SIGN_OFFS = new Set([
  // fr
  "Merci", "Merci beaucoup", "Merci à tous", "Merci à vous",
  "Merci d'avoir regardé", "Merci d'avoir regardé cette vidéo",
  "Merci d'avoir écouté", "Merci de votre attention",
  "Merci de nous avoir suivis", "Abonnez-vous", "Abonnez-vous à la chaîne",
  "N'oubliez pas de vous abonner",
  // en
  "You", "Thank you", "Thanks", "Thank you very much", "Thank you so much",
  "Thanks for watching", "Thank you for watching", "Thanks for listening",
  "Thank you for listening", "Please subscribe", "Like and subscribe",
  "Please like and subscribe", "See you next time", "See you in the next video",
  "Bye", "Bye bye",
  // de
  "Danke", "Danke schön", "Vielen Dank", "Danke fürs Zuschauen",
  "Vielen Dank fürs Zuschauen", "Vielen Dank für Ihre Aufmerksamkeit",
  "Bis zum nächsten Mal", "Tschüss",
  // es
  "Gracias", "Muchas gracias", "Gracias por ver", "Gracias por ver el video",
  "Gracias por ver el vídeo", "Suscríbete", "Suscríbete al canal",
  "Hasta la próxima",
  // it
  "Grazie", "Grazie mille", "Grazie a tutti", "Grazie per la visione",
  "Grazie per l'attenzione", "Iscriviti al canale",
  // pt
  "Obrigado", "Obrigada", "Muito obrigado", "Muito obrigada",
  "Obrigado por assistir", "Obrigada por assistir", "Inscreva-se no canal",
  // nl
  "Dank je wel", "Dank u wel", "Bedankt voor het kijken",
  // pl
  "Dziękuję", "Dziękuję za obejrzenie", "Dziękuję za uwagę",
  // ru
  "Спасибо", "Спасибо за просмотр", "Продолжение следует",
  // ja, zh, ko
  "ご視聴ありがとうございました", "ありがとうございました", "谢谢观看",
  "感谢观看", "谢谢大家", "시청해주셔서 감사합니다", "감사합니다",
].map(normalizePhrase));

// A credit line is short; a long sentence that happens to cite one is speech.
const MAX_CREDIT_CHARS = 120;

function containsTerm(haystack: string, term: string, atWordStartOnly: boolean): boolean {
  return ` ${haystack} `.includes(atWordStartOnly ? ` ${term}` : ` ${term} `);
}

function isCredit(phrase: string): boolean {
  if (!phrase || phrase.length > MAX_CREDIT_CHARS) return false;
  if (CREDIT_MARKERS.some((marker) => containsTerm(phrase, marker, false))) return true;
  return (
    CREDIT_WORDS.some((word) => containsTerm(phrase, word, true)) &&
    CREDIT_SOURCES.some((source) => containsTerm(phrase, source, false))
  );
}

// Sentence boundaries: a line break, Latin end punctuation followed by a space
// (so "Amara.org" stays whole), or CJK end punctuation, which takes no space.
const SENTENCE_BOUNDARY = /(\s*\n\s*|(?<=[.!?…])[ \t]+|(?<=[。！？])[ \t]*)/u;

/**
 * The transcript without hallucinated credits and edge sign-offs. Text with
 * nothing to remove comes back unchanged; a take that was only hallucination
 * comes back empty.
 */
export function stripTranscriptionHallucinations(text: string): string {
  const parts = text.split(SENTENCE_BOUNDARY);
  const sentences: { text: string; separator: string; phrase: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    sentences.push({
      text: parts[i] ?? "",
      separator: parts[i + 1] ?? "",
      phrase: normalizePhrase(parts[i] ?? ""),
    });
  }

  let kept = sentences.filter((sentence) => !isCredit(sentence.phrase));
  const isEdgeNoise = (phrase: string) => !phrase || SIGN_OFFS.has(phrase);
  let start = 0;
  let end = kept.length;
  while (start < end && isEdgeNoise(kept[start]!.phrase)) start += 1;
  while (end > start && isEdgeNoise(kept[end - 1]!.phrase)) end -= 1;
  kept = kept.slice(start, end);

  // Blank edges alone are not a removal: leave the provider's text as it was.
  if (kept.filter((s) => s.phrase).length === sentences.filter((s) => s.phrase).length) {
    return text;
  }
  return kept
    .map((sentence, index) => sentence.text + (index < kept.length - 1 ? sentence.separator : ""))
    .join("")
    .trim();
}
