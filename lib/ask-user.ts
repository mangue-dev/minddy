/**
 * Questions `ask_user` (MIN-86) — forme normalisée partagée entre les boucles
 * serveur (Numo `loop.ts`, agent `agent-loop.ts`) et la carte de questions de
 * l'UI. Schéma aligné sur l'outil AskUserQuestion de Claude Code : chaque
 * question porte un header court (chip), un mode multi-sélection (checkboxes)
 * ou exclusif (radio), et des options `{label, description}` dont la première
 * peut être recommandée (suffixe « (Recommended) » détecté et retiré du label).
 *
 * Le parseur absorbe TOUTES les formes historiques :
 *  - actuelle : `{questions: [{question, header?, multi_select?, options: [{label, description?}]}]}`
 *  - v1 MIN-86 : `{questions: [{question, suggestions: string[]}]}`
 *  - legacy mono-question : `{question, suggestions}`
 *  - sa propre sortie normalisée (round-trip par le feed de l'agent).
 */

export interface AskUserOption {
  label: string;
  description: string;
  /** Option recommandée par le modèle (1re + suffixe « (Recommended) »). */
  recommended: boolean;
}

export interface AskUserQuestion {
  question: string;
  /** Chip courte (≤12 caractères) affichée comme onglet de set. "" si absente. */
  header: string;
  /** true = plusieurs réponses combinables (checkboxes) ; false = radio. */
  multiSelect: boolean;
  options: AskUserOption[];
}

/** Nombre max de questions affichées/transmises pour un même appel ask_user. */
export const MAX_ASK_USER_QUESTIONS = 4;

/** Suffixe « (Recommended) » / « (Recommandé) » — détecté puis retiré du label. */
const RECOMMENDED_SUFFIX = /\s*\(\s*(?:recommended|recommandée?)\s*\)\s*$/i;

function toOption(raw: unknown): AskUserOption | null {
  let label = "";
  let description = "";
  let recommended = false;
  if (typeof raw === "string") {
    label = raw;
  } else if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    label = typeof rec.label === "string" ? rec.label : "";
    description = typeof rec.description === "string" ? rec.description : "";
    recommended = rec.recommended === true;
  }
  if (RECOMMENDED_SUFFIX.test(label)) {
    label = label.replace(RECOMMENDED_SUFFIX, "");
    recommended = true;
  }
  label = label.trim();
  if (!label) return null;
  return { label, description: description.trim(), recommended };
}

function toQuestion(raw: unknown): AskUserQuestion | null {
  let question = "";
  let header = "";
  let multiSelect = false;
  let rawOptions: unknown;
  if (typeof raw === "string") {
    // Tolérance : le modèle envoie parfois des questions nues.
    question = raw;
  } else if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    question = typeof rec.question === "string" ? rec.question : "";
    header = typeof rec.header === "string" ? rec.header.trim() : "";
    multiSelect = rec.multi_select === true || rec.multiSelect === true;
    rawOptions = rec.options ?? rec.suggestions;
  }
  question = question.trim();
  if (!question) return null;
  const options = Array.isArray(rawOptions)
    ? rawOptions.map(toOption).filter((o): o is AskUserOption => o !== null)
    : [];
  return { question, header, multiSelect, options };
}

export function parseAskUserQuestions(
  args: Record<string, unknown>
): AskUserQuestion[] {
  const out: AskUserQuestion[] = [];
  if (Array.isArray(args.questions)) {
    for (const item of args.questions) {
      const q = toQuestion(item);
      if (q) out.push(q);
    }
  }
  // Forme legacy mono-question ({question, suggestions}).
  if (out.length === 0) {
    const q = toQuestion(args);
    if (q) out.push(q);
  }
  return out.slice(0, MAX_ASK_USER_QUESTIONS);
}

/**
 * Compose le message user qui répond à un lot de questions : la réponse seule
 * pour une question unique, sinon une ligne `question → réponse` par question
 * (lisible dans le fil ET sans ambiguïté pour le modèle). Une réponse
 * multi-sélection arrive déjà jointe (« a, b, c ») par la carte.
 */
export function composeAskUserReply(
  entries: Array<{ question: string; answer: string }>
): string {
  if (entries.length === 1) return entries[0].answer.trim();
  return entries
    .map((e) => `${e.question.trim()} → ${e.answer.trim()}`)
    .join("\n");
}

export interface AskUserAnswerEntry {
  question: string;
  /** null = réponse introuvable dans le message (forme libre, skip, ancien flux). */
  answer: string | null;
}

/**
 * Inverse de `composeAskUserReply` : ré-associe le message de réponse de
 * l'utilisateur aux questions posées, pour l'affichage replié « détails » de la
 * ligne ask_user du fil. Question unique → tout le message est la réponse ;
 * plusieurs → on retrouve chaque ligne `question → réponse`. Une réponse non
 * appariable (skip, texte libre tapé hors carte) laisse `answer: null` — la
 * surface affiche alors le message brut.
 */
export function matchAskUserAnswers(
  questions: AskUserQuestion[],
  reply: string | null | undefined
): AskUserAnswerEntry[] {
  const entries: AskUserAnswerEntry[] = questions.map((q) => ({
    question: q.question,
    answer: null,
  }));
  const text = (reply ?? "").trim();
  if (!text) return entries;
  if (entries.length === 1) {
    entries[0].answer = text;
    return entries;
  }
  for (const line of text.split("\n")) {
    for (const e of entries) {
      if (e.answer !== null) continue;
      const prefix = `${e.question.trim()} → `;
      if (line.startsWith(prefix)) {
        e.answer = line.slice(prefix.length).trim() || null;
        break;
      }
    }
  }
  return entries;
}
