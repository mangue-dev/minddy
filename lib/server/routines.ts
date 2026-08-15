import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { softDeleteItem } from "@/lib/server/trash";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { ensureModelInPlan } from "@/lib/server/agent/model-plan";
import { checkAgentQuota } from "@/lib/server/agent/quota";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { isReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import {
  DEFAULT_MAX_SPEND_PERCENT,
  NO_SPEND_CAP_PERCENT,
  clampSpendPercent,
} from "@/lib/routine-budget";
import { generateShortTitle } from "@/lib/server/short-title";
import {
  RoutineScheduleError,
  assertSchedule,
  isRoutineFrequency,
  nextRunAt,
  type RoutineFrequency,
  type RoutineSchedule,
} from "@/lib/routine-schedule";

/**
 * La FABRIQUE des routines (MIN-185) — une seule, pour quatre portes.
 *
 * Le wizard, le chat Numo, l'agent Numo et le MCP savent tous poser une
 * routine ; aucun des quatre ne valide quoi que ce soit. Tout est ici : la
 * garde de propriété, le dépôt lié, la cohérence de la cadence, le plafond de
 * modèle du plan, le calcul du prochain passage. Même doctrine que la fabrique
 * de tickets de MIN-170 — quatre validations qui se ressemblent finissent par
 * diverger, et c'est la porte la moins parcourue qui laisse passer.
 *
 * **Seul le OWNER du projet crée, modifie ou supprime une routine.** Une
 * routine engage un budget tous les lundis matin sans que personne ne clique :
 * c'est à celui qui paye de la poser. Un membre la VOIT (la RLS de lecture est
 * `can_access_project`) et lit ses exécutions, mais l'écriture lui est refusée
 * en `403 ownerOnly` — exactement comme les réglages de projet
 * (`update-project.ts`) et l'invitation de membres (`members.ts`).
 *
 * **Aucune policy d'écriture en base** : tout passe par le service client
 * derrière ces gardes, doctrine `agent_runs` / `agent_chains`.
 *
 * **`ensureModelInPlan` est appelé À L'ENREGISTREMENT**, pas au lancement : un
 * modèle hors plan doit se refuser devant quelqu'un, pas à 13 h dans un cron
 * dont personne ne lit les logs.
 */

export interface Routine {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  prompt: string;
  model: string | null;
  reasoning_level: ReasoningLevel;
  base_branch: string | null;
  /**
   * Part du budget d'usage mensuel du plan qu'UN passage a le droit de dépenser
   * (1–100, 15 par défaut). Cf. `routineRunBudgetUsd`.
   */
  max_spend_percent: number;
  frequency: RoutineFrequency;
  hour: number;
  minute: number;
  weekdays: number[];
  days_of_month: number[];
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  /** CODE du dernier passage manqué, jamais une phrase — l'UI traduit. */
  last_error: RoutineErrorCode | string | null;
  created_at: string;
  updated_at: string;
}

/** Motifs de passage manqué, écrits par le cron et traduits par l'UI. */
export type RoutineErrorCode =
  | "quota"
  | "noRepo"
  | "alreadyRunning"
  | "modelAbovePlan"
  | "launchFailed";

export type RoutineErrorKey =
  | "projectNotFound"
  | "ownerOnly"
  | "routineNotFound"
  | "promptRequired"
  | "noRepo"
  | "invalidSchedule"
  | "unknownTimezone"
  | "modelAbovePlan"
  | "noFieldsToUpdate"
  | "databaseError";

export type RoutineResult<T> =
  | { ok: true; routine: T }
  | {
      ok: false;
      status: number;
      errorKey: RoutineErrorKey;
      /** Détail du refus de modèle, de quoi écrire la phrase complète. */
      modelLimit?: { model: string; multiplier: number; limit: number; planId: string };
      /** Code de refus de la cadence (`invalidWeekday`, `invalidHour`…). */
      scheduleCode?: string;
    };

/** Bornes d'écriture — au-delà on tronque, comme partout ailleurs (MIN-118). */
const MAX_TITLE_LENGTH = 120;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_MODEL_LENGTH = 200;
const MAX_BRANCH_LENGTH = 255;

/**
 * Ce qu'UN passage de cette routine a le droit de dépenser, en USD — le
 * `budget_usd` posé sur son run, que la boucle rend exécutoire.
 *
 * `null` = pas de plafond propre, et c'est vrai dans deux cas :
 *  - **100 %**, le réglage qui dit « seul mon quota me borne » (l'ancien
 *    comportement, gardé accessible) ;
 *  - **BYOK**, où le budget du plan ne borne plus rien : l'utilisateur paye ses
 *    tokens, et un pourcentage d'un budget qui ne le concerne pas lui poserait
 *    un plafond qu'il n'a pas demandé. Même doctrine que le plafond de modèle
 *    (`ensureModelInPlan`), qui ne vaut lui aussi que sur le quota minddy.
 *
 * La base est le budget du PLAN et non le restant du mois : un plafond qui
 * fondrait avec la consommation ferait travailler la routine de moins en moins
 * loin à mesure que le mois avance, sans que son réglage ait bougé. Ce qui
 * borne le restant, c'est le quota — l'autre moitié du `min()` de la boucle.
 */
export async function routineRunBudgetUsd(routine: {
  owner_id: string;
  max_spend_percent: number;
}): Promise<number | null> {
  const percent = clampSpendPercent(routine.max_spend_percent);
  if (percent >= NO_SPEND_CAP_PERCENT) return null;
  const quota = await checkAgentQuota(routine.owner_id, "automations");
  if (quota.unlimited || quota.cap == null) return null;
  return (quota.cap * percent) / 100;
}

export interface CreateRoutineInput {
  projectId: string;
  /** Qui demande. La garde owner porte sur LUI, quelle que soit la porte. */
  actorId: string;
  /**
   * PAS de titre : il est ÉCRIT par un petit modèle à partir de l'instruction,
   * ici et nulle part ailleurs (cf. `titleFor`). Aucune porte n'en propose un —
   * un nom donné à la main est un champ de plus à remplir pour un résultat
   * moins bon, et il divergeait de l'instruction dès la première réécriture.
   */
  prompt: string;
  model?: string | null;
  reasoningLevel?: string | null;
  baseBranch?: string | null;
  /** Plafond d'un passage, en % du budget mensuel (1–100). Absent → 15. */
  maxSpendPercent?: number | null;
  frequency: string;
  hour: number;
  minute?: number | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  timezone: string;
  enabled?: boolean;
}

/** Champs de cadence lus depuis une entrée brute, normalisés. */
function toSchedule(input: {
  frequency: string;
  hour: number;
  minute?: number | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  timezone: string;
}): RoutineSchedule {
  const frequency = isRoutineFrequency(input.frequency) ? input.frequency : "weekly";
  // Dédoublonnés et triés dès l'entrée : deux fois le même jour n'est pas deux
  // occurrences, et l'ordre de saisie n'a pas à survivre jusqu'à l'affichage.
  const uniq = (days: number[] | null | undefined) =>
    [...new Set(days ?? [])].sort((a, b) => a - b);
  return {
    frequency,
    hour: Number(input.hour),
    minute: Number(input.minute ?? 0),
    // Les champs de jour n'existent QUE pour leur cadence : les laisser traîner
    // d'une cadence à l'autre ferait passer `assertSchedule` pour un caprice.
    weekdays: frequency === "weekly" ? uniq(input.weekdays) : [],
    daysOfMonth: frequency === "monthly" ? uniq(input.daysOfMonth) : [],
    timezone: String(input.timezone ?? ""),
  };
}

/**
 * Le TITRE d'une routine : écrit par le petit modèle qui nomme déjà les
 * sessions carnet et les conversations de Numo, à partir de son instruction.
 *
 * Il n'est jamais demandé à l'utilisateur, et il se REFAIT à chaque fois que
 * l'instruction change : un nom saisi une fois cesse de décrire la routine dès
 * la première réécriture, et personne ne pense à le corriger. L'appel coûte
 * quelques centimes de millier de tokens, une fois par édition — à comparer au
 * titre que MIN-185 a justement retiré du lancement, qui se repayait à CHAQUE
 * passage.
 *
 * La dépense est celle de la routine (`routine_code`), comme tout ce qu'elle
 * fait faire.
 *
 * Repli si le modèle ne répond pas : la première phrase de l'instruction,
 * coupée. Une routine sans titre n'a pas de ligne lisible dans la colonne.
 */
async function titleFor(prompt: string, userId: string, projectId: string): Promise<string> {
  const generated = await generateShortTitle({
    text: prompt,
    kind: "note",
    // La langue du titre est celle de l'instruction, sans qu'on ait à la
    // connaître ici — c'est la personne qui l'a écrite.
    locale: "auto",
    usage: { feature: "routine_code", userId, projectId },
  }).catch(() => null);
  if (generated?.trim()) return generated.trim().slice(0, MAX_TITLE_LENGTH);
  const first = prompt.trim().split(/[.\n!?]/)[0]?.trim() ?? "";
  return (first || prompt.trim()).slice(0, MAX_TITLE_LENGTH);
}

/** Traduit un refus de cadence en résultat de fabrique. */
function scheduleRefusal(err: unknown): Extract<RoutineResult<never>, { ok: false }> | null {
  if (!(err instanceof RoutineScheduleError)) return null;
  return err.code === "unknownTimezone"
    ? { ok: false, status: 400, errorKey: "unknownTimezone", scheduleCode: err.code }
    : { ok: false, status: 400, errorKey: "invalidSchedule", scheduleCode: err.code };
}

/**
 * Le plafond de modèle du plan, appliqué au modèle CHOISI pour la routine. Le
 * plafond ne vaut que sur le quota minddy (en BYOK, l'utilisateur paye ses
 * tokens) : on lit donc le mode du compte, comme le lancement.
 */
async function refuseModelAbovePlan(
  userId: string,
  model: string | null,
): Promise<Extract<RoutineResult<never>, { ok: false }> | null> {
  if (!model) return null;
  const quota = await checkAgentQuota(userId, "automations");
  try {
    await ensureModelInPlan({ userId, model, mode: quota.mode });
    return null;
  } catch (err) {
    if (isPlanLimitError(err) && err.code === "model_above_plan") {
      const p = err.params ?? {};
      return {
        ok: false,
        status: 403,
        errorKey: "modelAbovePlan",
        modelLimit: {
          model: String(p.model ?? model),
          multiplier: Number(p.multiplier ?? 0),
          limit: Number(p.limit ?? 0),
          planId: String(p.plan ?? ""),
        },
      };
    }
    throw err;
  }
}

/** Crée une routine. Owner du projet uniquement. */
export async function createRoutine(
  input: CreateRoutineInput,
): Promise<RoutineResult<Routine>> {
  const access = await getProjectAccess(input.actorId, input.projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };
  // La garde AVANT tout le reste : inutile de valider une cadence qu'on va
  // refuser, et le refus doit être le même quelle que soit la porte.
  if (!access.isOwner) return { ok: false, status: 403, errorKey: "ownerOnly" };

  const prompt = input.prompt?.trim() ?? "";
  if (!prompt) return { ok: false, status: 400, errorKey: "promptRequired" };

  // Sans dépôt lié, la routine n'aurait rien à cloner : on refuse ici plutôt
  // que de laisser une routine se casser à chaque passage.
  const link = await getProjectLink(input.projectId);
  if (!link) return { ok: false, status: 409, errorKey: "noRepo" };

  const schedule = toSchedule(input);
  let next: Date;
  try {
    next = nextRunAt(schedule, new Date());
  } catch (err) {
    const refusal = scheduleRefusal(err);
    if (refusal) return refusal;
    throw err;
  }

  const model = input.model?.trim() ? input.model.trim().slice(0, MAX_MODEL_LENGTH) : null;
  const refusal = await refuseModelAbovePlan(input.actorId, model);
  if (refusal) return refusal;

  // Le titre en DERNIER : après tous les refus, pour ne pas payer un appel de
  // nommage à une routine qu'on s'apprête à refuser.
  const title = await titleFor(prompt, input.actorId, input.projectId);
  const enabled = input.enabled !== false;
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_routines")
    .insert({
      project_id: input.projectId,
      // Acteur technique = le owner, c'est-à-dire l'appelant (la garde ci-dessus
      // le garantit). Écrit en colonne pour que le cron n'ait pas à re-joindre.
      owner_id: input.actorId,
      title,
      prompt: prompt.slice(0, MAX_PROMPT_LENGTH),
      model,
      reasoning_level: isReasoningLevel(input.reasoningLevel)
        ? input.reasoningLevel
        : "medium",
      base_branch: input.baseBranch?.trim()
        ? input.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
        : null,
      // Ramené dans ses bornes plutôt que refusé : un plafond mal écrit par une
      // des quatre portes ne doit pas empêcher de poser la routine — le CHECK
      // de la base, lui, ne pardonnerait pas.
      max_spend_percent:
        input.maxSpendPercent == null
          ? DEFAULT_MAX_SPEND_PERCENT
          : clampSpendPercent(input.maxSpendPercent),
      frequency: schedule.frequency,
      hour: schedule.hour,
      minute: schedule.minute,
      weekdays: schedule.weekdays,
      days_of_month: schedule.daysOfMonth,
      timezone: schedule.timezone,
      enabled,
      // Une routine désarmée n'a pas d'échéance : l'index partiel du cron ne la
      // voit pas, et la réactiver la recalcule.
      next_run_at: enabled ? next.toISOString() : null,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[routines] create failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, routine: data as Routine };
}

export interface UpdateRoutineInput {
  routineId: string;
  actorId: string;
  /** Réécrire l'instruction REFAIT le titre : cf. `titleFor`. */
  prompt?: string;
  model?: string | null;
  reasoningLevel?: string | null;
  baseBranch?: string | null;
  /** Nouveau plafond d'un passage, en % du budget mensuel (1–100). */
  maxSpendPercent?: number | null;
  frequency?: string;
  hour?: number;
  minute?: number | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  timezone?: string;
  enabled?: boolean;
}

/**
 * Modifie une routine. Owner seul.
 *
 * Toute touche à la cadence ou à `enabled` RECALCULE `next_run_at` : sans ça,
 * changer l'heure ne changerait rien avant le passage suivant — et réactiver
 * une routine la ferait partir sur une échéance périmée, donc immédiatement.
 */
export async function updateRoutine(
  input: UpdateRoutineInput,
): Promise<RoutineResult<Routine>> {
  const service = getServiceClient();
  const { data: current } = await service
    .from("agent_routines")
    .select("*")
    // Une routine à la corbeille ne se modifie pas : elle se restaure d'abord.
    .is("deleted_at", null)
    .eq("id", input.routineId)
    .maybeSingle();
  if (!current) return { ok: false, status: 404, errorKey: "routineNotFound" };
  const routine = current as Routine;

  const access = await getProjectAccess(input.actorId, routine.project_id);
  if (!access) return { ok: false, status: 404, errorKey: "routineNotFound" };
  if (!access.isOwner) return { ok: false, status: 403, errorKey: "ownerOnly" };

  const updates: Record<string, unknown> = {};
  if (typeof input.prompt === "string") {
    const prompt = input.prompt.trim();
    if (!prompt) return { ok: false, status: 400, errorKey: "promptRequired" };
    updates.prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
    // Le titre SUIT l'instruction. Une routine dont on a réécrit le travail
    // garderait sinon le nom de ce qu'elle faisait avant — et c'est ce nom-là
    // qu'on lit dans la colonne pour décider si elle sert encore.
    if (prompt !== routine.prompt) {
      updates.title = await titleFor(prompt, input.actorId, routine.project_id);
    }
  }
  if ("model" in input) {
    const model = input.model?.trim() ? input.model.trim().slice(0, MAX_MODEL_LENGTH) : null;
    const refusal = await refuseModelAbovePlan(input.actorId, model);
    if (refusal) return refusal;
    updates.model = model;
  }
  if (input.reasoningLevel != null) {
    if (isReasoningLevel(input.reasoningLevel)) updates.reasoning_level = input.reasoningLevel;
  }
  if ("baseBranch" in input) {
    updates.base_branch = input.baseBranch?.trim()
      ? input.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
      : null;
  }
  if (input.maxSpendPercent != null) {
    updates.max_spend_percent = clampSpendPercent(input.maxSpendPercent);
  }

  // La cadence se relit ENTIÈRE, en fusionnant l'existant et ce qui change :
  // valider un champ isolé laisserait passer « mensuel + un jour de semaine »,
  // qui n'est cohérent qu'à deux.
  const cadenceTouched =
    input.frequency !== undefined ||
    input.hour !== undefined ||
    input.minute !== undefined ||
    input.weekdays !== undefined ||
    input.daysOfMonth !== undefined ||
    input.timezone !== undefined;
  const enabledTouched = typeof input.enabled === "boolean";
  const enabled = enabledTouched ? (input.enabled as boolean) : routine.enabled;

  let schedule: RoutineSchedule | null = null;
  if (cadenceTouched || enabledTouched) {
    schedule = toSchedule({
      frequency: input.frequency ?? routine.frequency,
      hour: input.hour ?? routine.hour,
      minute: input.minute ?? routine.minute,
      weekdays: input.weekdays !== undefined ? input.weekdays : routine.weekdays,
      daysOfMonth:
        input.daysOfMonth !== undefined ? input.daysOfMonth : routine.days_of_month,
      timezone: input.timezone ?? routine.timezone,
    });
    try {
      const next = nextRunAt(schedule, new Date());
      updates.next_run_at = enabled ? next.toISOString() : null;
    } catch (err) {
      const refusal = scheduleRefusal(err);
      if (refusal) return refusal;
      throw err;
    }
    if (cadenceTouched) {
      updates.frequency = schedule.frequency;
      updates.hour = schedule.hour;
      updates.minute = schedule.minute;
      updates.weekdays = schedule.weekdays;
      updates.days_of_month = schedule.daysOfMonth;
      updates.timezone = schedule.timezone;
    }
    if (enabledTouched) updates.enabled = enabled;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const { data, error } = await service
    .from("agent_routines")
    .update(updates)
    .eq("id", input.routineId)
    .select("*")
    .single();
  if (error || !data) {
    console.error("[routines] update failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, routine: data as Routine };
}

/**
 * Supprime une routine — à la CORBEILLE (MIN-201), pas pour de bon.
 *
 * C'était un `delete` sec, et il emportait tous ses passages avec elle
 * (`agent_runs.routine_id` cascade) : les conversations, les diffs et les pull
 * requests qui s'y lisent disparaissaient d'un clic, sans retour possible. La
 * routine part donc là où partent déjà les tickets, les objectifs, les retours
 * et les projets : marquée, sortie de l'app, restaurable 30 jours à l'identique
 * — cadence, instruction, modèle, échéance et historique inchangés, puisque rien
 * n'est détaché. C'est le balayage nocturne qui tranche ensuite.
 *
 * La garde owner ET l'écriture vivent dans `softDeleteItem` : deux
 * implémentations de « corbeiller une routine » — une ici, une pour l'écran de
 * corbeille et l'outil de Numo — finiraient par diverger.
 */
export async function deleteRoutine(input: {
  routineId: string;
  actorId: string;
}): Promise<{ ok: true } | Extract<RoutineResult<never>, { ok: false }>> {
  const result = await softDeleteItem("routine", input.routineId, input.actorId);
  if (result.ok) return { ok: true };
  // La corbeille ne rend, pour une routine, que ces trois clés-là ; le repli
  // couvre l'impossible plutôt que de laisser passer une clé que l'UI ne sait
  // pas traduire.
  const errorKey: RoutineErrorKey =
    result.errorKey === "routineNotFound" || result.errorKey === "ownerOnly"
      ? result.errorKey
      : "databaseError";
  return { ok: false, status: result.status, errorKey };
}

/**
 * Une routine par son id, avec l'accès de l'appelant (lecture = membres). Une
 * routine à la corbeille n'existe plus pour personne (MIN-201) : elle se
 * restaure depuis la corbeille, elle ne se relit pas par son ancienne URL.
 */
export async function getRoutineForUser(
  routineId: string,
  userId: string,
): Promise<{ routine: Routine; isOwner: boolean } | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_routines")
    .select("*")
    .eq("id", routineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const routine = data as Routine;
  const access = await getProjectAccess(userId, routine.project_id);
  if (!access) return null;
  return { routine, isOwner: access.isOwner };
}

/**
 * Les routines des projets accessibles à l'utilisateur — owner ET membres. La
 * lecture est ouverte : un membre doit pouvoir voir ce qui tourne sur le dépôt
 * qu'il partage, même s'il ne peut ni le poser ni l'arrêter.
 */
export async function listRoutinesForUser(userId: string): Promise<Routine[]> {
  const service = getServiceClient();
  const { data: owned } = await service
    .from("projects")
    .select("id")
    .eq("owner_id", userId)
    .is("deleted_at", null);
  const { data: member } = await service
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  const ids = new Set<string>([
    ...((owned ?? []) as { id: string }[]).map((p) => p.id),
    ...((member ?? []) as { project_id: string }[]).map((m) => m.project_id),
  ]);
  if (ids.size === 0) return [];

  const { data } = await service
    .from("agent_routines")
    // Même garde que le balayage du cron : un projet à la corbeille sort de la
    // liste. Le chemin « membre » ne peut pas filtrer `deleted_at` lui-même
    // (`project_members` ne le porte pas), et sans cette jointure un membre
    // lisait dans la colonne une routine dont le détail répond 404 —
    // `getProjectAccess` écarte les projets corbeillés.
    .select("*, projects!inner(deleted_at)")
    .is("projects.deleted_at", null)
    // Et la routine elle-même, corbeillée à son tour (MIN-201).
    .is("deleted_at", null)
    .in("project_id", [...ids])
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<Routine & { projects?: unknown }>).map(
    ({ projects: _joined, ...routine }) => routine as Routine,
  );
}

/**
 * Les routines dont l'échéance est passée — le balayage du cron.
 *
 * **Un projet à la CORBEILLE ne fait plus travailler personne.** La suppression
 * d'un projet est douce (`deleted_at`, MIN-133) : la routine, elle, survit à sa
 * ligne — et sans ce filtre elle partirait tous les lundis sur un projet que
 * son propriétaire croit supprimé, en dépensant son budget, sans figurer nulle
 * part dans l'écran (`listRoutinesForUser` écarte les projets corbeillés,
 * comme `getProjectAccess`). Même doctrine que le moteur d'automatisations,
 * qui écarte les projets corbeillés de son propre balayage.
 *
 * **Une routine à la corbeille non plus** (MIN-201) : son échéance reste armée
 * pour que la restauration la rende telle quelle, et sans ce filtre elle
 * partirait pendant sa rétention comme si de rien n'était.
 *
 * La jointure est INTERNE et le filtre est DANS la requête, jamais après :
 * écartée en JS, une routine de projet corbeillé garderait sa place en tête de
 * la fenêtre (son échéance ne bouge plus, donc elle trie toujours première) et
 * affamerait les routines vivantes.
 */
export async function dueRoutines(limit = 20): Promise<Routine[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_routines")
    .select("*, projects!inner(deleted_at)")
    .is("projects.deleted_at", null)
    .is("deleted_at", null)
    .eq("enabled", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
  // La jointure ajoute une clé au retour : elle ne voyage pas plus loin.
  return ((data ?? []) as Array<Routine & { projects?: unknown }>).map(
    ({ projects: _joined, ...routine }) => routine as Routine,
  );
}

/**
 * RÉSERVE une échéance : compare-and-set sur `next_run_at`. C'est le SEUL
 * verrou contre un double départ — deux crons qui se chevauchent lisent la même
 * routine, un seul gagne l'écriture, l'autre repart sans rien lancer. Même
 * doctrine que `claim_agent_run`.
 *
 * On avance l'échéance AVANT de lancer, et on ne rattrape jamais les passages
 * manqués : une routine restée trois jours sans budget repart demain, elle ne
 * joue pas trois fois.
 */
export async function claimRoutine(
  routine: Routine,
): Promise<{ claimed: boolean; nextRunAt: string | null }> {
  if (!routine.next_run_at) return { claimed: false, nextRunAt: null };
  const schedule = routineSchedule(routine);
  let next: string | null;
  try {
    // Depuis MAINTENANT et non depuis l'échéance ratée : une routine réveillée
    // en retard doit repartir sur la prochaine occurrence réelle.
    next = nextRunAt(schedule, new Date()).toISOString();
  } catch {
    // Cadence devenue illisible (fuseau retiré d'ICU, donnée bricolée) : on
    // désarme plutôt que de la rejouer en boucle à chaque réveil du cron.
    next = null;
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_routines")
    .update({ next_run_at: next, last_run_at: new Date().toISOString() })
    .eq("id", routine.id)
    // Le compare-and-set : l'échéance qu'on a lue doit être encore là.
    .eq("next_run_at", routine.next_run_at)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[routines] claim failed:", error.message);
    return { claimed: false, nextRunAt: null };
  }
  return { claimed: !!data, nextRunAt: next };
}

/**
 * « Lancer maintenant » : le passage n'est pas celui du calendrier, mais c'en
 * est un — `last_run_at` le dit, et l'alerte du passage précédent s'éteint,
 * exactement comme le fait le cron quand son lancement part.
 *
 * Sans ça, un passage déclenché à la main laissait `last_run_at` sur l'échéance
 * d'avant, et les deux surfaces qui le rendent (`list_routines` du chat et du
 * MCP, toutes deux annoncées comme « quand elle a tourné pour la dernière
 * fois ») répondaient à côté. **`next_run_at` n'est pas touché** : essayer sa
 * routine un mardi ne fait pas sauter le lundi suivant.
 */
export async function stampRoutineLaunched(routineId: string): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("agent_routines")
    .update({ last_run_at: new Date().toISOString(), last_error: null })
    .eq("id", routineId);
  if (error) console.error("[routines] stamp launch failed:", error.message);
}

/**
 * Écrit le motif du dernier passage — un CODE, jamais une phrase. `null` efface
 * (un passage qui repart normalement doit effacer l'alerte de l'écran).
 */
export async function stampRoutineError(
  routineId: string,
  code: RoutineErrorCode | null,
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("agent_routines")
    .update({ last_error: code })
    .eq("id", routineId);
  if (error) console.error("[routines] stamp error failed:", error.message);
}

/** La cadence d'une routine, telle que `describeSchedule`/`nextRunAt` l'attendent. */
export function routineSchedule(routine: Routine): RoutineSchedule {
  return {
    frequency: routine.frequency,
    hour: routine.hour,
    minute: routine.minute,
    weekdays: routine.weekdays,
    daysOfMonth: routine.days_of_month,
    timezone: routine.timezone,
  };
}

/** Sanity: la cadence d'une routine est valide (utile aux appelants externes). */
export function isValidSchedule(schedule: RoutineSchedule): boolean {
  try {
    assertSchedule(schedule);
    return true;
  } catch {
    return false;
  }
}
