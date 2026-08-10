import "server-only";

import { after } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { isRecurrenceCadence, startDueDateISO } from "@/lib/recurrence";
import { MAX_PLAN_LENGTH } from "@/lib/plan";
import {
  copyResourcesToProject,
  insertAttachments,
  parseResourcesInput,
} from "@/lib/server/attachments";
import {
  insertEvents,
  stampForgeSync,
  stampIntegration,
  stampViaAssistant,
  stampMcpKey,
  type EventRow,
} from "@/lib/server/issue-events";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import { runSmartFill } from "@/lib/server/smart-fill";
import { insertNotifications } from "@/lib/server/notifications";
import { notifyDescriptionMentions } from "@/lib/server/description-mentions";
import { insertStatEvents, type StatEventRow } from "@/lib/server/stat-events";
import {
  applySmartAssign,
  isSmartAssignEligibleStatus,
} from "@/lib/server/smart-assign";
import { ensureIssueLimit } from "@/lib/server/entitlements";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { captureServerEvent } from "./posthog";

/**
 * Shared issue-creation core: builds the row from an untrusted input payload,
 * assigns the CLÉ-number atomically, inserts via the service client, attaches
 * categories and records activity events. Used by POST /api/projects/[id]/issues
 * and by the triage accept route.
 *
 * Callers MUST have verified the actor's access to the project beforehand —
 * the insert bypasses RLS.
 */
export type CreateIssueResult =
  | { ok: true; issue: Record<string, unknown> & { category_ids: string[] } }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?:
        | "titleRequired"
        | "parentIssueNotFound"
        | "nestingLimitedToOneLevel"
        | "planTooLong"
        | "invalidRecurrence"
        | "recurrenceNeedsDueDate"
        | "databaseError"
        | "resourceInvalid"
        | "issueLimitReached"
        | "remoteIssueAlreadyImported";
      /** ICU values the message needs (ex. `limit` pour `issueLimitReached`). */
      params?: Record<string, string | number>;
      /** Verbatim DB message already meant for the user (P0001 trigger raise). */
      rawMessage?: string;
    };

/**
 * Identité de l'issue distante qu'un ticket importé reflète (MIN-97) — posée
 * telle quelle sur la ligne, l'index UNIQUE partiel faisant le dédoublonnage.
 */
export interface RemoteIssueRef {
  provider: string;
  repoId: string;
  number: number;
  url: string | null;
}

/**
 * D'où vient ce ticket ? Dérivé des marqueurs de provenance que les appelants
 * posent déjà (`viaAssistant`, `mcpKeyId`, `integrationId`) — aucun nouveau
 * paramètre à câbler dans la douzaine de routes qui créent des tickets.
 */
export function resolveIssueSource(params: {
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
  integrationId?: string | null;
  /** Provider derrière l'écriture quand elle vient de la synchro d'un dépôt lié. */
  forge?: string | null;
  actorId?: string | null;
}): string {
  if (params.forge) return "forge";
  if (params.integrationId) return "integration";
  if (params.viaAssistant) return "numo";
  if (params.mcpKeyId) return "mcp";
  if (!params.actorId) return "system";
  return "web";
}

// Bornes de longueur (MIN-118). Le cœur tronque en silence — même philosophie
// que le drop silencieux des enums invalides — pour ne casser aucun appelant
// (UI, MCP, Numo, import CSV) ; seul le plan garde son rejet explicite.
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 65_536;
const MAX_CATEGORY_REFS = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createIssueForProject({
  projectId,
  projectName = null,
  actorId,
  input,
  viaAssistant = false,
  mcpKeyId = null,
  integrationId = null,
  remote = null,
  recurrenceSeriesId = null,
  rowId = null,
}: {
  projectId: string;
  /** Project name snapshot for the stats ledger (survives project deletion). */
  projectName?: string | null;
  /** NULL when the issue comes from an integration (no user behind it). */
  actorId: string | null;
  input: Record<string, unknown>;
  /** Marks the resulting activity events as triggered through Numo. */
  viaAssistant?: boolean;
  /** Attributes the resulting activity events to an MCP API key (agent actor). */
  mcpKeyId?: string | null;
  /** Attributes the issue and its events to a project integration. */
  integrationId?: string | null;
  /** Issue distante que ce ticket reflète (MIN-97) : pose l'identité `remote_*`
      et estampille les événements au nom de la forge. */
  remote?: RemoteIssueRef | null;
  /** Série de récurrence à laquelle rattacher le ticket (MIN-136) — posé par
      lib/server/recurrence.ts sur l'occurrence qu'il crée, jamais par un
      payload client. Null = ce ticket ouvre sa propre série (voir seriesIdOf). */
  recurrenceSeriesId?: string | null;
  /** Id que le client a DÉJÀ donné à sa carte optimiste : la ligne naît avec,
      pour que la diffusion temps réel de cette création soit reconnue comme la
      sienne plutôt qu'adoptée en double (lib/optimistic-issue.ts). Posé par la
      seule route web, JAMAIS lu dans `input` — les dix autres appelants (MCP,
      Numo, webhooks de forge, import, récurrence, promotion d'un retour)
      transmettent des charges qu'ils n'ont pas écrites, et un `id` égaré n'y
      désignerait pas la ligne à créer. Ignoré s'il n'est pas un UUID, comme les
      enums invalides. */
  rowId?: string | null;
}): Promise<CreateIssueResult> {
  const title =
    typeof input.title === "string" ? input.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
  if (!title) {
    return { ok: false, status: 400, errorKey: "titleRequired" };
  }

  // Limite issues/projet du plan du owner (MIN-72) — vérifiée ici pour couvrir
  // tous les chemins de création (UI, API v1, MCP, Numo, import CSV, triage).
  try {
    await ensureIssueLimit(projectId);
  } catch (err) {
    if (isPlanLimitError(err)) {
      // `params` porte la limite du plan — le message l'affiche.
      return {
        ok: false,
        status: err.status,
        errorKey: "issueLimitReached",
        params: err.params,
      };
    }
    throw err;
  }

  // Resources for the new issue: files the client already uploaded under this
  // project's storage prefix, and links /link-preview already resolved.
  const parsedResources = parseResourcesInput(
    input.resources,
    `projects/${projectId}/`
  );
  if (parsedResources === null) {
    return { ok: false, status: 400, errorKey: "resourceInvalid" };
  }

  // Cross-project creation: files uploaded under another project's prefix, to be
  // COPIED into this one. Validated with the generic `projects/` family here;
  // per-file source access is checked at copy time (copyResourcesToProject).
  const parsedCopyResources = parseResourcesInput(
    input.copy_resources,
    "projects/"
  );
  if (parsedCopyResources === null) {
    return { ok: false, status: 400, errorKey: "resourceInvalid" };
  }

  const clientRowId = typeof rowId === "string" && UUID_RE.test(rowId) ? rowId : null;

  const row: Record<string, unknown> = {
    project_id: projectId,
    title,
    created_by: actorId,
    position: Date.now(),
  };
  if (clientRowId) row.id = clientRowId;
  if (integrationId) row.integration_id = integrationId;
  if (remote) {
    row.remote_provider = remote.provider;
    row.remote_repo_id = remote.repoId;
    row.remote_number = remote.number;
    row.remote_url = remote.url;
  }
  if (typeof input.description === "string") {
    row.description = input.description.slice(0, MAX_DESCRIPTION_LENGTH);
  }
  if (typeof input.plan === "string" && input.plan.trim()) {
    if (input.plan.length > MAX_PLAN_LENGTH) {
      return { ok: false, status: 400, errorKey: "planTooLong" };
    }
    row.plan = input.plan;
  }
  if (isStatus(input.status)) {
    row.status = input.status;
    if (input.status === "done") row.completed_at = new Date().toISOString();
  }
  if (isPriority(input.priority)) row.priority = input.priority;
  if (input.effort === null || isEffort(input.effort)) row.effort = input.effort ?? null;
  if (typeof input.assignee_id === "string" || input.assignee_id === null) {
    row.assignee_id = input.assignee_id ?? null;
  }
  if (typeof input.objective_id === "string" || input.objective_id === null) {
    row.objective_id = input.objective_id ?? null;
  }
  if (isDateOrNull(input.due_date)) row.due_date = input.due_date;

  // Récurrence (MIN-136) : une cadence exige une échéance, qui porte alors la
  // PREMIÈRE occurrence. Même règle que la mise à jour — un ticket récurrent
  // sans date n'aurait rien à décaler à sa clôture.
  if ("recurrence" in input && input.recurrence !== null) {
    if (!isRecurrenceCadence(input.recurrence)) {
      return { ok: false, status: 400, errorKey: "invalidRecurrence" };
    }
    if (!row.due_date) {
      return { ok: false, status: 400, errorKey: "recurrenceNeedsDueDate" };
    }
    row.recurrence = input.recurrence;
    // La date d'une récurrence est un DÉBUT : si elle est déjà passée, le
    // ticket naît sur la première occurrence à venir plutôt qu'en retard.
    row.due_date =
      startDueDateISO(row.due_date as string, input.recurrence) ?? row.due_date;
    if (recurrenceSeriesId) row.recurrence_series_id = recurrenceSeriesId;
  }

  const service = getServiceClient();

  // An assignee must belong to the target project. Cross-project creation may
  // carry an assignee_id whose user isn't a member here — drop it rather than
  // assign a stranger. (Same-project assignees are picked from the project's
  // own member list, so this is a no-op there.)
  if (typeof row.assignee_id === "string") {
    const assigneeAccess = await getProjectAccess(row.assignee_id, projectId);
    if (!assigneeAccess) row.assignee_id = null;
  }

  // Sub-issue: validate the parent (same project, top-level) and, unless an
  // objective was explicitly set, inherit the parent's objective (plan §4).
  if (typeof input.parent_id === "string") {
    const { data: parent } = await service
      .from("issues")
      .select("id, project_id, parent_id, objective_id")
      .is("deleted_at", null)
      .eq("id", input.parent_id)
      .maybeSingle();
    if (!parent || parent.project_id !== projectId) {
      return { ok: false, status: 400, errorKey: "parentIssueNotFound" };
    }
    if (parent.parent_id) {
      return { ok: false, status: 400, errorKey: "nestingLimitedToOneLevel" };
    }
    row.parent_id = input.parent_id;
    if (!("objective_id" in input)) row.objective_id = parent.objective_id;
  }

  /**
   * SMART-FILL (MIN-260) — juste AVANT que la ligne existe, et c'est tout le
   * dessin de la feature : le ticket naît complet, donc il n'y a jamais de
   * ticket à moitié rempli à masquer dans le board.
   *
   * Ici et pas plus haut : toutes les validations sont passées (parent, membre,
   * récurrence), donc on ne paye pas un appel de modèle pour une création qui
   * va être refusée. Et pas plus bas : après l'insert, il faudrait un UPDATE et
   * une seconde diffusion temps réel, c'est-à-dire exactement la carte vide
   * qu'on ne veut pas montrer.
   *
   * IL NE COMPLÈTE QUE CE QUE L'HUMAIN A LAISSÉ VIDE. Un champ posé à la main
   * gagne toujours — y compris l'objectif hérité d'un ticket parent juste
   * au-dessus. C'est une aide à la saisie, pas un correcteur.
   */
  let smartFillCategoryIds: string[] = [];
  // Les champs que Smart-fill a RÉELLEMENT posés — pas ceux qu'il a proposés.
  // C'est cette liste qui part dans l'activité : dire « a rempli la priorité »
  // d'un ticket dont l'auteur avait déjà mis « urgent » serait un mensonge, et
  // c'est précisément le genre de ligne qui fait cesser de croire la timeline.
  const smartFilled: string[] = [];
  if (input.smart_fill === true) {
    const patch = await runSmartFill({
      projectId,
      projectName: projectName ?? "this project",
      actorId,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
    });
    // « none » est le défaut du formulaire, pas un choix : un ticket qui arrive
    // sans priorité n'en a pas refusé une.
    if (patch.priority && (row.priority == null || row.priority === "none")) {
      row.priority = patch.priority;
      smartFilled.push("priority");
    }
    // `effort: null` est une VRAIE réponse (« rien d'estimable ») — mais elle ne
    // change rien à un champ déjà nul, et l'annoncer dirait un geste invisible.
    if (patch.effort != null && row.effort == null) {
      row.effort = patch.effort;
      smartFilled.push("effort");
    }
    if (patch.objective_id && row.objective_id == null) {
      row.objective_id = patch.objective_id;
      smartFilled.push("objective_id");
    }
    if (patch.category_ids?.length) smartFillCategoryIds = patch.category_ids;
  }

  const { data: number, error: counterError } = await service.rpc("next_issue_number", {
    p_project_id: projectId,
  });
  if (counterError || typeof number !== "number") {
    console.error("[create-issue] counter failed:", counterError?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  row.number = number;

  const { data, error } = await service
    .from("issues")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (error.code === "P0001") {
      return { ok: false, status: 400, rawMessage: error.message };
    }
    // 23505 sur l'index d'identité distante = cette issue est DÉJÀ importée.
    // C'est le chemin normal d'une redélivrance de webhook, pas une panne : on
    // le distingue pour que l'appelant l'avale sans bruit (MIN-97).
    if (error.code === "23505" && remote) {
      return { ok: false, status: 409, errorKey: "remoteIssueAlreadyImported" };
    }
    // 23505 sur la CLÉ PRIMAIRE alors que c'est le client qui l'a choisie : la
    // même création rejouée (double soumission, renvoi après une réponse
    // perdue). Le ticket d'avant EST le résultat attendu — le rendre tel quel
    // plutôt qu'un second ticket ou une erreur. Les effets de bord, eux, ont
    // déjà eu lieu au premier passage.
    if (error.code === "23505" && clientRowId) {
      const { data: existing } = await service
        .from("issues")
        .select(ISSUE_SELECT)
        .eq("id", clientRowId)
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) return { ok: true, issue: mapIssueRow(existing) };
    }
    console.error("[create-issue] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Resource rows — the issue exists from here on, so a failure must not
  // fail the request (the resources just don't get registered). Cross-project files
  // are copied into this project's storage prefix first, then registered
  // alongside the local ones.
  try {
    const copied = await copyResourcesToProject(service, {
      targetProjectId: projectId,
      actorId,
      resources: parsedCopyResources,
    });
    await insertAttachments(service, {
      projectId,
      issueId: data.id as string,
      commentId: null,
      createdBy: actorId,
      resources: [...parsedResources, ...copied],
    });
  } catch (e) {
    console.error("[create-issue] resources failed:", (e as Error).message);
  }

  // Attach categories that belong to this project — matched by ID (same-project
  // creation) and/or by NAME (cross-project creation carries names, since a
  // category ID is scoped to one project). The DB filter on project_id keeps
  // foreign values out either way.
  let categoryIds: string[] = [];
  const pickedIds = Array.isArray(input.category_ids)
    ? input.category_ids
        .filter((v): v is string => typeof v === "string")
        .slice(0, MAX_CATEGORY_REFS)
    : [];
  const requestedNames = Array.isArray(input.category_names)
    ? input.category_names
        .filter((v): v is string => typeof v === "string")
        .slice(0, MAX_CATEGORY_REFS)
    : [];
  // Smart-fill ne range le ticket que si PERSONNE ne l'a rangé — ni par id ni
  // par nom. Des catégories choisies à la main sont un choix, et s'y ajouter le
  // déferait à moitié.
  const requestedIds =
    pickedIds.length === 0 && requestedNames.length === 0 ? smartFillCategoryIds : pickedIds;
  if (requestedIds.length > 0 || requestedNames.length > 0) {
    const resolved = new Set<string>();
    if (requestedIds.length > 0) {
      const { data: cats } = await service
        .from("categories")
        .select("id")
        .eq("project_id", projectId)
        .in("id", requestedIds);
      (cats ?? []).forEach((c) => resolved.add(c.id as string));
    }
    if (requestedNames.length > 0) {
      const { data: cats } = await service
        .from("categories")
        .select("id")
        .eq("project_id", projectId)
        .in("name", requestedNames);
      (cats ?? []).forEach((c) => resolved.add(c.id as string));
    }
    categoryIds = [...resolved];
    if (categoryIds.length > 0) {
      await service
        .from("issue_categories")
        .insert(categoryIds.map((category_id) => ({ issue_id: data.id, category_id })));
    }
  }

  // Activité + ledger de stats : best-effort, sans effet sur l'issue renvoyée
  // (le client la voit déjà via l'insert optimiste) et reconciliés par le
  // realtime. Hors du chemin critique du POST via after() — la création répond
  // dès la ligne + catégories écrites. Hors requête HTTP → run synchrone.
  const runSideEffects = async () => {
    // Activity: creation + "sub-issue added" on the parent.
    const events: EventRow[] = [
      { issue_id: data.id, actor_id: actorId, type: "created" },
    ];
    if (data.parent_id) {
      events.push({
        issue_id: data.parent_id,
        actor_id: actorId,
        type: "sub_issue_added",
        to_value: data.id,
      });
    }
    /**
     * SMART-FILL DANS L'ACTIVITÉ (MIN-260) — un seul événement, après « a créé
     * le ticket », et attribué à Smart-fill plutôt qu'à l'auteur : ces
     * propriétés-là, il ne les a pas posées.
     *
     * `actor_id` reste celui de l'auteur, comme pour Smart Assign : c'est bien
     * sous son compte que l'écriture a eu lieu, et le drapeau suffit à ce que la
     * timeline nomme l'automatisation. `to_value` porte la liste des champs, et
     * la phrase se compose à l'affichage — dans la langue du lecteur.
     *
     * Rien de rempli, rien à dire : un événement « Smart-fill n'a rien trouvé »
     * n'apprend rien et se répéterait sur tous les tickets d'une ligne.
     */
    if (smartFilled.length > 0 || smartFillCategoryIds.length > 0) {
      const filled = [...smartFilled];
      if (smartFillCategoryIds.length > 0) filled.push("category_ids");
      events.push({
        issue_id: data.id,
        actor_id: actorId,
        type: "updated",
        field: "smart_fill",
        to_value: filled.join(","),
        via_smart_fill: true,
      });
    }
    await insertEvents(
      service,
      stampForgeSync(
        stampIntegration(
          stampMcpKey(stampViaAssistant(events, viaAssistant), mcpKeyId),
          integrationId
        ),
        remote?.provider
      )
    );

    // Ledger de stats : une contribution "créée" (et "terminée" si créée
    // directement en done) au nom de l'acteur. Skip pour les issues d'intégration
    // (actorId null) — elles n'appartiennent à aucun utilisateur. Skip aussi pour
    // un ticket importé du dépôt lié : l'acteur technique est le owner qui a lié
    // le dépôt, il n'a rien écrit (même raison que l'import CSV, qui ne touche
    // pas au ledger).
    if (actorId && !remote) {
      const snapshot = {
        project_id: projectId,
        project_name: projectName,
        issue_id: data.id as string,
        issue_number: data.number as number,
        issue_title: data.title as string,
      };
      const statRows: StatEventRow[] = [
        { user_id: actorId, kind: "issue_created", occurred_at: data.created_at as string, ...snapshot },
      ];
      if (data.status === "done") {
        statRows.push({
          user_id: actorId,
          kind: "issue_completed",
          occurred_at: (data.completed_at as string) ?? (data.created_at as string),
          ...snapshot,
        });
      }
      await insertStatEvents(service, statRows);
    }

    // Notify a user the issue was born assigned to (never on self-assign) —
    // the update path only covers later re-assignments (MIN-82).
    const bornAssignee = data.assignee_id as string | null;
    if (bornAssignee && bornAssignee !== actorId) {
      await insertNotifications(service, [
        {
          user_id: bornAssignee,
          project_id: projectId,
          type: "assigned",
          issue_id: data.id as string,
          actor_id: actorId,
          // Cf. update-issue : un ticket créé assigné depuis le MCP est l'œuvre
          // de l'agent, la notification doit le nommer comme la timeline.
          via_mcp: !!mcpKeyId,
          api_key_id: mcpKeyId,
        },
      ]);
    }

    // Les gens cités dans la description du ticket qui vient de naître. Pas de
    // version précédente : tout ce qui y figure est nouveau.
    await notifyDescriptionMentions(service, {
      projectId,
      actorId,
      description: data.description as string | null,
      issueId: data.id as string,
      mcpKeyId,
    });
  };
  const deferSideEffects = () =>
    runSideEffects().catch((e) =>
      console.error("[create-issue] side-effects failed:", (e as Error).message)
    );
  try {
    after(deferSideEffects);
  } catch {
    void deferSideEffects();
  }

  // Smart Assign (MIN-31): an issue born past triage without an assignee gets
  // one (opt-in per project; the run re-checks everything). Integration issues
  // are forced to "triage" by their routes, so never match.
  //
  // ATTENDU, contrairement aux effets de bord ci-dessus : le cas déterministe
  // écrit ici même, avant la réponse. Différé, il se perdait — c'est tout le
  // sujet de MIN-31 revisité (voir l'en-tête de lib/server/smart-assign.ts).
  // Seul l'appel au modèle repart en `after()`, depuis le run.
  let smartAssignee: string | null = null;
  if (data.assignee_id == null && isSmartAssignEligibleStatus(data.status)) {
    smartAssignee = await applySmartAssign({
      issueId: data.id as string,
      projectId,
      triggerActorId: actorId,
      trigger: "create",
    });
  }

  // Analytics serveur (MIN-78). C'est le comptage qui FAIT AUTORITÉ : il ne
  // dépend ni du consentement cookies ni d'un navigateur — or une bonne partie
  // des tickets de minddy naissent d'un agent MCP, de Numo ou d'une intégration,
  // là où il n'y a personne devant un écran. `source` est la dimension qui
  // permet de répondre à « qui crée vraiment les tickets ? ».
  captureServerEvent({
    distinctId: actorId ?? `integration:${integrationId ?? "unknown"}`,
    event: "issue_created_server",
    properties: {
      source: resolveIssueSource({
        viaAssistant,
        mcpKeyId,
        integrationId,
        forge: remote?.provider,
        actorId,
      }),
      status: data.status,
      priority: data.priority,
      effort: data.effort ?? "none",
      has_description: !!data.description,
      has_assignee: data.assignee_id != null,
      has_parent: data.parent_id != null,
      category_count: categoryIds.length,
      resource_count: parsedResources.length,
      // Doublon volontaire du groupe : une propriété se découpe gratuitement,
      // l'agrégation par groupe suppose l'add-on payant (voir useAnalytics).
      project_id: projectId,
    },
    groups: { project: projectId },
  });

  // `data` reste la ligne TELLE QU'ELLE EST NÉE — les effets de bord différés
  // s'appuient dessus (la notification « créé assigné » ne doit pas se déclencher
  // sur le choix de Smart Assign, qui envoie déjà la sienne) et l'analytics
  // ci-dessus compte les tickets créés AVEC un assigné. Seul le ticket rendu
  // porte la correction : l'agent MCP lit cette réponse pour savoir à qui il a
  // affaire, et le direct ne rattrape que ce qu'il voit passer.
  return {
    ok: true,
    issue: {
      ...data,
      ...(smartAssignee ? { assignee_id: smartAssignee } : {}),
      category_ids: categoryIds,
    },
  };
}
