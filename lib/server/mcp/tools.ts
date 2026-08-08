import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getServiceClient } from "@/lib/supabase-service";
import {
  getIssue,
  listIssues,
  listMembers,
  searchIssues,
  type ReadContext,
} from "@/lib/server/issue-reads";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { displayName } from "@/lib/display-name";
import { isForgePrEvent, forgePrActor } from "@/lib/pr-events";
import { getRepoProvider } from "@/lib/repo-providers";
import {
  MAX_PLAN_LENGTH,
  PLAN_TASK_STATES,
  appendToPlan,
  parsePlan,
  setTaskState,
} from "@/lib/plan";
import {
  editIssueText,
  type IssueTextField,
  type IssueTextTools,
} from "@/lib/server/text-edit";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
} from "@/lib/issue-validation";
import { OBJECTIVE_STATUS_VALUES } from "@/lib/objective-validation";
import { RECURRENCE_CADENCES } from "@/lib/recurrence";
import { createIssueForProject } from "@/lib/server/create-issue";
import {
  MAX_DESCRIPTION_LENGTH,
  updateIssueFields,
} from "@/lib/server/update-issue";
import {
  addIssueRelation,
  findIssueRelation,
  removeIssueRelation,
} from "@/lib/server/issue-relations";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import {
  addCommentToIssue,
  addCommentToFeedbackPost,
  addCommentToObjective,
} from "@/lib/server/add-comment";
import { getProjectFeedbackPost } from "@/lib/server/feedback/team-guard";
import {
  listTeamFeedback,
  getTeamFeedbackDetail,
} from "@/lib/server/feedback/team-queries";
import { updateFeedbackPostFields } from "@/lib/server/feedback/posts";
import {
  linkFeedbackIssue,
  promoteFeedbackPost,
  unlinkFeedbackIssue,
} from "@/lib/server/feedback/promote";
import {
  FEEDBACK_POST_STATUSES,
  FEEDBACK_REVIEW_STATES,
} from "@/lib/feedback/types";
import {
  integrationUsage,
  integrationWebhookDoc,
} from "@/lib/feedback/integration-contract";
import {
  configureFeedbackBoard,
  getFeedbackBoardConfig,
} from "@/lib/server/feedback/board-config";
import {
  createIntegration,
  listIntegrations,
  revokeIntegration,
  updateIntegrationWebhook,
} from "@/lib/server/integrations";
import { WEBHOOK_EVENTS, WEBHOOK_SCOPES } from "@/lib/server/webhooks";
import { SITE_URL } from "@/lib/site";
import {
  downloadAttachment,
  insertAttachments,
  signedAttachmentUrl,
  uploadAttachment,
} from "@/lib/server/attachments";
import { FaviconError } from "@/lib/server/favicon";
import { resolveLinkResource } from "@/lib/server/link-resource";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import {
  createRoutine,
  deleteRoutine,
  listRoutinesForUser,
  updateRoutine,
  type Routine,
} from "@/lib/server/routines";
import {
  forgeFor,
} from "@/lib/server/agent/forge";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import {
  linkPullRequestToIssue,
  resolveProjectPullRequest,
  type PrLinkRefusal,
} from "@/lib/server/agent/pr-link";
import {
  ensureCycles,
  fillCycleForUser,
  getCycleOverview,
  getCyclePrefsForUser,
} from "@/lib/server/cycles";
import {
  getScratchpad,
  setScratchpad,
  mutateScratchpad,
  applyScratchpadTaskChanges,
} from "@/lib/server/scratchpad";
import { MAX_SCRATCHPAD_LENGTH, appendScratchpadTasks } from "@/lib/scratchpad";
import { effortToPoints, statusCompletionCredit, todayISO } from "@/lib/cycle";
import {
  issueIdentifier,
  isClosedStatus,
  type IssueEffort,
  type IssueStatus,
} from "@/lib/issue-constants";
import type { ProjectAccess } from "@/lib/server/project-access";
import {
  ok,
  fail,
  getUserId,
  requireUser,
  resolveProject,
  resolveIssueRef,
  type ToolExtra,
  type ToolResult,
} from "@/lib/server/mcp/tool-helpers";
import { captureServerEvent } from "@/lib/server/posthog";
import { durationBucket } from "@/lib/analytics-sanitize";

/**
 * Tools MCP de minddy — nommage minddy_<verbe>_<nom>, surface volontairement
 * réduite : projets (lecture), tickets (+ plan), objectifs, commentaires.
 * Pas de Vues, pas de suppressions, pas de gestion membres/catégories.
 * Chaque tool ré-authentifie (requireUser) et re-vérifie l'accès projet —
 * il n'y a aucun état de session entre deux appels (transport stateless).
 */

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;

/** Above this, minddy_get_resource never embeds bytes inline (base64 would
    swamp the model's context) — the signed download_url is the way in. */
const MAX_INLINE_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Plafond par fichier du diff renvoyé par minddy_get_pull_request — aligné sur
    le tool read_pull_request de Numo. */
const MAX_PATCH_CHARS = 4000;

/** Refus de rattachement d'une PR → ce que le modèle doit en comprendre. Le
    `code` du cœur partagé EST le code d'erreur MCP : un seul vocabulaire. */
const LINK_REFUSALS: Record<PrLinkRefusal, string> = {
  pr_already_linked:
    "This pull request is already attached to another issue. The link is definitive: " +
    "it cannot be replaced, and there is no unlink.",
  issue_already_linked:
    "This issue already carries a live (draft or open) pull request. Only ONE live pull " +
    "request per issue — wait for it to be merged or closed.",
  issue_outside_repo:
    "This issue belongs to a project that does not link the repository of that pull request.",
};

/** Description rendue par une LISTE : de quoi choisir, pas de quoi lire —
    même plafond que la description tronquée de minddy_list_issues. Le document
    entier se lit par la lecture unitaire (minddy_get_objective). */
const MAX_LIST_DESCRIPTION_CHARS = 200;

function truncate(text: string | null | undefined, max: number): string | null {
  if (typeof text !== "string" || !text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Métadonnées d'une ressource telles que les rendent les lectures MCP : un
    lien porte son url, un fichier son nom/type/taille — ses octets restent
    derrière minddy_get_resource. */
function resourceMeta(row: Record<string, unknown>): Record<string, unknown> {
  return row.kind === "link"
    ? { id: row.id, kind: "link", url: row.url, title: row.file_name }
    : {
        id: row.id,
        kind: "file",
        file_name: row.file_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
      };
}

/** Text-ish MIME → return the file as readable text rather than a base64 blob. */
function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-yaml" ||
    mime === "application/yaml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** Ce qu'un échec de cœur DIT à l'agent. Les `errorKey` sont des clés du
 *  namespace i18n `ApiErrors` : nues, elles ne veulent rien dire hors de l'app,
 *  et les `params` que le cœur a calculés (la limite du plan) se perdaient en
 *  route. Ici on les rend en anglais, comme le reste de la surface MCP. */
const CORE_MESSAGES: Record<
  string,
  (params?: Record<string, string | number>) => string
> = {
  issueLimitReached: (params) =>
    `This project has reached the ${params?.limit ?? "issue"} issue limit of its ` +
    "owner's plan. The owner must upgrade the plan or free up issues — retrying " +
    "will not help.",
};

interface CoreFailure {
  status: number;
  errorKey?: string;
  rawMessage?: string;
  /** Valeurs ICU du message (ex. `limit` pour `issueLimitReached`). */
  params?: Record<string, string | number>;
}

/** Le message lisible d'un échec de cœur — celui de `coreFail`, réutilisé par
 *  les tools qui rendent leurs échecs PAR TICKET dans un tableau `failed`. */
function coreMessage(r: CoreFailure, fallback = "Request failed"): string {
  const known = r.errorKey ? CORE_MESSAGES[r.errorKey] : undefined;
  return known ? known(r.params) : (r.rawMessage ?? r.errorKey ?? fallback);
}

/** Map a lib/server/* core failure to a stable MCP error. */
function coreFail(r: CoreFailure): ToolResult {
  // 403 = une limite de PLAN, donc un refus définitif tant que rien ne change
  // côté compte — jamais une panne. Le rendre en `database_error` disait
  // « réessaie » à un agent qui n'aurait jamais pu réussir : il retentait sans
  // fin et personne n'apprenait la cause. Même raisonnement, et même code
  // stable, que l'API publique (app/api/v1/issues/route.ts).
  if (r.status === 403) return fail("plan_limit_reached", coreMessage(r));
  if (r.status === 409) return fail("conflict", coreMessage(r));
  const code =
    r.status === 404
      ? "not_found"
      : r.status === 400
        ? "invalid_params"
        : "database_error";
  return fail(code, coreMessage(r));
}

/**
 * Le plan et la description d'un ticket TELS QU'ILS SONT STOCKÉS — le point de
 * départ obligé des écritures chirurgicales (append, patch) : ce qu'on lit
 * d'abord, on ne peut pas l'écraser sans le voir. Les deux colonnes d'un coup,
 * en une seule chaîne littérale (`select` type ses colonnes en LISANT ce texte,
 * une concaténation lui rend le résultat opaque).
 */
async function readIssueText(
  issueId: string
): Promise<{ plan: string; description: string } | { error: ToolResult }> {
  const { data, error } = await getServiceClient()
    .from("issues")
    .select("plan, description")
    .is("deleted_at", null)
    .eq("id", issueId)
    .maybeSingle();
  if (error) return { error: fail("database_error", error.message) };
  return {
    plan: typeof data?.plan === "string" ? data.plan : "",
    description: typeof data?.description === "string" ? data.description : "",
  };
}

/** Les tâches du plan après écriture, avec les index que reprend
 *  minddy_update_plan_task — le retour commun des trois tools de plan. */
function planTaskSummary(plan: string | null | undefined) {
  const parsed = parsePlan(plan ?? "");
  return {
    plan_tasks: parsed.tasks.map((t) => ({
      task_index: t.index,
      state: t.state,
      text: t.text,
    })),
    plan_progress: parsed.progress,
  };
}

/** Plafond du diff renvoyé par minddy_edit_issue_text : de quoi confirmer que
 *  l'édition a atterri au bon endroit, sans re-transporter le document qu'on
 *  vient précisément d'éviter de réécrire. */
const MAX_EDIT_DIFF_CHARS = 2000;

/** Les noms que porte CETTE surface, pour que les refus du patch renvoient vers
 *  des tools qui existent ici (cf. IssueTextTools). */
const MCP_TEXT_TOOLS: IssueTextTools = {
  read: "minddy_get_issue",
  appendToPlan: "minddy_append_to_plan",
  replaceWhole: {
    plan: "minddy_update_issues { fields: { plan } }",
    description: "minddy_update_issues { fields: { description } }",
  },
};

const PLAN_FIELD = z
  .string()
  .max(MAX_PLAN_LENGTH)
  .describe(
    "Implementation plan: FULL markdown document, and a REAL engineering plan " +
      "(the kind a coding agent's plan mode produces), not a vague todo list. " +
      "Structure: a short context section (goal, approach, constraints), then " +
      "ordered checkbox tasks where EACH task names the actual code to touch (" +
      "exact file paths, components, functions, migrations, routes), and a final " +
      "verification step (how to test end-to-end). 'Add POST handler in " +
      "app/api/foo/route.ts with zod validation' is a good task; 'do the backend' " +
      "is not. Checkbox states: '- [ ]' pending, '- [~]' in progress, '- [x]' " +
      "completed, '- [-]' cancelled. Prose between task blocks is allowed. " +
      "DECIDE rather than ask: on an unresolved detail, pick the most reasonable " +
      "option and state the assumption in the context section. Park a question " +
      "only when being wrong is expensive, under a '## Questions' heading. " +
      "checkboxes there are open questions, not work, and stay out of the " +
      "progress count (tick one to mark it answered). " +
      "This field REPLACES the whole plan, so send it whole when WRITING one — " +
      "but never to change part of an existing plan: minddy_append_to_plan adds " +
      "a block, minddy_edit_issue_text rewrites a passage (old_string → " +
      "new_string), minddy_update_plan_task flips a task's state. All three cost " +
      "a few tokens instead of the whole document, and leave what you did not " +
      "touch exactly as it was."
  );

const PROJECT_ID = z
  .string()
  .uuid()
  .describe("Project UUID. Use minddy_list_projects to discover ids.");

/** Une routine (MIN-185) telle qu'un client MCP la relit — cadence en clair,
    jamais une expression cron : c'est ce qu'il devra réafficher à l'utilisateur. */
function mcpRoutine(routine: Routine) {
  return {
    id: routine.id,
    title: routine.title,
    prompt: routine.prompt,
    model: routine.model,
    reasoning_level: routine.reasoning_level,
    base_branch: routine.base_branch,
    /** Ce qu'UN passage peut dépenser, en % du budget mensuel du propriétaire. */
    max_spend_percent: routine.max_spend_percent,
    frequency: routine.frequency,
    hour: routine.hour,
    minute: routine.minute,
    weekdays: routine.weekdays,
    days_of_month: routine.days_of_month,
    timezone: routine.timezone,
    enabled: routine.enabled,
    next_run_at: routine.next_run_at,
    last_run_at: routine.last_run_at,
    // CODE du dernier passage manqué ('quota', 'noRepo'…) : à traduire côté
    // client, jamais à afficher tel quel.
    last_error: routine.last_error,
  };
}

/** Refus de la fabrique de routines → erreur MCP, avec le code qui va bien. */
function routineFailure(r: {
  errorKey: string;
  modelLimit?: { model: string; multiplier: number; limit: number; planId: string };
}): ToolResult {
  switch (r.errorKey) {
    case "ownerOnly":
      return fail(
        "forbidden",
        "Only the project's OWNER can create or change a routine — it is their AI usage budget that runs on every occurrence. There is no way around it."
      );
    case "projectNotFound":
      return fail("not_found", "Project not found or not accessible.");
    case "routineNotFound":
      return fail("not_found", "No routine with that id in this project.");
    case "noRepo":
      return fail(
        "invalid_params",
        "This project has no linked repository, so a routine would have nothing to clone. Link one first."
      );
    case "promptRequired":
      return fail("invalid_params", "prompt is required — it is the instruction each run receives.");
    case "unknownTimezone":
      return fail(
        "invalid_params",
        "timezone must be a valid IANA name (e.g. 'Europe/Paris'). Pass the user's own timezone; never guess and never fall back to UTC."
      );
    case "invalidSchedule":
      return fail(
        "invalid_params",
        "The cadence does not hold together: 'weekly' takes at least one day in weekdays (0=Sunday…6=Saturday) and no days_of_month; 'monthly' takes at least one day in days_of_month (1–31) and no weekdays."
      );
    case "modelAbovePlan":
      return fail(
        "forbidden",
        r.modelLimit
          ? `The model ${r.modelLimit.model} costs ${r.modelLimit.multiplier}x minddy's default model, above the ${r.modelLimit.limit}x ceiling of the ${r.modelLimit.planId} plan. Omit model to use the account default.`
          : "That model is above the plan's model ceiling. Omit model to use the account default."
      );
    case "noFieldsToUpdate":
      return fail("invalid_params", "Pass at least one field to change.");
    default:
      return fail("database_error", "Could not save the routine.");
  }
}

const ISSUE_REF = z
  .string()
  .describe(
    "Issue reference: UUID, identifier like 'MIND-42', or bare issue number."
  );

const RECURRENCE_FIELD = z
  .enum(RECURRENCE_CADENCES)
  .describe(
    "Makes the issue RECURRING at this cadence. Needs a due_date (in the same " +
      "call, or already on the issue), which carries the first occurrence and " +
      "gives the rhythm its day: weekly + a Monday = every Monday, monthly + " +
      "the 4th = every 4th. A past due date is moved forward to the next " +
      "occurrence, so the issue never starts overdue. Then it runs on its own: " +
      "completing it (status 'done') creates the next occurrence in 'backlog' " +
      "one cadence later and carries the recurrence over — only ever ONE live " +
      "issue per series, so never create the next occurrence yourself. Clear it " +
      "(null, via minddy_update_issues) to stop the series."
  );

/** Garde combinée auth + rate limit + accès projet des tools scopés projet. */
async function requireProject(
  extra: ToolExtra,
  projectId: unknown
): Promise<
  | { userId: string; keyId: string | null; access: ProjectAccess }
  | { error: ToolResult }
> {
  const auth = requireUser(extra);
  if ("error" in auth) return auth;
  const project = await resolveProject(auth.userId, projectId);
  if ("error" in project) return project;
  return { userId: auth.userId, keyId: auth.keyId, access: project.access };
}

function mcpReadCtx(access: ProjectAccess): ReadContext {
  const service = getServiceClient();
  return {
    db: service,
    service,
    projectId: access.project.id,
    projectKey: access.project.key,
  };
}

/** Résout un post de feedback par UUID, épinglé au projet — l'équivalent de
    resolveIssueRef pour le feedback (pas d'identifiant KEY-N, seulement l'id). */
async function resolveFeedbackPost(
  access: ProjectAccess,
  postId: unknown
): Promise<{ post: { id: string; title: string; issue_id: string | null } } | { error: ToolResult }> {
  if (typeof postId !== "string" || !postId) {
    return {
      error: fail(
        "invalid_params",
        "feedback_post_id is required: a feedback post UUID (from minddy_list_feedback)."
      ),
    };
  }
  const post = await getProjectFeedbackPost(access.project.id, postId);
  if (!post) {
    return { error: fail("feedback_not_found", "Feedback post not found in this project.") };
  }
  return { post: { id: post.id, title: post.title, issue_id: post.issue_id } };
}

/** Les 20 derniers événements d'activité d'un ticket OU d'un objectif, acteurs
    résolus en libellés lisibles (membre, « Numo », « clé (mcp) », intégration) —
    ordre chronologique, pour répondre à « qu'est-ce qui s'est passé ici ? ».
    `issue_events` est polymorphe depuis l'activité des objectifs
    (20260728091000_objective_activity.sql) : une ligne pend d'un ticket ou d'un
    objectif, jamais des deux. */
async function recentActivity(
  parent: { issue_id: string } | { objective_id: string }
): Promise<Array<Record<string, unknown>>> {
  const service = getServiceClient();
  const query = service
    .from("issue_events")
    .select(
      "type, field, from_value, to_value, actor_id, via_assistant, via_mcp, api_key_id, integration_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(20);
  const { data } =
    "issue_id" in parent
      ? await query.eq("issue_id", parent.issue_id)
      : await query.eq("objective_id", parent.objective_id);
  const events = (data ?? []).reverse();
  if (events.length === 0) return [];

  const [users, keyActors, { data: integrations }] = await Promise.all([
    fetchAuthUsersById(
      service,
      events.map((e) => e.actor_id).filter((v): v is string => typeof v === "string")
    ),
    resolveApiKeyActors(events.map((e) => e.api_key_id as string | null)),
    service
      .from("integrations")
      .select("id, name")
      .in("id", [
        ...new Set(
          events
            .map((e) => e.integration_id)
            .filter((v): v is string => typeof v === "string")
        ),
      ]),
  ]);
  const integrationNames = new Map((integrations ?? []).map((i) => [i.id, i.name]));

  return events.map((e) => {
    // Action PR/MR venue d'un webhook provider : pas d'acteur minddy — le login
    // provider tient lieu d'acteur, DÉCODÉ (le préfixe `gitlab:` de from_value
    // est un encodage interne, cf. forgeActorValue, il ne doit pas fuir ici).
    const forge = isForgePrEvent(e as { type: string; actor_id: string | null })
      ? forgePrActor(e.from_value as string | null)
      : null;
    return {
      actor: forge
        ? `${forge.login ?? getRepoProvider(forge.provider).displayName} (${forge.provider})`
        : e.via_assistant
          ? "Numo"
          : e.via_mcp
            ? `${keyActors.get(e.api_key_id as string)?.name ?? "Agent"} (mcp)`
            : e.integration_id
              ? `${integrationNames.get(e.integration_id) ?? "Integration"} (integration)`
              : displayName(toNamed(users.get(e.actor_id as string)), "User"),
      type: e.type,
      field: e.field,
      from_value: forge ? forge.login : e.from_value,
      to_value: e.to_value,
      created_at: e.created_at,
    };
  });
}

/** Mode detailed de minddy_list_issues : noms (assigné, objectif, catégories)
    à côté des UUID — principe « human-readable identifiers ». */
async function withNames(
  rows: Array<Record<string, unknown>>,
  access: ProjectAccess
): Promise<Array<Record<string, unknown>>> {
  const service = getServiceClient();
  const [users, { data: objectives }, { data: categories }] = await Promise.all([
    fetchAuthUsersById(
      service,
      rows.map((r) => r.assignee_id).filter((v): v is string => typeof v === "string")
    ),
    service.from("objectives").select("id, name").eq("project_id", access.project.id).is("deleted_at", null),
    service.from("categories").select("id, name").eq("project_id", access.project.id),
  ]);
  const objectiveNames = new Map((objectives ?? []).map((o) => [o.id, o.name]));
  const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return rows.map((row) => ({
    ...row,
    assignee_name:
      typeof row.assignee_id === "string"
        ? displayName(toNamed(users.get(row.assignee_id)), "User")
        : null,
    objective_name:
      typeof row.objective_id === "string"
        ? (objectiveNames.get(row.objective_id) ?? null)
        : null,
    category_names: Array.isArray(row.category_ids)
      ? row.category_ids.map((id) => categoryNames.get(id as string) ?? id)
      : [],
  }));
}

/**
 * Catégories demandées par NOM autant que par id.
 *
 * Un agent qui crée un ticket connaît « bug » ou « infra », pas
 * `f3c1e2…`. Lui imposer un `minddy_list_categories` avant chaque création,
 * c'est exactement l'aller-retour qu'il saute — et le ticket arrive sans
 * catégorie. Les noms sont donc résolus ici, à la casse et aux espaces près.
 *
 * Ce qui ne correspond à RIEN est rendu à l'appelant (`categories_unmatched`)
 * plutôt que jeté : le cœur, lui, filtre en silence
 * ([create-issue.ts](../create-issue.ts) — un `in()` sur le projet), et un nom
 * inventé qui disparaît sans un mot se lit « catégorie posée » côté agent.
 */
async function resolveCategoryRefs(
  projectId: string,
  ids: string[] | undefined,
  names: string[] | undefined
): Promise<{ ids: string[]; unmatched: string[] } | { error: ToolResult }> {
  if (!ids?.length && !names?.length) return { ids: [], unmatched: [] };
  const { data, error } = await getServiceClient()
    .from("categories")
    .select("id, name")
    .eq("project_id", projectId);
  if (error) return { error: fail("database_error", error.message) };
  const rows = data ?? [];
  const knownIds = new Set(rows.map((c) => c.id as string));
  const byName = new Map(
    rows.map((c) => [(c.name as string).trim().toLowerCase(), c.id as string])
  );

  const resolved = new Set<string>();
  const unmatched: string[] = [];
  for (const id of ids ?? []) {
    if (knownIds.has(id)) resolved.add(id);
    else unmatched.push(id);
  }
  for (const name of names ?? []) {
    const hit = byName.get(name.trim().toLowerCase());
    if (hit) resolved.add(hit);
    else unmatched.push(name);
  }
  return { ids: [...resolved], unmatched };
}

/** Une relation demandée à la création d'un ticket : la cible peut être un
    ticket qui existe déjà, ou `sub:N` — le Nième sous-ticket du MÊME appel. */
const RELATION_INPUT = z.object({
  relation: z
    .enum(["blocks", "blocked_by", "related"])
    .describe("Relation type, from THIS issue's point of view."),
  target: z
    .string()
    .describe(
      "The other issue: UUID, identifier ('MIND-42'), bare number, or 'sub:N' " +
        "— the Nth sub-issue of this same call, 1-based. 'sub:N' is what lets a " +
        "breakdown wire its own dependencies in one pass, before the sub-issues " +
        "have identifiers."
    ),
});

type RelationInput = z.infer<typeof RELATION_INPUT>;

/**
 * Les relations demandées à la création, posées APRÈS que tout existe.
 *
 * Deux raisons de ne pas les poser au fil de l'eau : un sous-ticket peut en
 * bloquer un autre créé plus tard dans le même appel (`sub:3` depuis `sub:1`),
 * et une relation qui échoue ne doit rien annuler — le ticket, lui, est écrit.
 * D'où le contrat rendu : `relations` pour ce qui a été posé, `relations_failed`
 * pour ce qui ne l'a pas été, jamais une erreur d'ensemble.
 */
async function applyCreatedRelations(
  scope: { userId: string; keyId: string | null; access: ProjectAccess },
  requests: Array<{ source: { id: string; identifier: string }; input: RelationInput }>,
  subsByIndex: Map<number, { id: string; identifier: string }>
): Promise<{
  applied: Array<{ issue: string; relation: string; target: string }>;
  failed: Array<{ issue: string; relation: string; target: string; error: string }>;
}> {
  const applied: Array<{ issue: string; relation: string; target: string }> = [];
  const failed: Array<{
    issue: string;
    relation: string;
    target: string;
    error: string;
  }> = [];

  for (const { source, input } of requests) {
    const subMatch = /^sub:(\d+)$/i.exec(input.target.trim());
    let target: { id: string; identifier: string } | null = null;
    if (subMatch) {
      target = subsByIndex.get(Number(subMatch[1])) ?? null;
      if (!target) {
        failed.push({
          issue: source.identifier,
          relation: input.relation,
          target: input.target,
          error: `'${input.target}' does not name a sub-issue of this call (they are 1-based, and one may have failed to be created).`,
        });
        continue;
      }
    } else {
      const resolved = await resolveIssueRef(scope.access, input.target);
      if ("error" in resolved) {
        failed.push({
          issue: source.identifier,
          relation: input.relation,
          target: input.target,
          error: `Issue '${input.target}' not found in this project.`,
        });
        continue;
      }
      target = { id: resolved.issue.id, identifier: resolved.issue.identifier };
    }

    if (target.id === source.id) {
      failed.push({
        issue: source.identifier,
        relation: input.relation,
        target: input.target,
        error: "An issue can't be related to itself.",
      });
      continue;
    }

    const result = await addIssueRelation({
      projectId: scope.access.project.id,
      actorId: scope.userId,
      sourceId: source.id,
      targetId: target.id,
      type: input.relation,
      mcpKeyId: scope.keyId,
    });
    if (result.ok) {
      applied.push({
        issue: source.identifier,
        relation: input.relation,
        target: target.identifier,
      });
    } else {
      failed.push({
        issue: source.identifier,
        relation: input.relation,
        target: target.identifier,
        error: coreMessage(result, "relation failed"),
      });
    }
  }
  return { applied, failed };
}

/**
 * Enveloppe `registerTool` pour tracker CHAQUE appel d'outil MCP (MIN-78).
 *
 * Un décorateur unique plutôt que quarante `captureServerEvent` copiés dans les
 * handlers : la couverture est totale, elle ne peut pas dériver, et un outil
 * ajouté demain est instrumenté sans y penser. On mesure le nom de l'outil, sa
 * durée et son issue (succès / erreur applicative) — jamais les arguments, qui
 * portent des titres et des descriptions de tickets.
 *
 * C'est la seule fenêtre sur l'usage agent de minddy : par construction, aucun
 * navigateur n'est impliqué ici, donc aucun événement client ne le verrait.
 */
function withToolAnalytics(server: McpServer): McpServer {
  const original = server.registerTool.bind(server) as (
    ...args: unknown[]
  ) => unknown;

  const wrapped = (name: string, config: unknown, handler: unknown) => {
    const tracked = async (...args: unknown[]) => {
      const extra = args[args.length - 1] as ToolExtra | undefined;
      const startedAt = Date.now();
      let outcome = "ok";
      try {
        const result = (await (handler as (...a: unknown[]) => Promise<ToolResult>)(
          ...args
        )) as ToolResult;
        // Les tools ne lèvent pas : ils renvoient `fail(...)`, marqué isError.
        if (result?.isError) outcome = "error";
        return result;
      } catch (err) {
        outcome = "exception";
        throw err;
      } finally {
        captureServerEvent({
          distinctId: getUserId(extra ?? {}) ?? "mcp:anonymous",
          event: "mcp_tool_called",
          properties: {
            tool_name: name,
            outcome,
            duration_bucket: durationBucket(Date.now() - startedAt),
          },
        });
      }
    };
    return original(name, config, tracked);
  };

  // Proxy plutôt que mutation : le serveur MCP appartient à `mcp-handler`, on
  // ne réécrit pas ses méthodes en place.
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === "registerTool") return wrapped;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as McpServer;
}

export function registerMinddyTools(rawServer: McpServer): void {
  const server = withToolAnalytics(rawServer);

  // ── Lectures ──────────────────────────────────────────────────────────

  server.registerTool(
    "minddy_list_projects",
    {
      title: "List projects",
      description:
        "List every minddy project the API key's owner can access (owned or member). " +
        "Returns each project's id (UUID to pass as project_id elsewhere), name, key " +
        "(the issue-identifier prefix, e.g. 'MIND' in 'MIND-42') and your role.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async (_args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;

      const service = getServiceClient();
      const { data: memberships, error: memberError } = await service
        .from("project_members")
        .select("project_id")
        .eq("user_id", auth.userId);
      if (memberError) return fail("database_error", memberError.message);

      const memberIds = (memberships ?? []).map((m) => m.project_id as string);
      let query = service
        .from("projects")
        .select("id, name, key, owner_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      query = memberIds.length
        ? query.or(`owner_id.eq.${auth.userId},id.in.(${memberIds.join(",")})`)
        : query.eq("owner_id", auth.userId);

      const { data, error } = await query;
      if (error) return fail("database_error", error.message);

      return ok({
        projects: (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          key: p.key,
          role: p.owner_id === auth.userId ? "owner" : "member",
        })),
      });
    }
  );

  server.registerTool(
    "minddy_get_project",
    {
      title: "Get project",
      description:
        "Fetch one project's details: name, key, your role, and the count of open " +
        "issues (statuses other than done/canceled/duplicate).",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const { project } = scope.access;

      const service = getServiceClient();
      const { count, error } = await service
        .from("issues")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("project_id", project.id)
        .not("status", "in", "(done,canceled,duplicate)");
      if (error) return fail("database_error", error.message);

      return ok({
        project: {
          id: project.id,
          name: project.name,
          key: project.key,
          role: scope.access.isOwner ? "owner" : "member",
          open_issues: count ?? 0,
          created_at: project.created_at,
        },
      });
    }
  );

  server.registerTool(
    "minddy_list_issues",
    {
      title: "List issues",
      description:
        "List or search a project's issues, newest-updated first. Pass `query` to " +
        "search by text, identifier ('MIND-42') or number; otherwise filters apply. " +
        "Closed issues (done/canceled/duplicate) are hidden unless include_done is " +
        "true or an explicit status filter names them. response_format 'detailed' " +
        "adds assignee/objective/category names and a truncated description; " +
        "'concise' (default) keeps rows compact. has_more tells you to paginate " +
        "with offset.",
      inputSchema: {
        project_id: PROJECT_ID,
        query: z
          .string()
          .optional()
          .describe("Text search (title/description) or exact identifier/number."),
        status: z
          .array(z.enum(ISSUE_STATUSES))
          .optional()
          .describe("Only these statuses (overrides the closed-issues default)."),
        assignee_id: z
          .string()
          .nullable()
          .optional()
          .describe("Member user_id, or null for unassigned issues."),
        objective_id: z.string().uuid().optional(),
        category_id: z.string().uuid().optional(),
        include_done: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
        offset: z.number().int().min(0).optional(),
        response_format: z.enum(["concise", "detailed"]).optional(),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ctx = mcpReadCtx(scope.access);
      const detailed = args.response_format === "detailed";

      if (typeof args.query === "string" && args.query.trim()) {
        const r = await searchIssues(ctx, { query: args.query, limit: args.limit });
        if ("error" in r) return fail("invalid_params", r.error);
        const issues = detailed ? await withNames(r.issues, scope.access) : r.issues;
        return ok({ issues, has_more: false });
      }

      const r = await listIssues(ctx, { ...args, include_description: detailed });
      if ("error" in r) return fail("database_error", r.error);
      const issues = detailed ? await withNames(r.issues, scope.access) : r.issues;
      return ok({ issues, has_more: r.has_more });
    }
  );

  server.registerTool(
    "minddy_get_issue",
    {
      title: "Get issue",
      description:
        "Fetch one issue in full: every field (title, description, status, priority, " +
        "effort, assignee, objective, due date, parent), its implementation plan " +
        "(raw markdown plus parsed plan_tasks with stable task_index for " +
        "minddy_update_plan_task, and plan_progress), comments with author names, " +
        "resource metadata — files AND links (id + kind, file name/type/size or " +
        "url, on the issue and on each comment; add one with " +
        "minddy_add_resource, read one with minddy_get_resource) —, sub-issues, " +
        "its `relations` (the issues it blocks, is blocked_by, or is related to, " +
        "each with identifier/title/status — that is the order of work; write " +
        "them with minddy_link_issues), " +
        "and the last " +
        "activity events (status changes, reassignments…) with resolved actors: " +
        "'what happened on this issue?'. It also carries `linked_feedback` — the " +
        "user requests from the feedback board this issue implements (title, " +
        "status, vote_count, comment_count). That is the WHY behind the work, in " +
        "the users' own words: when an issue carries one, read it with " +
        "minddy_get_feedback before deciding what to build, especially if it has " +
        "comments — people qualify their request there.",
      inputSchema: { project_id: PROJECT_ID, issue: ISSUE_REF },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const r = await getIssue(mcpReadCtx(scope.access), { issue_id: ref.issue.id });
      if ("error" in r) return fail("issue_not_found", r.error);

      const activity = await recentActivity({ issue_id: ref.issue.id });

      const plan = r.issue.plan;
      const parsed = typeof plan === "string" && plan ? parsePlan(plan) : null;
      return ok({
        ...r,
        activity,
        ...(parsed
          ? {
              plan_tasks: parsed.tasks.map((t) => ({
                task_index: t.index,
                state: t.state,
                text: t.text,
              })),
              plan_progress: parsed.progress,
            }
          : {}),
      });
    }
  );

  server.registerTool(
    "minddy_get_pull_request",
    {
      title: "Get pull request",
      description:
        "Read the pull request the code agent opened for an issue: its number, url, " +
        "state (open/merged/closed), whether it is still a draft, its CI checks " +
        "(aggregate state, how many pass, and the failing ones by name), " +
        "title, description, head/base branches, the " +
        "per-file diffs (patches, truncated past ~4000 chars), and the review comments " +
        "anchored to lines of code. 'checks: null' means they could not be read, not " +
        "that they pass. Each review comment thread carries its file, its " +
        "line and side (RIGHT = the new file, LEFT = the old one), the diff snippet it " +
        "was written against, and its replies; 'outdated: true' means the code it " +
        "pointed at has since changed, so only the snippet says what it referred to. " +
        "'resolved: true' means the thread was marked resolved on the forge — the " +
        "point is settled, read it for the decision it records rather than acting on " +
        "it again; 'resolved: false' also covers 'the forge did not say'. " +
        "Use it to review a PR, explain what it changes, or act on the review feedback. " +
        "Fails if the issue has no agent-opened PR, or if the project has no linked " +
        "GitHub repo.",
      inputSchema: { project_id: PROJECT_ID, issue: ISSUE_REF },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      // La PR d'une issue est portée par sa run CANONIQUE — la plus ancienne à
      // l'avoir ouverte ; les runs suivants (demandes de changements) la partagent.
      const { data: run, error } = await getServiceClient()
        .from("agent_runs")
        .select("pr_number")
        .eq("issue_id", ref.issue.id)
        .not("pr_number", "is", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) return fail("database_error", error.message);
      const prNumber = (run as { pr_number?: number } | null)?.pr_number;
      if (prNumber == null) {
        return fail(
          "pull_request_not_found",
          `Issue '${ref.issue.identifier}' has no pull request opened by the code agent yet.`
        );
      }

      let target;
      try {
        target = await resolveRepoCloneTarget(scope.access.project.id);
      } catch (e) {
        return fail("git_link_invalid", (e as Error).message);
      }
      if (!target) {
        return fail("no_repository", "This project has no linked repository.");
      }
      const forge = forgeFor(target.provider);

      try {
        const [pr, diff, reviewComments, reviewThreads] = await Promise.all([
          forge.getPullRequest({
            token: target.token,
            repoFullName: target.repoFullName,
            number: prNumber,
          }),
          forge.listPullRequestFiles({
            token: target.token,
            repoFullName: target.repoFullName,
            number: prNumber,
          }),
          forge
            .listPullRequestReviewComments({
              token: target.token,
              repoFullName: target.repoFullName,
              number: prNumber,
            })
            .catch(() => []),
          // État de résolution des fils (MIN-139) — best-effort, comme les
          // commentaires : illisible = fils sans état, pas d'erreur.
          forge
            .listReviewThreads({
              token: target.token,
              repoFullName: target.repoFullName,
              number: prNumber,
            })
            .catch(() => []),
        ]);
        // Checks CI (MIN-138) — `null` = illisible (permission de l'App non
        // acceptée) ou dépôt sans CI ; jamais bloquant pour la lecture de la PR.
        const checks = pr.headSha
          ? await forge
              .listChecks({
                token: target.token,
                repoFullName: target.repoFullName,
                number: prNumber,
                sha: pr.headSha,
              })
              .catch(() => null)
          : null;
        return ok({
          pull_request: {
            number: pr.number,
            url: pr.url,
            state: pr.merged ? "merged" : pr.state,
            title: pr.title,
            body: pr.body,
            head: pr.head,
            base: pr.base,
            draft: !!pr.draft,
            checks: checks
              ? {
                  state: checks.state,
                  passing: checks.passing,
                  total: checks.total,
                  failing: checks.checks
                    .filter((c) => c.state === "failure")
                    // `description` = ce que la forge dit de l'échec, quand elle
                    // le formule : de quoi savoir QUOI corriger sans ouvrir le lien.
                    .map((c) => ({ name: c.name, url: c.url, description: c.description })),
                }
              : null,
            repository: target.repoFullName,
            issue: { id: ref.issue.id, identifier: ref.issue.identifier },
            files: diff.files.map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              // Plafonne le patch : un gros diff noierait le contexte du modèle.
              patch:
                f.patch && f.patch.length > MAX_PATCH_CHARS
                  ? f.patch.slice(0, MAX_PATCH_CHARS) + "\n… (diff truncated)"
                  : f.patch ?? null,
            })),
            // La pagination de la forge a coupé la liste : le dire plutôt que de
            // laisser conclure sur ce qui a été vu.
            files_truncated: diff.truncated,
            // Fils de review ancrés au code. Un fil périmé (`outdated`) n'a plus
            // d'ancre fiable — son `diff_hunk` est la seule trace du code visé.
            review_comments: groupReviewThreads(reviewComments, reviewThreads).map((thread) => ({
              id: thread.id,
              path: thread.root.path,
              line: thread.root.line,
              original_line: thread.root.original_line,
              side: thread.root.side,
              // Remarque MULTI-LIGNES : `line` en est la dernière ligne, celle-ci
              // la première. Sans elle, « ces dix lignes sont fausses » se lit
              // comme un point sur la seule dernière (MIN-181).
              start_line: thread.root.start_line,
              outdated: thread.root.line == null,
              // `true` = le fil a été marqué résolu : le point est réglé.
              // `false` inclut « état inconnu » — la forge ne l'a pas dit.
              resolved: !!thread.resolution?.resolved,
              diff_hunk: thread.root.diff_hunk,
              url: thread.root.html_url,
              comments: thread.comments.map((c) => ({
                author: c.user?.login ?? null,
                body: c.body,
                created_at: c.created_at,
              })),
            })),
          },
        });
      } catch (e) {
        return fail("github_error", (e as Error).message);
      }
    }
  );

  server.registerTool(
    "minddy_link_pull_request",
    {
      title: "Link pull request to issue",
      description:
        "Attach an existing pull request of the project's linked repository to a minddy " +
        "issue, when it was not attached on its own. A PR normally finds its issue by " +
        "CONVENTION at ingestion — the issue identifier in the branch name, the title, or a " +
        "closing line ('Fixes MIND-42') of the description — so use this tool only for a PR " +
        "that followed none of them and shows up with no issue. " +
        "Identify the PR by number ('42', '#42', '!42' for a GitLab merge request) or by " +
        "pasting its forge URL; the repository is the one the project links. " +
        "Attaching also ALIGNS the issue's status on the state of the PR: open → in_review, " +
        "draft → in_progress, merged → done, closed → todo (the response says which). " +
        "The link is DEFINITIVE and there is no unlink: a PR that already carries another " +
        "issue is refused, and so is an issue that already carries a live (draft or open) " +
        "pull request — several TERMINAL pull requests on one issue are normal. Re-linking " +
        "the same PR to the same issue is not an error, it just reports 'already: true'.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        pull_request: z
          .union([z.string(), z.number()])
          .describe(
            "The pull request to attach: its number (42), '#42', '!42' for a GitLab " +
              "merge request, or its full URL on the forge."
          ),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const found = await resolveProjectPullRequest({
        projectId: scope.access.project.id,
        ref: args.pull_request,
        userId: scope.userId,
      });
      if ("error" in found) {
        if (found.error === "invalid_ref") {
          return fail(
            "invalid_params",
            "pull_request must be a pull request number (42, '#42', '!42') or its URL on the forge."
          );
        }
        if (found.error === "no_repository") {
          return fail("no_repository", "This project has no linked repository.");
        }
        return fail(
          "pull_request_not_found",
          "No pull request with that number in the repository linked to this project."
        );
      }

      const result = await linkPullRequestToIssue({
        pr: found.pr,
        issue: { id: ref.issue.id, projectId: scope.access.project.id },
        actorId: scope.userId,
      });
      if (!result.ok) return fail(result.code, LINK_REFUSALS[result.code]);

      return ok({
        linked: true,
        already: result.already,
        pull_request: {
          number: found.pr.number,
          url: found.pr.url,
          state: found.pr.state,
          title: found.pr.title,
          repository: found.pr.repo_full_name,
        },
        issue: { id: ref.issue.id, identifier: ref.issue.identifier },
        issue_status: result.status,
      });
    }
  );

  server.registerTool(
    "minddy_list_members",
    {
      title: "List members",
      description:
        "List a project's members (owner included) with their user_id, display name " +
        "and role. Use user_id for assignee_id in create/update tools.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const r = await listMembers(
        mcpReadCtx(scope.access),
        scope.access.project.owner_id
      );
      if ("error" in r) return fail("database_error", r.error);
      return ok(r);
    }
  );

  server.registerTool(
    "minddy_list_categories",
    {
      title: "List categories",
      description:
        "List a project's categories (labels). Read-only: assign them to issues " +
        "via category_ids in minddy_create_issue / minddy_update_issues.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const { data, error } = await getServiceClient()
        .from("categories")
        .select("id, name, color")
        .eq("project_id", scope.access.project.id)
        .order("name", { ascending: true });
      if (error) return fail("database_error", error.message);
      return ok({ categories: data ?? [] });
    }
  );

  server.registerTool(
    "minddy_list_objectives",
    {
      title: "List objectives",
      description:
        "List a project's objectives (issue groups with a shared goal): id, name, " +
        "a TRUNCATED description, " +
        "status (planned/in_progress/done/canceled), lead, target date, " +
        "progress: { done, total, percent } computed from linked issues " +
        "(status 'done' / all linked), same as the UI's progress bar. Plus, when " +
        "present, the objective's own resources — files AND links (id + kind, " +
        "file name/type/size or url; read one with minddy_get_resource). " +
        "minddy_get_objective opens ONE of them in full: the whole description, " +
        "its issues, and its comment thread.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const service = getServiceClient();
      const [
        { data, error },
        { data: linkedIssues, error: issuesError },
        { data: attachmentRows },
      ] = await Promise.all([
        service
          .from("objectives")
          .select("id, name, description, status, lead_user_id, target_date, color")
          .is("deleted_at", null)
          .eq("project_id", scope.access.project.id)
          .order("created_at", { ascending: true }),
        service
          .from("issues")
          .select("objective_id, status, effort")
          .is("deleted_at", null)
          .eq("project_id", scope.access.project.id)
          .not("objective_id", "is", null),
        // Objective-level resources (comment_id null) — metadata only; a
        // file's bytes come from minddy_get_resource by id.
        service
          .from("attachments")
          .select(
            "id, objective_id, kind, url, file_name, mime_type, size_bytes"
          )
          .eq("project_id", scope.access.project.id)
          .not("objective_id", "is", null)
          .is("comment_id", null)
          .order("created_at", { ascending: true }),
      ]);
      if (error) return fail("database_error", error.message);
      if (issuesError) return fail("database_error", issuesError.message);

      const resourcesByObjective = new Map<string, Record<string, unknown>[]>();
      for (const row of attachmentRows ?? []) {
        const id = row.objective_id as string;
        const list = resourcesByObjective.get(id) ?? [];
        list.push(resourceMeta(row));
        resourcesByObjective.set(id, list);
      }

      // Progression : done/total restent des comptes bruts de tickets pour le
      // label, mais percent est pondéré par l'effort en points Fibonacci
      // (effortToPoints) avec crédit partiel par statut — même calcul que
      // objectiveProgress dans lib/use-objectives-query.ts (MIN-56). `done`
      // compte tous les statuts CLOS (done, canceled, duplicate), comme le
      // pourcentage qui les crédite déjà à 100 % : un ticket annulé est réglé.
      const progress = new Map<
        string,
        { done: number; total: number; totalPoints: number; earnedPoints: number }
      >();
      for (const issue of linkedIssues ?? []) {
        const id = issue.objective_id as string;
        const entry =
          progress.get(id) ?? { done: 0, total: 0, totalPoints: 0, earnedPoints: 0 };
        entry.total += 1;
        if (isClosedStatus(issue.status as IssueStatus)) entry.done += 1;
        const points = effortToPoints(issue.effort as IssueEffort | null);
        entry.totalPoints += points;
        entry.earnedPoints += points * statusCompletionCredit(issue.status as IssueStatus);
        progress.set(id, entry);
      }

      const leads = await fetchAuthUsersById(
        service,
        (data ?? [])
          .map((o) => o.lead_user_id)
          .filter((v): v is string => typeof v === "string")
      );
      return ok({
        objectives: (data ?? []).map((o) => {
          const p =
            progress.get(o.id as string) ??
            { done: 0, total: 0, totalPoints: 0, earnedPoints: 0 };
          const atts = resourcesByObjective.get(o.id as string);
          return {
            ...o,
            // Tronquée : une liste sert à CHOISIR. Le document entier est dans
            // minddy_get_objective, et vingt descriptions complètes noieraient
            // la réponse pour la seule qui intéresse l'appelant.
            description: truncate(o.description as string | null, MAX_LIST_DESCRIPTION_CHARS),
            lead_name: o.lead_user_id
              ? displayName(toNamed(leads.get(o.lead_user_id)), "User")
              : null,
            progress: {
              done: p.done,
              total: p.total,
              percent:
                p.totalPoints === 0
                  ? 0
                  : Math.round((p.earnedPoints / p.totalPoints) * 100),
            },
            ...(atts ? { resources: atts } : {}),
          };
        }),
      });
    }
  );

  server.registerTool(
    "minddy_get_objective",
    {
      title: "Get objective",
      description:
        "Fetch ONE objective in full — the counterpart of minddy_get_issue: its " +
        "whole description (the goal, not the truncated line " +
        "minddy_list_objectives shows), status, lead, target date, weighted " +
        "progress, the ISSUES it groups (identifier, title, status, priority, " +
        "effort, assignee), its resources — files AND links —, its COMMENT " +
        "THREAD with author names, and the last activity events with resolved " +
        "actors. Read it before commenting on an objective or reporting on it: " +
        "the thread is where the team already said what it thinks, and the " +
        "issue list is what the progress bar is actually made of.",
      inputSchema: {
        project_id: PROJECT_ID,
        objective_id: z
          .string()
          .uuid()
          .describe("Objective UUID (from minddy_list_objectives)."),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const service = getServiceClient();

      const { data: objective, error } = await service
        .from("objectives")
        .select("*")
        .is("deleted_at", null)
        .eq("id", args.objective_id)
        .eq("project_id", scope.access.project.id)
        .maybeSingle();
      if (error) return fail("database_error", error.message);
      if (!objective) {
        return fail("not_found", "Objective not found in this project.");
      }

      const [{ data: issues }, { data: comments }, { data: attachmentRows }, activity] =
        await Promise.all([
          service
            .from("issues")
            .select("id, number, title, status, priority, effort, assignee_id")
            .is("deleted_at", null)
            .eq("objective_id", objective.id)
            .order("number", { ascending: true }),
          service
            .from("comments")
            .select(
              "id, author_id, body, parent_id, via_assistant, via_mcp, api_key_id, created_at"
            )
            .eq("objective_id", objective.id)
            .order("created_at", { ascending: true }),
          service
            .from("attachments")
            .select("id, comment_id, kind, url, file_name, mime_type, size_bytes")
            .eq("objective_id", objective.id)
            .order("created_at", { ascending: true }),
          recentActivity({ objective_id: objective.id as string }),
        ]);

      // Ressources : `comment_id` null = portée par l'objectif lui-même, sinon
      // par l'un de ses commentaires — même découpe que minddy_get_issue.
      const resourcesByComment = new Map<string | null, Record<string, unknown>[]>();
      for (const row of attachmentRows ?? []) {
        const key = (row.comment_id as string | null) ?? null;
        const list = resourcesByComment.get(key) ?? [];
        list.push(resourceMeta(row));
        resourcesByComment.set(key, list);
      }

      // Auteurs : un commentaire écrit par un agent est attribué à SA CLÉ, pas
      // au propriétaire de la clé — même règle que sur un ticket.
      const [users, keyActors] = await Promise.all([
        fetchAuthUsersById(service, [
          ...(comments ?? []).map((c) => c.author_id as string),
          ...(issues ?? [])
            .map((i) => i.assignee_id)
            .filter((v): v is string => typeof v === "string"),
          ...(typeof objective.lead_user_id === "string" ? [objective.lead_user_id] : []),
        ]),
        resolveApiKeyActors((comments ?? []).map((c) => c.api_key_id as string | null)),
      ]);

      // Progression : mêmes comptes et même pondération par effort que
      // minddy_list_objectives (et que la barre de l'UI).
      let done = 0;
      let totalPoints = 0;
      let earnedPoints = 0;
      for (const issue of issues ?? []) {
        if (isClosedStatus(issue.status as IssueStatus)) done += 1;
        const points = effortToPoints(issue.effort as IssueEffort | null);
        totalPoints += points;
        earnedPoints += points * statusCompletionCredit(issue.status as IssueStatus);
      }

      return ok({
        objective: {
          ...objective,
          lead_name:
            typeof objective.lead_user_id === "string"
              ? displayName(toNamed(users.get(objective.lead_user_id)), "User")
              : null,
          progress: {
            done,
            total: (issues ?? []).length,
            percent:
              totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100),
          },
          resources: resourcesByComment.get(null) ?? [],
        },
        issues: (issues ?? []).map((i) => ({
          id: i.id,
          identifier: issueIdentifier(scope.access.project.key, i.number as number),
          title: i.title,
          status: i.status,
          priority: i.priority,
          effort: i.effort,
          assignee_id: i.assignee_id,
          assignee_name:
            typeof i.assignee_id === "string"
              ? displayName(toNamed(users.get(i.assignee_id)), "User")
              : null,
        })),
        comments: (comments ?? []).map((c) => {
          const commentResources = resourcesByComment.get(c.id as string);
          return {
            id: c.id,
            author: c.via_assistant
              ? "Numo"
              : c.via_mcp
                ? `${keyActors.get(c.api_key_id as string)?.name ?? "Agent"} (mcp)`
                : displayName(toNamed(users.get(c.author_id as string)), "User"),
            body: c.body,
            parent_id: c.parent_id,
            created_at: c.created_at,
            ...(commentResources ? { resources: commentResources } : {}),
          };
        }),
        activity,
      });
    }
  );

  // ── Écritures (pas de suppressions) ───────────────────────────────────

  server.registerTool(
    "minddy_create_issue",
    {
      title: "Create issue",
      description:
        "Create an issue in a project. Status defaults to 'backlog' (the issue " +
        "lands directly on the board; the human is driving you). " +
        "FILL THE TICKET. `title` is the only field the schema requires, and a " +
        "ticket carrying nothing else is a ticket someone else has to finish by " +
        "hand — which is the work you were asked to do. Every call: a " +
        "`description` saying WHAT and WHY, an estimated `priority` AND `effort` " +
        "(infer them from the work; 'none'/absent is not an estimate), and the " +
        "project's categories that match — by name via `category_names`, no " +
        "lookup needed. Attach `objective_id` when an objective covers this work " +
        "(minddy_list_objectives), and set `due_date` when a date was named. " +
        "ASSIGNEE: pass the person the human named; on a single-member project " +
        "that person is the owner, always (minddy_list_members says so in one " +
        "call). Otherwise leave it empty rather than picking a colleague nobody " +
        "chose. " +
        "RELATIONS: pass `relations` in this same call whenever the work depends " +
        "on other work — 'blocks', 'blocked_by', 'related'. A backlog whose " +
        "dependencies live only in your head is a backlog nobody can order. " +
        "Set parent to make a sub-issue (one level max; it inherits the " +
        "parent's objective unless objective_id is set). description = WHAT/WHY " +
        "(the problem or feature); plan = HOW (the full implementation plan; see " +
        "the plan field spec). Pass sub_issues to split the work into sub-tickets " +
        "in the same call (the 'plan a feature and break it down' workflow) — " +
        "each carries its own fields and relations, and 'sub:N' targets a sibling " +
        "of the same call. " +
        "Returns the created issue (and sub-issues) with identifiers, plus " +
        "`categories_unmatched` and `relations_failed` when something you asked " +
        "for did not land.",
      inputSchema: {
        project_id: PROJECT_ID,
        title: z.string().min(1),
        description: z
          .string()
          .optional()
          .describe("Markdown. WHAT and WHY — write one on every issue you create."),
        plan: PLAN_FIELD.optional(),
        status: z.enum(ISSUE_STATUSES).optional().describe("Default: backlog."),
        priority: z
          .enum(ISSUE_PRIORITIES)
          .optional()
          .describe(
            "ALWAYS pass one, estimated from the work when the human did not say. " +
              "Default 'none' means 'nobody has judged this yet'."
          ),
        effort: z
          .enum(ISSUE_EFFORTS)
          .optional()
          .describe(
            "ALWAYS pass one, estimated from the work (t-shirt size). It is what " +
              "weights the objective's progress bar and fills a cycle."
          ),
        assignee_id: z
          .string()
          .optional()
          .describe(
            "Member user_id (minddy_list_members). The person the human named; " +
              "on a single-member project, the owner. Never a colleague nobody chose."
          ),
        objective_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "The objective this work belongs to (minddy_list_objectives). Attach " +
              "it whenever one covers the ticket."
          ),
        parent: ISSUE_REF.optional().describe("Parent issue → creates a sub-issue."),
        due_date: z.string().optional().describe("ISO 8601 date or datetime."),
        recurrence: RECURRENCE_FIELD.optional(),
        category_ids: z
          .array(z.string().uuid())
          .optional()
          .describe("Category UUIDs (minddy_list_categories). Combines with category_names."),
        category_names: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Categories BY NAME, case-insensitive — the cheap way to label an " +
              "issue without a lookup first. Names matching nothing come back in " +
              "`categories_unmatched` (this tool never creates a category)."
          ),
        relations: RELATION_INPUT.array()
          .max(50)
          .optional()
          .describe(
            "Relations of the NEW issue, applied once everything exists. Targets " +
              "are existing issues, or 'sub:N' for a sub-issue of this same call."
          ),
        sub_issues: z
          .array(
            z.object({
              title: z.string().min(1),
              description: z.string().optional(),
              plan: PLAN_FIELD.optional(),
              status: z.enum(ISSUE_STATUSES).optional(),
              priority: z.enum(ISSUE_PRIORITIES).optional(),
              effort: z.enum(ISSUE_EFFORTS).optional(),
              assignee_id: z.string().optional(),
              due_date: z.string().optional(),
              category_ids: z.array(z.string().uuid()).optional(),
              category_names: z.array(z.string().min(1)).optional(),
              relations: RELATION_INPUT.array()
                .max(50)
                .optional()
                .describe(
                  "Relations of THIS sub-issue. 'sub:N' targets a sibling of the " +
                    "same call (1-based, in the order of this array), so a " +
                    "breakdown states its own order of work: step 2 is " +
                    "blocked_by 'sub:1'."
                ),
            })
          )
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Sub-issues created under the new issue, in order. They inherit its " +
              "objective. Fill them like the parent — priority, effort, " +
              "categories, and the relations that order them. Incompatible with " +
              "parent (nesting is one level max)."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      let parentId: string | undefined;
      if (args.parent) {
        if (args.sub_issues?.length) {
          return fail(
            "invalid_params",
            "sub_issues can't be combined with parent: nesting is limited to one level."
          );
        }
        const parent = await resolveIssueRef(scope.access, args.parent);
        if ("error" in parent) return parent.error;
        parentId = parent.issue.id;
      }

      const {
        sub_issues: subInputs,
        relations: relationInputs,
        category_names: categoryNames,
        category_ids: categoryIds,
        ...issueArgs
      } = args;

      // Catégories résolues AVANT la création : les noms deviennent des ids, et
      // ce qui ne correspond à rien est collecté pour être dit (le cœur, lui,
      // filtrerait en silence).
      const unmatchedCategories: string[] = [];
      const cats = await resolveCategoryRefs(
        scope.access.project.id,
        categoryIds,
        categoryNames
      );
      if ("error" in cats) return cats.error;
      unmatchedCategories.push(...cats.unmatched);

      const result = await createIssueForProject({
        projectId: scope.access.project.id,
        projectName: scope.access.project.name,
        actorId: scope.userId,
        input: {
          ...issueArgs,
          ...(cats.ids.length ? { category_ids: cats.ids } : {}),
          ...(parentId ? { parent_id: parentId } : {}),
        },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      const identifier = issueIdentifier(
        scope.access.project.key,
        result.issue.number as number
      );
      const created = { id: result.issue.id as string, identifier };

      // Sous-tickets : créés dans l'ordre, échecs remontés individuellement —
      // le parent existe déjà, on ne le rollback pas.
      const subIssues: Array<Record<string, unknown>> = [];
      const subIssuesFailed: Array<{ title: string; error: string }> = [];
      // Index 1-based → sous-ticket réellement créé, pour résoudre les 'sub:N'.
      // Un sous-ticket qui a échoué n'y entre pas : les relations qui le visaient
      // ressortiront en `relations_failed` plutôt que de viser à côté.
      const subsByIndex = new Map<number, { id: string; identifier: string }>();
      const relationRequests: Array<{
        source: { id: string; identifier: string };
        input: RelationInput;
      }> = (relationInputs ?? []).map((input) => ({ source: created, input }));

      for (const [index, sub] of (subInputs ?? []).entries()) {
        const {
          relations: subRelations,
          category_names: subCategoryNames,
          category_ids: subCategoryIds,
          ...subArgs
        } = sub;
        const subCats = await resolveCategoryRefs(
          scope.access.project.id,
          subCategoryIds,
          subCategoryNames
        );
        if ("error" in subCats) return subCats.error;
        unmatchedCategories.push(...subCats.unmatched);

        const subResult = await createIssueForProject({
          projectId: scope.access.project.id,
          projectName: scope.access.project.name,
          actorId: scope.userId,
          input: {
            ...subArgs,
            ...(subCats.ids.length ? { category_ids: subCats.ids } : {}),
            parent_id: result.issue.id,
          },
          mcpKeyId: scope.keyId,
        });
        if (subResult.ok) {
          const subCreated = {
            id: subResult.issue.id as string,
            identifier: issueIdentifier(
              scope.access.project.key,
              subResult.issue.number as number
            ),
          };
          subsByIndex.set(index + 1, subCreated);
          subIssues.push({ ...subCreated, title: subResult.issue.title });
          for (const input of subRelations ?? []) {
            relationRequests.push({ source: subCreated, input });
          }
        } else {
          subIssuesFailed.push({
            title: sub.title,
            error: coreMessage(subResult, "create failed"),
          });
        }
      }

      // Relations en DERNIER : un sous-ticket peut en bloquer un autre créé
      // après lui dans le même appel ('sub:3' depuis 'sub:1').
      const relations = await applyCreatedRelations(
        scope,
        relationRequests,
        subsByIndex
      );

      return ok({
        issue: { ...result.issue, identifier },
        ...(subInputs?.length
          ? { sub_issues: subIssues, sub_issues_failed: subIssuesFailed }
          : {}),
        ...(relationRequests.length
          ? { relations: relations.applied, relations_failed: relations.failed }
          : {}),
        ...(unmatchedCategories.length
          ? { categories_unmatched: [...new Set(unmatchedCategories)] }
          : {}),
      });
    }
  );

  server.registerTool(
    "minddy_update_issues",
    {
      title: "Update issues",
      description:
        "Apply the same field changes to 1–50 issues of a project (single edits: " +
        "pass one issue). Only the fields you send change; null clears a nullable " +
        "field. category_ids (and category_names) REPLACE the issue's full " +
        "category set. So do " +
        "description and plan: every field here is a full replacement, which on a " +
        "long text means re-emitting the whole document to change a line, and " +
        "silently dropping whatever another client wrote meanwhile. To change PART " +
        "of a plan or a description, patch it instead — minddy_edit_issue_text " +
        "(rewrite a passage), minddy_append_to_plan (add a block), " +
        "minddy_update_plan_task (flip a checkbox). " +
        "This is also how you FINISH an under-filled ticket: when you touch one " +
        "that has no priority, no effort or no category, set them in the same " +
        "call — you already read it, nobody else will. Relations are not fields: " +
        "wire them with minddy_link_issues. " +
        "Returns per-issue failures, so check `failed` in the result.",
      inputSchema: {
        project_id: PROJECT_ID,
        issues: z.array(ISSUE_REF).min(1).max(50),
        fields: z
          .object({
            title: z.string().min(1).optional(),
            description: z.string().nullable().optional(),
            plan: PLAN_FIELD.nullable().optional(),
            status: z.enum(ISSUE_STATUSES).optional(),
            priority: z.enum(ISSUE_PRIORITIES).optional(),
            effort: z.enum(ISSUE_EFFORTS).nullable().optional(),
            assignee_id: z.string().nullable().optional(),
            objective_id: z.string().uuid().nullable().optional(),
            parent: ISSUE_REF.nullable().optional(),
            duplicate_of: ISSUE_REF.nullable().optional()
              .describe("With status 'duplicate': the issue this one duplicates."),
            due_date: z.string().nullable().optional(),
            recurrence: RECURRENCE_FIELD.nullable().optional(),
            category_ids: z
              .array(z.string().uuid())
              .optional()
              .describe(
                "REPLACES the whole category set. Combines with category_names; " +
                  "an empty array clears every category."
              ),
            category_names: z
              .array(z.string().min(1))
              .optional()
              .describe(
                "Same replacement, BY NAME (case-insensitive) — no " +
                  "minddy_list_categories round trip. Names matching nothing come " +
                  "back in `categories_unmatched`."
              ),
          })
          .describe("At least one field."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      // Résoudre les références d'issues des champs AVANT la boucle.
      const {
        category_ids,
        category_names,
        parent,
        duplicate_of,
        ...fields
      } = args.fields as Record<string, unknown> & {
        category_ids?: string[];
        category_names?: string[];
        parent?: string | null;
        duplicate_of?: string | null;
      };
      // Les deux clés sont un REMPLACEMENT du jeu de catégories : leur PRÉSENCE
      // décide, pas leur contenu — `category_ids: []` efface tout.
      const setsCategories =
        "category_ids" in args.fields || "category_names" in args.fields;
      let resolvedCategoryIds: string[] = [];
      let unmatchedCategories: string[] = [];
      if (setsCategories) {
        const cats = await resolveCategoryRefs(
          scope.access.project.id,
          category_ids,
          category_names
        );
        if ("error" in cats) return cats.error;
        resolvedCategoryIds = cats.ids;
        unmatchedCategories = cats.unmatched;
      }
      if ("parent" in args.fields) {
        if (parent) {
          const r = await resolveIssueRef(scope.access, parent);
          if ("error" in r) return r.error;
          fields.parent_id = r.issue.id;
        } else fields.parent_id = null;
      }
      if ("duplicate_of" in args.fields) {
        if (duplicate_of) {
          const r = await resolveIssueRef(scope.access, duplicate_of);
          if ("error" in r) return r.error;
          fields.duplicate_of_id = r.issue.id;
        } else fields.duplicate_of_id = null;
      }
      if (Object.keys(fields).length === 0 && !setsCategories) {
        return fail("invalid_params", "fields must contain at least one field.");
      }

      const updated: string[] = [];
      const failed: Array<{ issue: string; error: string }> = [];
      for (const ref of args.issues) {
        const resolved = await resolveIssueRef(scope.access, ref);
        if ("error" in resolved) {
          failed.push({ issue: ref, error: `Issue '${ref}' not found in this project.` });
          continue;
        }
        if (Object.keys(fields).length > 0) {
          const result = await updateIssueFields({
            issueId: resolved.issue.id,
            actorId: scope.userId,
            input: fields,
            mcpKeyId: scope.keyId,
          });
          if (!result.ok) {
            failed.push({
              issue: resolved.issue.identifier,
              error: coreMessage(result, "update failed"),
            });
            continue;
          }
        }
        if (setsCategories) {
          const result = await setIssueCategories({
            issueId: resolved.issue.id,
            actorId: scope.userId,
            categoryIds: resolvedCategoryIds,
            mcpKeyId: scope.keyId,
          });
          if (!result.ok) {
            failed.push({
              issue: resolved.issue.identifier,
              error: coreMessage(result, "categories update failed"),
            });
            continue;
          }
        }
        updated.push(resolved.issue.identifier);
      }

      return ok({
        updated,
        failed,
        ...(unmatchedCategories.length
          ? { categories_unmatched: unmatchedCategories }
          : {}),
      });
    }
  );

  server.registerTool(
    "minddy_update_plan_task",
    {
      title: "Update plan tasks",
      description:
        "Flip one or several tasks of an issue's implementation plan to new states " +
        "without resending the plan markdown, e.g. mark the finished tasks '- [x]' " +
        "and the next one '- [~]' in a single call at the end of a work session. " +
        "task_index comes from minddy_get_issue's plan_tasks (0-based, in document " +
        "order; indexes are stable, state flips don't renumber). States: pending " +
        "('- [ ]'), in_progress ('- [~]'), completed ('- [x]'), cancelled ('- [-]'). " +
        "All-or-nothing: an invalid index rejects the whole batch. Returns the " +
        "refreshed plan_tasks and plan_progress.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        tasks: z
          .array(
            z.object({
              task_index: z.number().int().min(0),
              state: z.enum(PLAN_TASK_STATES),
            })
          )
          .min(1)
          .max(50),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const current = await readIssueText(ref.issue.id);
      if ("error" in current) return current.error;
      const plan = current.plan;
      const parsed = parsePlan(plan);

      // Tout-ou-rien : valider chaque index avant de toucher au markdown.
      const invalid = args.tasks
        .map((t) => t.task_index)
        .filter((i) => !parsed.tasks[i]);
      if (invalid.length > 0) {
        return fail(
          "plan_task_not_found",
          `No plan task at index(es) ${[...new Set(invalid)].join(", ")}: ` +
            `${ref.issue.identifier} has ${parsed.tasks.length} task(s). ` +
            "Fetch minddy_get_issue for plan_tasks."
        );
      }

      // Les numéros de ligne restent stables : setTaskState ne réécrit que le
      // marqueur d'état, jamais la structure du document.
      let nextPlan = plan;
      for (const t of args.tasks) {
        nextPlan = setTaskState(nextPlan, parsed.tasks[t.task_index].line, t.state);
      }

      const result = await updateIssueFields({
        issueId: ref.issue.id,
        actorId: scope.userId,
        input: { plan: nextPlan },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);

      return ok({
        issue: ref.issue.identifier,
        ...planTaskSummary(result.issue.plan as string | null),
      });
    }
  );

  server.registerTool(
    "minddy_append_to_plan",
    {
      title: "Append to plan",
      description:
        "Add a block to an issue's implementation plan WITHOUT touching a single " +
        "byte of what is already there — an extra task, a note, a precision that " +
        "landed after the plan was written. The block goes at the END of the plan " +
        "(just above its '## Questions' heading when it has one, so a new checkbox " +
        "isn't read as an open question), or at the end of a named section with " +
        "`section`. Creates the plan when the issue has none. Prefer this to " +
        "minddy_update_issues { fields: { plan } }, which rewrites the whole plan " +
        "and drops everything you don't resend; to reword something already " +
        "written, use minddy_edit_issue_text. Returns the refreshed plan_tasks " +
        "and plan_progress.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        markdown: z
          .string()
          .min(1)
          .describe(
            "The block to ADD, markdown: checkbox task lines ('- [ ] …') and/or a " +
              "short paragraph. ONLY what is new — everything already in the plan " +
              "is kept as-is, so never repeat it here."
          ),
        section: z
          .string()
          .optional()
          .describe(
            "Exact text of an existing heading to append under (e.g. 'Questions' " +
              "to park an open question). Omit to append at the end of the plan. " +
              "An unknown heading is an error, not a new section — read the plan " +
              "with minddy_get_issue first."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      if (!args.markdown.trim()) {
        return fail("invalid_params", "markdown must carry the block to add.");
      }
      const section = args.section?.trim() ? args.section.trim() : null;

      const current = await readIssueText(ref.issue.id);
      if ("error" in current) return current.error;

      const next = appendToPlan(current.plan, args.markdown, section);
      if (next === null) {
        return fail(
          "plan_section_not_found",
          `The plan of ${ref.issue.identifier} has no "${section}" heading. ` +
            "Read it with minddy_get_issue to see its headings, or omit " +
            '"section" to append at the end of the plan.'
        );
      }
      if (next.length > MAX_PLAN_LENGTH) {
        return fail(
          "invalid_params",
          `The plan is capped at ${MAX_PLAN_LENGTH} characters; this block would ` +
            `take it to ${next.length}.`
        );
      }

      const result = await updateIssueFields({
        issueId: ref.issue.id,
        actorId: scope.userId,
        input: { plan: next },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);

      return ok({
        issue: ref.issue.identifier,
        ...planTaskSummary(result.issue.plan as string | null),
      });
    }
  );

  server.registerTool(
    "minddy_edit_issue_text",
    {
      title: "Edit issue text",
      description:
        "Rewrite ONE passage of an issue's plan or description IN PLACE, the way a " +
        "code editor patches a file: old_string → new_string, copied verbatim from " +
        "minddy_get_issue, and the match must be unique (add the surrounding lines, " +
        "or set replace_all). Every other byte is left alone. This is how a decision " +
        "gets reworded or a section rewritten without re-emitting the whole document " +
        "through minddy_update_issues — and it is also the safe way round: a full " +
        "rewrite silently overwrites whatever another client changed meanwhile, a " +
        "stale old_string fails loudly. To ADD to a plan use minddy_append_to_plan, " +
        "to flip a checkbox minddy_update_plan_task. Returns a unified diff of what " +
        "changed (plus the refreshed plan_tasks when editing a plan).",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        field: z
          .enum(["plan", "description"])
          .describe("Which text of the issue to patch."),
        old_string: z
          .string()
          .min(1)
          .describe(
            "The exact passage to replace, copied VERBATIM from what " +
              "minddy_get_issue returned — whitespace and line breaks included."
          ),
        new_string: z
          .string()
          .describe("What replaces it. An empty string deletes the passage."),
        replace_all: z
          .boolean()
          .optional()
          .describe(
            "Replace EVERY occurrence instead of requiring a unique match " +
              "(default false). Use it for a term repeated throughout the text."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const field: IssueTextField = args.field;
      const current = await readIssueText(ref.issue.id);
      if ("error" in current) return current.error;

      const edit = editIssueText({
        field,
        current: current[field],
        oldString: args.old_string,
        newString: args.new_string,
        replaceAll: args.replace_all ?? false,
        tools: MCP_TEXT_TOOLS,
      });
      if (!edit.ok) return fail(edit.code, edit.message);

      // La description est TRONQUÉE en silence par updateIssueFields au-delà de
      // sa borne : la vérifier ici est la seule façon de le dire.
      const cap = field === "plan" ? MAX_PLAN_LENGTH : MAX_DESCRIPTION_LENGTH;
      if (edit.content.length > cap) {
        return fail(
          "invalid_params",
          `The ${field} is capped at ${cap} characters; this edit would take it ` +
            `to ${edit.content.length}.`
        );
      }

      const result = await updateIssueFields({
        issueId: ref.issue.id,
        actorId: scope.userId,
        input: { [field]: edit.content },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);

      const truncated = edit.diff.length > MAX_EDIT_DIFF_CHARS;
      return ok({
        issue: ref.issue.identifier,
        field,
        additions: edit.additions,
        deletions: edit.deletions,
        length: edit.content.length,
        diff: truncated ? `${edit.diff.slice(0, MAX_EDIT_DIFF_CHARS)}\n…` : edit.diff,
        ...(truncated ? { diff_truncated: true } : {}),
        ...(field === "plan"
          ? planTaskSummary(result.issue.plan as string | null)
          : {}),
      });
    }
  );

  server.registerTool(
    "minddy_add_comment",
    {
      title: "Add comment",
      description:
        "Post a markdown comment on an issue, e.g. to report progress or leave a " +
        "note for the team. " +
        "KEEP IT SHORT — a message to a colleague, not a report: a few sentences, " +
        "or a handful of one-line bullets, 1000 characters at most. Say what you " +
        "did and what it means for whoever reads the ticket; drop the preamble, " +
        "the restating of the ticket back at its author, the file-by-file " +
        "inventory and the closing recap. NO HEADINGS — a comment that needs " +
        "sections is a comment that is too long. Detail that IS the work belongs " +
        "in the code, in the plan or in the pull request: point at it, never copy " +
        "it here. " +
        "The timeline shows the agent as the author (this API " +
        "key's name with an '(mcp)' marker), not the key's owner. To attach a " +
        "resource to the comment, call minddy_add_resource with the returned " +
        "comment id.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        body: z
          .string()
          .min(1)
          .describe(
            "Markdown, SHORT: a few sentences or short bullets, 1000 characters " +
              "at most, no headings."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const result = await addCommentToIssue({
        issueId: ref.issue.id,
        actorId: scope.userId,
        body: args.body,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ comment: result.comment });
    }
  );

  server.registerTool(
    "minddy_add_resource",
    {
      title: "Add resource",
      description:
        "Attach a resource to an issue, or to one of its comments (pass " +
        "comment_id, e.g. the id minddy_add_comment returned). A resource is " +
        "EITHER a file — content inline as base64 with its file_name, 10 MB max " +
        "after decoding, landing in minddy's private storage — OR a link: pass " +
        "`url` alone and minddy fetches the page's title and favicon itself. The " +
        "two are exclusive: send one or the other, never both. Either way it " +
        "shows as the same pill in the app, and minddy_get_issue lists it.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        comment_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Attach to this comment of the issue instead of the issue itself."
          ),
        url: z
          .string()
          .max(2000)
          .optional()
          .describe(
            "A LINK resource: the http(s) address to attach. Its title and " +
              "favicon are resolved server-side, so send nothing else. Leave out " +
              "when attaching a file."
          ),
        file_name: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "A FILE resource: display name, extension included (e.g. " +
              "'screenshot.png'). Required with content_base64."
          ),
        mime_type: z
          .string()
          .max(120)
          .optional()
          .describe("MIME type of the file; defaults to application/octet-stream."),
        content_base64: z
          .string()
          .min(1)
          .max(14_000_000)
          .optional()
          .describe(
            "A FILE resource: its content, base64-encoded (no 'data:' prefix)."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      // Les deux moitiés sont exclusives : un appel qui porte les deux (ou
      // aucune) est une intention ambiguë, pas quelque chose à deviner.
      const wantsLink = !!args.url?.trim();
      const wantsFile = !!args.content_base64;
      if (wantsLink === wantsFile) {
        return fail(
          "invalid_params",
          wantsLink
            ? "A resource is either a file or a link: send url, or " +
                "content_base64 + file_name, not both."
            : "Nothing to attach: send url for a link, or content_base64 + " +
                "file_name for a file."
        );
      }

      if (args.comment_id) {
        const { data: comment } = await getServiceClient()
          .from("comments")
          .select("id, issue_id")
          .eq("id", args.comment_id)
          .maybeSingle();
        if (!comment || comment.issue_id !== ref.issue.id) {
          return fail("not_found", "Comment not found on this issue.");
        }
      }

      if (wantsLink) {
        let resource;
        try {
          resource = await resolveLinkResource(args.url as string);
        } catch (e) {
          if (e instanceof FaviconError) {
            return fail(
              "invalid_params",
              "That url can't be reached: it must be a public http(s) address."
            );
          }
          return fail("database_error", (e as Error).message);
        }
        try {
          const [row] = await insertAttachments(getServiceClient(), {
            projectId: scope.access.project.id,
            issueId: ref.issue.id,
            commentId: args.comment_id ?? null,
            createdBy: scope.userId,
            resources: [resource],
          });
          return ok({
            resource: {
              id: row.id,
              kind: "link",
              url: row.url,
              title: row.file_name,
              comment_id: row.comment_id,
            },
          });
        } catch (e) {
          return fail("database_error", (e as Error).message);
        }
      }

      if (!args.file_name?.trim()) {
        return fail("invalid_params", "file_name is required with content_base64.");
      }
      const normalized = (args.content_base64 as string).replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
        return fail("invalid_params", "content_base64 is not valid base64.");
      }
      const data = Buffer.from(normalized, "base64");
      if (data.byteLength === 0) {
        return fail("invalid_params", "Empty file.");
      }
      if (data.byteLength > 10 * 1024 * 1024) {
        return fail("invalid_params", "File exceeds the 10 MB cap.");
      }

      try {
        const attachment = await uploadAttachment(getServiceClient(), {
          projectId: scope.access.project.id,
          issueId: ref.issue.id,
          commentId: args.comment_id ?? null,
          createdBy: scope.userId,
          fileName: args.file_name,
          mimeType: args.mime_type,
          data,
        });
        return ok({
          resource: {
            id: attachment.id,
            kind: "file",
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
            comment_id: attachment.comment_id,
          },
        });
      } catch (e) {
        return fail("database_error", (e as Error).message);
      }
    }
  );

  server.registerTool(
    "minddy_get_resource",
    {
      title: "Get resource",
      description:
        "Read one resource of an issue, an objective, or a comment. Pass the " +
        "resource_id you got from minddy_get_issue (issue and comment resources) " +
        "or minddy_list_objectives (objective resources). A LINK comes back as its " +
        "url and title — there is nothing to download, fetch the page yourself if " +
        "you need its content. A FILE returns its metadata and a short-lived " +
        "signed download_url (~10 min); fetch that URL to grab the bytes without " +
        "loading them into context, whatever the size. Set include_content=true to " +
        "also embed a file inline (base64): images come back viewable, text-ish " +
        "files as readable text, anything else as a blob. Inline content is capped " +
        "at 10 MB; larger files stay URL-only.",
      inputSchema: {
        project_id: PROJECT_ID,
        resource_id: z
          .string()
          .uuid()
          .describe("Resource id from minddy_get_issue / minddy_list_objectives."),
        include_content: z
          .boolean()
          .optional()
          .describe(
            "Embed the file bytes in the result (base64), not just the URL. " +
              "Default false. Ignored for links and for files over 10 MB."
          ),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      const service = getServiceClient();
      // Scope by project_id (resources carry it directly) — one door for
      // issue, objective and comment resources alike.
      const { data: row, error } = await service
        .from("attachments")
        .select(
          "id, kind, url, storage_path, file_name, mime_type, size_bytes, issue_id, objective_id, comment_id"
        )
        .eq("id", args.resource_id)
        .eq("project_id", scope.access.project.id)
        .maybeSingle();
      if (error) return fail("database_error", error.message);
      if (!row) return fail("not_found", "Resource not found in this project.");

      // Un lien n'a pas d'octets : ni URL signée, ni contenu inline.
      if (row.kind === "link") {
        return ok({
          id: row.id,
          kind: "link",
          url: row.url,
          title: row.file_name,
          issue_id: row.issue_id,
          objective_id: row.objective_id,
          comment_id: row.comment_id,
        });
      }

      const fileName = (row.file_name as string) || "attachment";
      const mime = (row.mime_type as string) || "application/octet-stream";
      const size = typeof row.size_bytes === "number" ? row.size_bytes : 0;

      const url = await signedAttachmentUrl(service, row.storage_path as string, {
        download: fileName,
        expiresIn: 600,
      });

      const meta: Record<string, unknown> = {
        id: row.id,
        kind: "file",
        file_name: row.file_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        issue_id: row.issue_id,
        objective_id: row.objective_id,
        comment_id: row.comment_id,
        download_url: url,
        download_url_expires_in_seconds: 600,
      };

      if (!args.include_content) return ok(meta);
      if (size > MAX_INLINE_ATTACHMENT_BYTES) {
        return ok({
          ...meta,
          content_omitted: `File is larger than the ${
            MAX_INLINE_ATTACHMENT_BYTES / (1024 * 1024)
          } MB inline cap. Fetch download_url instead.`,
        });
      }

      const data = await downloadAttachment(service, row.storage_path as string);
      if (!data) {
        return ok({ ...meta, content_omitted: "The stored file could not be read." });
      }

      const content: Array<Record<string, unknown>> = [
        { type: "text", text: JSON.stringify(meta, null, 2) },
      ];
      if (mime.startsWith("image/")) {
        content.push({ type: "image", data: data.toString("base64"), mimeType: mime });
      } else if (isTextMime(mime)) {
        content.push({
          type: "resource",
          resource: {
            uri: `minddy://attachments/${row.id}`,
            mimeType: mime,
            text: data.toString("utf8"),
          },
        });
      } else {
        content.push({
          type: "resource",
          resource: {
            uri: `minddy://attachments/${row.id}`,
            mimeType: mime,
            blob: data.toString("base64"),
          },
        });
      }
      return { content } as unknown as ToolResult;
    }
  );

  server.registerTool(
    "minddy_link_issues",
    {
      title: "Link issues",
      description:
        "Create or remove a relation between two issues (MIN-25). From `issue`'s " +
        "point of view: 'blocks' (issue blocks target), 'blocked_by' (issue is " +
        "blocked by target), or 'related' (a soft link). Pass remove=true to delete " +
        "that relation instead. Idempotent: adding an existing relation, or " +
        "removing an absent one, is a no-op. " +
        "Use it every time you notice a dependency between two issues — it is " +
        "what makes a backlog orderable, and nothing else records it. On issues " +
        "you are CREATING, don't call this after the fact: minddy_create_issue " +
        "takes `relations` in the same call, siblings included.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        relation: z
          .enum(["blocks", "blocked_by", "related"])
          .describe("Relation type from `issue`'s perspective."),
        target: ISSUE_REF.describe("The other issue in the relation."),
        remove: z
          .boolean()
          .optional()
          .describe("Remove the relation instead of adding it."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const src = await resolveIssueRef(scope.access, args.issue);
      if ("error" in src) return src.error;
      const tgt = await resolveIssueRef(scope.access, args.target);
      if ("error" in tgt) return tgt.error;
      if (src.issue.id === tgt.issue.id) {
        return fail("invalid_params", "An issue can't be related to itself.");
      }

      if (args.remove) {
        const existing = await findIssueRelation(
          scope.access.project.id,
          src.issue.id,
          args.relation,
          tgt.issue.id
        );
        if (!existing) {
          return ok({ removed: false, issue: src.issue.identifier, target: tgt.issue.identifier });
        }
        const result = await removeIssueRelation({
          relationId: existing.id,
          actorId: scope.userId,
          mcpKeyId: scope.keyId,
        });
        if (!result.ok) return coreFail(result);
        return ok({
          removed: true,
          issue: src.issue.identifier,
          relation: args.relation,
          target: tgt.issue.identifier,
        });
      }

      const result = await addIssueRelation({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        sourceId: src.issue.id,
        targetId: tgt.issue.id,
        type: args.relation,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        added: true,
        issue: src.issue.identifier,
        relation: args.relation,
        target: tgt.issue.identifier,
      });
    }
  );

  server.registerTool(
    "minddy_create_objective",
    {
      title: "Create objective",
      description:
        "Create an objective (a named group of issues with a shared goal) in a " +
        "project. " +
        "FILL IT, like a ticket. An objective is what the team reads to know " +
        "where the work is going, and a bare name says nothing: write a " +
        "`description` (the goal, what counts as done, what is out of scope), " +
        "pass the `status` it is really in, and set `target_date` when a date " +
        "was named. `lead_user_id` follows the same rule as an issue's " +
        "assignee: the person the human named, the owner on a single-member " +
        "project, nobody otherwise. " +
        "Then LINK ITS ISSUES — an objective with no issue has a progress bar " +
        "of zero forever: pass objective_id in minddy_create_issue, or " +
        "minddy_update_issues { fields: { objective_id } } on issues that " +
        "already exist.",
      inputSchema: {
        project_id: PROJECT_ID,
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .describe(
            "Markdown. The goal, what counts as done, what is out of scope — " +
              "write one on every objective you create."
          ),
        status: z
          .enum(OBJECTIVE_STATUS_VALUES)
          .optional()
          .describe("Default: planned. Pass 'in_progress' when the work is already under way."),
        lead_user_id: z
          .string()
          .optional()
          .describe(
            "Member user_id (minddy_list_members). The person the human named; " +
              "on a single-member project, the owner."
          ),
        target_date: z.string().optional().describe("ISO 8601 date."),
        color: z.string().optional().describe("Hex color, e.g. '#6b7280'."),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await createObjective({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        input: args,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ objective: result.objective });
    }
  );

  server.registerTool(
    "minddy_update_objective",
    {
      title: "Update objective",
      description:
        "Update an objective's fields. Only the fields you send change; null " +
        "clears lead_user_id / target_date / color.",
      inputSchema: {
        project_id: PROJECT_ID,
        objective_id: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(OBJECTIVE_STATUS_VALUES).optional(),
        lead_user_id: z.string().nullable().optional(),
        target_date: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      // Scope check : l'objectif doit appartenir au projet en question.
      const { data: obj } = await getServiceClient()
        .from("objectives")
        .select("id")
        .is("deleted_at", null)
        .eq("id", args.objective_id)
        .eq("project_id", scope.access.project.id)
        .maybeSingle();
      if (!obj) return fail("not_found", "Objective not found in this project.");

      const result = await updateObjective({
        objectiveId: args.objective_id,
        actorId: scope.userId,
        input: args,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ objective: result.objective });
    }
  );

  server.registerTool(
    "minddy_add_objective_comment",
    {
      title: "Add objective comment",
      description:
        "Post a markdown comment on an OBJECTIVE — the twin of minddy_add_comment, " +
        "one level up. This is where a note belongs when it is about the goal " +
        "rather than about one ticket: where the objective stands, what was " +
        "decided, what changed in its scope. A note about a single ticket goes " +
        "on that ticket. " +
        "KEEP IT SHORT — a message to a colleague, not a report: a few sentences, " +
        "or a handful of one-line bullets, 1000 characters at most. NO HEADINGS " +
        "— a comment that needs sections is a comment that is too long. Detail " +
        "that IS the work belongs in the issues it groups: point at them by " +
        "identifier, never copy them here. " +
        "Read minddy_get_objective first: the thread carries what the team " +
        "already said. " +
        "The timeline shows the agent as the author (this API key's name with an " +
        "'(mcp)' marker), not the key's owner. To attach a resource to the " +
        "comment, call minddy_add_resource with the returned comment id.",
      inputSchema: {
        project_id: PROJECT_ID,
        objective_id: z
          .string()
          .uuid()
          .describe("Objective UUID (from minddy_list_objectives)."),
        body: z
          .string()
          .min(1)
          .describe(
            "Markdown, SHORT: a few sentences or short bullets, 1000 characters " +
              "at most, no headings."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      // Scope check : l'objectif doit appartenir au projet en question. Le cœur
      // vérifie l'accès au PROJET de l'objectif, pas que c'est CE projet-là —
      // sans ça, un objectif d'un autre projet accessible passerait.
      const { data: obj } = await getServiceClient()
        .from("objectives")
        .select("id")
        .is("deleted_at", null)
        .eq("id", args.objective_id)
        .eq("project_id", scope.access.project.id)
        .maybeSingle();
      if (!obj) return fail("not_found", "Objective not found in this project.");

      const result = await addCommentToObjective({
        objectiveId: args.objective_id,
        actorId: scope.userId,
        body: args.body,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ comment: result.comment });
    }
  );

  // ── Scratchpad (Notes) — la note perso UNIQUE du propriétaire de la clé :
  // un bloc-notes markdown de petites tâches du moment (« problems.md »
  // intégré), mêmes cases à cocher que les plans (lib/plan.ts). Pas de
  // project_id : c'est personnel et cross-projet. get lit, set REMPLACE tout le
  // document — relire d'abord pour ne rien écraser.
  server.registerTool(
    "minddy_get_scratchpad",
    {
      title: "Get scratchpad",
      description:
        "Read the key owner's SCRATCHPAD: their single personal, cross-project " +
        "notes doc ('quick things to do right now'), the in-app replacement for " +
        "a problems.md file. Markdown with the same checkbox tasks as plans " +
        "('- [ ]' pending, '- [~]' in progress, '- [x]' done, '- [-]' dropped) " +
        "and '##' section headings. Returns the raw markdown, task progress, and " +
        "the flat list of tasks with their 0-based index (document order). Pass " +
        "those indices to minddy_update_scratchpad_task to tick items off without " +
        "rewriting the doc. There is exactly one scratchpad per account; it is " +
        "not tied to a project. Also returns `rev`, the version: pass it back to " +
        "minddy_set_scratchpad / minddy_update_scratchpad_task so a concurrent " +
        "edit by the user is never overwritten.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async (_args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;
      try {
        const state = await getScratchpad(getServiceClient(), auth.userId);
        return ok({
          content: state.content,
          updated_at: state.updated_at,
          rev: state.rev,
          progress: state.progress,
          tasks: parsePlan(state.content).tasks.map((t) => ({
            index: t.index,
            text: t.text,
            state: t.state,
          })),
        });
      } catch (err) {
        return fail("database_error", (err as Error).message);
      }
    }
  );

  server.registerTool(
    "minddy_set_scratchpad",
    {
      title: "Set scratchpad",
      description:
        "Replace the ENTIRE scratchpad markdown for the key owner. This " +
        "overwrites the whole notes doc. So call minddy_get_scratchpad FIRST and " +
        "preserve the parts you are not changing (keep other sections; only tick " +
        "off the items you actually finished). Checkbox convention: '- [ ]' to " +
        "do, '- [~]' in progress, '- [x]' done, '- [-]' dropped; '##' for section " +
        "titles. An empty string clears the scratchpad. ALWAYS pass `expected_rev` " +
        "(the `rev` from your minddy_get_scratchpad): the write is rejected if the " +
        "note changed meanwhile so you never clobber the user's concurrent edits.",
      inputSchema: {
        content: z
          .string()
          .max(MAX_SCRATCHPAD_LENGTH)
          .describe(
            "The full new scratchpad markdown (replaces everything currently there)."
          ),
        expected_rev: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "The `rev` from the minddy_get_scratchpad you based this on. If it no " +
              "longer matches (the user edited meanwhile) the write is rejected; " +
              "re-read and reapply. Omit only for an unconditional overwrite."
          ),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;
      try {
        const service = getServiceClient();
        // With expected_rev: a strict compare-and-swap — a stale base is refused
        // so the user's concurrent edits are never overwritten. Without it: an
        // unconditional (but still atomic) overwrite for backward compatibility.
        if (args.expected_rev !== undefined) {
          const write = await setScratchpad(
            service,
            auth.userId,
            args.content,
            args.expected_rev
          );
          if (write.conflicted) {
            return fail(
              "conflict",
              `The scratchpad changed since rev ${args.expected_rev} (it is now at rev ${write.rev}). The user likely edited it in the app. Call minddy_get_scratchpad again, reapply your change onto the fresh content, and set it with the new rev.`
            );
          }
          return ok({
            content: write.content,
            updated_at: write.updated_at,
            rev: write.rev,
            progress: write.progress,
          });
        }
        const result = await mutateScratchpad(
          service,
          auth.userId,
          () => args.content
        );
        if (result.status !== "ok") {
          return fail(
            "conflict",
            "The scratchpad is being edited concurrently; read it again and retry."
          );
        }
        return ok({
          content: result.state.content,
          updated_at: result.state.updated_at,
          rev: result.state.rev,
          progress: result.state.progress,
        });
      } catch (err) {
        return fail("database_error", (err as Error).message);
      }
    }
  );

  server.registerTool(
    "minddy_update_scratchpad_task",
    {
      title: "Update scratchpad task",
      description:
        "Flip the state of ONE or more existing scratchpad tasks WITHOUT " +
        "rewriting the whole doc: the precise way to tick items off. Tasks are " +
        "0-indexed in document order (the `tasks` array of minddy_get_scratchpad); " +
        "each task keeps its text, only its checkbox marker changes. States: " +
        "pending, in_progress, completed, cancelled. To add/remove tasks or edit " +
        "their text, use minddy_set_scratchpad instead. Indices are validated " +
        "all-or-nothing: a single out-of-range index rejects the whole call. Pass " +
        "`expected_rev` (the `rev` from the get whose indices you're using) so a " +
        "concurrent edit can't make you flip the wrong task.",
      inputSchema: {
        tasks: z
          .array(
            z.object({
              task_index: z
                .number()
                .int()
                .min(0)
                .describe("0-based task index, in document order."),
              state: z.enum(PLAN_TASK_STATES),
            })
          )
          .min(1)
          .max(50)
          .describe("The task-state changes to apply."),
        expected_rev: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "The `rev` from the minddy_get_scratchpad whose task indices you are " +
              "using. If the note changed since, the indices may point elsewhere, " +
              "so the call is rejected; re-read for fresh indices and retry."
          ),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;
      try {
        // Logique partagée avec le tool `update_scratchpad_task` de l'agent de
        // code (MIN-84) : mêmes index, mêmes gardes (rev périmé, all-or-nothing).
        const result = await applyScratchpadTaskChanges(
          getServiceClient(),
          auth.userId,
          args.tasks,
          args.expected_rev
        );
        if (result.status === "stale_rev") {
          return fail(
            "conflict",
            `The scratchpad changed since rev ${args.expected_rev} (it is now at rev ${result.rev}), so your task indices may no longer match. Call minddy_get_scratchpad again for fresh indices and retry.`
          );
        }
        if (result.status === "out_of_range") {
          return fail(
            "invalid_params",
            `task_index ${result.index} is out of range: the scratchpad has ${result.total} task(s) (valid indices 0..${Math.max(0, result.total - 1)}).`
          );
        }
        if (result.status === "conflict") {
          return fail(
            "conflict",
            "The scratchpad was edited concurrently while applying your change. Call minddy_get_scratchpad again for fresh indices and retry."
          );
        }
        return ok({
          content: result.state.content,
          rev: result.state.rev,
          progress: result.state.progress,
          tasks: parsePlan(result.state.content).tasks.map((t) => ({
            index: t.index,
            text: t.text,
            state: t.state,
          })),
        });
      } catch (err) {
        return fail("database_error", (err as Error).message);
      }
    }
  );

  server.registerTool(
    "minddy_add_scratchpad_tasks",
    {
      title: "Add scratchpad tasks",
      description:
        "Append one or more NEW tasks to the scratchpad without rewriting the " +
        "whole doc. Each task defaults to 'pending' (unchecked). By default tasks " +
        "go at the END of the note; pass `section` (a '##' heading's exact text) " +
        "to add them at the end of that section instead; an unknown section is " +
        "rejected (create it with minddy_set_scratchpad first). To change an " +
        "existing task's state use minddy_update_scratchpad_task; to edit task " +
        "text or remove tasks use minddy_set_scratchpad.",
      inputSchema: {
        tasks: z
          .array(
            z.object({
              text: z
                .string()
                .min(1)
                .max(2000)
                .describe("The task text (single line)."),
              state: z
                .enum(PLAN_TASK_STATES)
                .optional()
                .describe("Initial state (default: pending)."),
            })
          )
          .min(1)
          .max(50)
          .describe("The tasks to add, in order."),
        section: z
          .string()
          .optional()
          .describe(
            "Exact text of a '##' section heading to append under. Omit to add at the end of the note."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;
      try {
        const service = getServiceClient();
        // Appending is position-independent, so no rev is needed: mutateScratchpad
        // re-reads and re-appends under compare-and-swap on conflict, landing the
        // new tasks on top of the latest note without clobbering concurrent edits.
        const result = await mutateScratchpad(service, auth.userId, (content) =>
          appendScratchpadTasks(
            content,
            args.tasks.map((task) => ({
              text: task.text,
              state: task.state ?? "pending",
            })),
            args.section
          )
        );
        if (result.status === "aborted") {
          return fail(
            "invalid_params",
            `Section "${args.section}" was not found. Omit "section" to add at the end, or create the heading first with minddy_set_scratchpad.`
          );
        }
        if (result.status === "conflict") {
          return fail(
            "conflict",
            "The scratchpad is being edited concurrently; read it again and retry."
          );
        }
        const saved = result.state;
        return ok({
          content: saved.content,
          rev: saved.rev,
          progress: saved.progress,
          tasks: parsePlan(saved.content).tasks.map((t) => ({
            index: t.index,
            text: t.text,
            state: t.state,
          })),
        });
      } catch (err) {
        return fail("database_error", (err as Error).message);
      }
    }
  );

  // ── Cycles (MIN-32) — le cycle personnel cross-projet du propriétaire de
  // la clé. Pas de project_id sur les lectures/fill (le cycle traverse les
  // projets) ; add/remove résolvent leurs références d'issues dans UN projet,
  // comme tous les autres tools — appeler une fois par projet si besoin.
  // Mêmes cœurs que Numo (lib/server/cycles.ts) : parité par construction.

  /** Garde commune des tools cycle : auth + prefs (cycles activés). */
  async function requireCycle(
    extra: ToolExtra
  ): Promise<
    | { userId: string; keyId: string | null; prefs: Awaited<ReturnType<typeof getCyclePrefsForUser>> }
    | { error: ToolResult }
  > {
    const auth = requireUser(extra);
    if ("error" in auth) return auth;
    const prefs = await getCyclePrefsForUser(getServiceClient(), auth.userId);
    if (!prefs.enabled) {
      return {
        error: fail(
          "cycles_disabled",
          "Cycles are not enabled for this account. The owner can enable them in Account → Cycles."
        ),
      };
    }
    return { userId: auth.userId, keyId: auth.keyId, prefs };
  }

  server.registerTool(
    "minddy_get_cycle",
    {
      title: "Get cycle",
      description:
        "Read the key owner's cycle: their PERSONAL, CROSS-PROJECT week/fortnight " +
        "('what am I working on right now'), identified by its dates. Returns the " +
        "cycle (dates, intensity, capacity target and filled points, completion %), " +
        "the issues in it (with identifiers, across all projects), and the best " +
        "next candidates from their assigned pool (reco-scored, `blocks` relations " +
        "respected). Points are an internal capacity unit: talk to humans in " +
        "effort sizes or percentages, never raw points. Reading also reconciles " +
        "the timeline (cycle creation, rollover, one-shot auto-fill).",
      inputSchema: {
        which: z
          .enum(["current", "next", "previous"])
          .optional()
          .describe("Which cycle to read. Default: current."),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const r = await getCycleOverview({
        service: getServiceClient(),
        userId: scope.userId,
        prefs: scope.prefs,
        which: args.which,
      });
      if (!r.ok) return fail("not_found", r.error);
      return ok(r.overview);
    }
  );

  server.registerTool(
    "minddy_fill_cycle",
    {
      title: "Fill cycle",
      description:
        "Top up the key owner's CURRENT cycle with the deterministic engine: it " +
        "picks from the issues assigned to them (no cycle yet, open status), by " +
        "priority + unblocked (`blocks` relations respected) + smallest first, " +
        "until the capacity target is reached. The optional weights steer the " +
        "scoring ('prioritize UI fixes' → keyword/category boosts): they bias " +
        "the same deterministic engine, they NEVER force a pick. Weights default " +
        "to 1; boosts are additive score points (10–100 = mild–strong).",
      inputSchema: {
        priority_weight: z
          .number()
          .positive()
          .optional()
          .describe("Multiplier on the issue-priority component (default 1)."),
        unblocked_weight: z
          .number()
          .positive()
          .optional()
          .describe("Multiplier on the not-blocked bonus (default 1)."),
        small_first_weight: z
          .number()
          .positive()
          .optional()
          .describe("Multiplier on the smallest-first component (default 1)."),
        project_boosts: z
          .array(z.object({ project_id: z.string().uuid(), weight: z.number() }))
          .optional()
          .describe("Additive boost per project id."),
        category_boosts: z
          .array(z.object({ category_id: z.string().uuid(), weight: z.number() }))
          .optional()
          .describe("Additive boost per category id."),
        keyword_boosts: z
          .array(z.object({ keyword: z.string().min(1), weight: z.number() }))
          .optional()
          .describe("Additive boost when the issue title contains the keyword."),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const service = getServiceClient();
      const ensured = await ensureCycles({
        service,
        userId: scope.userId,
        prefs: scope.prefs,
        today: todayISO(),
      });
      if (!ensured.current) return fail("not_found", "No current cycle exists yet.");

      const toBoostMap = (
        rows: Array<Record<string, unknown>> | undefined,
        idKey: string
      ): Record<string, number> | undefined => {
        if (!rows?.length) return undefined;
        return Object.fromEntries(rows.map((r) => [r[idKey] as string, r.weight as number]));
      };
      const { pickedIds, points } = await fillCycleForUser({
        service,
        userId: scope.userId,
        actorId: scope.userId,
        cycle: ensured.current,
        weights: {
          priority: args.priority_weight,
          unblocked: args.unblocked_weight,
          small: args.small_first_weight,
          projectBoost: toBoostMap(args.project_boosts, "project_id"),
          categoryBoost: toBoostMap(args.category_boosts, "category_id"),
          keywordBoost: args.keyword_boosts,
        },
      });
      return ok({
        added: pickedIds.length,
        added_ids: pickedIds,
        added_points: points,
        cycle_id: ensured.current.id,
      });
    }
  );

  server.registerTool(
    "minddy_add_to_cycle",
    {
      title: "Add to cycle",
      description:
        "Add issues (1–50) of a project to the key owner's CURRENT cycle. Adding " +
        "ASSIGNS each issue to the owner as a side-effect; it NEVER changes the " +
        "status (the cycle is orthogonal to status). An issue in TRIAGE is " +
        "refused ('triageCannotJoinCycle'): triage is undecided work, a cycle is " +
        "a commitment — move it out of triage first. Reassigning an issue to " +
        "someone else later silently drops it from the cycle, and so does moving " +
        "it back to triage. The cycle is cross-project: call once per project to " +
        "add issues from several.",
      inputSchema: {
        project_id: PROJECT_ID,
        issues: z.array(ISSUE_REF).min(1).max(50),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const project = await resolveProject(scope.userId, args.project_id);
      if ("error" in project) return project.error;
      const ensured = await ensureCycles({
        service: getServiceClient(),
        userId: scope.userId,
        prefs: scope.prefs,
        today: todayISO(),
      });
      if (!ensured.current) return fail("not_found", "No current cycle exists yet.");

      const added: string[] = [];
      const failed: Array<{ issue: string; error: string }> = [];
      for (const ref of args.issues) {
        const resolved = await resolveIssueRef(project.access, ref);
        if ("error" in resolved) {
          failed.push({ issue: ref, error: `Issue '${ref}' not found in this project.` });
          continue;
        }
        const r = await updateIssueFields({
          issueId: resolved.issue.id,
          actorId: scope.userId,
          input: { cycle_id: ensured.current.id },
          mcpKeyId: scope.keyId,
        });
        if (r.ok) added.push(resolved.issue.identifier);
        else
          failed.push({
            issue: resolved.issue.identifier,
            error: coreMessage(r, "update failed"),
          });
      }
      return ok({ added, failed, cycle_id: ensured.current.id });
    }
  );

  server.registerTool(
    "minddy_remove_from_cycle",
    {
      title: "Remove from cycle",
      description:
        "Remove issues (1–50) of a project from the key owner's CURRENT cycle. " +
        "Assignment and status are untouched; the issues simply leave the cycle. " +
        "Issues that aren't in the owner's current cycle are reported in `failed`.",
      inputSchema: {
        project_id: PROJECT_ID,
        issues: z.array(ISSUE_REF).min(1).max(50),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const project = await resolveProject(scope.userId, args.project_id);
      if ("error" in project) return project.error;
      const service = getServiceClient();
      const ensured = await ensureCycles({
        service,
        userId: scope.userId,
        prefs: scope.prefs,
        today: todayISO(),
      });
      if (!ensured.current) return fail("not_found", "No current cycle exists yet.");

      const removed: string[] = [];
      const failed: Array<{ issue: string; error: string }> = [];
      for (const ref of args.issues) {
        const resolved = await resolveIssueRef(project.access, ref);
        if ("error" in resolved) {
          failed.push({ issue: ref, error: `Issue '${ref}' not found in this project.` });
          continue;
        }
        // Only pull issues out of the owner's OWN current cycle — project
        // access alone must not allow draining someone else's cycle.
        const { data: row } = await service
          .from("issues")
          .select("cycle_id")
          .is("deleted_at", null)
          .eq("id", resolved.issue.id)
          .maybeSingle();
        if (!row || row.cycle_id !== ensured.current.id) {
          failed.push({
            issue: resolved.issue.identifier,
            error: "Not in the owner's current cycle.",
          });
          continue;
        }
        const r = await updateIssueFields({
          issueId: resolved.issue.id,
          actorId: scope.userId,
          input: { cycle_id: null },
          mcpKeyId: scope.keyId,
        });
        if (r.ok) removed.push(resolved.issue.identifier);
        else
          failed.push({
            issue: resolved.issue.identifier,
            error: coreMessage(r, "update failed"),
          });
      }
      return ok({ removed, failed });
    }
  );

  // ── Feedback (user requests collected on the project's board / API) ──────
  server.registerTool(
    "minddy_list_feedback",
    {
      title: "List feedback",
      description:
        "List a project's feedback posts (user requests from the feedback board, its " +
        "API, or internal entry): id (the feedback_post_id other feedback tools " +
        "take), title, status (open/planned/in_progress/shipped/declined/spam — " +
        "'spam' is a request the team or the AI review set aside, and it never " +
        "shows on the public board), vote_count, is_public, review_state, source, " +
        "category_ids, and the linked tracking issue if any. Sorted by votes; " +
        "merged duplicates are excluded. A post is actually VISIBLE on the board " +
        "only when is_public AND review_state is 'published' AND status is not " +
        "'spam' — a 'pending' post is still in the AI review queue and nobody has " +
        "seen it yet, so don't tell the user their request is up.",
      inputSchema: {
        project_id: PROJECT_ID,
        status: z
          .array(z.enum(FEEDBACK_POST_STATUSES))
          .optional()
          .describe("Only these public statuses. Omit for all."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      // Le filtre part DANS la requête : le plafond de 500 de listTeamFeedback
      // est appliqué après le tri par votes, donc filtrer la fenêtre renvoyée
      // aurait rendu une liste vide sur les statuts sans voix — `spam` en
      // premier, celui qu'on vient justement de rendre demandable.
      const posts = await listTeamFeedback(scope.access.project.id, {
        statuses: args.status,
      });
      const rows = posts
        .slice(0, args.limit ?? 50)
        .map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          vote_count: p.vote_count,
          is_public: p.is_public,
          // Sans lui, un retour encore dans la file de revue IA est
          // indiscernable d'un retour publié (cf. la règle de visibilité
          // annoncée dans la description).
          review_state: p.review_state,
          source: p.source,
          category_ids: p.category_ids,
          linked_issue_id: p.issue_id,
        }));
      return ok({ feedback: rows });
    }
  );

  server.registerTool(
    "minddy_get_feedback",
    {
      title: "Get feedback",
      description:
        "Fetch one feedback post in full: title, body (the user's request), the raw " +
        "submitted text, status, vote_count, review_state, category_ids, author " +
        "(real identity), the linked issue if any, and its whole comment thread. " +
        "Each comment carries a `visibility`: 'internal' is a team-only note, " +
        "'public' is read by everyone on the board — including the replies visitors " +
        "wrote there. When the request came in a language the team does not read, " +
        "the review TRANSLATES it: `translated_title` / `translated_body` sit BESIDE " +
        "the original (which stays as written, and is what the board shows), and " +
        "`translated_language` says which language they are in — read the " +
        "translation when it matches the team's, exactly as the team's own view " +
        "does. `source_language` is the language of the request itself.",
      inputSchema: { project_id: PROJECT_ID, feedback_post_id: z.string().uuid() },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const detail = await getTeamFeedbackDetail(
        scope.access.project.id,
        args.feedback_post_id
      );
      if (!detail) return fail("feedback_not_found", "Feedback post not found in this project.");

      const service = getServiceClient();
      const { data: comments } = await service
        .from("comments")
        .select(
          "author_id, via_assistant, body, created_at, visibility, feedback_users!feedback_user_id (name, email, pseudonym)"
        )
        .eq("feedback_post_id", args.feedback_post_id)
        .order("created_at", { ascending: true });
      const users = await fetchAuthUsersById(
        service,
        (comments ?? [])
          .map((c) => c.author_id as string | null)
          .filter((v): v is string => !!v)
      );

      return ok({
        feedback: {
          id: detail.id,
          title: detail.title,
          body: detail.body,
          submitted_title: detail.submitted_title,
          submitted_body: detail.submitted_body,
          // La traduction vit À CÔTÉ du texte, jamais à sa place : le board
          // public montre toujours l'original, la vue équipe préfère la
          // traduction quand elle est dans SA langue. Le MCP est le canal
          // équipe — il lui faut donc les deux, et la langue de chacune.
          source_language: detail.source_language,
          translated_title: detail.translated_title,
          translated_body: detail.translated_body,
          translated_language: detail.translated_language,
          status: detail.status,
          vote_count: detail.vote_count,
          is_public: detail.is_public,
          review_state: detail.review_state,
          category_ids: detail.category_ids,
          source: detail.source,
          author: detail.author
            ? { name: detail.author.name, email: detail.author.email }
            : null,
          linked_issue: detail.issue
            ? {
                id: detail.issue.id,
                identifier: issueIdentifier(scope.access.project.key, detail.issue.number),
                status: detail.issue.status,
              }
            : null,
          comments: (comments ?? []).map((c) => {
            const visitor = c.feedback_users as unknown as {
              name: string | null;
              email: string | null;
              pseudonym: string;
            } | null;
            return {
              // Un commentaire public écrit par un VISITEUR se nomme par son
              // identité réelle (l'agent est côté équipe, comme la vue équipe) ;
              // le board, lui, n'en montre jamais que l'avatar.
              author: visitor
                ? visitor.name?.trim() || visitor.email?.trim() || visitor.pseudonym
                : c.via_assistant
                  ? "Numo"
                  : displayName(
                      toNamed(c.author_id ? users.get(c.author_id as string) : null),
                      "User"
                    ),
              visibility: (c.visibility as string) ?? "internal",
              body: c.body,
              created_at: c.created_at,
            };
          }),
        },
      });
    }
  );

  server.registerTool(
    "minddy_add_feedback_comment",
    {
      title: "Add feedback comment",
      description:
        "Post an internal, team-only comment on a feedback post (never shown on the " +
        "public board), e.g. to leave triage notes. " +
        "KEEP IT SHORT — a triage note, not a memo: two or three sentences, or a " +
        "few one-line bullets, 1000 characters at most, no headings. " +
        "The timeline shows the agent as " +
        "the author (this API key's name with an '(mcp)' marker), not the key's owner. " +
        "To answer the person who submitted the request, where everyone reading it on " +
        "the board will see the reply, use minddy_respond_feedback instead.",
      inputSchema: {
        project_id: PROJECT_ID,
        feedback_post_id: z.string().uuid(),
        body: z
          .string()
          .min(1)
          .describe(
            "Markdown, SHORT: two or three sentences, 1000 characters at most, " +
              "no headings."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const result = await addCommentToFeedbackPost({
        postId: ref.post.id,
        actorId: scope.userId,
        body: args.body,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ comment: result.comment });
    }
  );

  server.registerTool(
    "minddy_update_feedback",
    {
      title: "Update feedback post",
      description:
        "Decide on a feedback post: set its `status` (the public answer the board " +
        "shows — open, planned, in_progress, shipped, declined, or spam for a " +
        "request set aside, which drops off the board entirely), its `is_public` " +
        "(false keeps the request for the team only), and its `review_state` " +
        "('published' pushes a post out of the AI review queue by hand, 'pending' " +
        "puts it back). Only the fields you send change. " +
        "The status of a post LINKED TO AN ISSUE is not its own — it is copied from " +
        "that issue on every transition — so setting it here is refused: move the " +
        "issue instead, with minddy_update_issues. To answer the person rather than " +
        "decide, use minddy_respond_feedback.",
      inputSchema: {
        project_id: PROJECT_ID,
        feedback_post_id: z.string().uuid(),
        status: z
          .enum(FEEDBACK_POST_STATUSES)
          .optional()
          .describe("Public status. Refused on a post linked to an issue."),
        is_public: z
          .boolean()
          .optional()
          .describe("false takes the request off the public board."),
        review_state: z
          .enum(FEEDBACK_REVIEW_STATES)
          .optional()
          .describe("Publication queue: 'pending' or 'published'."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const input: Record<string, unknown> = {};
      if (args.status !== undefined) input.status = args.status;
      if (args.is_public !== undefined) input.is_public = args.is_public;
      if (args.review_state !== undefined) input.review_state = args.review_state;
      if (Object.keys(input).length === 0) {
        return fail(
          "invalid_params",
          "Pass at least one of status, is_public, review_state."
        );
      }

      // Même verrou que la vue équipe (`statusLocked`) : un retour lié tient son
      // statut de son ticket, que `status-sync` recopie à chaque transition.
      // L'accepter ici offrirait un geste que la prochaine transition écrase.
      if (args.status !== undefined && ref.post.issue_id) {
        return fail(
          "status_follows_issue",
          "This feedback post is linked to an issue: its public status is copied " +
            "from that issue on every transition, so it can't be set directly. " +
            "Move the issue instead (minddy_update_issues), or detach the post " +
            "with minddy_unlink_feedback first."
        );
      }

      const result = await updateFeedbackPostFields({
        postId: ref.post.id,
        actorId: scope.userId,
        input,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        feedback: {
          id: result.post.id,
          title: result.post.title,
          status: result.post.status,
          is_public: result.post.is_public,
          review_state: result.post.review_state,
        },
      });
    }
  );

  server.registerTool(
    "minddy_promote_feedback",
    {
      title: "Promote feedback to issue",
      description:
        "Turn a feedback post into a NEW backlog issue and link them: the issue " +
        "carries the request and its vote count, and the post's public status then " +
        "follows that issue automatically. Fails if the post is already linked or is " +
        "a merged duplicate. Use minddy_link_feedback instead when an issue already " +
        "tracks the request.",
      inputSchema: { project_id: PROJECT_ID, feedback_post_id: z.string().uuid() },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const result = await promoteFeedbackPost({
        postId: ref.post.id,
        actorId: scope.userId,
        projectName: scope.access.project.name,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        issue: {
          ...result.issue,
          identifier: issueIdentifier(
            scope.access.project.key,
            result.issue.number as number
          ),
        },
      });
    }
  );

  server.registerTool(
    "minddy_link_feedback",
    {
      title: "Link feedback to issue",
      description:
        "Link a feedback post to an EXISTING issue (the work is already tracked). The " +
        "post's public status immediately reflects the issue and follows its " +
        "transitions. Fails if the post is already linked or merged.",
      inputSchema: {
        project_id: PROJECT_ID,
        feedback_post_id: z.string().uuid(),
        issue: ISSUE_REF,
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;
      const issueRef = await resolveIssueRef(scope.access, args.issue);
      if ("error" in issueRef) return issueRef.error;

      const result = await linkFeedbackIssue({
        postId: ref.post.id,
        issueId: issueRef.issue.id,
        actorId: scope.userId,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        linked: true,
        feedback_post_id: ref.post.id,
        issue: issueRef.issue.identifier,
      });
    }
  );

  server.registerTool(
    "minddy_unlink_feedback",
    {
      title: "Unlink feedback",
      description:
        "Detach the issue currently linked to a feedback post (the post keeps its " +
        "last public status).",
      inputSchema: { project_id: PROJECT_ID, feedback_post_id: z.string().uuid() },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const okDone = await unlinkFeedbackIssue(ref.post.id, scope.userId, scope.keyId);
      if (!okDone) return fail("database_error", "Could not unlink the feedback post.");
      return ok({ unlinked: true, feedback_post_id: ref.post.id });
    }
  );

  server.registerTool(
    "minddy_respond_feedback",
    {
      title: "Respond to feedback",
      description:
        "Reply PUBLICLY on a feedback post: the message is posted to the public " +
        "board thread, where everyone reading the request sees it, signed on behalf " +
        "of the team (never with a member's name). This is PUBLIC-facing and it is " +
        "not editable afterwards — post it once it says what the team means. " +
        "KEEP IT SHORT — the person wants to know where their request stands, not " +
        "read a report: two or three plain sentences, no headings, no roadmap " +
        "recap. " +
        "For a " +
        "triage note nobody outside the team should read, use " +
        "minddy_add_feedback_comment instead.",
      inputSchema: {
        project_id: PROJECT_ID,
        feedback_post_id: z.string().uuid(),
        response: z
          .string()
          .min(1)
          .describe(
            "Public reply, shown on the board. SHORT: two or three sentences, " +
              "no headings."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const result = await addCommentToFeedbackPost({
        postId: ref.post.id,
        actorId: scope.userId,
        body: args.response,
        visibility: "public",
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ feedback_post_id: ref.post.id, comment: result.comment });
    }
  );

  // ── Setup : le board public et les clés d'intégration (MIN-106) ──────────
  // Ce que les outils ci-dessus ne pouvaient pas faire : brancher l'app de
  // l'utilisateur SUR minddy. L'agent qui lit ceci est dans le dépôt du client —
  // il peut écrire un `.env` et du code, ce que Numo, dans le chat, ne peut pas.

  server.registerTool(
    "minddy_get_feedback_board",
    {
      title: "Get feedback board setup",
      description:
        "Read the project's PUBLIC feedback board setup — call this before writing " +
        "any link, button or redirect that sends users to the board. Returns whether " +
        "the board exists and is enabled, its public_url, the custom domain and its " +
        "status, whether SSO pre-identification is configured, and the display " +
        "options. public_url is the custom domain when the project has a VERIFIED " +
        "one, otherwise the /f/<token> URL: use it VERBATIM — a board is reached by " +
        "an opaque token and its URL cannot be derived from the project.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      return ok({ board: await getFeedbackBoardConfig(scope.access.project.id) });
    }
  );

  server.registerTool(
    "minddy_configure_feedback_board",
    {
      title: "Configure feedback board",
      description:
        "Publish or unpublish the project's public feedback board, and/or get its " +
        "SSO secret. OWNER ONLY. enabled=true creates the board if the project has " +
        "none; enabled=false only takes the public page down — collection through " +
        "the feedback API keeps working. generate_sso_secret=true returns the HS256 " +
        "secret used to pre-identify signed-in users: it NEVER rotates an existing " +
        "secret (that would break a live integration), it returns the current one or " +
        "creates the first. Put that secret in the app's server-side environment " +
        "(e.g. MINDDY_SSO_SECRET), never in client code, never in version control.",
      inputSchema: {
        project_id: PROJECT_ID,
        enabled: z
          .boolean()
          .optional()
          .describe("true publishes the public board, false takes it down."),
        generate_sso_secret: z
          .boolean()
          .optional()
          .describe("true returns the SSO secret, creating it if there is none."),
        allow_comments: z
          .boolean()
          .optional()
          .describe(
            "Let signed-in visitors reply publicly on a request. false leaves the " +
              "existing thread readable but closes it to new comments; the team can " +
              "still reply publicly. Needs an existing board."
          ),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      if (!scope.access.isOwner) {
        return fail("forbidden", "Only the project owner can configure the feedback board.");
      }
      const result = await configureFeedbackBoard({
        projectId: scope.access.project.id,
        enabled: args.enabled,
        generateSso: args.generate_sso_secret === true,
        allowComments: args.allow_comments,
      });
      if (!result.ok) {
        switch (result.errorKey) {
          case "noFieldsToUpdate":
            return fail(
              "invalid_params",
              "Pass enabled, allow_comments and/or generate_sso_secret."
            );
          case "boardNotFound":
            return fail(
              "not_found",
              "This project has no feedback board yet — pass enabled: true to create it."
            );
          default:
            return fail("database_error", "Could not configure the feedback board.");
        }
      }
      return ok({
        board: result.config,
        ...(result.sso_secret ? { sso_secret: result.sso_secret } : {}),
      });
    }
  );

  server.registerTool(
    "minddy_list_integrations",
    {
      title: "List integrations",
      description:
        "List the project's integrations — the API keys an external app uses to " +
        "push into this project server-to-server: id, name, kind ('issues' or " +
        "'feedback'), key_prefix, when it was created, when it was last used, " +
        "whether it is revoked, and its outgoing `webhook` (null when off, else " +
        "url, events, scope and the status of the last delivery). Call it before " +
        "creating one, to reuse the setup already in place instead of piling up " +
        "keys. Plaintext keys are NEVER listed — a key exists in clear only in the " +
        "minddy_create_integration result.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const rows = await listIntegrations(scope.access.project.id);
      if (!rows) return fail("database_error", "Could not list integrations.");
      return ok({
        integrations: rows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          key_prefix: row.key_prefix,
          created_at: row.created_at,
          last_used_at: row.last_used_at,
          revoked: row.revoked_at !== null,
          // Une intégration sans URL n'a pas de webhook : dire `null` plutôt
          // qu'un objet à moitié rempli évite de faire croire à un webhook
          // éteint mais configuré.
          webhook: row.webhook_url
            ? {
                url: row.webhook_url,
                events: row.webhook_events,
                scope: row.webhook_scope,
                last_status: row.webhook_last_status,
                last_at: row.webhook_last_at,
              }
            : null,
        })),
      });
    }
  );

  server.registerTool(
    "minddy_create_integration",
    {
      title: "Create integration",
      description:
        "Create an API key the user's own application uses to push into this " +
        "project server-to-server, and get everything needed to wire it up. OWNER " +
        "ONLY. Pick the kind from what the app collects: 'feedback' submits end-user " +
        "requests to the feedback board (votes, public status, automatic " +
        "deduplication), 'issues' creates issues straight in triage. A key serves " +
        "one endpoint family only. The result carries the plaintext key ONCE — it is " +
        "never readable again, so write it to the project's server-side environment " +
        "(never client-side, never committed) before doing anything else — and a " +
        "`usage` object with the exact endpoints, payloads and error codes for that " +
        "kind: implement against THAT, not from memory. On an 'issues' key, " +
        "`usage.webhook` describes the OTHER direction — minddy calling the app " +
        "back when issues move; turn it on with minddy_configure_webhook rather " +
        "than polling. A 'feedback' key has none: what it submits lives on the " +
        "board, and it creates no issue.",
      inputSchema: {
        project_id: PROJECT_ID,
        name: z
          .string()
          .min(1)
          .max(60)
          .describe("Identifies the integration in the project's settings, e.g. 'Acme web app'."),
        kind: z
          .enum(["issues", "feedback"])
          .describe(
            "'feedback' = submit user requests to the feedback board; " +
              "'issues' = create issues in triage."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      if (!scope.access.isOwner) {
        return fail("forbidden", "Only the project owner can create an integration.");
      }
      const created = await createIntegration({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        name: args.name,
        kind: args.kind,
      });
      if (!created.ok) {
        return created.errorKey === "integrationNameRequired"
          ? fail("invalid_params", "name must be 1 to 60 characters.")
          : fail("database_error", "Could not create the integration.");
      }
      return ok({
        integration: {
          id: created.integration.id,
          name: created.integration.name,
          kind: created.integration.kind,
        },
        key: created.key,
        usage: integrationUsage(args.kind, SITE_URL),
      });
    }
  );

  server.registerTool(
    "minddy_configure_webhook",
    {
      title: "Configure integration webhook",
      description:
        "Point an integration's outgoing webhook at an endpoint of the user's app: " +
        "minddy then POSTs signed JSON there whenever a followed issue event " +
        "happens, which is how the app learns that a human triaged what it pushed. " +
        "OWNER ONLY, and 'issues' keys ONLY — a 'feedback' key creates no issue, so " +
        "it has no webhook and this is refused on one. This is the answer to 'how " +
        "do I know when the status changes' — never write a polling loop. The " +
        "result carries the full receiver contract (headers, signature, payload, " +
        "delivery guarantees): implement the route against THAT. Pass url: null to " +
        "turn the webhook off; the events and scope are kept. Read the current " +
        "setup with minddy_list_integrations.",
      inputSchema: {
        project_id: PROJECT_ID,
        integration_id: z.string().uuid().describe("From minddy_list_integrations."),
        url: z
          .string()
          .nullable()
          .describe(
            "HTTPS endpoint that receives the deliveries, or null to turn the " +
              "webhook off. Must be reachable from the internet — a localhost URL " +
              "is accepted and will simply never be delivered."
          ),
        events: z
          .array(z.enum(WEBHOOK_EVENTS))
          .min(1)
          .describe(
            "Which events to deliver: 'issue.created', 'issue.status_changed', " +
              "'issue.updated'. Ask for what the app actually reacts to — every " +
              "unused delivery is a request your endpoint has to answer anyway."
          ),
        scope: z
          .enum(WEBHOOK_SCOPES)
          .describe(
            "'integration' = only the issues this key created (the usual choice " +
              "for an app that pushes its own reports); 'all' = every issue of the " +
              "project. A 'feedback' key creates no issue, so it needs 'all'."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      if (!scope.access.isOwner) {
        return fail("forbidden", "Only the project owner can configure a webhook.");
      }
      const result = await updateIntegrationWebhook({
        projectId: scope.access.project.id,
        integrationId: args.integration_id,
        input: {
          webhook_url: args.url,
          webhook_events: args.events,
          webhook_scope: args.scope,
        },
      });
      if (!result.ok) {
        switch (result.errorKey) {
          case "webhookInvalidUrl":
            return fail("invalid_params", "url must be an http(s) URL, or null.");
          case "webhookInvalidConfig":
            return fail("invalid_params", "Unknown event or scope.");
          case "webhookIssuesOnly":
            return fail(
              "invalid_params",
              "That is a 'feedback' key: it creates no issue, so it has no " +
                "webhook. Only an 'issues' key can have one."
            );
          case "integrationNotFound":
            return fail(
              "not_found",
              "No active integration with that id in this project."
            );
          default:
            return fail("database_error", "Could not configure the webhook.");
        }
      }
      return ok({
        webhook: {
          url: result.integration.webhook_url,
          events: result.integration.webhook_events,
          scope: result.integration.webhook_scope,
          // Éteindre le webhook, c'est ne plus rien avoir à implémenter : le
          // contrat du récepteur ne suit que quand il y a une URL.
          ...(result.integration.webhook_url
            ? { contract: integrationWebhookDoc() }
            : {}),
        },
      });
    }
  );

  // ── Routines (MIN-185) ──────────────────────────────────────────────
  //
  // La description de `minddy_create_routine` est celle que `catalog.ts` rejoue
  // dans `/llms.txt` : elle doit se suffire à elle-même, et surtout DIRE CE QUE
  // N'EST PAS une routine. Un ticket récurrent, une automatisation de projet et
  // une routine se ressemblent de loin ; sans cette phrase, un client crée la
  // mauvaise des trois et personne ne s'en aperçoit avant que ça tourne.
  server.registerTool(
    "minddy_list_routines",
    {
      title: "List routines",
      description:
        "List the project's ROUTINES — the jobs minddy's coding agent runs BY " +
        "ITSELF on a schedule. Each one gives its id, title, the instruction it " +
        "runs, its cadence (frequency + hour/minute + weekdays or days_of_month + " +
        "IANA timezone), its model, whether it is enabled, when it last ran, when " +
        "it runs next, and the code of the last missed run ('quota' = the monthly " +
        "usage budget was exhausted, 'noRepo' = the repository was unlinked). Call " +
        "it before creating one, to adjust what is already scheduled instead of " +
        "stacking a second routine doing the same job.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const rows = (await listRoutinesForUser(scope.userId)).filter(
        (r) => r.project_id === scope.access.project.id
      );
      return ok({ routines: rows.map(mcpRoutine) });
    }
  );

  server.registerTool(
    "minddy_create_routine",
    {
      title: "Create routine",
      description:
        "Create a ROUTINE: a job that minddy's coding agent runs BY ITSELF " +
        "on a schedule, in a sandbox on the project's linked repository — a " +
        "security review every Monday, a dependency sweep on the 1st, a monthly " +
        "inventory. OWNER ONLY: only the project's owner can create one, because " +
        "it is their AI usage budget that leaves every Monday morning; a member " +
        "gets a 'forbidden' refusal and there is no way around it. " +
        "It is NOT a recurring ticket (that is an issue with a `recurrence` — a " +
        "task that comes back on a board) and NOT a project automation (those " +
        "react to an event on an issue): nothing triggers a routine but the clock, " +
        "and each occurrence is a real agent run with its own sandbox and tools. " +
        "There is NO name to pass: minddy writes the routine's title from its " +
        "instruction, and rewrites it whenever the instruction changes. " +
        "Two things follow from running unattended, and the instruction must be " +
        "written for them: the agent CANNOT ask anything (no question will ever be " +
        "answered — it decides and documents its choice), and it MAY open a pull " +
        "request without being asked when it finds something worth fixing, and " +
        "simply concludes when it does not. So write `prompt` as a complete brief: " +
        "what to look at, what counts as a finding, what to do with one. The model " +
        "is chosen per routine and frozen on it — the strongest one for a security " +
        "review, the cheapest for a monthly inventory — and its spend is billed " +
        "under 'Routines', separately from agent runs. ONE run stops at 15% of the " +
        "owner's monthly usage budget by default, so a routine cannot silently " +
        "take the whole month (`max_spend_percent`). Requires a linked repository.",
      inputSchema: {
        project_id: PROJECT_ID,
        prompt: z
          .string()
          .min(1)
          .describe(
            "The INSTRUCTION the agent receives at every occurrence, in the user's " +
              "language. It must stand on its own — nobody will be there to clarify it."
          ),
        frequency: z
          .enum(["daily", "weekly", "monthly"])
          .describe(
            "'daily', 'weekly' (then pass weekdays) or 'monthly' (then pass days_of_month)."
          ),
        hour: z
          .number()
          .int()
          .min(0)
          .max(23)
          .describe("Hour of the run, 0–23, expressed IN `timezone`."),
        timezone: z
          .string()
          .describe(
            "IANA timezone the hour is expressed in ('Europe/Paris', " +
              "'America/New_York'). REQUIRED, and it must be the USER'S timezone: " +
              "pass the one their machine reports, never guess, never default to " +
              "UTC — a wrong timezone runs the routine hours off, every single " +
              "time, and nothing on screen says so. An unknown name is refused."
          ),
        minute: z.number().int().min(0).max(59).optional().describe("Minute, 0–59. Default 0."),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .optional()
          .describe(
            "Days of the week a 'weekly' routine runs on: 0 = Sunday, 1 = Monday … " +
              "6 = Saturday. SEVERAL are allowed — [1, 4] means every Monday AND " +
              "Thursday. At least one is required for 'weekly'; REFUSED on other " +
              "cadences."
          ),
        days_of_month: z
          .array(z.number().int().min(1).max(31))
          .optional()
          .describe(
            "Days of the month a 'monthly' routine runs on, 1–31. SEVERAL are " +
              "allowed — [1, 15] means the 1st AND the 15th. On a shorter month a " +
              "day falls back to that month's last day (31 in February = the 28th), " +
              "never skipping a month. At least one is required for 'monthly'; " +
              "REFUSED on other cadences."
          ),
        model: z
          .string()
          .optional()
          .describe(
            "Exact model id to freeze on this routine. Omit for the owner's default. " +
              "A model above the plan's ceiling is refused here, at creation."
          ),
        reasoning_level: z
          .enum(["off", "low", "medium", "high"])
          .optional()
          .describe("Reasoning effort of the runs. Omit for the owner's default."),
        base_branch: z
          .string()
          .optional()
          .describe("Branch the runs start from. Omit for the repository's default branch."),
        max_spend_percent: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Cap on what ONE run of this routine may spend, as a percentage of the " +
              "owner's monthly usage budget. OMIT unless the user asks for a cap: " +
              "the default (15) lets a routine run all month without eating the " +
              "budget, and 100 removes the cap. Raise it for a routine that runs " +
              "rarely and must finish its job (a monthly security review at 50); " +
              "lower it for one that runs every day (an inventory at 5). It " +
              "does not apply to owners running on their own API key."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await createRoutine({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        prompt: args.prompt,
        model: args.model ?? null,
        reasoningLevel: args.reasoning_level ?? null,
        baseBranch: args.base_branch ?? null,
        maxSpendPercent: args.max_spend_percent ?? null,
        frequency: args.frequency,
        hour: args.hour,
        minute: args.minute ?? 0,
        weekdays: args.weekdays ?? null,
        daysOfMonth: args.days_of_month ?? null,
        timezone: args.timezone,
      });
      if (!result.ok) return routineFailure(result);
      return ok({ routine: mcpRoutine(result.routine) });
    }
  );

  server.registerTool(
    "minddy_update_routine",
    {
      title: "Update routine",
      description:
        "Change an existing routine: pause it or bring it back (`enabled`), move " +
        "its cadence, swap its model, or rewrite its instruction. OWNER ONLY. " +
        "Touching the cadence — or re-enabling a paused routine — RECOMPUTES the " +
        "next occurrence, so a change takes effect at the next one, never at the " +
        "one already scheduled. Pausing keeps the routine in the list, where the " +
        "user still reads its past runs; minddy_delete_routine takes it out of the " +
        "list altogether (to the trash). Get the id from minddy_list_routines.",
      inputSchema: {
        project_id: PROJECT_ID,
        routine_id: z.string().uuid().describe("From minddy_list_routines."),
        prompt: z
          .string()
          .min(1)
          .optional()
          .describe(
            "REPLACES the current instruction. The title is rewritten from it — " +
              "there is no name to pass."
          ),
        enabled: z
          .boolean()
          .optional()
          .describe("false pauses the routine; true re-arms it on its next occurrence."),
        frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
        hour: z.number().int().min(0).max(23).optional(),
        minute: z.number().int().min(0).max(59).optional(),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .optional()
          .describe("0 = Sunday … 6 = Saturday. Several allowed."),
        days_of_month: z.array(z.number().int().min(1).max(31)).optional(),
        timezone: z
          .string()
          .optional()
          .describe("IANA timezone of the hour. Pass the user's, never a guess."),
        model: z.string().optional(),
        reasoning_level: z.enum(["off", "low", "medium", "high"]).optional(),
        base_branch: z.string().optional(),
        max_spend_percent: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "New cap on what ONE run may spend, as a percentage of the owner's " +
              "monthly usage budget (100 = no cap of its own). This is what to " +
              "change when a run stopped on its cap and the user wants it to go " +
              "further — not the plan."
          ),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await updateRoutine({
        routineId: args.routine_id,
        actorId: scope.userId,
        ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
        ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.reasoning_level !== undefined
          ? { reasoningLevel: args.reasoning_level }
          : {}),
        ...(args.base_branch !== undefined ? { baseBranch: args.base_branch } : {}),
        ...(args.max_spend_percent !== undefined
          ? { maxSpendPercent: args.max_spend_percent }
          : {}),
        ...(args.frequency !== undefined ? { frequency: args.frequency } : {}),
        ...(args.hour !== undefined ? { hour: args.hour } : {}),
        ...(args.minute !== undefined ? { minute: args.minute } : {}),
        ...(args.weekdays !== undefined ? { weekdays: args.weekdays } : {}),
        ...(args.days_of_month !== undefined ? { daysOfMonth: args.days_of_month } : {}),
        ...(args.timezone !== undefined ? { timezone: args.timezone } : {}),
      });
      if (!result.ok) return routineFailure(result);
      return ok({ routine: mcpRoutine(result.routine) });
    }
  );

  server.registerTool(
    "minddy_delete_routine",
    {
      title: "Delete routine",
      description:
        "Move a routine to the TRASH. OWNER ONLY. It stops running at once and " +
        "leaves the list, but nothing is destroyed: its past executions stay with " +
        "it, and the user can restore it as it was — cadence, instruction, model, " +
        "next occurrence and history — from Trash in the app, for a few weeks. " +
        "After that the nightly sweep deletes it for good, executions included. " +
        "To simply stop it from running while keeping it in the list, pass " +
        "enabled: false to minddy_update_routine instead. Confirm with the user " +
        "before deleting one they did not just create by mistake.",
      inputSchema: {
        project_id: PROJECT_ID,
        routine_id: z.string().uuid().describe("From minddy_list_routines."),
      },
      annotations: { ...WRITE, destructiveHint: true },
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await deleteRoutine({
        routineId: args.routine_id,
        actorId: scope.userId,
      });
      if (!result.ok) return routineFailure(result);
      return ok({ deleted: true, routine_id: args.routine_id });
    }
  );

  server.registerTool(
    "minddy_revoke_integration",
    {
      title: "Revoke integration",
      description:
        "Revoke an integration's API key: it stops working immediately, for every " +
        "app still using it. OWNER ONLY and IRREVERSIBLE — there is no un-revoke, " +
        "and a new key means redeploying whatever held the old one. Use it to clean " +
        "up a key you just created by mistake; otherwise confirm with the user " +
        "first. Get the id from minddy_list_integrations.",
      inputSchema: {
        project_id: PROJECT_ID,
        integration_id: z.string().uuid().describe("From minddy_list_integrations."),
      },
      annotations: { ...WRITE, destructiveHint: true },
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      if (!scope.access.isOwner) {
        return fail("forbidden", "Only the project owner can revoke an integration.");
      }
      const result = await revokeIntegration({
        projectId: scope.access.project.id,
        integrationId: args.integration_id,
      });
      if (!result.ok) {
        return result.errorKey === "integrationNotFound"
          ? fail("not_found", "No active integration with that id in this project.")
          : fail("database_error", "Could not revoke the integration.");
      }
      return ok({ revoked: true, integration_id: args.integration_id });
    }
  );
}
