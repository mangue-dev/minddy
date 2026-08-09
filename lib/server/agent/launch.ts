import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { REPO_PROVIDERS, isRepoProviderId } from "@/lib/repo-providers";
import { insertEvents } from "@/lib/server/issue-events";
import {
  resolveAgentModel,
  resolveReasoningLevel,
  resolvePrReviewModel,
  AgentModelRequiredError,
} from "./model";
import { ensureModelInPlan } from "./model-plan";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { checkAgentQuota, type AgentQuota } from "./quota";
import { loadPrRunContext, type PrRunContext } from "./pr-run";
import { resolveProjectLinkForRepo } from "./repo-access";
import {
  createRun,
  activeRunForIssue,
  activeRunForPullRequest,
  activeRunForRoutine,
  inheritableWorkForIssue,
  insertRunMessage,
  bumpRunActivity,
  ActiveRunExistsError,
  type AgentRun,
  type AgentRunTrigger,
} from "./runs";
import { drainAgentRuns } from "./drain";
import { chainAgentDrain } from "./drain-chain";
import { syncIssueStatusOnAgentStart } from "./issue-status-sync";
import { handOffToHuman } from "@/lib/server/automations/hooks";
import { generateShortTitle } from "@/lib/server/short-title";
import { agentRunTitleSource } from "./run-title";

/**
 * Point d'entrée UNIQUE pour démarrer un run FROID (MIN-46 + MIN-68). Appelé par
 * tous les triggers de LANCEMENT (sidebar, clic droit, « demander des changements »,
 * chat numo). Résout et FIGE le modèle sur le run (cascade run > user > racine), fait
 * les pré-checks (dépôt lié, quota/BYOK, pas de run déjà actif), fait HÉRITER la PR
 * de l'issue si elle est encore pertinente, crée le run `queued`, puis kicke le drain
 * en `after()` (réponse immédiate à l'utilisateur).
 *
 * Froid = une run NEUVE : aucun checkpoint, aucun message LLM repris. Elle hérite
 * seulement de l'ARTEFACT (branche + PR) et du résumé de la run précédente, injectés
 * dans son prompt d'amorce par `execute.ts`. La reprise à CHAUD (même session, même
 * contexte) est un chemin distinct : `/steer`, depuis le composer d'une conversation.
 */

export type LaunchError =
  | "issueNotFound"
  | "prNotFound"
  | "prIncomplete"
  | "noRepo"
  | "unsupportedProvider"
  | "alreadyRunning"
  | "quotaExceeded"
  | "noModelForProvider"
  | "modelAbovePlan"
  | "promptRequired";

/**
 * De quoi écrire « Claude Opus 5 (×12) dépasse le plafond de votre plan Go (×4) ».
 * Le picker grise déjà ces modèles : ce refus-ci n'arrive qu'à un modèle choisi
 * AVANT (défaut perso enregistré, puis downgrade ou plafond réajusté), et il
 * doit donc se suffire à lui-même.
 */
export interface ModelAbovePlan {
  model: string;
  multiplier: number;
  limit: number;
  planId: string;
}

export type LaunchResult =
  | { ok: true; run: AgentRun }
  | {
      ok: false;
      error: LaunchError;
      run?: AgentRun;
      quota?: AgentQuota;
      modelLimit?: ModelAbovePlan;
    };

export interface LaunchAgentInput {
  /**
   * Ticket d'ancrage. ABSENT → run CARNET (MIN-84) : l'agent est découplé du
   * système de tickets — `projectId` (le dépôt à cloner) et `prompt` (la note,
   * son instruction) sont alors requis. Un run carnet n'a ni lignée ni héritage :
   * chaque lancement est une conversation autonome.
   */
  issueId?: string | null;
  /**
   * Pull request d'ancrage (MIN-168) : le run RELIT cette PR — il clone sa
   * branche de tête, lit le code et commente, sans jamais écrire dans le dépôt.
   * Exclusif avec `issueId` : une session de review n'occupe pas un ticket.
   * Le projet porteur est résolu ici, à partir du dépôt de la PR et des projets
   * accessibles à `userId`.
   */
  pullRequestId?: string | null;
  /** Projet du run carnet. Ignoré quand `issueId` est fourni (le projet vient du
   *  ticket). L'appelant a déjà vérifié l'appartenance au projet. */
  projectId?: string | null;
  userId: string;
  triggeredBy: AgentRunTrigger;
  /** Consigne libre en plus de l'issue (optionnelle) — ou LA note (run carnet). */
  prompt?: string | null;
  /** Modèle explicite = override/forçage (numo ou l'utilisateur). */
  model?: string | null;
  /** true si le modèle est imposé (numo « utilise tel modèle »). */
  forced?: boolean;
  /**
   * Niveau de raisonnement choisi au lancement (MIN-122). Absent → le défaut perso
   * de l'utilisateur, sinon `DEFAULT_REASONING_LEVEL` (`medium`). Aucune borne :
   * les quatre niveaux sont ouverts, y compris en quota minddy (cf.
   * `resolveReasoningLevel`).
   */
  reasoningLevel?: string | null;
  /**
   * Branche de base choisie au lancement (défaut : la branche par défaut du
   * dépôt). IGNORÉE si l'issue a une lignée vivante à hériter : la branche de
   * travail existe déjà, sa base ne se rechoisit pas.
   */
  baseBranch?: string | null;
  /**
   * Ce qu'on demande à l'agent, du point de vue du TICKET. Seul `implement`
   * (le défaut) fait passer le ticket « en cours » ; `plan` (« Générer un
   * plan » / « Vérifier le plan ») le CADRE sans le commencer, `verify`
   * (« Vérifier l'implémentation ») CONTRÔLE du travail déjà fait — un ticket
   * en revue doit y rester, pas régresser « en cours » — et `custom` porte une
   * consigne libre, dont on ne sait pas si elle est du travail.
   */
  intent?: AgentLaunchIntent;
  /**
   * Étape d'une CHAÎNE d'automatisation (MIN-147). Le run porte l'id de sa
   * chaîne — c'est par lui que le crochet de fin de run la retrouve — et le
   * plafond de dépense que la chaîne lui accorde, rendu exécutoire par la boucle
   * (`min(quota, run, chaîne)`) et pas seulement affiché.
   */
  chainId?: string | null;
  budgetUsd?: number | null;
  /**
   * Passage d'une ROUTINE (MIN-185). Un run de routine EST un run carnet — même
   * ancrage, même `create_pr`, même chemin de drain — auquel cette seule ligne
   * ajoute trois choses : la ligne de facture « Routines », le jeu de tools sans
   * `ask_user` ni `create_routine`, et l'exclusion de la liste des
   * conversations. `projectId` et `prompt` restent requis, comme tout run
   * carnet : la routine les fournit.
   */
  routineId?: string | null;
  /**
   * Titre DÉJÀ écrit du run, quand l'appelant en a un — le titre de la routine
   * (MIN-185). Il remplace la génération par petit modèle, qui est sautée dans
   * ce cas : un titre écrit une fois vaut mieux qu'un titre repayé chaque matin.
   */
  title?: string | null;
}

/**
 * Ce que le lancement fait au statut du ticket : cf. `intentStartsWork`.
 * `review` (MIN-168) est le seul qui ne parle pas d'un ticket du tout : il relit
 * une pull request.
 */
export type AgentLaunchIntent = "implement" | "plan" | "verify" | "custom" | "review";

/**
 * Le lancement fait-il DÉMARRER le ticket ? Seul « implémenter » est du travail
 * neuf : cadrer vient avant, vérifier vient après, une consigne écrite par
 * l'utilisateur (`custom`) peut être n'importe quoi, et relire (`review`) ne
 * touche même pas au dépôt — aucun des quatre ne doit déplacer le ticket.
 * `undefined` (appelant historique) vaut « implémenter ».
 */
export function intentStartsWork(intent: AgentLaunchIntent | undefined): boolean {
  return intent === undefined || intent === "implement";
}

export async function launchAgentRun(input: LaunchAgentInput): Promise<LaunchResult> {
  const service = getServiceClient();

  // Ancrage PULL REQUEST (MIN-168) : chemin à part de bout en bout — le projet
  // vient du dépôt, le modèle de `pr_review_model`, et rien n'est écrit sur un
  // ticket (ni statut, ni événement, ni héritage de branche).
  if (input.pullRequestId) return launchPrReviewRun(input, input.pullRequestId);

  const issueId = input.issueId ?? null;
  let projectId: string;
  // Titre du TICKET : la moitié durable de ce que le titreur résume (l'autre est
  // la consigne). Cf. `agentRunTitleSource`.
  let issueTitle: string | null = null;
  if (issueId) {
    const { data: issue } = await service
      .from("issues")
      .select("id, project_id, title")
      .is("deleted_at", null)
      .eq("id", issueId)
      .maybeSingle();
    if (!issue) return { ok: false, error: "issueNotFound" };
    projectId = (issue as { project_id: string }).project_id;
    issueTitle = (issue as { title: string | null }).title;
  } else {
    // Run CARNET : sans ticket, la note EST la mission — un run carnet sans
    // instruction n'aurait rien à faire (un run d'issue, si : le ticket).
    if (!input.projectId) return { ok: false, error: "issueNotFound" };
    if (!input.prompt?.trim()) return { ok: false, error: "promptRequired" };
    projectId = input.projectId;
  }

  const link = await getProjectLink(projectId);
  if (!link) return { ok: false, error: "noRepo" };
  // Le registre des providers fait autorité (MIN-69) : un provider connu avec la
  // capacité d'écriture (PR/MR) peut porter l'agent — github ET gitlab.
  if (!isRepoProviderId(link.provider) || !REPO_PROVIDERS[link.provider].capabilities.write) {
    return { ok: false, error: "unsupportedProvider" };
  }

  // « Un seul agent actif par ticket » est une règle du TICKET : les runs carnet,
  // indépendants les uns des autres, peuvent travailler en parallèle (chacun sur
  // sa branche). Le quota reste leur seul plafond.
  //
  // Une ROUTINE (MIN-185) retrouve cette règle, pour la même raison qu'un
  // ticket : un passage qui traîne ne doit pas se faire doubler par l'échéance
  // suivante — même instruction, même dépense, deux fois.
  if (issueId) {
    const active = await activeRunForIssue(issueId);
    if (active) return { ok: false, error: "alreadyRunning", run: active };
  } else if (input.routineId) {
    const active = await activeRunForRoutine(input.routineId);
    if (active) return { ok: false, error: "alreadyRunning", run: active };
  }

  const quota = await checkAgentQuota(input.userId);
  if (!quota.allowed) return { ok: false, error: "quotaExceeded", quota };

  // Titre de la conversation. TOUTE conversation en a un désormais, ticket
  // compris : la page Agents ne groupe plus les runs d'un ticket sous une
  // session unique, si bien que trois conversations du même ticket portaient
  // trois fois son titre, à la lettre près. Ce qui les distingue, c'est ce qu'on
  // a demandé — d'où le résumé du ticket ET de la consigne
  // (`agentRunTitleSource`), rendu à l'écran précédé de l'identifiant du ticket.
  //
  // Le résumé part MAINTENANT, en parallèle des résolutions qui suivent, et se
  // pose sur le run à sa création — ainsi la conversation n'existe jamais sans
  // son titre, et l'attente ne s'ajoute pas au lancement.
  //
  // Un passage de ROUTINE fait exception (MIN-185), et pour une raison qui coûte
  // cher : son titre est celui de la routine, écrit UNE fois à la création.
  // Le laisser passer ici ferait payer un appel de résumé à CHAQUE échéance —
  // tous les matins pour une routine quotidienne — afin de réécrire un titre
  // qu'on a déjà.
  const titleSource = agentRunTitleSource({ issueTitle, prompt: input.prompt });
  const titlePromise =
    !input.routineId && titleSource
      ? generateShortTitle({
          text: titleSource,
          kind: "note",
          // La note est écrite dans la langue de la personne, sans qu'on la
          // connaisse ici : le modèle la reprend telle quelle.
          locale: "auto",
          usage: {
            // Un titre de session est une dépense de l'agent, pas du chat.
            feature: "agent_code",
            userId: input.userId,
            projectId,
          },
        }).catch(() => null)
      : Promise.resolve(null);

  let model: string;
  try {
    const resolved = await resolveAgentModel({ perRunModel: input.model, userId: input.userId });
    model = resolved.model;
    // Plafond de modèle du plan (quota minddy uniquement) : il porte sur ce que
    // l'utilisateur a CHOISI — pas sur les défauts de minddy, dont l'instance
    // répond. Le picker grise déjà ces modèles ; ce refus attrape le cas où le
    // choix précède la contrainte (défaut perso enregistré, puis downgrade).
    if (resolved.chosenByUser) {
      await ensureModelInPlan({ userId: input.userId, model, mode: quota.mode });
    }
  } catch (err) {
    if (err instanceof AgentModelRequiredError) {
      return { ok: false, error: "noModelForProvider" };
    }
    if (isPlanLimitError(err) && err.code === "model_above_plan") {
      const p = err.params ?? {};
      return {
        ok: false,
        error: "modelAbovePlan",
        modelLimit: {
          model: String(p.model ?? ""),
          multiplier: Number(p.multiplier ?? 0),
          limit: Number(p.limit ?? 0),
          planId: String(p.plan ?? ""),
        },
      };
    }
    throw err;
  }

  // Niveau de raisonnement figé sur le run, comme le modèle : les chunks suivants
  // tournent dans d'autres invocations et doivent retrouver le même.
  const reasoningLevel = await resolveReasoningLevel({
    perRunLevel: input.reasoningLevel,
    userId: input.userId,
  });

  // Héritage du TRAVAIL (MIN-68, indexé sur la branche) : tant que la lignée de
  // l'issue est vivante (branche portée par une run, PR non mergée — ou pas de PR
  // du tout), la run froide repart de SA branche et porte ses `pr_*` dès la
  // création → `execute.ts` pousse sur la bonne branche et met à jour la MÊME PR
  // le cas échéant (une `closed` est rouverte au push). Après un merge, plus rien
  // à hériter : branche neuve.
  // Un run carnet n'hérite jamais : pas de lignée, branche neuve à chaque fois.
  const inherited = issueId ? await inheritableWorkForIssue(issueId) : null;

  let run: AgentRun;
  try {
    run = await createRun({
      projectId,
      issueId,
      repoLinkId: link.id,
      connectionId: link.connection_id,
      createdBy: input.userId,
      prompt: input.prompt ?? null,
      // Le titre fourni gagne : c'est celui de la routine, et il n'a rien à
      // attendre d'une génération qui n'a pas eu lieu.
      title: input.title?.trim() || (await titlePromise),
      model,
      modelForced: !!input.forced,
      reasoningLevel,
      keyMode: quota.mode,
      triggeredBy: input.triggeredBy,
      // Persisté depuis MIN-147 : sans lui, la chaîne ne peut pas savoir ce que
      // le run qui vient de finir FAISAIT. `undefined` vaut « implémenter »,
      // comme partout ailleurs (cf. `intentStartsWork`).
      intent: input.intent ?? "implement",
      chainId: input.chainId ?? null,
      budgetUsd: input.budgetUsd ?? null,
      routineId: input.routineId ?? null,
      branchName: inherited?.branchName ?? null,
      baseBranch: inherited ? inherited.baseBranch : input.baseBranch ?? null,
      prNumber: inherited?.prNumber ?? null,
      prUrl: inherited?.prUrl ?? null,
      prState: inherited?.prState ?? null,
    });
  } catch (err) {
    // Course perdue contre un lancement concurrent (double-clic, deux onglets) :
    // l'index unique a tranché. Même réponse que le pré-check, pas un 500.
    // (Inatteignable pour un run carnet : les NULL sont distincts dans l'index.)
    if (err instanceof ActiveRunExistsError && issueId) {
      const winner = await activeRunForIssue(issueId);
      return { ok: false, error: "alreadyRunning", run: winner ?? undefined };
    }
    throw err;
  }

  if (issueId) {
    // Trace dans le journal d'activité de l'issue : qui a lancé l'agent + le modèle.
    await insertEvents(service, [
      {
        issue_id: issueId,
        actor_id: input.userId,
        type: "agent_launched",
        to_value: model,
        // Acteur TECHNIQUE vs acteur AFFICHÉ (MIN-147) : le run part sous le
        // compte qui paye et dont vient la clé, mais c'est l'automatisation que
        // la timeline doit nommer — même vocabulaire que `via_smart_assign`.
        ...(input.triggeredBy === "automation" ? { via_automation: true } : {}),
      },
    ]);

    // Agent lancé → l'issue passe « en cours » (MIN-46). Deux exceptions :
    //  • run qui n'est pas du travail neuf (`intent` `plan`, `verify` ou
    //    `custom` — cadrer avant, contrôler après, consigne libre) : le ticket
    //    garde son statut, quel qu'il soit ;
    //  • la run hérite d'une PR encore en revue (open/draft) — c'est SON état qui
    //    gouverne le statut (in_review), on ne le fait pas régresser le temps d'une
    //    itération. Une PR refusée (closed → issue `todo`) repasse bien « en cours ».
    if (
      intentStartsWork(input.intent) &&
      inherited?.prState !== "open" &&
      inherited?.prState !== "draft"
    ) {
      await syncIssueStatusOnAgentStart({ issueId, actorId: input.userId });
    }

    // Un lancement MANUEL, quel que soit son mode, dit que quelqu'un prend le
    // ticket en main : la chaîne qui l'attendait en sursis s'annule (MIN-147).
    // Sans ça, seule l'implémentation était couverte — elle seule déplace le
    // ticket —, et lancer un plan ou une vérification à la main laissait le
    // sursis courir jusqu'au bout, pour repartir sur le travail qu'on venait de
    // prendre. Une chaîne qui TOURNE n'est pas concernée : là, c'est ce
    // lancement-ci qui est refusé (`alreadyRunning`, plus haut).
    if (input.triggeredBy !== "automation") handOffToHuman(issueId);
  }

  kickAgentDrain(service);
  return { ok: true, run };
}

/**
 * Lance une session de RELECTURE d'une pull request (MIN-168).
 *
 * Le chemin est distinct de bout en bout, et chaque écart au lancement d'un run
 * de ticket est une décision :
 *  - **le projet vient du DÉPÔT**, pas d'un ticket : une PR appartient à un
 *    dépôt, que plusieurs projets peuvent lier. On retient le premier lien dont
 *    le projet est accessible au lanceur (`resolveProjectLinkForRepo`) — c'est
 *    lui qui portera la RLS du run, et donc la visibilité de la session ;
 *  - **le modèle vient de `resolvePrReviewModel`**, délibérément distinct du
 *    modèle d'écriture (cf. `model.ts`) ;
 *  - **aucune écriture sur un ticket** : ni `agent_launched`, ni changement de
 *    statut, ni héritage de branche. La PR liée peut porter un ticket ; relire
 *    n'est pas travailler dessus ;
 *  - **un run actif par PR**, même règle que par ticket, pour la même raison.
 *
 * Les branches de la PR sont un PRÉREQUIS : sans elles, la sandbox n'a rien à
 * cloner. On refuse au lancement (`prIncomplete`) plutôt qu'au premier chunk —
 * un run mort-né coûte un claim et laisse une session vide à l'écran.
 */
async function launchPrReviewRun(
  input: LaunchAgentInput,
  pullRequestId: string,
): Promise<LaunchResult> {
  const pr = await loadPrRunContext(pullRequestId);
  if (!pr) return { ok: false, error: "prNotFound" };
  if (!isRepoProviderId(pr.provider) || !REPO_PROVIDERS[pr.provider].capabilities.write) {
    return { ok: false, error: "unsupportedProvider" };
  }
  // La base est indispensable (c'est elle qu'on clone, et le diff s'y adosse) ;
  // la tête, elle, se retrouve par la ref serveur de la PR même sur un fork —
  // d'où la seule exigence portée ici.
  if (!pr.baseBranch) return { ok: false, error: "prIncomplete" };

  const link = await resolveProjectLinkForRepo({
    userId: input.userId,
    provider: pr.provider,
    repoFullName: pr.repoFullName,
  });
  // Aucun projet accessible ne lie ce dépôt : du point de vue du lanceur, cette
  // PR n'existe pas. Même réponse que partout ailleurs (MIN-143).
  if (!link) return { ok: false, error: "prNotFound" };

  const active = await activeRunForPullRequest(pullRequestId);
  if (active) return { ok: false, error: "alreadyRunning", run: active };

  const quota = await checkAgentQuota(input.userId);
  if (!quota.allowed) return { ok: false, error: "quotaExceeded", quota };

  const { model, chosenByUser } = await resolvePrReviewModel({
    perCall: input.model,
    userId: input.userId,
  });
  // La review tourne sur la clé plateforme, donc sur le quota minddy : le
  // plafond de modèle du plan s'y applique, BYOK ou pas.
  if (chosenByUser) {
    try {
      await ensureModelInPlan({ userId: input.userId, model, mode: "platform" });
    } catch (err) {
      if (isPlanLimitError(err) && err.code === "model_above_plan") {
        const p = err.params ?? {};
        return {
          ok: false,
          error: "modelAbovePlan",
          modelLimit: {
            model: String(p.model ?? ""),
            multiplier: Number(p.multiplier ?? 0),
            limit: Number(p.limit ?? 0),
            planId: String(p.plan ?? ""),
          },
        };
      }
      throw err;
    }
  }

  const reasoningLevel = await resolveReasoningLevel({
    perRunLevel: input.reasoningLevel,
    userId: input.userId,
  });

  let run: AgentRun;
  try {
    run = await createRun({
      projectId: link.projectId,
      issueId: null,
      pullRequestId,
      // Le sha RELU par cette session : figé au lancement, comparé plus tard à la
      // tête courante pour savoir si relancer aurait quelque chose de neuf à lire.
      prHeadSha: pr.headSha,
      repoLinkId: link.linkId,
      connectionId: link.connectionId,
      createdBy: input.userId,
      prompt: input.prompt ?? null,
      // Titre de la session : celui de la pull request. Pas de résumé à générer —
      // contrairement à une note, une PR a déjà un titre écrit pour être lu.
      title: prSessionTitle(pr),
      model,
      modelForced: !!input.forced,
      reasoningLevel,
      keyMode: quota.mode,
      triggeredBy: input.triggeredBy,
      intent: "review",
      // La base sert de point de comparaison à `git diff` dans la sandbox.
      baseBranch: pr.baseBranch,
    });
  } catch (err) {
    // Course perdue contre un lancement concurrent : l'index unique a tranché.
    if (err instanceof ActiveRunExistsError) {
      const winner = await activeRunForPullRequest(pullRequestId);
      return { ok: false, error: "alreadyRunning", run: winner ?? undefined };
    }
    throw err;
  }

  kickAgentDrain(getServiceClient());
  return { ok: true, run };
}

/** Titre lisible d'une session de review — celui de la PR, à défaut son numéro. */
function prSessionTitle(pr: PrRunContext): string {
  const title = pr.title?.trim();
  return title ? `#${pr.number} ${title}` : `#${pr.number}`;
}

export type ContinueResult =
  | { ok: true; run: AgentRun; continued: boolean }
  | { ok: false; error: LaunchError; run?: AgentRun; quota?: AgentQuota };

/**
 * Démarre OU CONTINUE un run d'agent, pour les triggers CONVERSATIONNELS où « une
 * run tourne déjà » ne doit pas être une erreur (@numo en commentaire, chat numo) :
 *   • une run TRAVAILLE (queued/running) → le message lui parvient en STEERING, à
 *     chaud, drainé à la frontière de round ;
 *   • sinon (aucune run, ou la dernière est au repos) → nouvelle run FROIDE, qui
 *     hérite de la PR de l'issue.
 * Une run `completed` (au repos) n'est pas reprise ici : la reprise à chaud d'une
 * conversation existante se fait depuis le composer de SA conversation (`/steer`).
 */
export async function continueOrLaunchAgentRun(
  input: LaunchAgentInput,
): Promise<ContinueResult> {
  // Chemins conversationnels : un ticket (@numo dans un commentaire, chat numo)
  // et, depuis MIN-168, une PULL REQUEST (@numo dans son fil) — une session de
  // review qui tourne LIT déjà la PR, donc la question lui parvient en steering
  // au lieu d'ouvrir une seconde session sur le même diff. Un run carnet, lui, se
  // reprend par SA conversation (/steer), jamais par ce raccourci.
  const active = input.issueId
    ? await activeRunForIssue(input.issueId)
    : input.pullRequestId
      ? await activeRunForPullRequest(input.pullRequestId)
      : null;
  if (active) {
    const text = (input.prompt ?? "").trim();
    if (text) await insertRunMessage(active.id, input.userId, text);
    await bumpRunActivity(active.id);
    return { ok: true, run: active, continued: true };
  }
  const result = await launchAgentRun(input);
  return result.ok ? { ok: true, run: result.run, continued: false } : result;
}

/**
 * Kick basse latence : draine après la réponse HTTP (même invocation), puis
 * auto-invoque si du travail reste. Ne lève jamais — le cron (toutes les 2 min) est le filet.
 */
export function kickAgentDrain(service: SupabaseClient): void {
  after(async () => {
    try {
      const summary = await drainAgentRuns(service);
      if (summary.claimed > 0) await chainAgentDrain({ supabase: service, chain: 0 });
    } catch (err) {
      console.error("[agent-launch] kick drain failed:", (err as Error).message);
    }
  });
}
