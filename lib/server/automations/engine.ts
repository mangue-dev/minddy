import "server-only";

import { after } from "next/server";

import { getServiceClient } from "@/lib/supabase-service";
import { canUseAutomations } from "@/lib/server/entitlements";
import {
  activeRunForIssue,
  requestInterrupt,
  type AgentRunVerdict,
} from "@/lib/server/agent/runs";
import { updateIssueFields } from "@/lib/server/update-issue";
import {
  automationModelFor,
  findImplementRule,
  isAutomationEffortEnabled,
  MAX_CHAIN_STEPS,
  MAX_VERIFICATION_RETRIES,
  nextRule,
  parseAutomationOverride,
  presetOfRules,
  rulesForIssue,
  rulesForProject,
  resolveAutomationStartDelayMinutes,
  rulesToReplayOnRetry,
  simulateChain,
  type AutomationEvent,
  type AutomationIssueFacts,
  type AutomationRule,
  type AutomationSource,
} from "@/lib/automations";
import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import {
  advanceChain,
  cancelPendingChain,
  chainForIssue,
  getChain,
  lastVerdictOfChain,
  openChain,
  retryChain,
  startPendingChain,
  type AgentChain,
} from "./chain";
import { runAction } from "./actions";
import { captureChainStarted, finishChain, haltChain } from "./report";

/**
 * Le MOTEUR des automatisations (MIN-147), calqué sur `lib/server/smart-assign.ts` :
 * un point d'entrée fire-and-forget qui ne fait rien d'autre que programmer le
 * travail après la réponse, et une exécution qui RE-VÉRIFIE TOUT au moment où
 * elle tourne. Le monde a pu bouger entre la programmation et l'exécution —
 * interrupteur coupé, projet supprimé, ticket re-trié, budget épuisé, run relancé
 * à la main — et chacun de ces cas doit être un no-op silencieux, pas une panne.
 *
 * Il ne joue QU'UNE règle par événement (cf. `nextRule`) : l'action lancée
 * produira elle-même l'événement suivant, soit en finissant son run (crochet de
 * fin de run), soit en changeant le statut (crochet de statut). C'est ce qui rend
 * la boucle observable — chaque étape laisse une trace en base avant la suivante.
 */

export interface AutomationRunParams {
  issueId: string;
  projectId: string;
  event: AutomationEvent;
  /**
   * Chaîne concernée quand l'appelant la connaît (crochet de fin de run,
   * reprise humaine). Absent → celle du ticket, s'il en a une vivante.
   */
  chainId?: string | null;
  /**
   * L'appel vient du BALAYEUR (cron) ou d'un « Lancer maintenant » : il réveille
   * une chaîne en sursis. C'est le seul chemin qui a le droit de la démarrer, et
   * il re-vérifie d'abord que la condition qui l'a ouverte tient toujours.
   */
  startPending?: boolean;
}

/**
 * Point d'entrée fire-and-forget. Hors du chemin critique, comme
 * `scheduleSmartAssign` — et avec le même filet que `update-issue` : hors d'une
 * requête (le moteur s'appelle lui-même en cascade), `after()` lève, et le
 * travail part alors directement.
 */
export function scheduleAutomations(params: AutomationRunParams): void {
  const go = () =>
    runAutomations(params).catch((e) =>
      console.error("[automations] run failed:", (e as Error).message),
    );
  try {
    after(go);
  } catch {
    void go();
  }
}

/**
 * Les statuts qui disent « ce ticket n'est plus en travail » : rangé, abandonné,
 * ou fait à la main. `todo`, `in_progress` et `in_review` en sont absents — ce
 * sont ceux que la chaîne traverse elle-même.
 */
const CHAIN_STAND_DOWN_STATUSES: IssueStatus[] = [
  "backlog",
  "triage",
  "canceled",
  "duplicate",
  "done",
];

/** Origines qui valent « quelqu'un a repris la main » — cf. `AUTOMATION_SOURCES`. */
const HUMAN_STAND_DOWN_SOURCES: AutomationSource[] = ["web", "numo"];

interface IssueRow {
  id: string;
  number: number;
  title: string;
  plan: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  automation_override: unknown;
}

/**
 * Acteur TECHNIQUE de la chaîne : l'assigné du ticket s'il est de l'équipe,
 * sinon le owner du projet. C'est de lui que viennent la clé BYOK, le quota, la
 * langue et les notifications — pas de qui a cliqué, puisque personne n'a cliqué.
 * L'acteur AFFICHÉ, lui, est l'automatisation (`via_automation`).
 */
async function resolveChainOwner(
  projectId: string,
  ownerId: string,
  assigneeId: string | null,
): Promise<string> {
  if (!assigneeId || assigneeId === ownerId) return ownerId;
  const service = getServiceClient();
  const { data } = await service
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", assigneeId)
    .maybeSingle();
  return data ? assigneeId : ownerId;
}

/**
 * Le `user_metadata` du propriétaire du projet — c'est là que vit son préréglage
 * d'automatisation. Best-effort : un compte illisible vaut « aucun préréglage »
 * (donc aucune règle, donc rien ne se déclenche), jamais une panne.
 */
async function ownerMetadata(ownerId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await getServiceClient().auth.admin.getUserById(ownerId);
    return (data?.user?.user_metadata ?? null) as Record<string, unknown> | null;
  } catch (err) {
    console.error("[automations] owner metadata read failed:", (err as Error).message);
    return null;
  }
}

async function categoryIdsOf(issueId: string): Promise<string[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", issueId);
  return ((data ?? []) as Array<{ category_id: string }>).map((r) => r.category_id);
}

/**
 * Une vérification d'implémentation qui dit NON. Une reprise, et une seule : la
 * relance porte le rapport en consigne, donc elle sait quoi corriger ; un
 * deuxième échec sur le même sujet dit que le ticket a besoin d'un humain, pas
 * d'un tour de plus — arrêt, ticket en triage, rapport en commentaire.
 *
 * Rend `true` quand il a pris la main : le moteur ne consulte alors pas les
 * règles (elles rejoueraient l'étape suivante d'un travail qu'on vient de juger
 * non fait).
 */
async function handleFailedVerification(params: {
  chain: AgentChain;
  rules: readonly AutomationRule[];
  verdict: AgentRunVerdict;
  issue: IssueRow;
  projectKey: string;
  /** Modèle réglé pour la TAILLE de ce ticket. À passer comme sur le chemin
   *  normal : une reprise reste une étape de la même chaîne, sur le même
   *  ticket — la reprendre avec un autre modèle que celui que l'utilisateur a
   *  choisi pour cette taille n'aurait aucune raison d'être. */
  model: string | null;
}): Promise<boolean> {
  const { chain, verdict, issue } = params;

  if (chain.retries >= MAX_VERIFICATION_RETRIES) {
    await haltChain(chain, "verification_failed", {
      verdictSummary: verdict.summary,
      verdictBlockers: verdict.blockers,
    });
    // Le ticket remonte en triage : c'est l'endroit du produit qui dit
    // « quelqu'un doit regarder ça », et la chaîne n'a plus rien à en faire.
    await updateIssueFields({
      issueId: issue.id,
      actorId: chain.owner_id,
      input: { status: "triage" },
      viaAssistant: true,
      viaAutomation: true,
    });
    return true;
  }

  const retried = await retryChain(chain, rulesToReplayOnRetry(params.rules));
  if (!retried) return true;

  // On rejoue la règle d'implémentation — celle que `retryChain` vient de
  // démarquer — avec le rapport de vérification en consigne supplémentaire.
  const rule = findImplementRule(params.rules, {
    issue: factsOf(issue, await categoryIdsOf(issue.id)),
    playedRuleIds: retried.played_rule_ids,
  });
  if (!rule) {
    await haltChain(retried, "verification_failed", {
      verdictSummary: verdict.summary,
      verdictBlockers: verdict.blockers,
    });
    return true;
  }
  const advanced = await advanceChain(retried, rule.id);
  if (!advanced) return true;
  await runAction({
    chain: advanced,
    action: rule.then[0],
    issue: { ...issue, project_key: params.projectKey },
    extraPrompt: [
      verdict.summary,
      ...(verdict.blockers ?? []).map((b) => `- ${b}`),
    ]
      .filter(Boolean)
      .join("\n"),
    model: params.model,
  });
  return true;
}

/**
 * Éteint une chaîne, quelle que soit sa forme. Une chaîne EN SURSIS s'annule en
 * silence : elle n'a rien joué, rien dépensé, et un rapport « la chaîne s'est
 * arrêtée » pour un travail jamais commencé serait du bruit sur le ticket. Une
 * chaîne qui TOURNE, elle, s'arrête en le disant.
 *
 * Sans ce point de passage, un projet désarmé pendant un sursis laissait la
 * chaîne `pending` pour toujours — et l'index unique par ticket avec elle.
 */
async function shutDownChain(chain: AgentChain, reason: string): Promise<void> {
  // Les TROIS statuts vivants, pas deux : `awaiting_human` était oublié, alors
  // que `stopChain` l'accepte parfaitement. Désarmer le projet, perdre le
  // budget, retirer le préréglage ou poser « ne pas automatiser » sur le ticket
  // pendant qu'une chaîne était garée la laissait garée POUR TOUJOURS — et avec
  // elle l'index unique du ticket, donc plus aucune automatisation possible.
  if (chain.status === "pending") await cancelPendingChain(chain.id, reason);
  else await haltChain(chain, reason);
}

function factsOf(issue: IssueRow, categoryIds: string[]): AutomationIssueFacts {
  return {
    status: issue.status,
    effort: issue.effort,
    priority: issue.priority,
    plan: issue.plan,
    assigneeId: issue.assignee_id,
    categoryIds,
  };
}

export async function runAutomations(params: AutomationRunParams): Promise<void> {
  const service = getServiceClient();

  // ── Le monde, re-vérifié à l'exécution ────────────────────────────────────
  const { data: project } = await service
    .from("projects")
    .select("id, key, owner_id, automations_enabled, automations")
    .eq("id", params.projectId)
    .is("deleted_at", null)
    .maybeSingle();

  const existing = params.chainId
    ? await getChain(params.chainId)
    : await chainForIssue(params.issueId);

  // Projet à la corbeille : la chaîne n'a plus d'objet. L'abandonner telle
  // quelle la laissait vivante à jamais — et, pire, en tête de la file du
  // balayeur (triée par ancienneté), où une poignée de chaînes mortes suffisait
  // à affamer TOUTES les automatisations de la plateforme.
  if (!project) {
    if (existing) await shutDownChain(existing, "gone");
    return;
  }

  if (!project.automations_enabled) {
    // L'interrupteur a été coupé pendant qu'une chaîne tournait : on ne la laisse
    // pas en suspens, on l'arrête en le disant.
    if (existing) await shutDownChain(existing, "disabled");
    return;
  }
  if (!(await canUseAutomations(project.owner_id as string))) {
    if (existing) await shutDownChain(existing, "entitlement");
    return;
  }

  const { data: issueRow } = await service
    .from("issues")
    .select(
      "id, number, title, plan, status, priority, effort, assignee_id, automation_override",
    )
    .eq("id", params.issueId)
    .is("deleted_at", null)
    .maybeSingle();
  // Ticket à la corbeille : même raison, même remède. Et sans ça, une
  // restauration avant la purge réveillait une chaîne vieille de plusieurs
  // jours, qui lançait un run que plus personne n'attendait.
  if (!issueRow) {
    if (existing) await shutDownChain(existing, "gone");
    return;
  }
  const issue = issueRow as IssueRow;

  const override = parseAutomationOverride(issue.automation_override);
  const ownerMeta = await ownerMetadata(project.owner_id as string);
  // Cascade ticket > projet > compte : le forçage du ticket gagne, sinon les
  // règles écrites sur le projet (API/MCP), sinon le préréglage du PROPRIÉTAIRE
  // du projet — c'est lui qui paie et lui seul qui a pu armer ce projet.
  const rules = rulesForIssue(rulesForProject(project.automations, ownerMeta), override);

  // Efforts couverts : un ticket d'une taille éteinte au compte ne déclenche
  // rien. Testé APRÈS les règles (l'un dit quoi jouer, l'autre sur quoi), et
  // AVANT tout le reste — c'est un refus, pas un arrêt : si une chaîne tournait
  // déjà, elle a été ouverte quand la taille était autorisée, et on la laisse
  // finir plutôt que de l'abandonner à mi-parcours.
  if (!existing && !isAutomationEffortEnabled(ownerMeta, issue.effort)) return;
  if (rules.length === 0) {
    if (existing) await shutDownChain(existing, "disabled");
    return;
  }

  // ── L'HUMAIN A REPRIS LE TICKET ───────────────────────────────────────────
  // La garde la plus importante du système, et celle qui manquait.
  //
  // Le sursis ne protège que l'AMORÇAGE : à partir de l'étape 2, la chaîne
  // décide sur des déclencheurs `run_finished`, dont les conditions ne portent
  // que sur le ticket (effort, priorité, plan…) et JAMAIS sur son statut. Une
  // chaîne engagée ne regardait donc plus jamais où en était son ticket — et le
  // crochet de statut ne rattrapait rien, puisqu'il sort tôt quand un run
  // travaille. Conséquence mesurée : on annule un ticket à la main, l'étape en
  // cours finit, la suivante part quand même, et `syncIssueStatusOnAgentStart`
  // ÉCRASE l'annulation en le repassant « en cours ».
  //
  // La règle : un geste HUMAIN qui sort le ticket du travail en cours retire la
  // chaîne. Restreint aux origines humaines à dessein — le cycle de vie d'un run
  // écrit lui aussi des statuts (`done` à la fusion d'une PR), et la boucle ne
  // doit pas s'arrêter sur sa propre réussite.
  if (
    existing &&
    params.event.type === "status_changed" &&
    HUMAN_STAND_DOWN_SOURCES.includes(params.event.source ?? "web") &&
    CHAIN_STAND_DOWN_STATUSES.includes(params.event.to)
  ) {
    // Le run en cours part avec elle : le laisser finir, c'est continuer à
    // dépenser sur un ticket que son propriétaire vient de ranger.
    const working = await activeRunForIssue(issue.id);
    if (working?.chain_id === existing.id) await requestInterrupt(working.id);
    await shutDownChain(existing, "taken_over");
    return;
  }

  // Un run TRAVAILLE déjà sur le ticket : rien ne doit être décidé maintenant.
  // Ce garde-fou est ICI, AVANT le réveil d'un sursis et avant les règles.
  //
  // Avant le sursis, parce que réveiller d'abord et abandonner ensuite laissait
  // une chaîne `running` à l'étape 0, sans run à elle : plus jamais balayée (elle
  // n'est plus `pending`), plus jamais avancée (aucun run de chaîne ne finira), et
  // occupant l'index unique du ticket pour toujours. Laissée `pending`, elle est
  // simplement reproposée au balayage suivant.
  //
  // Avant les règles, parce qu'un changement de statut manuel pendant qu'un run
  // tourne ne matche aucune règle : sans ce retour, la chaîne serait déclarée
  // TERMINÉE alors que son étape court encore. (Sur le chemin normal, `stampRun`
  // a déjà rendu le run terminal quand le crochet appelle : rien n'est actif et
  // ce test laisse passer.)
  if (await activeRunForIssue(issue.id)) return;

  // ── La chaîne EN SURSIS ───────────────────────────────────────────────────
  // Sémantique du `for:` des alertes : la condition doit tenir EN CONTINU. Au
  // réveil, le ticket doit toujours être dans le statut qui a ouvert la chaîne.
  // C'est ce test qui couvre « j'ai copié le prompt d'implémentation » (la copie
  // déplace le ticket en `in_progress`), « je l'ai remis en backlog », « je l'ai
  // classé ». Les gestes manuels qui NE déplacent PAS le ticket — copier le
  // prompt de plan, lancer un plan ou une vérification à la main — n'y sont pas
  // visibles : ceux-là annulent la chaîne à la source (cf. `handOffToHuman`).
  let live = existing;
  let startedFromPending = false;
  if (live && live.status === "pending") {
    if (params.startPending) {
      if (live.pending_event && live.pending_event.to !== issue.status) {
        await cancelPendingChain(live.id, "superseded");
        return;
      }
      const started = await startPendingChain(live.id);
      if (!started) return; // un autre l'a réveillée, ou annulée
      live = started;
      startedFromPending = true;
    } else if (
      params.event.type === "status_changed" &&
      live.pending_event &&
      params.event.to !== live.pending_event.to
    ) {
      // Le ticket est parti ailleurs pendant le sursis : la chaîne en attente
      // n'a plus lieu d'être. On l'annule EN SILENCE (elle n'a rien joué, rien
      // dépensé) et on laisse le nouveau statut être évalué pour lui-même.
      await cancelPendingChain(live.id, "superseded");
      live = null;
    } else {
      return;
    }
  }

  // Une chaîne garée attend un HUMAIN : rien d'automatique ne la fait repartir.
  // La route de reprise la remet en `running` AVANT de rappeler le moteur.
  if (live && live.status !== "running") return;

  const categoryIds = await categoryIdsOf(issue.id);
  const facts = factsOf(issue, categoryIds);
  const projectKey = (project.key as string) ?? "";

  // Analytique d'ouverture d'une chaîne qui sortait de SURSIS : elle part au
  // vrai démarrage, pas à la mise en attente — une chaîne annulée pendant son
  // sursis n'a jamais commencé, et ne doit donc rien compter.
  if (startedFromPending && live) {
    captureChainStarted(live, {
      effort: issue.effort,
      plannedSteps: simulateChain(rules, facts, { throughHumanStop: true }).length,
    });
  }

  // ── Le verdict d'une vérification prime sur les règles ────────────────────
  if (live && params.event.type === "run_finished" && params.event.intent === "verify") {
    const verdict = await lastVerdictOfChain(live.id);
    if (verdict && !verdict.ok) {
      await handleFailedVerification({
        chain: live,
        rules,
        verdict,
        issue,
        projectKey,
        model: automationModelFor(ownerMeta, issue.effort),
      });
      return;
    }
  }

  // ── Ce qui reste à jouer ──────────────────────────────────────────────────
  const rule = nextRule(rules, {
    event: params.event,
    issue: facts,
    playedRuleIds: live?.played_rule_ids ?? [],
  });
  if (!rule) {
    // Plus rien à jouer — mais deux fins très différentes, qu'il faut distinguer
    // ICI parce que c'est le seul endroit qui voit encore l'événement. Un run
    // qui s'est terminé EN ÉCHEC ne matche aucune règle (les préréglages ne
    // réagissent qu'à `outcome: "ok"`) : sans ce test, la chaîne se déclarait
    // « allée au bout » — commentaire de rapport et analytics compris — alors
    // que son étape venait de mourir. C'est aussi ce qui rend enfin exécutoire
    // le motif `run_failed` (cf. `STOP_REASONS`), et ce que le routage de
    // `requeueStuckRuns` vers `stampRun` promettait : un run abandonné par le
    // balayeur ARRÊTE sa chaîne. (Sans chaîne, c'est simplement un événement
    // qui n'intéresse aucune règle.)
    if (live) {
      if (params.event.type === "run_finished" && params.event.outcome === "failed") {
        await haltChain(live, "run_failed");
      } else {
        await finishChain(live);
      }
    }
    return;
  }

  // ── La chaîne ─────────────────────────────────────────────────────────────
  let chain = live;
  if (!chain) {
    const ownerId = await resolveChainOwner(
      project.id as string,
      project.owner_id as string,
      issue.assignee_id,
    );
    // ── Le SURSIS ───────────────────────────────────────────────────────────
    // Un changement de statut ouvre la chaîne EN ATTENTE : elle ne démarrera
    // qu'au bout du délai, et seulement si le ticket y est encore. Le sursis ne
    // vaut que pour l'AMORÇAGE — la fin d'un run enchaîne l'étape suivante tout
    // de suite, puisqu'on est déjà engagé (et qu'on a déjà payé).
    const delayMin = resolveAutomationStartDelayMinutes(ownerMeta);
    const deferred =
      delayMin > 0 && params.event.type === "status_changed"
        ? {
            notBefore: new Date(Date.now() + delayMin * 60_000).toISOString(),
            pendingEvent: {
              to: params.event.to,
              source: params.event.source ?? "web",
            },
          }
        : null;
    chain = await openChain({
      projectId: project.id as string,
      issueId: issue.id,
      ownerId,
      preset: presetOfRules(rules),
      ...(deferred ?? {}),
    });
    // Null = une autre chaîne est née entre-temps (index unique). On rend la
    // main : c'est elle qui pilote maintenant.
    if (!chain) return;
    // En sursis : rien de plus ici. C'est le balayeur qui la rappellera, et
    // l'analytique d'ouverture part au VRAI démarrage, pas à la mise en attente.
    if (deferred) return;
    captureChainStarted(chain, {
      effort: issue.effort,
      plannedSteps: simulateChain(rules, facts, { throughHumanStop: true }).length,
    });
  }

  // ── Le garde-fou, juste avant de dépenser ─────────────────────────────────
  // Un seul : le compteur d'étapes (anti-runaway). PAS de plafond de dépense —
  // couper une chaîne au milieu n'est pas lisible pour qui la regarde ; c'est le
  // quota du compte qui borne, globalement et visiblement.
  if (chain.step >= MAX_CHAIN_STEPS) {
    await haltChain(chain, "max_steps");
    return;
  }

  // ── L'étape ───────────────────────────────────────────────────────────────
  // Compare-and-set : si un autre l'a jouée entre-temps, on ne lance rien.
  const advanced = await advanceChain(chain, rule.id);
  if (!advanced) return;

  await runAction({
    chain: advanced,
    action: rule.then[0],
    issue: { ...issue, project_key: projectKey },
    // Modèle choisi par TAILLE de ticket (réglage de compte). Il l'emporte sur
    // celui de la règle : c'est le réglage que l'utilisateur voit et manipule.
    model: automationModelFor(ownerMeta, issue.effort),
  });
}
