import "server-only";

import { recordSandboxUsage } from "@/lib/server/usage";
import { spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";

import { checkAgentQuota } from "./quota";
import { resolveRepoCloneTarget } from "./repo-access";
import { forgeFor } from "./forge";
import { revokeRunKey } from "./run-key";
import {
  notePrCommits,
  reopenIfRejectedWorkPushed,
  resolveRunPrefs,
  prRef,
  prTerm,
  MERGED_DURING_TURN_STRINGS,
  PUSH_FAILED_STRINGS,
  SANDBOX_USAGE_SEQ_BASE,
  type PrLandingContext,
} from "./pr-landing";
import {
  appendEvent,
  hasPendingRunMessages,
  clearInterrupt,
  notifyAgentRun,
  stampRun,
  type AgentRun,
} from "./runs";
import type { EmitAgentEvent } from "./agent-loop";
import type { VmTurnReport } from "./vm/protocol";

/**
 * LA MISE AU REPOS D'UN TOUR JOUÉ DANS LA MICROVM (MIN-224).
 *
 * La boucle a fini, a poussé son travail, et a rendu son rapport au plan de
 * contrôle. Tout ce qui suit demande la base et la forge — donc la fonction, et
 * pas la VM : l'événement `files_changed`, la réouverture d'une pull request
 * refusée, la mise au repos de la ligne, la notification, le métrage compute.
 *
 * CE QUI EST PLUS SIMPLE QU'AVANT, et c'est le dossier du ticket. `executeAgentRun`
 * a HUIT sorties de repos, parce qu'un chunk peut finir de huit façons — suspendu,
 * différé, à court de continuations, en attente d'un fournisseur en panne… Ici il
 * y en a QUATRE, et ce sont les seules qui aient jamais eu un sens pour
 * l'utilisateur : le tour a fini, il a été interrompu, il a échoué, ou le budget
 * est épuisé. Tout le reste était de la plomberie de découpage.
 *
 * CE QUI EST IDENTIQUE, et doit le rester : les mots, les events, l'ordre.
 * L'atterrissage sur la pull request passe par [pr-landing.ts](pr-landing.ts),
 * partagé avec l'ancienne forme — c'est ce qui rend vérifiable le critère de
 * bascule du cadrage (« le fil raconte la même chose sur le même ticket »).
 */

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/**
 * Fait atterrir le tour. Ne LÈVE jamais vers l'appelant HTTP sur un détail : ce
 * qui compte est que la ligne du run quitte `running`. Un event raté, une PR non
 * rouverte, une notification perdue sont des dégradations ; un run laissé
 * `running` est une conversation bloquée jusqu'au passage du chien de garde.
 */
export async function landVmTurn(run: AgentRun, report: VmTurnReport): Promise<void> {
  const emit: EmitAgentEvent = (type, payload) => appendEvent(run.id, type, payload);
  const nowIso = new Date().toISOString();

  const billTo: AiUsageBillTo = run.created_by
    ? { userId: run.created_by }
    : { unattributed: `run ${run.id} sans created_by` };

  /**
   * LE MÉTRAGE DE LA MICROVM, et il change de main ici (MIN-221 §3).
   *
   * `recordSandboxUsage` facturait le wall-clock du CHUNK depuis le `finally` de
   * la fonction. Sans chunk, plus personne ne tient cette horloge : c'est la
   * boucle qui la tient, dans la VM, du début à la fin du tour, et qui la remonte
   * dans son rapport. **C'est la moitié compute de la facture** — elle
   * disparaîtrait en silence si on l'oubliait, et personne ne s'en apercevrait
   * avant de comparer la marge à la facture Vercel.
   *
   * Écrit AVANT le reste : le reste peut échouer, cette ligne-là ne doit pas.
   */
  if (report.sandboxMs > 0) {
    await recordSandboxUsage({
      runId: run.run_id ?? run.id,
      // La bande de seq est celle des lignes `sandbox_compute` ; un tour = une
      // ligne, indexée par le compteur de tours qu'est `continuations` sur la
      // ligne du run (toujours 0 dans la nouvelle forme, mais la bande reste
      // celle-là pour qu'un run migré ne collisionne pas avec son passé).
      seq: SANDBOX_USAGE_SEQ_BASE + run.continuations,
      billTo,
      feature: run.routine_id ? "routine_compute" : "sandbox_compute",
      projectId: run.project_id,
      durationMs: report.sandboxMs,
    }).catch(() => {});
  }

  // Le checkpoint a dû lâcher la CONVERSATION pour tenir dans son gabarit : ça se
  // dit, sinon l'agent semble avoir tout oublié sans raison au tour suivant. Les
  // paliers d'avant (historiques de filles, images, sorties de tools) ne perdent
  // que du re-demandable et ne se disent pas.
  if (report.checkpointDropped.includes("history")) {
    await emit("error", {
      code: "turnHistoryReset",
      message:
        "This session's history grew too large to carry over and had to be reset. The work is kept; the next turn starts fresh.",
      dropped: report.checkpointDropped,
    });
  }

  const { locale } = await resolveRunPrefs(run);

  // Push raté → SIGNAL VISIBLE. Un rejet non-fast-forward n'est pas transitoire
  // (quelqu'un a poussé sur la branche de l'agent) : sans signal, chaque tour
  // re-échouerait en silence et l'utilisateur croirait le travail livré.
  if (report.pushError) {
    await emit("error", {
      message: (PUSH_FAILED_STRINGS[locale] ?? PUSH_FAILED_STRINGS.en)(
        cap(report.pushError, 300),
      ),
    });
  }

  // Atterrissage sur la pull request. Best-effort de bout en bout : le travail
  // est déjà sur le dépôt à ce stade, et un run qui reste `running` parce que la
  // forge répond 502 serait un mal bien pire.
  const prState = { number: run.pr_number, url: run.pr_url, state: run.pr_state };
  await landOnPullRequest(run, report, prState, emit, locale).catch((err) => {
    console.error("[agent-vm-rest] pull request landing failed:", (err as Error).message);
  });

  // Le diff du tour, calculé par git DANS la VM (la fonction n'a plus le dépôt).
  if (report.changed && report.changed.files.length > 0) {
    await emit("files_changed", {
      files: report.changed.files,
      truncated: report.changed.truncated,
    });
  }

  // ── La mise au repos ───────────────────────────────────────────────────────
  /**
   * Ce que la dépense du run vaut VRAIMENT, relu au ledger (MIN-215) plutôt que
   * cumulé sur la colonne. La colonne n'est écrite que par les sorties saines ;
   * le ledger, lui, est écrit appel par appel, y compris par un tour qui est mort
   * sans rien stamper. Le MAX des deux : ce sont deux minorants, le plus grand
   * est le plus vrai, et une dépense affichée ne doit jamais reculer.
   */
  const ledger = await spentFromLedger(run.run_id ?? run.id).catch(() => null);
  const newCost = Math.max(run.cost_usd + report.costUsd, ledger ?? 0);

  const restFields = {
    continuations: 0,
    attempts: 0,
    window_started_at: null,
    cost_usd: newCost,
    /**
     * Le checkpoint n'est écrit que si le rapport en porte un. Un rapport de
     * SECOURS (le tour a levé) n'en porte pas : celui qui est en base vient de la
     * sauvegarde périodique, à une frontière de round sûre, et l'écraser par
     * l'historique laissé au milieu d'un round donnerait au tour suivant un
     * `tool_call` sans son `tool_result` — plus la perte de `lastFilesSha`, donc
     * un diff de tour recalculé depuis la mauvaise base.
     */
    ...(report.checkpoint ? { checkpoint: report.checkpoint } : {}),
    // La microVM reste CHAUDE (le reaper la coupera après ~5 min d'inactivité) :
    // c'est ce qui rend la reprise à chaud instantanée sur le message suivant.
    sandbox_stopped_at: null,
    last_activity_at: nowIso,
    interrupt_requested: false,
    awaiting_input: false,
    // Le process de boucle est fini. Laisser son id sur la ligne ferait constater
    // au chien de garde un décès sur un run déjà au repos, à chaque passage.
    loop_command_id: null,
  } satisfies Partial<Parameters<typeof stampRun>[1]>;

  /**
   * Un message de steering arrivé APRÈS la dernière frontière de round (pendant
   * le push, pendant ce rapport) : on RE-QUEUE au lieu de reposer, et le drain
   * relancera un tour qui le drainera aussitôt. Sans ça le message resterait en
   * file sans personne pour le lire — un utilisateur qui écrit et n'obtient rien.
   */
  const restStamp = async (extra: Partial<Parameters<typeof stampRun>[1]>): Promise<boolean> => {
    const pending = await hasPendingRunMessages(run.id).catch(() => false);
    await stampRun(run.id, {
      status: pending ? "queued" : "completed",
      ...restFields,
      ...(pending ? { not_before: new Date().toISOString() } : {}),
      ...extra,
    });
    return pending;
  };

  if (report.status === "budget_exhausted") {
    await emitBudgetExhausted(run, emit);
    // Volontairement PAS `restStamp` : celui-ci re-queue s'il reste du steering,
    // ce qui relancerait aussitôt un tour sans budget. Le message attend.
    await stampRun(run.id, { status: "completed", ...restFields });
    await notifyAgentRun(run, "agent_failed");
    await revokeKey(run);
    return;
  }

  if (report.status === "interrupted") {
    await clearInterrupt(run.id).catch(() => {});
    await restStamp({});
    await revokeKey(run);
    return;
  }

  if (report.status === "error") {
    const pending = await restStamp({
      error_message: report.errorMessage ? cap(report.errorMessage, 1000) : null,
    });
    if (!pending) await notifyAgentRun(run, "agent_failed");
    await revokeKey(run);
    return;
  }

  // Fin de tour NATURELLE.
  const pending = await restStamp({
    outcome: report.reply ? cap(report.reply, 4000) : null,
    // Tour terminé sur un `ask_user` → la session ATTEND : point jaune sur les
    // surfaces tant que l'utilisateur n'a pas répondu.
    ...(report.askedUser ? { awaiting_input: true } : {}),
    ...(report.pushError ? { error_message: cap(report.pushError, 1000) } : {}),
  });
  if (!pending) {
    await notifyAgentRun(run, report.askedUser ? "agent_question" : "agent_done");
  }
  await revokeKey(run);
}

/**
 * La clé LLM du run n'a plus personne pour s'en servir : le process de boucle est
 * mort. Révoquée ici plutôt qu'attendue au reaper d'inactivité — celui-ci la
 * révoque aussi (cinq minutes plus tard), mais entre les deux la clé reste vivante
 * sur une microVM que le modèle peut encore atteindre s'il a laissé un job de
 * fond. Best-effort et idempotent.
 */
async function revokeKey(run: AgentRun): Promise<void> {
  if (!run.provider_key_id) return;
  await revokeRunKey(run.provider_key_id).catch(() => {});
  await stampRun(run.id, { provider_key_id: null }, { guard: ["completed", "queued"] }).catch(
    () => {},
  );
}

/**
 * Ce que le push du tour change côté pull request : la branche enregistrée au
 * premier push réel, la PR refusée rouverte, les commits tracés au ticket, et la
 * note du cas particulier — une PR fusionnée PENDANT le tour, dont le travail
 * poussé n'appartient plus à rien.
 */
async function landOnPullRequest(
  run: AgentRun,
  report: VmTurnReport,
  prState: { number: number | null; url: string | null; state: AgentRun["pr_state"] },
  emit: EmitAgentEvent,
  locale: Awaited<ReturnType<typeof resolveRunPrefs>>["locale"],
): Promise<void> {
  if (!report.pushed?.pushed) return;

  const target = await resolveRepoCloneTarget(run.project_id);
  if (!target) return;

  // La branche n'existe pour l'app qu'à partir du premier push RÉEL : c'est lui
  // qui la crée sur le dépôt (MIN-123).
  if (!run.branch_name && report.workBranch) {
    await stampRun(run.id, { branch_name: report.workBranch }).catch((err) => {
      console.error("[agent-vm-rest] branch stamp failed:", (err as Error).message);
    });
  }

  const issueIdentifier = await identifierOf(run);
  const ctx: PrLandingContext = {
    run,
    target,
    forge: forgeFor(target.provider),
    issue: issueIdentifier ? { identifier: issueIdentifier } : null,
    workBranch: report.workBranch || (run.branch_name ?? ""),
    baseBranch: run.base_branch ?? target.defaultBranch,
    locale,
    emit,
    prState,
  };

  await reopenIfRejectedWorkPushed(ctx, report.pushed, target.token);
  // APRÈS la réouverture : elle recale `prState` sur la base, donc un push qui
  // ressuscite une PR refusée se raconte sur la bonne PR.
  await notePrCommits(ctx, report.pushed);

  if (report.pushed.remoteUpdated && prState.state === "merged" && prState.number != null) {
    await emit("error", {
      message: (MERGED_DURING_TURN_STRINGS[locale] ?? MERGED_DURING_TURN_STRINGS.en)(
        prRef(target.provider, prState.number),
        prTerm(target.provider),
      ),
    });
  }
}

/** L'identifiant lisible du ticket du run (`MIN-42`), ou null hors run de ticket. */
async function identifierOf(run: AgentRun): Promise<string | null> {
  if (!run.issue_id) return null;
  const { getServiceClient } = await import("@/lib/supabase-service");
  const { data } = await getServiceClient()
    .from("issues")
    .select("number, projects(key)")
    .eq("id", run.issue_id)
    .maybeSingle();
  const row = data as { number?: number; projects?: { key?: string } | null } | null;
  return row?.projects?.key && row.number ? `${row.projects.key}-${row.number}` : null;
}

/**
 * La carte « budget épuisé », mot pour mot celle de l'ancienne forme : deux
 * causes derrière la même frontière, et elles ne se règlent pas pareil — le
 * budget du COMPTE est à zéro (attendre, monter de plan, passer en BYOK), ou
 * c'est le plafond posé sur CE run qui a mordu, et le compte va très bien.
 */
async function emitBudgetExhausted(run: AgentRun, emit: EmitAgentEvent): Promise<void> {
  const quota = await checkAgentQuota(run.created_by ?? "").catch(() => null);
  const accountRemainingUsd =
    quota && !quota.unlimited ? Math.max(0, quota.remaining ?? 0) : undefined;
  const runCapRemainingUsd =
    run.budget_usd == null ? undefined : Math.max(0, Number(run.budget_usd) - run.cost_usd);
  const cappedByRun =
    runCapRemainingUsd !== undefined &&
    (accountRemainingUsd === undefined || runCapRemainingUsd < accountRemainingUsd);
  await emit("quota_exhausted", {
    spent: quota?.spent ?? null,
    cap: quota?.cap ?? null,
    resetsAt: quota?.resetsAt ?? null,
    planId: quota?.planId ?? null,
    nextPlanId: quota?.nextPlanId ?? null,
    byok: quota?.mode === "byok",
    cause: cappedByRun ? "run_cap" : "account",
    capPercent:
      cappedByRun && quota?.cap && run.budget_usd != null
        ? Math.round((Number(run.budget_usd) / quota.cap) * 100)
        : null,
  });
}
