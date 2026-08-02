import "server-only";

import { after } from "next/server";

import { getServiceClient } from "@/lib/supabase-service";
import { canUseAutomations } from "@/lib/server/entitlements";
import { activeRunForIssue, type AgentRunVerdict } from "@/lib/server/agent/runs";
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
  rulesToReplayOnRetry,
  simulateChain,
  type AutomationEvent,
  type AutomationIssueFacts,
  type AutomationRule,
} from "@/lib/automations";
import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import {
  advanceChain,
  chainForIssue,
  getChain,
  lastVerdictOfChain,
  openChain,
  retryChain,
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
  });
  return true;
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
  if (!project) return;

  const existing = params.chainId
    ? await getChain(params.chainId)
    : await chainForIssue(params.issueId);

  if (!project.automations_enabled) {
    // L'interrupteur a été coupé pendant qu'une chaîne tournait : on ne la laisse
    // pas en suspens, on l'arrête en le disant.
    if (existing && existing.status === "running") await haltChain(existing, "disabled");
    return;
  }
  if (!(await canUseAutomations(project.owner_id as string))) {
    if (existing && existing.status === "running") await haltChain(existing, "entitlement");
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
  if (!issueRow) return;
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
    if (existing && existing.status === "running") await haltChain(existing, "disabled");
    return;
  }

  // Une chaîne garée attend un HUMAIN : rien d'automatique ne la fait repartir.
  // La route de reprise la remet en `running` AVANT de rappeler le moteur.
  if (existing && existing.status !== "running") return;

  // Un run TRAVAILLE déjà sur le ticket : la chaîne est au milieu d'une étape,
  // et rien ne doit être décidé maintenant. Ce garde-fou est ICI, avant même de
  // regarder les règles, et pas juste avant de lancer : un changement de statut
  // manuel pendant qu'un run tourne ne matche aucune règle, et sans ce retour
  // la chaîne serait déclarée TERMINÉE alors que son étape court encore. (Sur le
  // chemin normal, `stampRun` a déjà rendu le run terminal quand le crochet
  // appelle : il n'y a donc rien d'actif et ce test laisse passer.)
  if (await activeRunForIssue(issue.id)) return;

  const categoryIds = await categoryIdsOf(issue.id);
  const facts = factsOf(issue, categoryIds);
  const projectKey = (project.key as string) ?? "";

  // ── Le verdict d'une vérification prime sur les règles ────────────────────
  if (existing && params.event.type === "run_finished" && params.event.intent === "verify") {
    const verdict = await lastVerdictOfChain(existing.id);
    if (verdict && !verdict.ok) {
      await handleFailedVerification({
        chain: existing,
        rules,
        verdict,
        issue,
        projectKey,
      });
      return;
    }
  }

  // ── Ce qui reste à jouer ──────────────────────────────────────────────────
  const rule = nextRule(rules, {
    event: params.event,
    issue: facts,
    playedRuleIds: existing?.played_rule_ids ?? [],
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
    if (existing) {
      if (params.event.type === "run_finished" && params.event.outcome === "failed") {
        await haltChain(existing, "run_failed");
      } else {
        await finishChain(existing);
      }
    }
    return;
  }

  // ── La chaîne ─────────────────────────────────────────────────────────────
  let chain = existing;
  if (!chain) {
    const ownerId = await resolveChainOwner(
      project.id as string,
      project.owner_id as string,
      issue.assignee_id,
    );
    chain = await openChain({
      projectId: project.id as string,
      issueId: issue.id,
      ownerId,
      preset: presetOfRules(rules),
    });
    // Null = une autre chaîne est née entre-temps (index unique). On rend la
    // main : c'est elle qui pilote maintenant.
    if (!chain) return;
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
