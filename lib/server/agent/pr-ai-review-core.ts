import { headTail } from "./prune";
import { resolveDiffPosition } from "./mr-position";

/**
 * Cœur PUR de la review d'une PR par Numo (MIN-141) — sans `server-only`, sans
 * I/O : le prompt, le rendu du diff, la validation des ancres et la synthèse
 * sont ici, testables en node ; les appels (OpenRouter, forge) vivent dans
 * `pr-ai-review.ts`. Même découpage que `checks-core` / `pr-ingest-core`.
 *
 * Ce que ce module résout, et qui décide de la qualité de la passe : **une ligne
 * commentée est une ligne du diff, pas une ligne du fichier**. Les deux forges
 * refusent en 422 une ancre hors diff, et un modèle à qui l'on tend un patch brut
 * invente des numéros — il compte les lignes qu'il voit, pas celles du fichier.
 * D'où les deux moitiés du contrat :
 *  - `annotatePatch` préfixe CHAQUE ligne du diff de son numéro réel, celui que
 *    la forge attend ; le modèle n'a plus à compter, il recopie ;
 *  - `selectFindings` revalide malgré tout chaque ancre contre le patch
 *    (`resolveDiffPosition`, le même code qui sert à poster) et écarte celles qui
 *    ne tombent pas juste. Ce qui est écarté n'est pas perdu : ça part dans la
 *    synthèse, en clair, plutôt que de disparaître dans un 422.
 *
 * L'autre décision de cadrage du ticket est ici aussi : **synthèse + 3 à 5
 * points en ligne** (`AI_REVIEW_MAX_INLINE_COMMENTS`). Quinze commentaires de
 * ligne sur une PR, ce n'est plus une review, c'est du bruit — les points au-delà
 * du plafond descendent dans la synthèse, par ordre de gravité.
 *
 * Enfin, une review ne lit pas qu'un diff : elle lit ce qui a DÉJÀ été écrit.
 * `buildReviewUserMessage` porte donc, en plus du code, le **plan** du ticket
 * (ce qui avait été décidé avant d'écrire) et **tous les messages** qui
 * l'entourent — commentaires du ticket, fil de la PR, reviews déjà soumises,
 * commentaires déjà ancrés au diff. Deux raisons, et ce sont les deux moitiés de
 * ce qui sépare une relecture utile d'un avis hors-sol :
 *  - un écart entre le plan et le code n'est une faute que si personne ne l'a
 *    argumenté ; c'est dans les commentaires du ticket que ça se dit ;
 *  - un point déjà soulevé par quelqu'un n'a pas à l'être une seconde fois.
 * Tout ça vit sous un budget partagé (`AI_REVIEW_NOTES_MAX_CHARS`), servi aux
 * messages les plus RÉCENTS, et ce qui ne rentre pas est COMPTÉ dans le message.
 */

/** Un fichier du diff, réduit à ce que la review lit (`PullRequestFile` le satisfait). */
export interface ReviewableFile {
  filename: string;
  status: string;
  additions?: number;
  deletions?: number;
  patch?: string;
  /** Chemin AVANT la PR si le fichier a été renommé — c'est lui qui adresse la version de base. */
  previous_filename?: string;
}

/** Gravité d'un point, de la plus sérieuse à la moins : décide qui passe en ligne. */
export type FindingSeverity = "blocker" | "risk" | "nit";

export interface ReviewFinding {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  severity: FindingSeverity;
  body: string;
}

export interface AiReview {
  summary: string;
  verdict: "approve" | "request_changes" | "comment";
  findings: ReviewFinding[];
}

/** Budget TOTAL du diff envoyé au modèle. Au-delà, les fichiers restants sont
 *  seulement nommés — mieux vaut une review honnête sur 40 fichiers lus qu'une
 *  review confiante sur 200 fichiers survolés. */
export const AI_REVIEW_DIFF_MAX_CHARS = 60_000;

/** Budget d'UN fichier. Élision par le milieu, sur une FRONTIÈRE DE LIGNE
 *  (`elideAnnotatedPatch`) : un lockfile de 30 000 lignes ne doit pas manger le
 *  budget des fichiers qui portent la logique, et un numéro de ligne coupé en
 *  deux vaut pire que pas de ligne du tout. */
export const AI_REVIEW_FILE_MAX_CHARS = 12_000;

/** Commentaires de ligne réellement déposés. Le reste descend dans la synthèse. */
export const AI_REVIEW_MAX_INLINE_COMMENTS = 5;

/** Budget du PLAN du ticket. Tronqué par le milieu comme un fichier : le plan est
 *  la référence contre laquelle le diff se lit, pas le sujet de la lecture. */
export const AI_REVIEW_PLAN_MAX_CHARS = 4_000;

/** Budget d'UN message déjà écrit (commentaire, corps de review). Un pavé de
 *  10 000 signes ne doit pas coûter aux dix messages qui le suivent. */
export const AI_REVIEW_NOTE_MAX_CHARS = 1_200;

/**
 * Budget TOTAL de tout ce qui a déjà été écrit : commentaires du ticket, fil de
 * la PR, reviews soumises, commentaires ancrés au diff. PARTAGÉ — chaque liste
 * reçoit une part égale de ce qui reste quand vient son tour, et lui rend ce
 * qu'elle n'utilise pas. Aucune liste ne peut donc affamer les autres : trente
 * commentaires de ligne ne font pas disparaître les commentaires du ticket, qui
 * sont précisément là où les écarts au plan s'expliquent.
 */
export const AI_REVIEW_NOTES_MAX_CHARS = 16_000;

/** Nom du tool à sortie forcée. */
export const AI_REVIEW_TOOL_NAME = "submit_review";

const SEVERITY_RANK: Record<FindingSeverity, number> = { blocker: 0, risk: 1, nit: 2 };

/**
 * Schéma du tool. TOUS les champs sont `required`, y compris ceux qu'on saurait
 * défaultser : un champ hors `required` d'un tool call forcé n'est tout
 * simplement pas répondu par les petits modèles (mesuré sur les passes feedback).
 */
export const AI_REVIEW_TOOL_PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "The review itself, in markdown, 2 to 6 sentences: what this change does, and what you think of it. " +
        "No preamble, no restating the diff, no bullet list of every file.",
    },
    verdict: {
      type: "string",
      enum: ["approve", "request_changes", "comment"],
      description:
        "approve = you would merge it as is. request_changes = at least one finding is a blocker. " +
        "comment = you have remarks but nothing that must be fixed before merging.",
    },
    findings: {
      type: "array",
      description:
        "Concrete problems anchored to a line of the diff, most serious first. Empty array when the change is clean — " +
        "do NOT invent findings to look useful.",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "The file path ALONE, as written at the start of the diff heading — without the " +
              "` — modified · +2 −1` that follows it, and without any `(renamed from …)`.",
          },
          line: {
            type: "integer",
            description:
              "The number printed at the start of the diff line you are commenting on. Never a number you counted yourself.",
          },
          side: {
            type: "string",
            enum: ["LEFT", "RIGHT"],
            description: "RIGHT for a line marked + or a context line, LEFT for a line marked -.",
          },
          severity: {
            type: "string",
            enum: ["blocker", "risk", "nit"],
            description:
              "blocker = this is a bug, it breaks something or contradicts the rest of the code. " +
              "risk = it works but will bite (missing case, silent failure, unhandled error). " +
              "nit = style or wording.",
          },
          body: {
            type: "string",
            description:
              "One or two sentences: what is wrong and what to do instead. Markdown allowed. Address the code, not the author.",
          },
        },
        required: ["path", "line", "side", "severity", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "verdict", "findings"],
  additionalProperties: false,
};

/** La langue dans laquelle la review est écrite — celle du demandeur. */
const LANGUAGE_NAME: Record<string, string> = { fr: "French", en: "English" };

export function buildReviewSystemPrompt(locale: string): string {
  const language = LANGUAGE_NAME[locale] ?? LANGUAGE_NAME.en;
  return `You are Numo, reviewing a pull request the way a senior engineer of this team would: you read the diff end to end, then you say what you actually think.

Write the review in ${language}.

What you are looking for, in this order:
- **Bugs.** A case that is not handled, an off-by-one, a null that gets through, an await that is missing, an error swallowed in silence.
- **Joint errors.** Two files changed in the same move, each correct on its own, whose contract with the other is wrong: a value produced here and consumed there (i18n placeholders, props, payload fields, env vars, DB columns), a new case added on one side and ignored on the other, something changed halfway and not finished.
- **Security and data.** A user-controlled value interpolated into a path, a URL or a query; a permission check that moved or vanished; a secret that ends up in a log.
- **Leftovers.** Debug output, commented-out code, a scratch file, a change unrelated to what the PR says it does.

You are not given only the diff. You are also given the issue this pull request implements, its implementation plan, and everything already written — on the issue and on the pull request itself. Read them, and use them:
- **The plan is what was decided before the code was written.** Check the diff against it: a task marked \`[x]\` whose code is nowhere in the diff, a decision reversed without a word, a step quietly dropped. Task states read \`[ ]\` not started, \`[~]\` in progress, \`[x]\` done, \`[-]\` dropped.
- **Departing from the plan is not a defect in itself** — the plan is not sacred, and the code is sometimes the better answer. The comments on the issue are where a departure gets argued: if it is explained there and it holds, say nothing. A departure nobody ever mentioned is worth a finding.
- **Do not say again what has already been said.** A point already raised in the pull request thread, in a review, or in a comment anchored to the diff belongs to whoever raised it. Come back to it only if the code still contradicts it — and then say that it was already raised.
- What you were not shown, you have not read: never treat an absence as a fact.

What you do NOT do:
- Do not restate the diff, do not summarize each file one by one, do not congratulate.
- Do not report a problem you cannot point at: every finding is anchored to one line.
- Do not raise style preferences as if they were defects — the surrounding code is the convention, match it.
- Do not guess at code you cannot see. The diff is all you have; if a call looks wrong but its definition is outside the diff, say so as a question rather than as a defect.
- Do not pad. A clean change deserves \`approve\` with an empty findings list, and that is a good review.

Anchoring a finding — this is the part that must be exact. Every line of the diff below is printed as \`<sign><number>│<code>\`:
- \`+\` = a line this PR adds. Its number is a line of the NEW file → \`side: "RIGHT"\`.
- \`-\` = a line this PR removes. Its number is a line of the OLD file → \`side: "LEFT"\`.
- a space = an unchanged context line, numbered in the NEW file → \`side: "RIGHT"\`.
Copy the number that is printed. A number you counted yourself will not match, and the finding will be dropped.

Call \`${AI_REVIEW_TOOL_NAME}\` exactly once. It is the only way to answer.`;
}

/**
 * Rend un patch unifié avec le NUMÉRO DE LIGNE de chaque ligne, celui que la
 * forge attend pour ancrer un commentaire.
 *
 * Le format est `<sign><number>│<contenu>` — le séparateur est une barre pleine
 * (`│`, U+2502) et pas un `|`, parce que du code en contient et qu'un modèle qui
 * cherche la colonne doit pouvoir la trouver sans ambiguïté.
 *
 * Les en-têtes `@@` sont conservés tels quels : ils recalent les compteurs, et
 * ils disent au lecteur qu'il y a un trou entre deux hunks.
 */
export function annotatePatch(patch: string): string {
  const out: string[] = [];
  let oldN = 0;
  let newN = 0;
  let inHunk = false;

  const lines = patch.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  for (const l of lines) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) {
      oldN = Number(m[1]);
      newN = Number(m[2]);
      inHunk = true;
      out.push(l);
      continue;
    }
    if (!inHunk) {
      out.push(l);
      continue;
    }
    // « \ No newline at end of file » n'est pas une ligne du fichier.
    if (l.startsWith("\\")) {
      out.push(l);
      continue;
    }
    if (l.startsWith("+")) {
      out.push(`+${newN}│${l.slice(1)}`);
      newN++;
    } else if (l.startsWith("-")) {
      out.push(`-${oldN}│${l.slice(1)}`);
      oldN++;
    } else {
      out.push(` ${newN}│${l.startsWith(" ") ? l.slice(1) : l}`);
      oldN++;
      newN++;
    }
  }
  return out.join("\n");
}

/**
 * Élide un patch annoté en gardant des LIGNES ENTIÈRES — tête, marqueur, queue.
 *
 * `headTail` coupe au caractère : la queue reprend alors au milieu d'une ligne,
 * et `+456│const x = compute();` se présente au modèle comme `56│const x = …`.
 * Or le prompt lui demande précisément de RECOPIER le numéro imprimé plutôt que
 * de compter — il recopierait 56, qui est un numéro parfaitement valide ailleurs
 * dans le même diff : `resolveDiffPosition` l'accepterait, et le commentaire
 * atterrirait sur une AUTRE ligne, sans que rien ne le signale. C'est exactement
 * ce que tout le travail d'ancrage de ce module sert à éviter, donc la coupe se
 * fait ici sur une frontière de ligne.
 *
 * Une ligne à elle seule plus longue que le budget (un fichier minifié, une data
 * URL) est coupée par la FIN : son préfixe `+456│`, qui est en tête, survit —
 * seul le code qui suit se perd, et le `…` le dit.
 */
export function elideAnnotatedPatch(patch: string, max: number): string {
  if (patch.length <= max) return patch;
  const lines = patch.split("\n");
  const half = Math.max(1, Math.floor((max - 40) / 2));
  const clip = (l: string) => (l.length <= half ? l : `${l.slice(0, half)} …`);

  // La première ligne de chaque moitié entre toujours : un budget trop petit
  // doit rendre une ligne lisible, pas rien.
  const head: string[] = [];
  let used = 0;
  for (const line of lines) {
    const kept = clip(line);
    if (head.length > 0 && used + kept.length + 1 > half) break;
    head.push(kept);
    used += kept.length + 1;
  }

  const tail: string[] = [];
  used = 0;
  for (let i = lines.length - 1; i >= head.length; i--) {
    const kept = clip(lines[i]);
    if (tail.length > 0 && used + kept.length + 1 > half) break;
    tail.unshift(kept);
    used += kept.length + 1;
  }

  const elided = lines.length - head.length - tail.length;
  return elided > 0
    ? [...head, `… [${elided} lines elided] …`, ...tail].join("\n")
    : [...head, ...tail].join("\n");
}

/**
 * Un message déjà écrit quelque part : commentaire du ticket, du fil de la PR,
 * corps d'une review soumise, ou commentaire ancré à une ligne du diff. Toujours
 * le même triplet — qui parle, à propos de quoi, ce qui est dit.
 */
export interface ReviewNote {
  author: string;
  /** Ce à quoi le message se rattache : `lib/x.ts:42` pour une ancre, l'état
   *  d'une review soumise (« changes requested »). Rendu entre parenthèses. */
  about?: string | null;
  body: string;
}

/** Tout ce qui a déjà été dit SUR LA PR — ce qu'une relecture ne doit pas redire. */
export interface ReviewConversation {
  /** Reviews formelles déjà soumises, avec leur texte. */
  reviews: ReviewNote[];
  /** Commentaires déjà ancrés à une ligne du diff. */
  reviewComments: ReviewNote[];
  /** Fil de la PR — les commentaires qui ne visent aucune ligne. */
  comments: ReviewNote[];
}

/** Le ticket que la PR met en œuvre, quand elle en porte un. */
export interface ReviewIssueContext {
  identifier: string;
  title: string;
  description?: string | null;
  /** Le plan d'implémentation (markdown de `issues.plan`) : ce qui avait été
   *  décidé AVANT d'écrire le code, donc la référence de lecture du diff. */
  plan?: string | null;
  /** Les commentaires du ticket, du plus ancien au plus récent — l'endroit où
   *  s'argumentent les écarts entre le plan et ce qui a fini par être écrit. */
  comments?: ReviewNote[];
}

const ISSUE_DESCRIPTION_MAX_CHARS = 2000;
const PR_BODY_MAX_CHARS = 2000;

/** Une liste de messages à rendre sous un intitulé, adressable par son `id`. */
interface NoteSection {
  id: "issue" | "reviews" | "anchored" | "thread";
  heading: string;
  notes: ReviewNote[];
}

/**
 * Rend une liste de messages sous un budget, en gardant les PLUS RÉCENTS — la
 * liste arrive du plus ancien au plus récent, et c'est la fin d'une discussion
 * qui dit où elle en est. Ce qui ne rentre pas est COMPTÉ en tête : un modèle
 * qui sait qu'il n'a pas tout lu nuance ses conclusions.
 */
function renderNotes(notes: ReviewNote[], budget: number): { text: string; used: number } {
  const usable = notes
    .map((n) => ({ ...n, body: headTail(n.body.trim(), AI_REVIEW_NOTE_MAX_CHARS) }))
    .filter((n) => n.body);

  const kept: string[] = [];
  let used = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    const note = usable[i];
    const about = note.about?.trim() ? ` (${note.about.trim()})` : "";
    // Le corps est indenté sous sa puce : un message de plusieurs lignes doit
    // rester UN message, pas se lire comme plusieurs.
    const line = `- **${note.author.trim() || "someone"}**${about} — ${note.body.split("\n").join("\n  ")}`;
    // Le premier (le plus récent) entre toujours : une part de budget trop
    // petite doit rendre un message, pas rien.
    if (kept.length > 0 && used + line.length > budget) break;
    kept.unshift(line);
    used += line.length;
  }

  const omitted = usable.length - kept.length;
  const header = omitted > 0 ? [`- (${omitted} older not shown)`] : [];
  return { text: kept.length > 0 ? [...header, ...kept].join("\n") : "", used };
}

/**
 * Rend les listes de messages sous un budget PARTAGÉ : chacune reçoit une part
 * égale de ce qui reste quand vient son tour, et rend ce qu'elle n'a pas pris à
 * celles d'après. Une PR à trente commentaires de ligne ne fait donc pas
 * disparaître les commentaires du ticket, qui sont ce qui explique les écarts.
 */
function renderNoteSections(sections: NoteSection[], total: number): Map<string, string> {
  const rendered = new Map<string, string>();
  const present = sections.filter((s) => s.notes.length > 0);
  let budget = total;
  let left = present.length;
  for (const section of present) {
    const { text, used } = renderNotes(section.notes, Math.max(1, Math.floor(budget / left)));
    left--;
    if (!text) continue;
    budget -= used;
    rendered.set(section.id, `### ${section.heading}\n\n${text}`);
  }
  return rendered;
}

/**
 * Le message utilisateur : ce que la PR dit faire, le ticket qu'elle sert (avec
 * son PLAN et ses commentaires), ce qui a déjà été dit sur la PR, puis le diff
 * annoté — le code en dernier, juste avant que le modèle réponde.
 *
 * Les fichiers entrent dans l'ordre du diff jusqu'à épuisement du budget ; ceux
 * qui restent sont NOMMÉS — un modèle qui sait qu'il n'a pas tout vu nuance ses
 * conclusions, un modèle à qui l'on cache la troncature ne le sait pas. Les
 * messages déjà écrits suivent la même règle : les plus récents, et le compte de
 * ceux qui manquent.
 */
export function buildReviewUserMessage(input: {
  title: string;
  body?: string | null;
  issue?: ReviewIssueContext | null;
  /** Ce qui a déjà été écrit sur la PR elle-même (fil, reviews, ancres). */
  conversation?: ReviewConversation | null;
  files: ReviewableFile[];
}): string {
  const parts: string[] = [`# Pull request\n\n${input.title.trim() || "(untitled)"}`];

  const body = (input.body ?? "").trim();
  if (body) {
    parts.push(`## What the pull request says it does\n\n${headTail(body, PR_BODY_MAX_CHARS)}`);
  }

  // Le budget des messages est partagé par les QUATRE listes, dans cet ordre de
  // service : le ticket d'abord (c'est là que se disent les écarts au plan),
  // puis ce qui a déjà été dit sur la PR, du plus tranchant au plus bavard.
  const conversation = input.conversation;
  const noteSections = renderNoteSections(
    [
      {
        id: "issue",
        heading: "What was said on the issue",
        notes: input.issue?.comments ?? [],
      },
      {
        id: "reviews",
        heading: "Reviews already submitted on this pull request",
        notes: conversation?.reviews ?? [],
      },
      {
        id: "anchored",
        heading: "Comments already anchored to the diff",
        notes: conversation?.reviewComments ?? [],
      },
      { id: "thread", heading: "The pull request thread", notes: conversation?.comments ?? [] },
    ],
    AI_REVIEW_NOTES_MAX_CHARS,
  );

  if (input.issue) {
    const description = (input.issue.description ?? "").trim();
    parts.push(
      `## The issue it implements — ${input.issue.identifier}: ${input.issue.title}` +
        (description ? `\n\n${headTail(description, ISSUE_DESCRIPTION_MAX_CHARS)}` : ""),
    );

    const plan = (input.issue.plan ?? "").trim();
    if (plan) {
      // Le plan est CLÔTURÉ dans un bloc : c'est un document en markdown, et ses
      // propres `##` sortiraient sinon de la section qui les contient — un plan
      // qui commence par « ## Contexte » se lirait comme une section du message.
      parts.push(
        `### Its implementation plan\n\n` +
          "Written BEFORE the code. Task states: `[ ]` not started, `[~]` in progress, " +
          "`[x]` done, `[-]` dropped.\n\n" +
          "```markdown\n" +
          headTail(plan, AI_REVIEW_PLAN_MAX_CHARS) +
          "\n```",
      );
    }

    const said = noteSections.get("issue");
    if (said) parts.push(said);
  }

  const onThePr = (["reviews", "anchored", "thread"] as const)
    .map((id) => noteSections.get(id))
    .filter((section): section is string => !!section);
  if (onThePr.length > 0) {
    parts.push(
      `## What has already been said on this pull request\n\n` +
        `These points are taken — do not raise them again as if they were yours.\n\n` +
        onThePr.join("\n\n"),
    );
  }

  const rendered: string[] = [];
  const skipped: string[] = [];
  let budget = AI_REVIEW_DIFF_MAX_CHARS;

  for (const file of input.files) {
    const patch = file.patch?.trim();
    if (!patch) {
      // Binaire, trop gros pour la forge, ou renommage pur : rien à lire, mais
      // le fichier a bougé et ça compte dans la lecture d'ensemble.
      skipped.push(`${fileHeading(file)} (no diff available)`);
      continue;
    }
    // L'annotation D'ABORD, l'élision ensuite : les numéros sont calculés sur le
    // patch complet, et la coupe tombe entre deux lignes — jamais dedans.
    const annotated = elideAnnotatedPatch(annotatePatch(patch), AI_REVIEW_FILE_MAX_CHARS);
    const block = `### ${fileHeading(file)}\n\n\`\`\`diff\n${annotated}\n\`\`\``;
    if (block.length > budget && rendered.length > 0) {
      skipped.push(`${fileHeading(file)} (not shown — the diff is too large)`);
      continue;
    }
    budget -= block.length;
    rendered.push(block);
  }

  parts.push(
    `## Diff\n\n${rendered.length > 0 ? rendered.join("\n\n") : "(no readable diff in this pull request)"}`,
  );
  if (skipped.length > 0) {
    parts.push(
      `## Files you were NOT shown\n\n${skipped.map((s) => `- ${s}`).join("\n")}\n\n` +
        `Do not comment on these — you have not read them. Take them into account when you judge how complete your review is.`,
    );
  }

  return parts.join("\n\n");
}

function fileHeading(file: ReviewableFile): string {
  const renamed = file.previous_filename ? ` (renamed from ${file.previous_filename})` : "";
  const counts =
    file.additions != null || file.deletions != null
      ? ` · +${file.additions ?? 0} −${file.deletions ?? 0}`
      : "";
  return `${file.filename}${renamed} — ${file.status}${counts}`;
}

// ── Lecture de la réponse ────────────────────────────────────────────────────

const VERDICTS = new Set(["approve", "request_changes", "comment"]);
const SIDES = new Set(["LEFT", "RIGHT"]);
const SEVERITIES = new Set(["blocker", "risk", "nit"]);

/**
 * Lit l'objet renvoyé par le tool call. `null` = la réponse n'est pas une review
 * (pas de synthèse) : l'appelant le dit à l'utilisateur plutôt que de poster du
 * vide. Un point mal formé est écarté SEUL — une virgule de travers sur le
 * quatrième point ne doit pas jeter les trois premiers.
 */
export function parseAiReview(raw: unknown): AiReview | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  if (!summary) return null;

  const verdict =
    typeof r.verdict === "string" && VERDICTS.has(r.verdict)
      ? (r.verdict as AiReview["verdict"])
      : "comment";

  const findings: ReviewFinding[] = [];
  for (const item of Array.isArray(r.findings) ? r.findings : []) {
    const f = (item ?? {}) as Record<string, unknown>;
    const path = typeof f.path === "string" ? f.path.trim() : "";
    const body = typeof f.body === "string" ? f.body.trim() : "";
    const line = typeof f.line === "number" ? f.line : Number(f.line);
    if (!path || !body || !Number.isInteger(line) || line < 1) continue;
    findings.push({
      path,
      line,
      body,
      side: typeof f.side === "string" && SIDES.has(f.side) ? (f.side as "LEFT" | "RIGHT") : "RIGHT",
      severity:
        typeof f.severity === "string" && SEVERITIES.has(f.severity)
          ? (f.severity as FindingSeverity)
          : "risk",
    });
  }

  return { summary, verdict, findings };
}

// ── Ancrage ──────────────────────────────────────────────────────────────────

export interface SelectedFindings {
  /** Ancrés dans le diff ET sous le plafond : ceux-là partent en commentaire de ligne. */
  inline: ReviewFinding[];
  /** Tout le reste (ancre invalide ou débordement du plafond) : ils vont dans la synthèse. */
  inSummary: ReviewFinding[];
}

/**
 * Le chemin tel que le modèle l'a écrit, ramené à un chemin de fichier.
 *
 * L'en-tête qu'on lui montre est `lib/demo.ts (renamed from lib/vieux.ts) — modified · +2 −1`,
 * et la consigne dit de n'en recopier que le chemin — mais un modèle recopie
 * volontiers la ligne entière. Ce qui suit ` — ` ou ` (` n'a jamais fait partie
 * d'un chemin : sans ce nettoyage, l'ancre est perdue pour une raison purement
 * typographique, et le point redescend en synthèse alors qu'il visait juste.
 *
 * N'est essayé qu'en SECOND, après l'égalité stricte : un vrai fichier dont le
 * nom contient une parenthèse (`app/(marketing)/page.tsx` — ils sont légion dans
 * ce dépôt) est trouvé par le premier passage et ne voit jamais ce nettoyage.
 */
export function normalizeFindingPath(raw: string): string {
  const unquoted = raw.trim().replace(/^[`"']+/, "").replace(/[`"']+$/, "").trim();
  const cut = [" — ", " ("].reduce((min, marker) => {
    const at = unquoted.indexOf(marker);
    return at === -1 ? min : Math.min(min, at);
  }, unquoted.length);
  return unquoted.slice(0, cut).trim().replace(/^\.\//, "");
}

/**
 * Trie les points en « postables en ligne » et « à replier dans la synthèse ».
 *
 * L'ancre est revalidée contre le patch avec `resolveDiffPosition` — la fonction
 * même que `mr.ts` utilise pour poster : ce qui passe ici passe chez la forge.
 * GitHub ne l'utilise pas pour poster (il prend path+line+side tels quels) mais
 * refuse exactement les mêmes ancres, en 422.
 *
 * Le tri est par GRAVITÉ, stable à gravité égale : quand le plafond coupe, il
 * coupe dans les broutilles, jamais dans les bugs.
 */
export function selectFindings(
  findings: ReviewFinding[],
  files: ReviewableFile[],
  max = AI_REVIEW_MAX_INLINE_COMMENTS,
): SelectedFindings {
  const byNewPath = new Map<string, ReviewableFile>();
  const byOldPath = new Map<string, ReviewableFile>();
  for (const file of files) {
    byNewPath.set(file.filename, file);
    byOldPath.set(file.previous_filename ?? file.filename, file);
  }

  // Un renommage fait diverger les deux chemins, et le modèle peut nommer l'un
  // ou l'autre — le diff lui montre les deux. On RETROUVE donc le fichier par
  // n'importe lequel ; c'est le chemin RETENU qui est normalisé plus bas.
  const lookup = (path: string, side: "LEFT" | "RIGHT") =>
    (side === "LEFT" ? byOldPath.get(path) : byNewPath.get(path)) ??
    byNewPath.get(path) ??
    byOldPath.get(path);

  const anchored: ReviewFinding[] = [];
  const loose: ReviewFinding[] = [];
  const seen = new Set<string>();

  for (const raw of findings) {
    // Tel quel d'abord, nettoyé ensuite : voir `normalizeFindingPath`.
    const file =
      lookup(raw.path, raw.side) ?? lookup(normalizeFindingPath(raw.path), raw.side);
    // Le chemin retenu est celui de la forge, pas celui que le modèle a écrit —
    // y compris pour un point qui finira en synthèse, où il se lira en clair.
    //
    // C'est le chemin ACTUEL du fichier des DEUX côtés du diff, renommage
    // compris : un commentaire de review s'adresse au fichier tel qu'il est dans
    // la PR, jamais à son nom d'avant (même convention que le composer humain,
    // `pr-diff.tsx`, qui poste `file.filename` quel que soit le côté). Une ancre
    // LEFT posée sur l'ancien nom se ferait refuser par la forge — le fichier du
    // diff porte le nouveau — et, si elle passait, atterrirait dans les fils
    // ORPHELINS de la vue diff, qui indexe sur `files[].filename`.
    const finding: ReviewFinding = {
      ...raw,
      path: file ? file.filename : normalizeFindingPath(raw.path) || raw.path,
    };

    // Deux points sur la même ligne : le premier gagne (il est aussi le plus
    // grave, la liste arrive triée par le modèle). Dédoublonné sur l'ancre
    // RÉSOLUE, pour que deux façons d'écrire un même chemin ne comptent pas deux.
    const key = `${finding.side}:${finding.path}:${finding.line}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const patch = file?.patch;
    if (!patch || !resolveDiffPosition(patch, finding.line, finding.side)) {
      loose.push(finding);
      continue;
    }
    anchored.push(finding);
  }

  const sorted = [...anchored].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  return {
    inline: sorted.slice(0, max),
    inSummary: [...sorted.slice(max), ...loose].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    ),
  };
}

// ── Synthèse ─────────────────────────────────────────────────────────────────

interface SummaryStrings {
  heading: string;
  verdict: Record<AiReview["verdict"], string>;
  alsoNoted: string;
  footer: (model: string) => string;
}

const SUMMARY_STRINGS: Record<string, SummaryStrings> = {
  fr: {
    heading: "Review de Numo",
    verdict: {
      approve: "**Verdict** — rien à redire, cette PR peut partir.",
      request_changes: "**Verdict** — des changements sont à faire avant de fusionner.",
      comment: "**Verdict** — des remarques, rien de bloquant.",
    },
    alsoNoted: "Également relevé",
    footer: (model) => `🤖 Relu par Numo (minddy) · ${model}`,
  },
  en: {
    heading: "Numo's review",
    verdict: {
      approve: "**Verdict** — nothing to fix, this PR can go.",
      request_changes: "**Verdict** — changes are needed before merging.",
      comment: "**Verdict** — remarks, nothing blocking.",
    },
    alsoNoted: "Also noted",
    footer: (model) => `🤖 Reviewed by Numo (minddy) · ${model}`,
  },
};

/**
 * Le corps de la review postée sur la forge : le verdict, la synthèse, puis les
 * points qui n'ont pas pu (ou pas dû) devenir des commentaires de ligne, chemin
 * et ligne en clair. Rien ne se perd : ce qui n'est pas ancrable reste lisible.
 *
 * Le verdict est ÉCRIT ICI plutôt que porté par l'événement de review de la
 * forge, et c'est délibéré (cf. `runPrAiReview`) : Numo donne un avis, il ne
 * tient pas la porte. Un `APPROVE` d'app satisferait une protection de branche
 * qui exige une approbation — du code fusionné sans qu'aucun humain l'ait lu —
 * et un `REQUEST_CHANGES` d'app bloquerait la PR jusqu'à ce que quelqu'un aille
 * le lever à la main. Les deux gestes restent ceux du menu Review, aux humains.
 *
 * Ce corps part donc en commentaire du FIL de la PR, pas en événement de review :
 * un verdict qui n'est qu'un texte doit atterrir là où minddy sait le relire
 * (cf. `runPrAiReview` — le fil vient de `issues/{n}/comments`, qui ignore les
 * corps de review).
 */
export function formatReviewBody(input: {
  review: AiReview;
  inSummary: ReviewFinding[];
  model: string;
  locale: string;
}): string {
  const s = SUMMARY_STRINGS[input.locale] ?? SUMMARY_STRINGS.en;
  const parts = [
    `### ${s.heading}`,
    s.verdict[input.review.verdict],
    input.review.summary.trim(),
  ];

  if (input.inSummary.length > 0) {
    const items = input.inSummary.map((f) => `- \`${f.path}:${f.line}\` — ${f.body}`);
    parts.push(`**${s.alsoNoted}**\n\n${items.join("\n")}`);
  }

  parts.push(`---\n${s.footer(input.model)}`);
  return parts.join("\n\n");
}
