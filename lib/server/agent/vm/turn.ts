import {
  runAgentLoop,
  BUDGET_REFRESH_INTERVAL_MS,
  type AgentChatMessage,
  type AgentUsageLine,
  type EmitAgentEvent,
} from "../agent-loop";
import { agentToolsFor, subagentToolsFor } from "../tools";
import { buildSubagentSystemPrompt } from "../prompt";
import {
  Subagents,
  subagentUsageSeq,
  type SubagentRunner,
  type SubagentRunResult,
} from "../subagent";
import {
  makeSubagentModelResolver,
  subagentRoundsLeft,
  SUBAGENT_MAX_ROUNDS,
} from "../subagent-config";
import { usesApplyPatch } from "../patch";
import { fitCheckpoint } from "../checkpoint-fit";
import { typeErrorsForTurn, TYPECHECK_MIN_BUDGET_MS } from "../diagnostics";
import { formatSelfReview, SELF_REVIEW_MIN_BUDGET_MS } from "../self-review";
import {
  newPlanWriteSink,
  planClosureForTurn,
  watchPlanWrites,
  PLAN_CLOSURE_MIN_BUDGET_MS,
} from "../plan-closure";
import { planReviewForTurn, PLAN_REVIEW_MIN_BUDGET_MS } from "../plan-review";
import { REPO_INSTRUCTION_FILES, type InstructionsState } from "../repo-instructions";
import { commitAndPush, changedFiles, turnDiff, type RepoHost } from "../repo-host";
import { BackgroundJobs } from "../background";
import { makeExecTool, readRepoInstructions, repoBackgroundRunner } from "../exec-tool";
import { SecretRedactor } from "../redact";
import type { AgentCheckpoint } from "../runs";
import type { AgentToolImage } from "../content";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob, VmPushResult, VmTurnReport } from "./protocol";

/**
 * LE TOUR, DANS LA MICROVM (MIN-224) — ce que `executeAgentRun` faisait entre
 * l'amorçage et la mise au repos, moins tout ce qui n'a plus lieu d'être.
 *
 * CE QUI DISPARAÎT, et c'est le dossier du ticket. Il n'y a plus de CHUNK : pas
 * de soft-deadline de fonction, pas de `MAX_ROUNDS_PER_CHUNK`, pas de suspension,
 * pas de parking, pas de continuation, pas de re-queue, pas de reprise de fille
 * sérialisée dans un checkpoint. Un tour commence, travaille, et finit. Onze des
 * quinze défauts de [problems.md](../../../../problems.md) vivaient dans ce
 * découpage-là.
 *
 * CE QUI RESTE, ET POURQUOI. Un tour n'est pas éternel pour autant :
 *
 * - la SESSION de la microVM est plafonnée à 24 h par la plateforme, et un tour
 *   tué par elle ne laisserait aucun checkpoint. D'où `VM_TURN_SOFT_DEADLINE_MS`,
 *   posé bien en dessous : c'est le MÊME mécanisme que la soft-deadline de chunk,
 *   avec un ordre de grandeur qui n'est plus celui d'une fonction serverless ;
 * - le checkpoint ne disparaît pas non plus (MIN-221 §4). Il change de rôle : il
 *   n'est plus le transport entre deux chunks, il est l'état entre deux TOURS —
 *   plus une sauvegarde périodique, sans laquelle un tour de deux heures qui perd
 *   sa VM perdrait deux heures.
 */

/**
 * Plafond mural d'un TOUR. Douze heures : très au-dessus de tout ce qu'un tour
 * réel demande, et très en dessous des 24 h de la session de microVM — de sorte
 * que ce soit TOUJOURS la boucle qui s'arrête, jamais la plateforme qui la tue.
 * La différence compte : une boucle qui s'arrête écrit son checkpoint et le dit
 * dans le fil ; une boucle tuée ne laisse qu'un run `running` que le chien de
 * garde devra constater mort.
 */
export const VM_TURN_SOFT_DEADLINE_MS = 12 * 60 * 60_000;

/**
 * Plafond de rounds d'un tour. `MAX_ROUNDS_PER_CHUNK` valait 150 pour un chunk de
 * cinq minutes ; sans chunk, ce plafond n'a plus le même sens — mais un garde-fou
 * anti-runaway en garde un : un modèle qui boucle sur le même tool-call doit être
 * arrêté avant d'avoir dépensé le budget entier du compte. Le plafond de DÉPENSE
 * (`budgetUsd`) est le vrai gouverneur ; celui-ci est le filet du cas où chaque
 * round coûte trois centimes.
 */
export const VM_MAX_ROUNDS_PER_TURN = 2000;

/**
 * Cadence de la sauvegarde périodique du checkpoint (MIN-221 §4).
 *
 * Posée au TEMPS et pas au nombre de rounds : ce qu'on protège est du travail
 * mural, et un round peut durer trois secondes comme dix minutes. Cinq minutes,
 * c'est au pire cinq minutes de conversation perdues sur une microVM qui meurt,
 * pour un `fitCheckpoint` + un PUT toutes les cinq minutes — négligeable devant
 * ce qu'un round coûte.
 */
export const CHECKPOINT_SAVE_INTERVAL_MS = 5 * 60_000;

/**
 * Marge gardée pour couper les filles et livrer leur rapport partiel DANS le tour
 * (avant le type-check, qui doit voir leurs fichiers).
 */
const SUBAGENT_CUT_MARGIN_MS = 10_000;
/** Wall-clock max d'UN sous-agent. Même chiffre que dans la fonction : ce n'est
 *  pas le chunk qui le posait, c'est le bon sens d'une tâche déléguée. */
const SUBAGENT_MAX_MS = 600_000;
/**
 * Base des seq de fichiers de sortie d'un sous-agent, hors de la bande du parent.
 * Sans ça, deux exec-tools d'un même tour écriraient le même `slug-<seq>.log` et
 * le second écraserait la sortie du premier.
 */
const SUBAGENT_OUTPUT_SEQ_BASE = 500_000;
/** Chemins édités qu'un checkpoint emporte — cap, pour ne rien peser sur le gabarit. */
const CHECKPOINT_EDITED_PATHS_MAX = 200;
function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/** Dernier texte écrit par l'assistant — le rapport partiel d'une fille coupée. */
function lastAssistantText(messages: AgentChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const text = typeof m.content === "string" ? m.content.trim() : "";
    if (text) return text;
  }
  return "";
}

/**
 * Message de commit d'une fin de tour : la première ligne de la réponse de
 * l'agent, nettoyée et bornée. Recopié de `execute.ts` plutôt qu'importé — ce
 * module-là ne descend pas dans la microVM.
 */
export function commitMessageFromReply(reply: string, identifier: string): string {
  const firstLine = reply.split("\n").find((l) => l.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/[#*_`>]+/g, "").trim();
  if (cleaned.length >= 8) return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69)}…`;
  return `wip(${identifier}): agent update`;
}

/**
 * Joue le tour et rend son rapport. Ne LÈVE pas sur un échec de travail (push
 * raté, type-check en panne) : ces échecs se DISENT dans le rapport, parce qu'un
 * tour qui a écrit du code et n'a pas su le pousser doit quand même remonter son
 * checkpoint. Ce qui lève ici, c'est ce qui rend le tour inracontable — et
 * `main.ts` le rattrape.
 */
export async function runVmTurn(
  job: VmJob,
  cp: ControlPlaneClient,
  host: RepoHost,
): Promise<VmTurnReport> {
  const startedAt = Date.now();
  const emit: EmitAgentEvent = (type, payload) => cp.emit(type, payload);

  /** Fichiers édités depuis le dernier type-check — PARTAGÉ avec les filles. */
  const editedPaths = new Set<string>(job.editedPaths);
  const instructions: InstructionsState = {
    paths: [...job.instructions.paths],
    bytes: job.instructions.bytes,
  };
  /** Ancres de review posées par ce run — le plafond des 5 vit côté fonction, qui
   *  rend le compteur à jour à chaque appel. */
  let prInlineComments = job.prInlineComments;
  let repoTouched = job.repoTouched;
  let selfReviewed = false;
  /** Le plan écrit par ce tour, noté au passage des tools ticket (MIN-236) — c'est
   *  ce que la relecture rend au modèle (MIN-237) et que le contrôle de clôture grep
   *  avant de rendre la main. */
  const planWrites = newPlanWriteSink();
  let planReviewed = false;
  let planClosed = false;

  const background = new BackgroundJobs(repoBackgroundRunner(host), 0);

  /**
   * Le compteur de dépense PARTAGÉ entre le parent et ses filles (MIN-202) : sans
   * lui, chacune comparerait sa seule dépense au plafond commun. Il voyage avec la
   * boucle — c'est un des défauts du lot 1 que la migration n'efface pas.
   */
  const turnSpend = { usd: 0 };
  const budgetUsd = job.budgetUsd;

  const elapsed = () => Date.now() - startedAt;
  const remainingMs = () => VM_TURN_SOFT_DEADLINE_MS - elapsed();

  // ── Tools de plateforme : tout passe par le plan de contrôle ────────────────
  const platformTool = async (name: string, args: Record<string, unknown>) => {
    const res = await cp.callTool(name, { args, imageInput: job.imageInput, prInlineComments });
    if (typeof res.inlineUsed === "number") prInlineComments = res.inlineUsed;
    return {
      result: res.result,
      success: res.success,
      ...(res.images
        ? { images: res.images as unknown as AgentToolImage[] }
        : {}),
    };
  };

  /**
   * Recherches web déjà payées par ce TOUR, parent et filles confondus — le même
   * compteur partagé que la fonction tient (MIN-171). Il voyage avec la boucle :
   * le plan de contrôle facture ce qu'on lui demande, il ne compte rien. Sans lui,
   * un modèle qui cherche en rond dépense 0,005 $ par appel sans aucune borne, et
   * le tour n'en dit rien.
   *
   * Il sert aussi de `seq` : deux recherches d'un même tour écrivent alors deux
   * lignes de ledger distinctes, là où un `seq` absent les rangeait toutes sous le
   * même numéro.
   */
  let webSearchesUsed = 0;
  const webSearch = job.webSearch
    ? async (query: string) => {
        if (webSearchesUsed >= job.webSearchMax) {
          return {
            result: {
              error: `Web search limit reached for this turn (${job.webSearchMax} searches). Work with what you already found.`,
            },
            success: false,
          };
        }
        const seq = webSearchesUsed++;
        const res = await cp.callTool("web_search", { args: { query, seq } });
        return { result: res.result, success: res.success };
      }
    : null;

  /**
   * `create_pr` : la VM POUSSE (elle a le dépôt), la fonction OUVRE (elle a la
   * forge). C'est la seule frontière de ce fichier qui coupe un tool en deux, et
   * elle est dans le bon sens — le token de forge et l'état de la pull request
   * vivent côté fonction, le dépôt côté VM.
   */
  const createPr = job.writesToRepo
    ? async ({ title, body }: { title: string; body?: string }) => {
        // Mêmes précautions qu'en fin de tour : rien ne doit écrire pendant le
        // `git add -A`. Et on le DIT au modèle — un serveur tué en silence lui
        // laisse croire qu'il tourne (MIN-209).
        const stoppedJobs = await background.stopAll().catch(() => 0);
        const jobsNote =
          stoppedJobs === 0
            ? ""
            : `${stoppedJobs === 1 ? "1 background job was" : `${stoppedJobs} background jobs were`} stopped ` +
              `before staging — nothing may write to the repository while it is being committed. Restart what you still need.`;
        let pushed: VmPushResult;
        try {
          pushed = await pushWork(title || `wip(${job.commitRef}): agent update`);
        } catch (err) {
          const detail = `push failed: ${(err as Error).message}`;
          return {
            result: { error: jobsNote ? `${detail} ${jobsNote}` : detail },
            success: false,
          };
        }
        const res = await cp.callTool("create_pr", {
          args: { title, body },
          pushed,
          jobsNote,
          /**
           * LA BRANCHE, remontée plutôt que relue — et c'est ce qui fait que le
           * tool marche du premier coup. `agent_runs.branch_name` n'est stampé
           * qu'APRÈS un push réel (MIN-123), or ce push-ci est justement le
           * premier du run dans le cas normal : la fonction lirait alors une
           * branche nulle et ouvrirait la pull request sur une tête vide.
           */
          workBranch: job.workBranch,
        });
        return { result: res.result, success: res.success };
      }
    : null;

  // ── Le dépôt ───────────────────────────────────────────────────────────────
  /** Le dernier `authUrl` connu. Re-résolu avant chaque push : un tour dure des
   *  heures, un token d'installation de forge une heure. */
  let authUrl = job.authUrl;
  /**
   * Les secrets du tour (MIN-239) : chaque token de forge que cette microVM a vu.
   * `git clone` a écrit l'URL de clone dans `.git/config`, et trois tools l'en
   * sortent — la substitution est ce qui l'empêche d'aller se poser dans
   * `agent_run_events` et dans le checkpoint. Le registre est cumulatif : le token
   * du clone reste lisible dans `.git/config` longtemps après avoir été remplacé
   * ici par un frais.
   */
  const secrets = new SecretRedactor();
  secrets.addAuthUrl(authUrl);
  async function pushWork(message: string): Promise<VmPushResult> {
    authUrl = (await cp.repoAuthUrl()) ?? authUrl;
    secrets.addAuthUrl(authUrl);
    return await commitAndPush(host, {
      authUrl,
      workBranch: job.workBranch,
      baseBranch: job.baseBranch,
      message,
    });
  }

  // ── Sous-agents : de vraies promesses, du même process ─────────────────────
  /**
   * CE QUI CHANGE ICI, et c'est le plus visible du ticket. Une fille n'a plus à
   * sauver son historique pour survivre à la fin d'un chunk : sa promesse vit
   * aussi longtemps que le tour. Donc plus de `suspendAll`, plus de `restore`,
   * plus de `SubagentRecord` sérialisé, plus d'admission de chunk.
   *
   * CE QUI NE CHANGE PAS : le plafond `maxParallel` (une limite de CPU et de
   * coût, pas de chunk), le plafond de rounds cumulé, et le compteur de dépense
   * partagé. Ils voyagent avec la boucle.
   */
  let repoInstructionsForSubagent: Promise<{ message: string; bytes: number } | null> | null = null;
  const subagentRepoInstructions = () => {
    repoInstructionsForSubagent ??= readRepoInstructions(host).catch(() => null);
    return repoInstructionsForSubagent;
  };

  const subagentRunner: SubagentRunner = {
    run: async (jobOpts): Promise<SubagentRunResult> => {
      const roundsLeft = subagentRoundsLeft(jobOpts.roundsSoFar);
      if (roundsLeft <= 0) {
        const partial = lastAssistantText(jobOpts.resumeMessages ?? []);
        return {
          report:
            partial ||
            `No report: the sub-agent hit its ${SUBAGENT_MAX_ROUNDS}-round limit before saying anything useful. Do the work yourself, or spawn one with a narrower task.`,
          rounds: jobOpts.roundsSoFar ?? 0,
          costUsd: jobOpts.costSoFar ?? 0,
          status: "cut",
        };
      }
      const model = jobOpts.model ?? job.model;
      const childMessages: AgentChatMessage[] = [
        {
          role: "system",
          content: buildSubagentSystemPrompt({
            mode: jobOpts.mode,
            applyPatch: usesApplyPatch(model),
            webSearch: job.webSearch,
          }),
        },
      ];
      if (jobOpts.mode === "implement") {
        const repoInstructions = await subagentRepoInstructions();
        if (repoInstructions) {
          childMessages.push({ role: "user", content: repoInstructions.message });
        }
      }
      childMessages.push({
        role: "user",
        content: `${jobOpts.prompt}\n\n## What your report must contain\n${jobOpts.expectedOutput}`,
      });

      const childEmit: EmitAgentEvent = (type, payload) => {
        if (type === "tool_call") jobOpts.onRound();
        const id = payload.id;
        return emit(type, {
          ...payload,
          ...(typeof id === "string" ? { id: `${jobOpts.id}:${id}` } : {}),
          subagent_id: jobOpts.id,
          ...(jobOpts.parentCallId ? { parent_call_id: jobOpts.parentCallId } : {}),
          subagent_mode: jobOpts.mode,
        });
      };

      const result = await runAgentLoop({
        messages: childMessages,
        tools: subagentToolsFor(jobOpts.mode, { webSearch: job.webSearch, model }),
        model,
        // Le firewall pose la vraie clé après la sortie de la VM : ce que la
        // boucle envoie est un placeholder, et il est reconnaissable exprès.
        apiKey: job.llmPlaceholderKey,
        baseUrl: job.baseUrl,
        provider: job.provider,
        reasoningLevel: jobOpts.thinkingEffort ?? job.reasoningLevel,
        runId: job.ledgerRunId,
        // La VM ne choisit pas qui paye : le plan de contrôle impute au
        // `created_by` de la ligne du run. Ce champ ne sert qu'à satisfaire le
        // type de la boucle — il ne traverse pas le réseau.
        billTo: { unattributed: "resolved by the control plane" },
        feature: job.feature,
        projectId: job.projectId,
        recordUsage: cp.recordUsage,
        // Une fille est bornée par SON plafond et par ce qu'il reste au TOUR —
        // plus par un chunk qui la couperait au milieu.
        softDeadlineMs: Math.max(1_000, Math.min(SUBAGENT_MAX_MS, remainingMs())),
        budgetUsd,
        chunkSpend: turnSpend,
        onSpend: jobOpts.onSpend,
        contextWindow: jobOpts.model ? null : job.contextWindow,
        maxRounds: roundsLeft,
        usageSeqStart: jobOpts.resumeUsageSeq ?? subagentUsageSeq(jobOpts.slot),
        signal: jobOpts.signal,
        emit: childEmit,
        // Une fille lit le même `.git/config` que sa mère (MIN-239).
        redact: secrets.redact,
        execTool: makeExecTool({
          host,
          createPr: null,
          prTool: null,
          issueTool: null,
          scratchpadTool: null,
          webSearch,
          outputSeqBase: SUBAGENT_OUTPUT_SEQ_BASE + jobOpts.slot * 1000,
          background: null,
          instructions: { paths: [...REPO_INSTRUCTION_FILES], bytes: 0 },
          editedPaths,
          subagents: null,
          // Le temps restant du TOUR : c'est lui qui borne un `run_command`
          // maintenant, et il se compte en heures. Une commande n'est plus jamais
          // raccourcie parce qu'un chunk se termine.
          chunkRemainingMs: remainingMs,
        }),
      });

      const rounds = (jobOpts.roundsSoFar ?? 0) + result.rounds;
      const costUsd = (jobOpts.costSoFar ?? 0) + result.costUsd;
      const report = result.reply?.trim() || lastAssistantText(result.messages);
      // Plus de `suspended` possible : la fille n'a pas de chunk suivant où
      // reprendre, donc `awaitSubagents` ne le lui demande jamais (cf. plus bas).
      const status: SubagentRunResult["status"] =
        result.status === "completed" ? "done" : result.status === "error" ? "error" : "cut";
      return {
        report:
          report ||
          (result.errorMessage
            ? `No report: the sub-agent's model failed (${cap(result.errorMessage, 300)}).`
            : "No report: the sub-agent produced nothing before it stopped."),
        rounds,
        costUsd,
        status,
      };
    },
  };

  const subagents = new Subagents(subagentRunner, {
    maxParallel: job.subagents.maxParallel,
    favorites: job.subagents.favorites,
    ...(job.subagents.models
      ? {
          resolveModel: makeSubagentModelResolver({
            favorites: job.subagents.favorites,
            catalogIds: job.subagents.allowedIds,
            abovePlanIds: job.subagents.abovePlanIds,
            maxMultiplier: job.subagents.maxMultiplier,
          }),
        }
      : {}),
    seqBase: 0,
    /**
     * PLUS DE GARDE DE BUDGET-TEMPS, et c'est le défaut de MIN-212 qui disparaît
     * avec son objet. `budgetGuard` refusait un `spawn_agent` quand le chunk
     * n'avait plus de quoi faire tourner une fille pour de bon. Sans chunk, la
     * question ne se pose plus : ce qui reste au tour se compte en heures. Seul
     * le tout dernier quart d'heure (la fin du plafond mural) est refusé — une
     * fille lancée là serait coupée avant d'avoir rapporté.
     */
    budgetGuard: () => {
      const left = remainingMs();
      if (left >= 15 * 60_000) return null;
      return `This turn is close to its ${Math.round(VM_TURN_SOFT_DEADLINE_MS / 3_600_000)}-hour limit (${Math.max(0, Math.round(left / 60_000))} min left). A sub-agent launched now would be cut off before it could report. Finish what you can and reply.`;
    },
  });

  // ── Sauvegarde périodique du checkpoint ────────────────────────────────────
  /**
   * OÙ EN EST LE COMPTEUR DE `seq` DU LEDGER, et pourquoi il se suit à la main.
   *
   * `usageSeq` est la SEULE valeur du checkpoint que la boucle ne rende qu'à la
   * fin (`usageSeqEnd`). La sauvegarde périodique, elle, écrit au milieu — et y
   * poser `0` faisait repartir de zéro le tour qui reprend depuis elle
   * (`usageSeqStart = run.checkpoint?.usageSeq ?? …`, execute.ts : `0` n'est pas
   * nullish, donc c'est bien `0` qui gagne). Les lignes de ledger du tour repris
   * retombaient alors sur les `seq` du tour mort : rien n'est perdu (aucune
   * contrainte d'unicité, et la dépense se somme), mais l'ordre des appels d'un
   * run devenait faux, et c'est exactement ce qu'un `seq` sert à dire.
   *
   * PARENT SEULEMENT : les filles écrivent dans leur propre bande
   * (`subagentUsageSeq(slot)`), très au-dessus de celle du parent. Prendre le max
   * des deux propulserait le compteur du parent dans la bande des filles, ce qui
   * serait pire que le défaut qu'on corrige. D'où le wrapper posé sur le SEUL
   * `recordUsage` du parent — les filles gardent `cp.recordUsage` nu.
   */
  let usageSeqNow = job.usageSeqStart;
  const recordParentUsage = async (line: AgentUsageLine): Promise<void> => {
    // `+ 1` : la boucle écrit `seq: seq++`, donc `usageSeqEnd` est le prochain
    // numéro LIBRE. Le checkpoint porte cette même convention.
    if (line.seq >= usageSeqNow) usageSeqNow = line.seq + 1;
    await cp.recordUsage(line);
  };

  /**
   * ACCROCHÉE AU SOMMET D'UN ROUND, et pas à un timer, et c'est le point qui
   * compte. `messages` est muté PENDANT un round : un timer qui le sérialiserait
   * au mauvais moment écrirait un historique avec un `tool_call` sans son
   * `tool_result`, que le tour suivant rehydraterait pour se faire refuser par le
   * fournisseur. Au sommet d'un round, l'historique est toujours à une frontière
   * complète — et `pullSteering` est justement appelé là.
   */
  /**
   * Le plafond de dépense se relit en cours de tour (cf. `BUDGET_REFRESH_INTERVAL_MS`).
   * Throttlé ICI et pas dans la boucle : c'est l'appelant qui sait ce que la
   * lecture coûte, la boucle ne fait qu'obéir — même partage que `recordUsage`.
   *
   * `null` = rien de neuf à dire (pas encore l'heure), ou lecture en panne : la
   * boucle garde alors son plafond courant.
   */
  let lastBudgetAt = Date.now();
  const maybeRefreshBudget = async (): Promise<number | null> => {
    if (Date.now() - lastBudgetAt < BUDGET_REFRESH_INTERVAL_MS) return null;
    lastBudgetAt = Date.now();
    return await cp.budgetRemaining();
  };

  let lastSaveAt = Date.now();
  /**
   * La conversation a été FERMÉE sous nous — annulée, ou conclue par quelqu'un
   * d'autre. Le plan de contrôle le dit en 409 sur la sauvegarde ; c'est le seul
   * signal qui parvienne ici, et il doit arrêter le tour comme un « Stop ».
   * Continuer, ce serait dépenser au nom d'une session qui n'existe plus.
   */
  let runClosed = false;
  const messages = job.messages;
  const maybeSaveCheckpoint = async (): Promise<void> => {
    if (Date.now() - lastSaveAt < CHECKPOINT_SAVE_INTERVAL_MS) return;
    lastSaveAt = Date.now();
    const fit = fitCheckpoint(buildCheckpoint(usageSeqNow), job.checkpointMaxBytes);
    if (!(await cp.saveCheckpointQuietly(fit.checkpoint))) runClosed = true;
  };

  function buildCheckpoint(usageSeqEnd: number): AgentCheckpoint {
    return {
      messages,
      usageSeq: usageSeqEnd,
      lastFilesSha: job.filesFromSha,
      instructions,
      ...(editedPaths.size > 0
        ? { editedPaths: [...editedPaths].slice(-CHECKPOINT_EDITED_PATHS_MAX) }
        : {}),
      ...(repoTouched ? { repoTouched: true } : {}),
      ...(prInlineComments > 0 ? { prInlineComments } : {}),
    };
  }

  // ── Fin de tour : type-check, diff, relecture puis clôture du plan ─────────
  const typeCheckBlock = async (budgetMs: number): Promise<string | null> => {
    if (editedPaths.size === 0 || budgetMs < TYPECHECK_MIN_BUDGET_MS) return null;
    const touched = [...editedPaths];
    editedPaths.clear();
    const at = Date.now();
    const block = await typeErrorsForTurn(host, touched).catch((err) => {
      console.error("[agent-vm] turn-end typecheck failed:", (err as Error).message);
      return null;
    });
    await emit("status", {
      phase: "type_check",
      durationMs: Date.now() - at,
      files: touched.length,
      errorsShown: block ? block.split("\n").filter((l) => /error TS\d+/.test(l)).length : 0,
    });
    return block;
  };

  const selfReviewBlock = async (budgetMs: number): Promise<string | null> => {
    if (selfReviewed || !repoTouched || budgetMs < SELF_REVIEW_MIN_BUDGET_MS) return null;
    selfReviewed = true;
    const at = Date.now();
    const { diff, porcelain } = await turnDiff(host, job.filesFromSha).catch(() => ({
      diff: "",
      porcelain: "",
    }));
    const block = formatSelfReview({ diff, porcelain });
    await emit("status", {
      phase: "self_review",
      durationMs: Date.now() - at,
      chars: block?.length ?? 0,
    });
    return block;
  };

  /** Auto-relecture du plan écrit ce tour (MIN-237) — cf. `plan-review.ts`. */
  const planReviewBlock = async (budgetMs: number): Promise<string | null> => {
    if (planReviewed || !planWrites.wrote || budgetMs < PLAN_REVIEW_MIN_BUDGET_MS) return null;
    planReviewed = true;
    const at = Date.now();
    const block = await planReviewForTurn(host, planWrites.markdown).catch(() => null);
    await emit("status", {
      phase: "plan_review",
      durationMs: Date.now() - at,
      chars: block?.length ?? 0,
    });
    return block;
  };

  /** Contrôle de clôture du plan écrit ce tour (MIN-236) — cf. `plan-closure.ts`.
   *  Le même que côté fonction : la garantie ne doit pas dépendre de `loop_in_vm`. */
  const planClosureBlock = async (budgetMs: number): Promise<string | null> => {
    if (planClosed || !planWrites.wrote || budgetMs < PLAN_CLOSURE_MIN_BUDGET_MS) return null;
    planClosed = true;
    const at = Date.now();
    const block = await planClosureForTurn(host, planWrites.markdown).catch(() => null);
    await emit("status", {
      phase: "plan_closure",
      durationMs: Date.now() - at,
      chars: block?.length ?? 0,
    });
    return block;
  };

  // ── La boucle ──────────────────────────────────────────────────────────────
  const result = await runAgentLoop({
    messages,
    tools: agentToolsFor({
      anchor: job.anchor,
      webSearch: job.webSearch,
      model: job.model,
      images: job.imageInput,
      subagentModels: job.subagents.models,
      chain: job.chain,
      interactive: job.interactive,
    }),
    model: job.model,
    apiKey: job.llmPlaceholderKey,
    baseUrl: job.baseUrl,
    provider: job.provider,
    reasoningLevel: job.reasoningLevel,
    runId: job.ledgerRunId,
    billTo: { unattributed: "resolved by the control plane" },
    feature: job.feature,
    projectId: job.projectId,
    // Le wrapper, pas `cp.recordUsage` nu : c'est lui qui tient le compteur de
    // `seq` que la sauvegarde périodique doit pouvoir écrire (cf. `usageSeqNow`).
    recordUsage: recordParentUsage,
    // PAS de soft-deadline de chunk : le plafond mural du TOUR, qui se compte en
    // heures et n'existe que pour rester sous les 24 h de la session de microVM.
    softDeadlineMs: VM_TURN_SOFT_DEADLINE_MS,
    maxRounds: VM_MAX_ROUNDS_PER_TURN,
    budgetUsd,
    // Le plafond d'entrée ne sait rien de ce que les AUTRES runs dépensent
    // pendant les heures que ce tour peut durer. Il se relit.
    refreshBudgetUsd: maybeRefreshBudget,
    chunkSpend: turnSpend,
    contextWindow: job.contextWindow,
    // Le token de forge ne sort ni dans un event ni dans le checkpoint (MIN-239).
    redact: secrets.redact,
    execTool: makeExecTool({
      host,
      createPr,
      prTool: job.anchor === "pr" ? platformTool : null,
      // Enveloppé pour NOTER le plan écrit ce tour (MIN-236) : les tools ticket
      // partent au plan de contrôle, donc c'est le seul endroit d'où la boucle voit
      // passer le markdown.
      issueTool: watchPlanWrites(platformTool, planWrites),
      scratchpadTool: platformTool,
      webSearch,
      outputSeqBase: 0,
      background,
      instructions,
      editedPaths,
      subagents,
      chunkRemainingMs: remainingMs,
    }),
    // Même chaîne et même ORDRE que côté fonction (cf. execute.ts pour le pourquoi
    // de chaque rang) : relecture du plan avant sa clôture, pour que le grep voie
    // les corrections que la relecture a fait faire.
    onTurnEnd: async ({ budgetMs }) => {
      if (editedPaths.size > 0) repoTouched = true;
      return (
        (await typeCheckBlock(budgetMs)) ??
        (await selfReviewBlock(budgetMs)) ??
        (await planReviewBlock(budgetMs)) ??
        (await planClosureBlock(budgetMs))
      );
    },
    // Le sommet de chaque round : on en profite pour sauvegarder, à une frontière
    // d'historique sûre (cf. `maybeSaveCheckpoint`).
    pullSteering: async () => {
      await maybeSaveCheckpoint();
      return await cp.pullSteering();
    },
    pullSubagentReports: async () => subagents.drainReports(),
    /**
     * Dernière chance de livrer avant la fin du tour. La différence avec la
     * fonction tient en une ligne : il n'y a plus de branche `suspend`. Une fille
     * encore en vol quand le tour se termine est COUPÉE et livre son rapport
     * partiel — il n'y a pas de chunk suivant où la reprendre, donc lui promettre
     * une reprise serait un mensonge. En pratique on n'y arrive presque jamais :
     * le budget qu'on lui oppose se compte en heures.
     */
    awaitSubagents: async ({ budgetMs }) => {
      const waited = await subagents.awaitReports(
        Math.max(0, budgetMs - SUBAGENT_CUT_MARGIN_MS),
        // L'utilisateur peut RÉVEILLER le parent pendant qu'il attend : son
        // message rompt l'attente sans toucher aux filles, qui continuent. Sans
        // cette sonde, un « où en es-tu ? » écrit pendant qu'une fille travaille
        // ne serait lu qu'au retour de celle-ci — jusqu'à dix minutes plus tard.
        () => cp.hasPendingMessages(),
      );
      if (waited.reports.length > 0 || waited.interrupted || subagents.pending() === 0) {
        return waited;
      }
      await subagents.cutAll("the turn reached its limit").catch(() => 0);
      return { reports: subagents.drainReports(), interrupted: false };
    },
    parkedForSubagents: job.parkedForSubagents,
    checkInterrupt: async () => runClosed || (await cp.checkInterrupt()),
    syncPlan: (steps) => cp.syncPlan(steps),
    emit,
    emitLive: (progress) => cp.emitLive(progress),
    usageSeqStart: job.usageSeqStart,
  });

  // ── Après la boucle ────────────────────────────────────────────────────────
  // Les filles d'abord : une fille en vol écrirait dans le dépôt pendant le
  // `git add -A`. Puis les jobs de fond, pour la même raison.
  await subagents.cutAll("the turn ended").catch(() => 0);
  let subagentCost = 0;
  for (const report of subagents.drainReports()) {
    result.messages.push({ role: "user", content: report.text });
    subagentCost += report.costUsd;
    await emit("status", { phase: "subagent_report", id: report.id, partial: true });
  }
  const unbilledSubagentCost = subagents.settleUnbilled();
  await background.stopAll().catch(() => 0);

  if (editedPaths.size > 0) repoTouched = true;

  // Le PUSH. Un échec ne perd pas le tour : il se dit, et le travail reste dans
  // la microVM (le tour suivant le re-poussera).
  const reply = result.reply?.trim() ?? "";
  let pushed: VmPushResult | null = null;
  let pushError: string | undefined;
  if (job.writesToRepo) {
    try {
      pushed = await pushWork(commitMessageFromReply(reply, job.commitRef));
    } catch (err) {
      // Un rejet de push recopie l'URL de push, token compris (MIN-239) — et ce
      // message remonte au plan de contrôle, qui l'écrit en `error_message`.
      pushError = secrets.redact((err as Error).message);
      console.error("[agent-vm] turn-end push failed:", pushError);
    }
  }

  /**
   * Le diff du tour, calculé par git ICI — la fonction n'a plus le dépôt sous la
   * main, et ne pourrait le demander qu'en RPC.
   *
   * SUR LA FIN DE TOUR NATURELLE SEULEMENT, et c'est un invariant, pas une
   * préférence : `lastFilesSha` est défini comme « le sha au dernier event
   * `files_changed` émis » (runs.ts), et il n'avance qu'en `completed` — la
   * baseline doit rester en place pour qu'un tour interrompu puis repris raconte
   * son diff d'un seul tenant. Émettre l'event sans avancer la baseline cassait
   * les deux moitiés du couple : le fil listait les fichiers à l'interruption,
   * puis les relistait au tour suivant. L'ancienne forme ne l'émet que là
   * (execute.ts), et le critère de bascule est que le fil raconte la même chose.
   */
  const changed =
    result.status === "completed" && pushed?.headSha && pushed.headSha !== job.filesFromSha
      ? await changedFiles(host, job.filesFromSha, pushed.headSha).catch(() => null)
      : null;

  const fit = fitCheckpoint(
    {
      ...buildCheckpoint(result.usageSeqEnd),
      // Le tour est FINI : `lastFilesSha` avance jusqu'à la tête poussée, et
      // l'état de TOUR (`editedPaths`, `repoTouched`) ne voyage pas — son
      // type-check et son auto-relecture ont parlé.
      ...(result.status === "completed"
        ? {
            lastFilesSha: pushed?.headSha || job.filesFromSha,
            editedPaths: undefined,
            repoTouched: undefined,
          }
        : {}),
    },
    job.checkpointMaxBytes,
  );

  /**
   * LA CAUSE D'UN `suspended`, ET ELLE EST DE TROIS SORTES — ce que cette forme
   * a d'abord écrasé en une.
   *
   * `suspended` n'a plus d'objet côté VM : il n'y a pas de chunk suivant où
   * reprendre, donc le tour s'arrête. Mais il s'arrête pour une raison, et les
   * trois ne se règlent pas pareil :
   *
   * - le plafond MURAL (12 h) ou le plafond de ROUNDS → `turnTooLong`. Rien à
   *   faire qu'un message de plus ;
   * - le FOURNISSEUR EN PANNE (`suspendReason: "transient_error"`, MIN-219) →
   *   `providerUnavailable`. Celui-là ne se corrige pas, il s'ATTEND : la
   *   fonction en tire un re-queue différé (cf. `vm-rest.ts`). Rendu anonyme, il
   *   faisait mourir le tour en annonçant une limite de durée qu'aucune horloge
   *   n'avait atteinte — la phrase exacte que MIN-219 existait pour supprimer.
   *
   * Le message du fournisseur voyage AVEC : la phrase qui se lit à l'écran vient
   * du code (`ERROR_CODE_KEYS`), donc l'écraser par une phrase fixe ne gagnait
   * rien et perdait le seul indice de ce qui est tombé.
   */
  const errorCode: VmTurnReport["errorCode"] =
    result.status === "suspended"
      ? result.suspendReason === "transient_error"
        ? "providerUnavailable"
        : "turnTooLong"
      : undefined;

  return {
    status:
      result.status === "suspended"
        ? "error"
        : (result.status as VmTurnReport["status"]),
    ...(reply ? { reply } : {}),
    ...(result.askedUser ? { askedUser: true } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(result.errorMessage ? { errorMessage: cap(result.errorMessage, 1000) } : {}),
    costUsd: result.costUsd + subagentCost + unbilledSubagentCost,
    checkpoint: fit.checkpoint,
    checkpointDropped: fit.dropped,
    checkpointBytes: fit.bytes,
    pushed,
    workBranch: job.workBranch,
    ...(pushError ? { pushError } : {}),
    ...(changed && changed.files.length > 0 ? { changed } : {}),
    // L'amorçage COMPRIS : la microVM tournait déjà pendant que la fonction la
    // réveillait et clonait le dépôt, et cette tranche-là ne tombait dans aucun
    // compteur (cf. `VmJob.bootstrapMs`).
    sandboxMs: job.bootstrapMs + (Date.now() - startedAt),
  };
}
