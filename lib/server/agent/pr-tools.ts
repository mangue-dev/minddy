import "server-only";

import { resolveDiffPosition } from "./mr-position";
import { isForgeApiError, type Forge } from "./forge";
import { AI_REVIEW_MAX_INLINE_COMMENTS } from "./tools";

export { AI_REVIEW_MAX_INLINE_COMMENTS };

/**
 * Les trois écritures d'une session de RELECTURE (MIN-168) : commenter une ligne,
 * commenter le fil, répondre à un fil. C'est tout ce qu'un run ancré à une pull
 * request peut faire sortir de la sandbox — il n'a ni tool d'édition, ni
 * `create_pr`, et le harnais ne commite ni ne pousse rien pour lui
 * (`writesToRepo` dans `execute.ts`). La lecture seule est une propriété du JEU DE
 * TOOLS, pas une phrase de prompt : même doctrine que le sous-agent `explore`.
 *
 * Deux règles de MIN-141 survivent telles quelles, et elles vivent ici :
 *
 * **Le plafond de cinq commentaires de ligne.** Quinze remarques ancrées sur une
 * PR, ce n'est plus une review, c'est du bruit. La SOURCE DE VÉRITÉ du compteur
 * est le CHECKPOINT du run (`AgentCheckpoint.prInlineComments`), pas une variable
 * de tour : un run vit plusieurs chunks et plusieurs tours de conversation, et un
 * compteur qui repartirait de zéro à chaque réveil ferait du plafond une
 * politesse. Le compteur est donc porté par un objet que `execute.ts` sème depuis
 * le checkpoint et relit pour le persister — ce qui rend le plafond « 5 par RUN »
 * au sens strict, reprise et nouveau tour compris.
 *
 * **Le verdict s'écrit dans le CORPS.** Aucune méthode d'ici ne soumet
 * d'événement de review à la forge : un `APPROVE` posté par l'app satisferait une
 * protection de branche qui exige une approbation, un `REQUEST_CHANGES` bloquerait
 * la PR jusqu'à ce qu'un humain le lève. Numo donne un avis, il ne tient pas la
 * porte.
 *
 * L'ANCRAGE est le reste du travail. Une ligne commentable est une ligne du DIFF,
 * pas une ligne du fichier : les deux forges refusent en 422 une ancre hors diff.
 * On valide donc avant d'appeler (`resolveDiffPosition`, le même code qui sert à
 * poster côté GitLab), et un refus rend à l'agent les PLAGES réellement
 * commentables du fichier — une erreur qu'il peut corriger, au lieu d'un 422 qu'il
 * ne peut que subir.
 */

/** Noms des tools PR (routés vers ce module par execute.ts). */
/** Noms des tools de ce module. Ils vivent dans `platform-tool-names.ts` depuis
 *  MIN-224 — le ROUTAGE descend dans la microVM, l'EXÉCUTION reste ici — et sont
 *  ré-exportés pour que rien n'ait à changer d'import. */
export { PR_TOOL_NAMES } from "./platform-tool-names";

/** Un fichier du diff, réduit à ce que l'ancrage lit (`PullRequestFile` le satisfait). */
export interface ReviewableFile {
  filename: string;
  status: string;
  additions?: number;
  deletions?: number;
  patch?: string;
  /** Chemin AVANT la PR si le fichier a été renommé — c'est lui qui adresse la version de base. */
  previous_filename?: string;
}

type ToolOutcome = { result: unknown; success: boolean };

export interface PrToolContext {
  forge: Forge;
  call: { token: string; repoFullName: string; number: number };
  /** Fichiers du diff, chargés paresseusement et mémoïsés pour le chunk. */
  files: () => Promise<ReviewableFile[]>;
  /** Modèle du run — il signe la synthèse. */
  model: string;
  /** Langue de la signature : celle du lanceur. */
  locale: string;
  /**
   * Compteur d'ancres posées par CE RUN. Objet MUTÉ ici et persisté par
   * `execute.ts` dans le checkpoint : c'est ce qui rend le plafond insensible à
   * la reprise et au tour suivant.
   */
  inline: { used: number };
}

// ── Ancrage ─────────────────────────────────────────────────────────────────

/**
 * Le chemin tel que le modèle l'a écrit, ramené à un chemin de fichier.
 *
 * Un modèle recopie volontiers l'en-tête entier d'un fichier de diff
 * (`lib/demo.ts (renamed from lib/vieux.ts) — modified · +2 −1`). Ce qui suit
 * ` — ` ou ` (` n'a jamais fait partie d'un chemin : sans ce nettoyage, l'ancre
 * serait perdue pour une raison purement typographique.
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
 * Retrouve le fichier du diff que `path` désigne, quel que soit le côté nommé.
 *
 * Un renommage fait diverger les deux chemins et l'agent peut nommer l'un ou
 * l'autre — il lit les deux dans le diff. On cherche donc par le chemin ACTUEL
 * comme par `previous_filename`, dans les deux sens.
 */
export function findReviewableFile(
  files: ReviewableFile[],
  path: string,
  side: "LEFT" | "RIGHT",
): ReviewableFile | null {
  const byNewPath = new Map<string, ReviewableFile>();
  const byOldPath = new Map<string, ReviewableFile>();
  for (const file of files) {
    byNewPath.set(file.filename, file);
    byOldPath.set(file.previous_filename ?? file.filename, file);
  }
  const lookup = (p: string) =>
    (side === "LEFT" ? byOldPath.get(p) : byNewPath.get(p)) ??
    byNewPath.get(p) ??
    byOldPath.get(p) ??
    null;
  // Tel quel d'abord, nettoyé ensuite (cf. `normalizeFindingPath`).
  return lookup(path) ?? lookup(normalizeFindingPath(path));
}

/**
 * Les plages de lignes réellement commentables d'un patch, du côté demandé —
 * ce qu'on rend à l'agent quand son ancre tombe à côté.
 *
 * RIGHT : les lignes ajoutées et les lignes de contexte, numérotées dans le
 * fichier NOUVEAU. LEFT : les lignes supprimées et le contexte, numérotées dans
 * l'ANCIEN. Les plages sont fusionnées quand elles se touchent : un diff de dix
 * hunks doit rendre dix intervalles lisibles, pas trois cents numéros.
 */
export function commentableRanges(
  patch: string,
  side: "LEFT" | "RIGHT",
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const push = (n: number) => {
    const last = ranges[ranges.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else if (!last || n > last[1]) ranges.push([n, n]);
  };

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
      continue;
    }
    if (!inHunk || l.startsWith("\\")) continue;
    if (l.startsWith("+")) {
      if (side === "RIGHT") push(newN);
      newN++;
    } else if (l.startsWith("-")) {
      if (side === "LEFT") push(oldN);
      oldN++;
    } else {
      push(side === "RIGHT" ? newN : oldN);
      oldN++;
      newN++;
    }
  }
  return ranges;
}

/** Plages rendues à l'agent : `12–48, 91` — lisible, et recopiable tel quel. */
export function formatRanges(ranges: Array<[number, number]>): string {
  return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
}

export type PrAnchorResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Valide l'ancre d'un commentaire de ligne AVANT d'appeler la forge.
 *
 * Le chemin RETENU est celui du fichier tel qu'il est DANS la PR, des deux côtés
 * du diff : un commentaire de review s'adresse au fichier actuel, jamais à son nom
 * d'avant. Une ancre LEFT posée sur l'ancien nom se ferait refuser par la forge —
 * et, si elle passait, atterrirait dans les fils orphelins de la vue diff, qui
 * indexe sur le nom courant.
 */
export function resolvePrCommentAnchor(
  files: ReviewableFile[],
  input: { path: string; line: number; side: "LEFT" | "RIGHT" },
): PrAnchorResult {
  const file = findReviewableFile(files, input.path, input.side);
  if (!file) {
    const names = files.slice(0, 40).map((f) => f.filename);
    return {
      ok: false,
      error:
        `'${input.path}' is not part of this pull request's diff, so nothing can be anchored to it. ` +
        `Comment on a file the pull request actually changes` +
        (names.length > 0 ? `: ${names.join(", ")}` : "") +
        `${files.length > names.length ? `, … (${files.length} files total)` : ""}. ` +
        `Everything else goes in your summary comment.`,
    };
  }

  const patch = file.patch?.trim();
  if (!patch) {
    return {
      ok: false,
      error:
        `'${file.filename}' has no readable diff (binary, too large for the forge, or a pure rename), ` +
        `so no line of it can be commented. Put what you have to say about it in your summary comment.`,
    };
  }

  if (!resolveDiffPosition(patch, input.line, input.side)) {
    const ranges = commentableRanges(patch, input.side);
    return {
      ok: false,
      error:
        `Line ${input.line} (${input.side}) is not in the diff of '${file.filename}': a comment anchors to a line ` +
        `the pull request shows, not to any line of the file. ` +
        (ranges.length > 0
          ? `Commentable ${input.side} lines here: ${formatRanges(ranges)}.`
          : `No ${input.side} line of this file is commentable.`) +
        ` Pick one of them, or put the point in your summary comment.`,
    };
  }

  return { ok: true, path: file.filename };
}

// ── Signature de la synthèse ────────────────────────────────────────────────

const SIGNATURE: Record<string, (model: string) => string> = {
  fr: (model) => `🤖 Relu par Numo (minddy) · ${model}`,
  en: (model) => `🤖 Reviewed by Numo (minddy) · ${model}`,
};

/**
 * Signe une synthèse — exactement UNE fois.
 *
 * La signature est posée par le HARNAIS et non demandée au modèle : c'est un fait
 * (quel modèle a relu), pas une opinion, et un modèle à qui on demande de signer
 * oublie, invente un autre nom de modèle, ou signe deux fois. Le garde-fou reste
 * utile pour le cas où il l'écrit quand même : un corps qui porte déjà la marque
 * `🤖` d'une signature repart tel quel.
 */
export function signReviewBody(body: string, model: string, locale: string): string {
  const trimmed = body.trim();
  const sign = SIGNATURE[locale] ?? SIGNATURE.en;
  const line = sign(model);
  if (trimmed.includes(line)) return trimmed;
  // Une signature d'une AUTRE langue ou d'un autre modèle compte aussi : ce qu'on
  // évite, c'est le double pied de page, pas une chaîne précise.
  if (/🤖\s*(Relu par|Reviewed by) Numo \(minddy\)/.test(trimmed)) return trimmed;
  return `${trimmed}\n\n---\n${line}`;
}

// ── Handlers ────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Corps de commentaire accepté — GitHub refuse au-delà de 65 536 caractères. */
const MAX_BODY_LENGTH = 65_536;

async function commentPrLine(
  ctx: PrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const body = str(args.body);
  const path = str(args.path);
  const rawLine = typeof args.line === "number" ? args.line : Number(args.line);
  const side = args.side === "LEFT" ? "LEFT" : "RIGHT";

  if (!body) return { result: { error: "body is required." }, success: false };
  if (!path) return { result: { error: "path is required." }, success: false };
  if (!Number.isInteger(rawLine) || rawLine < 1) {
    return { result: { error: "line must be a positive integer." }, success: false };
  }

  // Le plafond AVANT tout appel de forge : dépassé, il n'y a rien à tenter.
  const left = AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used;
  if (left <= 0) {
    return {
      result: {
        error:
          `You have already posted the ${AI_REVIEW_MAX_INLINE_COMMENTS} line comments this review allows. ` +
          `Everything else goes in your summary comment (comment_pr), most serious first.`,
      },
      success: false,
    };
  }

  const anchor = resolvePrCommentAnchor(await ctx.files(), { path, line: rawLine, side });
  if (!anchor.ok) return { result: { error: anchor.error }, success: false };

  try {
    const comment = await ctx.forge.createPullRequestReviewComment({
      ...ctx.call,
      body: body.slice(0, MAX_BODY_LENGTH),
      path: anchor.path,
      line: rawLine,
      side,
    });
    ctx.inline.used++;
    return {
      result: {
        id: comment.id,
        path: anchor.path,
        line: rawLine,
        side,
        url: comment.html_url,
        remaining: AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used,
      },
      success: true,
    };
  } catch (err) {
    // Un refus de forge NE consomme PAS le plafond : rien n'a été posé. Le cas
    // attendu est le 422 (la tête a bougé entre la lecture du diff et l'envoi).
    if (isForgeApiError(err)) {
      return {
        result: {
          error:
            `The forge refused this anchor (${err.status}): ${err.message}. ` +
            `The head may have moved since you read the diff — put the point in your summary comment.`,
        },
        success: false,
      };
    }
    throw err;
  }
}

async function commentPr(
  ctx: PrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const body = str(args.body);
  if (!body) return { result: { error: "body is required." }, success: false };
  const signed = signReviewBody(body, ctx.model, ctx.locale).slice(0, MAX_BODY_LENGTH);
  const comment = await ctx.forge.createPullRequestComment({ ...ctx.call, body: signed });
  return { result: { id: comment.id, url: comment.html_url }, success: true };
}

async function replyPrThread(
  ctx: PrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const body = str(args.body);
  const commentId =
    typeof args.comment_id === "number" ? args.comment_id : Number(args.comment_id);
  if (!body) return { result: { error: "body is required." }, success: false };
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return {
      result: {
        error:
          "comment_id must be the numeric id of a review comment of this pull request — the one your context lists for that thread.",
      },
      success: false,
    };
  }
  try {
    const reply = await ctx.forge.replyToPullRequestReviewComment({
      ...ctx.call,
      commentId,
      body: body.slice(0, MAX_BODY_LENGTH),
    });
    return { result: { id: reply.id, url: reply.html_url }, success: true };
  } catch (err) {
    if (isForgeApiError(err)) {
      return {
        result: {
          error:
            `The forge refused this reply (${err.status}): ${err.message}. ` +
            `Check that comment_id is a REVIEW comment (anchored to a line) of this pull request.`,
        },
        success: false,
      };
    }
    throw err;
  }
}

/**
 * Exécute un tool PR. Une SYNTHÈSE RÉPÉTÉE est permise et n'est pas un accident :
 * une session de review est conversationnelle, et répondre une seconde fois dans
 * le fil est exactement ce qu'un relecteur humain fait. Chaque message part signé
 * une fois ; c'est le PLAFOND, lui, qui borne ce qui compte — les ancres.
 */
export async function executePrTool(
  ctx: PrToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "comment_pr_line":
        return await commentPrLine(ctx, args);
      case "comment_pr":
        return await commentPr(ctx, args);
      case "reply_pr_thread":
        return await replyPrThread(ctx, args);
      default:
        return { result: { error: `Unknown pull request tool: ${name}` }, success: false };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
  }
}
