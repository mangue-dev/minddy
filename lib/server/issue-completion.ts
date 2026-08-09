/**
 * L'AUTOCOMPLÉTION INLINE du formulaire de ticket — sa moitié pure : le prompt
 * qu'on envoie, et le nettoyage de ce qui revient.
 *
 * Séparée de la route pour la même raison que partout ailleurs dans ce dépôt :
 * c'est la partie qui a des cas limites (le modèle qui recopie le début de la
 * phrase, qui répond entre guillemets, qui rend un paragraphe là où on attend
 * trois mots), donc la partie qui a un test.
 *
 * Le contrat tient en une phrase : **ce qu'on rend se colle tel quel à la fin
 * de ce que l'humain a tapé.** Pas de recollage intelligent côté appelant, pas
 * d'espace à deviner — si la chaîne rendue n'est pas concaténable telle quelle,
 * c'est ici que c'est faux.
 */

/** Le champ qu'on complète. Le titre et la description ne se complètent pas au
    même souffle : une fin de titre, un bout de phrase. */
export type CompletionField = "title" | "description";

/** Ce que le modèle a le droit de rendre, par champ. Court, délibérément : une
    suggestion qu'on lit plus lentement qu'on ne l'écrirait ne sert à rien. */
export const MAX_COMPLETION_CHARS: Record<CompletionField, number> = {
  title: 60,
  description: 140,
};

/** Plafonds d'entrée — le préfixe est ce qui précède le caret. */
export const MAX_PREFIX_CHARS = 2000;
export const MAX_CONTEXT_TITLES = 24;

export interface CompletionContext {
  projectName: string;
  /** Titres récents du projet : le modèle y lit la MAISON (langue, conventions
      de nommage, préfixes maison) plutôt que de l'inventer. */
  recentTitles: string[];
  /** Le titre en cours — contexte de la description, absent pour le titre. */
  title?: string;
  /** Catégories déjà posées sur le brouillon, par nom. */
  categories?: string[];
  /** L'objectif déjà posé, par nom. */
  objective?: string;
  locale: string;
}

/**
 * Le prompt système. Court AUSSI par souci de latence : chaque token de prompt
 * est du temps avant le premier token rendu, et cette route-ci se juge en
 * millisecondes — c'est du texte fantôme sous les doigts, pas une réponse qu'on
 * attend.
 */
export function buildCompletionPrompt(
  field: CompletionField,
  ctx: CompletionContext
): string {
  const lang =
    ctx.locale === "fr"
      ? "Write in French, with proper accents."
      : "Write in English.";
  const what =
    field === "title"
      ? "the TITLE of an issue (a short imperative line — no final period)"
      : "the DESCRIPTION of an issue (plain prose, one sentence at a time)";

  const lines = [
    `You are an inline autocomplete inside an issue tracker's new-issue form, like a code editor's ghost text.`,
    `The user is typing ${what} in the project "${ctx.projectName}".`,
    ``,
    `Output ONLY the continuation of their text — the characters that come right after what they typed, and nothing else.`,
    `Rules, all of them absolute:`,
    `- Never repeat any part of what they already typed.`,
    `- Never answer, comment, apologize, or use quotes, markdown or emoji.`,
    `- One line. At most ${field === "title" ? "8 words" : "20 words"}.`,
    `- If their text ends in the MIDDLE of a word, start your output by repeating that whole word — after "…fix the pag" output "pagination bug on the board", never "ination bug on the board".`,
    `- If you have nothing genuinely useful to add — the text already reads as complete, or any continuation would be a guess about facts you do not have — output NOTHING at all. An empty answer is a good answer, and the expected one most of the time.`,
    `- ${lang} Match the tone and conventions of the examples below.`,
  ];

  if (ctx.recentTitles.length > 0) {
    lines.push(``, `Recent issue titles in this project (style reference):`);
    for (const t of ctx.recentTitles) lines.push(`- ${t}`);
  }
  if (ctx.title) lines.push(``, `Title of the issue being written: ${ctx.title}`);
  if (ctx.categories?.length) lines.push(`Categories: ${ctx.categories.join(", ")}`);
  if (ctx.objective) lines.push(`Objective: ${ctx.objective}`);

  return lines.join("\n");
}

/**
 * Nettoie la sortie du modèle et la rend CONCATÉNABLE au préfixe, ou rend `""`
 * quand rien n'est utilisable — le cas le plus fréquent, et celui qu'on veut
 * silencieux.
 *
 * Le cas qui revient sans arrêt et qui justifie la moitié de cette fonction :
 * le modèle recopie la fin (parfois le tout) de ce que l'humain a tapé avant de
 * continuer. Collé tel quel, ça donne « Corriger le bug de pagpagination ».
 */
export function sanitizeCompletion(
  raw: string,
  prefix: string,
  field: CompletionField
): string {
  if (!raw) return "";

  // Une seule ligne : le texte fantôme vit sur la ligne du caret.
  let out = raw.split("\n")[0] ?? "";
  // Les guillemets d'encadrement, mais PAS l'espace de tête : « de pag » + « ination »
  // n'a pas d'espace, « corriger le » + « bug » en a un, et cet espace-là est
  // porteur. On ne rogne donc à gauche que les guillemets, jamais l'espace.
  out = out.replace(/^["'«»“”]+/, "").replace(/["'«»“”\s]+$/, "");
  if (!out) return "";

  // Le modèle a recopié tout le préfixe puis continué : on ne garde que la queue.
  const trimmedPrefix = prefix.trimStart();
  // A-t-on retiré un morceau du MOT en cours ? C'est le seul signal fiable de
  // « la suite se soude au préfixe » — le prompt demande justement au modèle de
  // répéter le mot entamé (« pag » → « pagination… »), et c'est ce chevauchement
  // qui le prouve. Deviner à la lettre ne marche pas : « bug » suivi de « de »
  // et « pag » suivi de « ination » se ressemblent trait pour trait.
  let glued = false;
  if (trimmedPrefix && out.startsWith(trimmedPrefix)) {
    out = out.slice(trimmedPrefix.length);
  } else {
    const overlap = wordOverlap(prefix, out);
    if (overlap > 0) {
      out = out.slice(overlap);
      glued = true;
    }
  }
  if (!out.trim()) return "";

  // L'espace de jointure. Hors soudure, on le POSE : une suggestion qui démarre
  // un mot neuf sans espace donnerait « le bugde pagination ». Sauf devant une
  // ponctuation, qui se colle par définition.
  if (/\s$/.test(prefix)) out = out.replace(/^\s+/, "");
  else if (!glued && !/^[\s.,;:!?)\]…]/.test(out)) out = ` ${out}`;

  out = out.replace(/\s+/g, " ");
  if (out.trim() === "") return "";

  const max = MAX_COMPLETION_CHARS[field];
  if (out.length > max) {
    // On coupe à un mot, jamais au milieu — un fantôme tronqué à la lettre se
    // lit comme une faute de frappe.
    const cut = out.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    out = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  }
  // Un titre ne finit pas par un point (convention Linear, et celle du dépôt).
  if (field === "title") out = out.replace(/[.]+$/, "");
  return out;
}

/**
 * Combien de caractères du MOT en cours la suggestion recopie-t-elle ?
 *
 * Le chevauchement est cherché dans le dernier mot du préfixe, jamais au-delà :
 * autoriser un chevauchement qui traverse un espace ferait mordre des
 * coïncidences (« le » et « les données » partagent « le ») et charcuterait des
 * suggestions justes. Deux caractères au minimum, sauf mot d'une seule lettre —
 * une lettre commune entre deux mots voisins est un hasard fréquent.
 */
function wordOverlap(prefix: string, out: string): number {
  const lastWord = /\S*$/.exec(prefix)?.[0] ?? "";
  if (!lastWord) return 0;
  const max = Math.min(lastWord.length, out.length);
  const min = lastWord.length === 1 ? 1 : 2;
  for (let n = max; n >= min; n--) {
    if (lastWord.slice(-n).toLowerCase() === out.slice(0, n).toLowerCase()) return n;
  }
  return 0;
}
