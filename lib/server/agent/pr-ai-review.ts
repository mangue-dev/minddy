import "server-only";

import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  newRunId,
  parseOpenRouterUsage,
  recordAiUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import { getServiceClient } from "@/lib/supabase-service";
import { isForgeApiError, type Forge } from "./forge";
import {
  AI_REVIEW_TOOL_NAME,
  AI_REVIEW_TOOL_PARAMETERS,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
  formatReviewBody,
  parseAiReview,
  parsePartialReview,
  selectFindings,
  type AiReview,
  type ReviewConversation,
  type ReviewFinding,
  type ReviewIssueContext,
  type ReviewNote,
} from "./pr-ai-review-core";
import type { PrReviewRecorder } from "./pr-review-runs";
import type { PullRequestRow } from "./pull-requests";

/**
 * Review d'une pull request par Numo (MIN-141) — la passe DÉCLENCHÉE.
 *
 * `self-review.ts` existait déjà, mais c'est autre chose : une injection de fin
 * de tour dans la boucle de l'agent, que personne ne peut demander de
 * l'extérieur. Ici, un clic sur « Faire vérifier par Numo » (menu Review d'une
 * PR — de N'IMPORTE quelle PR, pas seulement de celles que Numo a ouvertes)
 * déclenche UN appel modèle qui produit une synthèse et des commentaires de
 * ligne, là où CodeRabbit se pose.
 *
 * Trois décisions tenues ici :
 *  1. **Manuel.** Rien ne l'appelle à l'ouverture d'une PR. Un tour de modèle
 *     coûte de l'argent, un clic n'en coûte pas — et c'est le déclencheur qui
 *     paye (`billTo: { userId }`, MIN-131), pas le owner du projet.
 *  2. **Un autre modèle.** Le défaut `pr_review_model` est délibérément distinct
 *     de `agent_model` : faire relire du code par le modèle qui vient de
 *     l'écrire donne un second avis identique. C'est la raison d'être de la
 *     passe. Le modèle EXACT, lui, se choisit au moment du clic
 *     (`resolvePrReviewModel`) — une grosse PR ne se relit pas comme un
 *     one-liner.
 *  3. **Synthèse + 3 à 5 points en ligne** (`selectFindings`), le reste replié
 *     dans la synthèse — quinze commentaires de ligne, c'est du bruit.
 *
 * La passe RACONTE ce qu'elle fait, au `PrReviewRecorder` qu'on lui passe : une
 * phase à chaque étape, une ligne par source lue, un point à chaque commentaire
 * déposé, et le texte de la synthèse pendant qu'il s'écrit (le tour de modèle
 * est streamé pour ça). C'est ce fil que la conversation de la PR affiche en
 * direct, à la place où le message de verdict va tomber, puis replie DANS ce
 * message une fois qu'il est publié — trois minutes de silence suivies d'un
 * toast ne disaient ni ce que Numo avait lu, ni ce qu'il était en train de faire.
 *
 * Ce que la passe LIT avant de juger, et qui vient d'autant de sources : le
 * diff, le ticket avec son PLAN et ses commentaires (`loadIssueContext`), et
 * tout ce qui a déjà été écrit sur la PR (`loadPrConversation` — fil, reviews
 * soumises, commentaires ancrés). Sans le plan, un écart d'implémentation ne se
 * voit pas ; sans les commentaires du ticket, un écart ASSUMÉ se lit comme une
 * faute ; sans le fil de la PR, Numo redit ce qu'un humain a déjà écrit. Chaque
 * lecture est best-effort : ce qui n'est pas lisible manque au contexte, il
 * n'arrête pas la review.
 *
 * L'écriture passe par l'outillage de MIN-138 : `createPullRequestReviewComment`
 * pour les ancres, `createPullRequestComment` pour la synthèse — le verdict est
 * écrit dans son corps, jamais porté par un événement de review de la forge
 * (voir plus bas : un avis, pas une porte ; et un fil que minddy sait lire).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Un diff se lit plus lentement qu'un ticket se classe : 3 minutes, pas 45 s. */
const REVIEW_TIMEOUT_MS = 180_000;

/** Assez pour une synthèse et une poignée de points argumentés, pas pour un essai. */
const REVIEW_MAX_TOKENS = 4000;

/** Cadence du direct pendant que le modèle écrit — quatre fois par seconde, comme
 *  le fil d'un run d'agent. En dessous, ça saccade ; au-dessus, on paye du réseau
 *  pour des caractères que l'œil ne distingue pas. */
const LIVE_FLUSH_MS = 250;

export type PrAiReviewOutcome =
  | {
      ok: true;
      /** Ce que Numo pense de la PR. Écrit dans la synthèse, pas dans l'événement
       *  de review de la forge (cf. la soumission en `comment` plus bas). */
      verdict: AiReview["verdict"];
      /** Commentaires de ligne réellement déposés. */
      inlineComments: number;
      model: string;
      /** Le diff qui vient d'être relu — ce qui permet de savoir, plus tard, si
       *  relancer la passe aurait quelque chose de nouveau à lire. */
      headSha: string | null;
      /** Le commentaire de fil qui porte la synthèse, chez la forge. */
      summaryCommentId: number | null;
    }
  | {
      ok: false;
      error: "noDiff" | "modelUnavailable" | "modelRefused";
      headSha: string | null;
    };

interface PrAiReviewInput {
  forge: Forge;
  call: { token: string; repoFullName: string; number: number };
  pr: PullRequestRow;
  /** Qui a cliqué — c'est lui qui paye. */
  userId: string;
  locale: string;
  /** Le modèle retenu pour CETTE passe (`resolvePrReviewModel`, côté appelant :
   *  c'est lui qui sait ce qui a été choisi au clic). */
  model: string;
  /** Le carnet de la session : phases, sources lues, points, synthèse, direct. */
  recorder: PrReviewRecorder;
}

/**
 * Lance la passe et POSTE le résultat. Lève sur erreur de forge (l'appelant la
 * traduit en HTTP) ; les échecs du modèle reviennent en `{ ok: false }`, parce
 * qu'un modèle qui n'a rien à dire n'est pas une panne de minddy.
 */
export async function runPrAiReview(input: PrAiReviewInput): Promise<PrAiReviewOutcome> {
  const { forge, call, recorder, model } = input;
  await recorder.status("reading");
  const [pr, files] = await Promise.all([
    forge.getPullRequest(call),
    forge.listPullRequestFiles(call),
  ]);
  const headSha = pr.headSha ?? input.pr.head_sha ?? null;
  await recorder.context({
    kind: "diff",
    files: files.length,
    additions: files.reduce((n, f) => n + (f.additions ?? 0), 0),
    deletions: files.reduce((n, f) => n + (f.deletions ?? 0), 0),
  });

  // « Rien à relire » n'est pas « aucun fichier » : une PR qui ne déplace que des
  // binaires — ou des fichiers trop gros pour que la forge en serve le patch —
  // arrive avec des fichiers ET aucun diff lisible. Le modèle n'aurait rien sous
  // les yeux, et l'appel serait payé quand même. (`every` sur une liste vide est
  // vrai : le cas « zéro fichier » passe par la même porte.)
  if (files.every((f) => !f.patch?.trim())) return { ok: false, error: "noDiff", headSha };

  // Le ticket (plan + commentaires) et la discussion de la PR se lisent en
  // parallèle : ni l'un ni l'autre ne dépend de l'autre, et les deux sont du
  // contexte, pas des prérequis.
  const [issue, conversation] = await Promise.all([
    loadIssueContext(input.pr.issue_id),
    loadPrConversation(forge, call),
  ]);
  // Ce qui a été lu, dit à l'écran : sur une review, « d'où ça sort » vaut le
  // verdict lui-même. Une PR non rattachée n'a pas de ligne ticket — c'est un
  // état normal (MIN-143), pas un trou.
  if (issue) {
    await recorder.context({
      kind: "issue",
      identifier: issue.context.identifier,
      hasPlan: !!issue.context.plan?.trim(),
      comments: issue.context.comments?.length ?? 0,
    });
  }
  await recorder.context({
    kind: "conversation",
    comments: conversation.comments.length,
    reviews: conversation.reviews.length,
    reviewComments: conversation.reviewComments.length,
  });

  await recorder.status("analyzing");
  const raw = await callReviewModel({
    model,
    system: buildReviewSystemPrompt(input.locale),
    user: buildReviewUserMessage({
      title: pr.title ?? input.pr.title ?? "",
      body: pr.body,
      issue: issue?.context ?? null,
      conversation,
      files,
    }),
    userId: input.userId,
    // Le projet de la ligne de ledger est celui du TICKET, ou rien : un dépôt
    // peut être lié depuis plusieurs projets, et `resolveRepoCloneTargetForRepo`
    // n'en choisit un que pour minter un token. Le ticket, lui, n'en a qu'un.
    projectId: issue?.projectId ?? null,
    recorder,
  });
  if (raw === null) return { ok: false, error: "modelUnavailable", headSha };

  const review = parseAiReview(raw);
  if (!review) return { ok: false, error: "modelRefused", headSha };

  await recorder.status("posting");
  const { inline, inSummary } = selectFindings(review.findings, files);

  // Les commentaires de ligne d'abord, la synthèse ensuite : c'est la synthèse
  // qui porte ce qui n'a pas pu être ancré, et on ne le sait qu'après avoir
  // essayé.
  //
  // AUCUN refus de forge n'emporte la passe : le point redescend dans la
  // synthèse, qui est le filet. Le 422 est le cas attendu (la tête a bougé entre
  // la lecture et l'envoi), mais un 403 ou un 404 ne valent pas mieux ici —
  // abandonner en cours de boucle laisserait sur la PR les commentaires DÉJÀ
  // posés, sans la synthèse qui les explique, et rendrait un 502 à quelqu'un dont
  // la review a en partie eu lieu. Si c'est la forge entière qui est tombée,
  // l'envoi de la synthèse le dira en levant, une fois, proprement. Ce qui n'est
  // pas une erreur de forge (une faute de programmation) continue de lever.
  const posted: typeof inline = [];
  const failed: typeof inline = [];
  for (const finding of inline) {
    try {
      const comment = await forge.createPullRequestReviewComment({
        ...call,
        body: finding.body,
        path: finding.path,
        line: finding.line,
        side: finding.side,
      });
      posted.push(finding);
      // Chaque point apparaît à l'écran AU MOMENT où il arrive sur la PR, pas
      // tous ensemble à la fin : c'est le seul rendu qui dit la vérité sur ce
      // que Numo est en train de faire. Son id voyage avec (MIN-159) : c'est lui
      // qui, dans le déroulé, ramène l'extrait de code du commentaire.
      await recordFinding(recorder, finding, true, comment.id);
    } catch (err) {
      if (!isForgeApiError(err)) throw err;
      console.error(
        `[pr-ai-review] anchor refused (${finding.path}:${finding.line}, ${err.status}):`,
        err.message,
      );
      failed.push(finding);
      await recordFinding(recorder, finding, false);
    }
  }

  // Les points que le plafond a écartés (ou dont l'ancre a été refusée) sont
  // dits eux aussi, marqués comme repliés dans la synthèse : sans ça, l'écran
  // montrerait trois points là où la review en compte sept.
  for (const finding of inSummary) await recordFinding(recorder, finding, false);

  const body = formatReviewBody({
    review,
    inSummary: [...failed, ...inSummary],
    model,
    locale: input.locale,
  });

  // Le verdict de Numo est ÉCRIT dans le corps, jamais porté par l'événement de
  // review de la forge. Un `APPROVE` posté par l'app satisferait une protection
  // de branche qui exige une approbation — du code fusionné sans qu'un humain
  // l'ait lu — et un `REQUEST_CHANGES` bloquerait la PR jusqu'à ce que quelqu'un
  // le lève à la main. Numo donne un avis ; approuver et demander des
  // changements restent des gestes du menu Review, c'est-à-dire des gestes de la
  // personne qui décide.
  //
  // D'où un COMMENTAIRE DE FIL et non `submitReview` : sans verdict à porter, un
  // événement de review n'apporte rien ici, et il coûte la seule chose qui
  // compte — être lu. VÉRIFIÉ contre l'API GitHub : le corps d'une review
  // `COMMENT` ne sort que de `pulls/{n}/reviews`, jamais de `issues/{n}/comments`
  // — l'endpoint QUE minddy lit pour peupler le fil (`listPullRequestComments`).
  // La synthèse — le verdict, et TOUS les points qui n'ont pas pu s'ancrer —
  // restait donc invisible dans minddy même : on payait un tour de modèle pour un
  // texte qu'il fallait aller lire sur GitHub. Côté GitLab le geste est identique
  // au précédent (`submitMergeRequestReview` en `comment` n'était déjà qu'un
  // `createMergeRequestNote`), donc rien n'y change.
  const summaryComment = await forge.createPullRequestComment({ ...call, body });
  await recorder.summary({
    verdict: review.verdict,
    summary: review.summary,
    inlineComments: posted.length,
  });

  return {
    ok: true,
    verdict: review.verdict,
    inlineComments: posted.length,
    model,
    headSha,
    // L'id du message de synthèse : c'est à LUI que le fil de la session se
    // rattache dans la conversation.
    summaryCommentId: summaryComment?.id ?? null,
  };
}

/**
 * Un point, tel qu'il apparaît dans le fil de la session. `commentId` est celui
 * du commentaire de review qu'il est devenu sur la forge (MIN-159) : c'est par
 * lui que le déroulé de la passe le retrouve pour le montrer avec son extrait de
 * code. Absent quand le point n'a été ancré nulle part.
 */
function recordFinding(
  recorder: PrReviewRecorder,
  finding: ReviewFinding,
  anchored: boolean,
  commentId?: number,
): Promise<void> {
  return recorder.finding({
    path: finding.path,
    line: finding.line,
    severity: finding.severity,
    body: finding.body,
    anchored,
    ...(commentId != null ? { commentId } : {}),
  });
}

/** Derniers commentaires du ticket remontés. Au-delà, `renderNotes` ne garderait
 *  de toute façon que les plus récents — autant ne pas les transporter. */
const ISSUE_COMMENTS_LIMIT = 40;

/**
 * Le ticket que la PR met en œuvre — le contexte qui distingue « ce code est
 * correct » de « ce code fait ce qu'on lui demandait », et le PROJET auquel
 * rattacher la ligne de ledger. Best-effort : une PR sans ticket (le cas normal
 * d'une PR humaine, MIN-143) se relit très bien sans, et sa dépense se lira
 * simplement sans nom de projet.
 *
 * Le PLAN et les COMMENTAIRES viennent avec, et ils vont ensemble : le plan dit
 * ce qui avait été décidé, les commentaires disent ce dont on s'est écarté et
 * pourquoi. Le plan seul ferait signaler comme des fautes des écarts assumés et
 * argumentés — c'est-à-dire le contraire d'une relecture utile.
 */
async function loadIssueContext(
  issueId: string | null,
): Promise<{ context: ReviewIssueContext; projectId: string | null } | null> {
  if (!issueId) return null;
  try {
    const service = getServiceClient();
    const [{ data }, { data: commentRows }] = await Promise.all([
      service
        .from("issues")
        .select("number, title, description, plan, project_id, projects(key)")
        .eq("id", issueId)
        .maybeSingle(),
      // Les PLUS RÉCENTS d'abord côté SQL, remis dans l'ordre de lecture ensuite :
      // un `limit` ascendant garderait le début d'une discussion, jamais sa fin.
      service
        .from("comments")
        .select("body, author_id, via_assistant")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false })
        .limit(ISSUE_COMMENTS_LIMIT),
    ]);
    if (!data) return null;
    const key = ((data.projects as { key?: string } | null)?.key ?? "").toString();
    return {
      context: {
        identifier: issueIdentifier(key, data.number as number),
        title: (data.title as string) ?? "",
        description: (data.description as string | null) ?? null,
        plan: (data.plan as string | null) ?? null,
        comments: await issueNotes(service, commentRows ?? []),
      },
      projectId: (data.project_id as string | null) ?? null,
    };
  } catch (err) {
    console.error("[pr-ai-review] issue context failed:", (err as Error).message);
    return null;
  }
}

/** Type minimal d'une ligne de `comments` telle que lue ci-dessus. */
type IssueCommentRow = { body: unknown; author_id: unknown; via_assistant: unknown };

/**
 * Les commentaires du ticket, nommés. Un commentaire de Numo se signe « Numo »
 * (son `author_id` est celui de la personne qui l'a déclenché — l'afficher
 * ferait dire à un humain ce que l'assistant a écrit) ; les autres passent par
 * la résolution de nom commune (`displayName`), jamais par l'e-mail brut.
 */
async function issueNotes(
  service: ReturnType<typeof getServiceClient>,
  rows: IssueCommentRow[],
): Promise<ReviewNote[]> {
  const ordered = [...rows].reverse();
  const users = await fetchAuthUsersById(
    service,
    ordered.map((r) => r.author_id as string).filter(Boolean),
  );
  return ordered.map((row) => ({
    author: row.via_assistant
      ? "Numo"
      : displayName(toNamed(users.get(row.author_id as string)), "User"),
    body: (row.body as string | null) ?? "",
  }));
}

/** Repli journalisé d'une lecture de contexte : ce qui manque manque, la review a lieu. */
function unreadable<T>(what: string, fallback: T): (err: unknown) => T {
  return (err) => {
    console.error(`[pr-ai-review] ${what} unreadable:`, (err as Error).message);
    return fallback;
  };
}

/**
 * Tout ce qui a déjà été écrit SUR la PR : les reviews soumises (avec leur
 * texte), les commentaires ancrés au diff, et le fil. Les trois ensemble sont ce
 * qui empêche Numo de resservir un point qu'un humain a déjà fait — et lui
 * donnent les décisions déjà prises sur cette PR.
 *
 * Best-effort liste par liste : une permission manquante sur l'une (les reviews
 * n'ont pas la même garde que les commentaires selon les installations) prive la
 * passe de cette liste-là, pas des deux autres, et ne fait pas échouer un geste
 * que l'utilisateur paye.
 */
async function loadPrConversation(
  forge: Forge,
  call: { token: string; repoFullName: string; number: number },
): Promise<ReviewConversation> {
  const [reviews, reviewComments, reviewThreads, comments] = await Promise.all([
    forge.listReviewMessages(call).catch(unreadable("submitted reviews", [])),
    forge.listPullRequestReviewComments(call).catch(unreadable("review comments", [])),
    forge.listReviewThreads(call).catch(unreadable("review threads", [])),
    forge.listPullRequestComments(call).catch(unreadable("comments", [])),
  ]);

  return {
    reviews: reviews.map((r) => ({
      author: r.author ?? "someone",
      about: r.state.replace(/_/g, " "),
      body: r.body,
    })),
    // Regroupés en fils pour porter l'état de résolution (MIN-139) : un fil
    // résolu est un point RÉGLÉ, et le resservir est exactement ce que cette
    // fonction existe pour éviter. Le marqueur suit chaque message du fil —
    // l'aplatissement d'origine, lui, ignorait jusqu'à l'existence du fil.
    reviewComments: groupReviewThreads(reviewComments, reviewThreads).flatMap((thread) =>
      thread.comments.map((c) => ({
        author: c.user?.login ?? "someone",
        // La ligne courante, sinon celle du commit d'origine : un commentaire
        // devenu « outdated » vise toujours quelque chose, et le dire vaut mieux
        // que de le donner sans adresse.
        about:
          `${c.path}:${c.line ?? c.original_line ?? "?"}` +
          (thread.resolution?.resolved ? " — resolved thread, already dealt with" : ""),
        body: c.body,
      })),
    ),
    comments: comments.map((c) => ({ author: c.user?.login ?? "someone", body: c.body })),
  };
}

/**
 * L'appel modèle à sortie forcée, STREAMÉ. Même contrat que `forcedToolCall` du
 * feedback (un tool obligatoire, `null` au moindre échec) mais avec ses propres
 * budgets : une review lit un diff entier et écrit plusieurs paragraphes, les
 * 1 024 tokens et 45 s de la passe feedback la couperaient au milieu.
 *
 * Streamé pour une seule raison, et elle est visible : sans flux, la passe reste
 * muette pendant tout le tour de modèle — la partie longue — et la « vue en
 * direct » ne montrerait qu'un spinner. On lit donc les deltas du tool call au
 * fil de l'eau et on republie, au plus quatre fois par seconde, ce qui est déjà
 * lisible de la synthèse (`parsePartialReview`). Le résultat, lui, ne change
 * pas : c'est le MÊME objet JSON, simplement recollé de ses morceaux.
 */
async function callReviewModel(input: {
  model: string;
  system: string;
  user: string;
  userId: string;
  projectId: string | null;
  recorder: PrReviewRecorder;
}): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "PR review (minddy)",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: AI_REVIEW_TOOL_NAME,
              description: "Mandatory structured output — you must always call it.",
              parameters: AI_REVIEW_TOOL_PARAMETERS,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: AI_REVIEW_TOOL_NAME } },
        stream: true,
        usage: { include: true },
        max_tokens: REVIEW_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const stream = await readReviewStream(response, input.recorder);

    // Le ledger AVANT la lecture du tool call : l'appel est payé même quand le
    // modèle répond à côté, et une dépense hors compteur est exactement ce que
    // MIN-131 interdit.
    const usage = parseOpenRouterUsage(stream.usage ?? undefined);
    await recordAiUsage({
      runId: newRunId(),
      feature: "pr_review",
      model: stream.model ?? input.model,
      generationId: stream.generationId,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cost: usage.cost,
      billTo: { userId: input.userId },
      projectId: input.projectId,
    });

    if (stream.toolName && stream.toolName !== AI_REVIEW_TOOL_NAME) return {};
    return JSON.parse(stream.args || "{}") as Record<string, unknown>;
  } catch (err) {
    console.error("[pr-ai-review] LLM call failed:", (err as Error).message);
    return null;
  }
}

/** Un chunk SSE d'OpenRouter, réduit à ce que la review y lit. */
interface ReviewStreamChunk {
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
  choices?: {
    delta?: {
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
  }[];
}

/**
 * Recolle le tool call de ses deltas, en publiant la synthèse au passage.
 *
 * Le direct est throttlé (`LIVE_FLUSH_MS`) ET conditionné à un vrai changement :
 * un modèle qui écrit ses `findings` ne fait plus bouger la synthèse, et
 * réémettre le même texte trente fois ne dit rien de plus. Un dernier envoi
 * forcé clôt le flux — sinon la fin de la synthèse n'apparaîtrait qu'avec
 * l'événement final, une bonne seconde plus tard.
 */
async function readReviewStream(
  response: Response,
  recorder: PrReviewRecorder,
): Promise<{
  args: string;
  toolName: string | null;
  generationId: string | null;
  model: string | null;
  usage: OpenRouterUsage | null;
}> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from LLM");

  const decoder = new TextDecoder();
  let buffer = "";
  let args = "";
  let toolName: string | null = null;
  let generationId: string | null = null;
  let model: string | null = null;
  let usage: OpenRouterUsage | null = null;

  let lastFlushAt = 0;
  let lastSignature = "";
  const flush = (force = false) => {
    if (!force && Date.now() - lastFlushAt < LIVE_FLUSH_MS) return;
    const partial = parsePartialReview(args);
    const signature = `${partial.summary.length}:${partial.findings.length}`;
    if (!force && signature === lastSignature) return;
    lastFlushAt = Date.now();
    lastSignature = signature;
    recorder.stream(partial.summary, partial.findings.length);
  };

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      let parsed: ReviewStreamChunk;
      try {
        parsed = JSON.parse(data) as ReviewStreamChunk;
      } catch {
        continue;
      }
      if (parsed.id && !generationId) generationId = parsed.id;
      if (parsed.model) model = parsed.model;
      if (parsed.usage) usage = parsed.usage;
      // Un seul tool call attendu (sortie forcée) : tous les deltas s'ajoutent
      // au même tampon, quel que soit leur index.
      for (const tc of parsed.choices?.[0]?.delta?.tool_calls ?? []) {
        if (tc.function?.name) toolName = tc.function.name;
        if (tc.function?.arguments) args += tc.function.arguments;
      }
    }
    flush();
  }
  flush(true);

  return { args, toolName, generationId, model, usage };
}
