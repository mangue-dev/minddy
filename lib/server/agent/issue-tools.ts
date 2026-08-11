import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  assertIssueInProject,
  getIssue,
  resolveIssueRef,
  searchIssues,
  type ResolvedIssueRef,
} from "@/lib/server/issue-reads";
import { signedAttachmentUrl, downloadAttachment } from "@/lib/server/attachments";
import { joinedPage } from "@/lib/server/resource-select";
import {
  MAX_DESCRIPTION_LENGTH,
  updateIssueFields,
} from "@/lib/server/update-issue";
import {
  editIssueText,
  type IssueTextField,
  type IssueTextTools,
} from "@/lib/server/text-edit";
import { createIssueForProject } from "@/lib/server/create-issue";
import { createRoutine } from "@/lib/server/routines";
import { getTeamFeedbackDetail } from "@/lib/server/feedback/team-queries";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { isEffort } from "@/lib/issue-validation";
import type { NumoDefaultStatus } from "@/lib/numo-default-status";
import { MAX_PLAN_LENGTH, appendToPlan, parsePlan } from "@/lib/plan";
import { executePageTool } from "./page-tools";
import { headTail } from "./prune";
import type { AgentToolImage } from "./content";

/**
 * Tools TICKET de l'agent de code : les tickets du PROJET du run. Servis aux deux
 * ancrages (MIN-125) — un run de carnet doit pouvoir chercher et lire un ticket,
 * un run de ticket doit pouvoir en viser un autre. L'ancrage ne décide plus que de
 * la CIBLE PAR DÉFAUT : le ticket du run quand il y en a un, sinon `issue` est
 * obligatoire et se résout avec `search_issues`.
 *  - `search_issues`    → trouver un ticket du projet (searchIssues, partagé
 *                          avec Numo/MCP).
 *  - `read_issue`       → tout le ticket (getIssue) + plan parsé en tâches +
 *                          derniers commentaires.
 *  - `read_resource`    → une ressource : l'url et le titre pour un LIEN ;
 *                          l'id et le titre pour une PAGE du wiki (le document
 *                          se lit ensuite par `read_page`) ; pour un
 *                          FICHIER, texte inline quand c'est lisible, l'IMAGE
 *                          ELLE-MÊME quand c'est une maquette et que le modèle du
 *                          run la voit (MIN-111), sinon URL signée courte
 *                          (curl-able depuis la sandbox).
 *  - `update_issue`     → titre, description, effort. JAMAIS le statut ni la
 *                          priorité : ce sont des décisions de l'utilisateur, et le
 *                          tool REFUSE explicitement l'argument plutôt que de
 *                          l'avaler (un champ hors schéma est vite halluciné).
 *  - `write_issue_plan` → écrit le plan markdown du ticket (updateIssueFields,
 *                          via_assistant) SANS lancer l'implémentation.
 *  - `append_to_plan`   → ajoute un bloc au plan existant sans toucher au reste.
 *  - `edit_issue_text`  → réécrit UN passage du plan ou de la description
 *                          (old_string → new_string), comme `edit_file` sur un
 *                          fichier. Les deux (MIN-186) partagent leur cœur avec
 *                          le MCP et Numo : `appendToPlan` et `editIssueText`.
 *  - `create_issue`     → crée un ticket du projet, au statut d'atterrissage choisi
 *                          par le lanceur (Compte → Préférences), comme Numo chat.
 *  - `create_routine`   → pose une ROUTINE (MIN-185) : un run programmé qui
 *                          revient tout seul. Même fabrique que les trois autres
 *                          portes ; l'appelant est le lanceur du run, donc un
 *                          run lancé par un non-propriétaire se voit refuser.
 * Service client : l'accès a été contrôlé au lancement du run (membre du projet),
 * et toute lecture/écriture est épinglée au projet du run.
 */

export interface IssueToolContext {
  /** Ticket du run — cible PAR DÉFAUT des tools ticket. Null sur un run de carnet :
   *  `issue` devient alors obligatoire. */
  anchorIssueId: string | null;
  projectId: string;
  projectKey: string;
  /** Propriétaire du run — acteur des écritures (plan, champs, création). */
  actorId: string | null;
  /** Statut d'atterrissage d'un ticket créé, réglage de compte du LANCEUR
   *  (`user_metadata.numo_default_status`) — jamais un paramètre du modèle. */
  numoDefaultStatus: NumoDefaultStatus;
  /** Le modèle du run accepte-t-il une image en entrée ? (cf. `supportsImageInput`).
   *  Faux → `read_resource` se comporte exactement comme avant MIN-111. */
  imageInput?: boolean;
  /** Run COURANT — la ligne sur laquelle `report_verdict` écrit son verdict. */
  runId?: string | null;
  /** Chaîne d'automatisation du run (MIN-147). C'est elle qui décide si
   *  `report_verdict` est servi : hors chaîne, personne ne lit un verdict. */
  chainId?: string | null;
}

/** Noms des tools de ce module. Ils vivent dans `platform-tool-names.ts` depuis
 *  MIN-224 — le ROUTAGE descend dans la microVM, l'EXÉCUTION reste ici — et sont
 *  ré-exportés pour que rien n'ait à changer d'import. */
export { ISSUE_TOOL_NAMES } from "./platform-tool-names";

/** Derniers commentaires renvoyés par défaut (le fil complet sur demande). */
const COMMENTS_DEFAULT_LIMIT = 15;
/** Cap par corps de commentaire injecté. */
const COMMENT_BODY_MAX_CHARS = 2000;
/** Cap du corps d'un retour : plus généreux qu'un commentaire, parce que c'est
    l'ÉNONCÉ du besoin — le tronquer, c'est perdre le cas d'usage décrit à la
    fin. Reste sous le cap de la boucle (headTail 6000). */
const FEEDBACK_BODY_MAX_CHARS = 4000;
/** Cap du contenu texte inline d'une pièce jointe — aligné sur le cap des
    résultats de tools de la boucle (headTail 6000) : au-delà, le contenu serait
    élidé au milieu de toute façon ; l'URL signée est la voie pour le fichier entier. */
const ATTACHMENT_INLINE_MAX_CHARS = 6000;
/** Taille max d'une pièce jointe téléchargée pour lecture inline. */
const ATTACHMENT_INLINE_MAX_BYTES = 256 * 1024;
/**
 * Formats d'image qu'on MONTRE au modèle (MIN-111). Liste fermée : ce sont ceux
 * que les providers multimodaux acceptent tous. Un SVG est du texte, il passe par
 * la lecture inline ; un TIFF ou un HEIC ne se montre pas — URL signée, comme avant.
 */
const VIEWABLE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
/**
 * Taille max d'une image montrée au modèle, en octets SOURCE. La base64 pèse 4/3 —
 * 750 Ko de PNG font ~1 Mo dans le message, et l'historique EST le checkpoint
 * (plafonné à 8 Mo, avec `capHistoryImages` qui n'en garde que trois). Une maquette
 * d'écran tient très largement dedans ; au-delà, on renvoie l'URL signée avec une
 * note qui le dit.
 */
const ATTACHMENT_IMAGE_MAX_BYTES = 750 * 1024;

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/** Les noms que porte l'agent de code, pour que les refus du patch renvoient
 *  vers des tools qui existent DANS LE RUN (cf. IssueTextTools). */
const AGENT_TEXT_TOOLS: IssueTextTools = {
  read: "read_issue",
  appendToPlan: "append_to_plan",
  replaceWhole: { plan: "write_issue_plan", description: "update_issue" },
};

/** Cap du diff rendu par `edit_issue_text` : confirmer l'atterrissage de
    l'édition, pas re-transporter le document qu'on vient d'éviter de réécrire. */
const EDIT_DIFF_MAX_CHARS = 2000;

/** MIME texte → contenu lisible inline (miroir du helper MCP). */
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

type ToolOutcome = { result: unknown; success: boolean; images?: AgentToolImage[] };

/**
 * Ticket VISÉ par un tool : celui que `args.issue` désigne, sinon celui du run.
 * Passer par le résolveur même pour l'ancrage coûte une requête minuscule et
 * rapporte l'identifiant (l'agent en a besoin pour parler du ticket) tout en
 * ré-épinglant la cible au projet du run.
 */
async function resolveTarget(
  ctx: IssueToolContext,
  ref: unknown,
): Promise<{ issue: ResolvedIssueRef } | { error: string }> {
  const explicit = typeof ref === "string" ? ref.trim() : "";
  const target = explicit || ctx.anchorIssueId;
  if (!target) {
    return {
      error:
        "This session is not attached to a ticket, so `issue` is required — pass a UUID, an identifier like 'MIN-42', or a bare issue number. Find it with search_issues first.",
    };
  }
  const resolved = await resolveIssueRef(
    getServiceClient(),
    { projectId: ctx.projectId, projectKey: ctx.projectKey },
    target,
  );
  if ("error" in resolved) return { error: resolved.error };
  return { issue: resolved.issue };
}

async function searchIssuesTool(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const service = getServiceClient();
  const found = await searchIssues(
    { db: service, service, projectId: ctx.projectId, projectKey: ctx.projectKey },
    args,
  );
  if ("error" in found) return { result: { error: found.error }, success: false };
  return { result: found, success: true };
}

async function readIssue(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const target = await resolveTarget(ctx, args.issue);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const service = getServiceClient();
  const detail = await getIssue(
    { db: service, service, projectId: ctx.projectId, projectKey: ctx.projectKey },
    { issue_id: target.issue.id },
  );
  if ("error" in detail) return { result: { error: detail.error }, success: false };

  // Assignee en nom d'affichage (jamais l'email brut) — l'uuid seul est muet.
  const assigneeId = (detail.issue.assignee_id as string | null) ?? null;
  let assigneeName: string | null = null;
  if (assigneeId) {
    const users = await fetchAuthUsersById(service, [assigneeId]).catch(() => null);
    if (users) assigneeName = displayName(toNamed(users.get(assigneeId)), "User");
  }

  // Plan parsé en tâches indexées : c'est la forme actionnable (« plan prêt,
  // plus qu'à l'appliquer ») — les états [ ]/[~]/[x]/[-] deviennent lisibles.
  const plan = detail.issue.plan;
  const parsed = typeof plan === "string" && plan ? parsePlan(plan) : null;

  const includeAll = args.include_all_comments === true;
  const total = detail.comments.length;
  const recent = includeAll ? detail.comments : detail.comments.slice(-COMMENTS_DEFAULT_LIMIT);
  const comments = recent.map((c) => ({
    ...c,
    body: cap(String(c.body ?? ""), COMMENT_BODY_MAX_CHARS),
  }));

  return {
    result: {
      issue: {
        ...detail.issue,
        // Sur un AUTRE ticket que celui du run, c'est par là que l'agent apprend
        // comment le nommer (« MIN-7 ») — jamais par son uuid.
        identifier: target.issue.identifier,
        ...(assigneeName ? { assignee_name: assigneeName } : {}),
      },
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
      comments,
      comments_total: total,
      ...(total > comments.length
        ? { comments_note: "Older comments omitted — pass include_all_comments=true for the full thread." }
        : {}),
      sub_issues: detail.sub_issues,
      relations: detail.relations,
      ...(detail.duplicate_of ? { duplicate_of: detail.duplicate_of } : {}),
      ...(detail.linked_feedback ? { linked_feedback: detail.linked_feedback } : {}),
    },
    success: true,
  };
}

/**
 * `read_feedback` (MIN-196) — la DEMANDE derrière le ticket, dans les mots de
 * qui l'a formulée, avec sa conversation.
 *
 * L'agent arrive ici par `read_issue`, qui liste les retours du ticket dans
 * `linked_feedback` : c'est de là que vient l'id. Le périmètre est le PROJET du
 * run, comme pour les pièces jointes — un retour d'un autre projet est refusé.
 *
 * Chaque commentaire porte sa visibilité, parce que les deux ne s'écoutent pas
 * pareil : un commentaire PUBLIC vient d'un utilisateur du produit qui décrit
 * son cas — c'est la matière la plus proche du besoin réel — tandis qu'une note
 * INTERNE est une décision d'équipe, qui peut contredire la demande. Les
 * confondre, c'est prendre l'arbitrage de l'équipe pour le besoin de l'usager,
 * ou l'inverse.
 */
async function readFeedback(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const postId = typeof args.feedback_post_id === "string" ? args.feedback_post_id : "";
  if (!postId) {
    return {
      result: { error: "feedback_post_id is required (get it from read_issue's linked_feedback)." },
      success: false,
    };
  }

  const detail = await getTeamFeedbackDetail(ctx.projectId, postId);
  if (!detail) {
    return {
      result: { error: "Feedback not found in this project." },
      success: false,
    };
  }

  const service = getServiceClient();
  const { data: rows } = await service
    .from("comments")
    .select(
      "author_id, via_assistant, body, created_at, visibility, feedback_users!feedback_user_id (name, email, pseudonym)",
    )
    .eq("feedback_post_id", postId)
    .order("created_at", { ascending: true });

  const authorIds = (rows ?? [])
    .map((c) => c.author_id as string | null)
    .filter((v): v is string => !!v);
  const users = await fetchAuthUsersById(service, authorIds).catch(() => null);

  const comments = (rows ?? []).map((c) => {
    const visitor = c.feedback_users as unknown as {
      name: string | null;
      email: string | null;
      pseudonym: string;
    } | null;
    return {
      author: visitor
        ? visitor.name?.trim() || visitor.email?.trim() || visitor.pseudonym
        : c.via_assistant
          ? "Numo"
          : displayName(
              toNamed(c.author_id && users ? users.get(c.author_id as string) : null),
              "User",
            ),
      // « board visitor » = quelqu'un HORS de l'équipe. C'est ce qui distingue
      // un besoin rapporté d'un arbitrage interne.
      from: visitor ? "board visitor" : "team",
      visibility: (c.visibility as string) ?? "internal",
      body: cap(String(c.body ?? ""), COMMENT_BODY_MAX_CHARS),
      created_at: c.created_at,
    };
  });

  return {
    result: {
      feedback: {
        id: detail.id,
        title: detail.title,
        // Le texte SOUMIS à côté du canonique : l'équipe réécrit souvent le
        // titre et le corps, et l'original est ce que la personne a tapé.
        body: cap(String(detail.body ?? ""), FEEDBACK_BODY_MAX_CHARS),
        submitted_title: detail.submitted_title,
        submitted_body: cap(String(detail.submitted_body ?? ""), FEEDBACK_BODY_MAX_CHARS),
        status: detail.status,
        vote_count: detail.vote_count,
        is_public: detail.is_public,
        source: detail.source,
      },
      comments,
    },
    success: true,
  };
}

async function readResource(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  // `attachment_id` reste accepté : un checkpoint écrit avant MIN-184 rejoue
  // l'ancien appel avec l'ancien argument, et le rejeu doit aboutir.
  const resourceId =
    typeof args.resource_id === "string"
      ? args.resource_id
      : typeof args.attachment_id === "string"
        ? args.attachment_id
        : "";
  if (!resourceId) {
    return { result: { error: "resource_id is required (get it from read_issue)." }, success: false };
  }

  const service = getServiceClient();
  // Périmètre = le PROJET du run, pas le seul ticket d'ancrage : les ids que
  // `read_issue` renvoie sur un autre ticket doivent être ouvrables. Le parent
  // est relu puis épinglé au projet — une ressource d'un autre projet est
  // introuvable, exactement comme avant.
  const { data: row } = await service
    .from("attachments")
    .select(
      "id, issue_id, objective_id, project_id, kind, url, page_id, storage_path, file_name, mime_type, size_bytes, comment_id, page:pages(id, title, deleted_at)",
    )
    .eq("id", resourceId)
    .maybeSingle();
  if (!row) {
    return { result: { error: "Resource not found." }, success: false };
  }
  // Une ressource pend d'un ticket OU d'un objectif : le ticket passe par
  // `assertIssueInProject` (qui vérifie aussi qu'il n'est pas à la corbeille),
  // l'objectif par le `project_id` que la ligne porte elle-même.
  const inProject = row.issue_id
    ? (await assertIssueInProject(service, row.issue_id as string, ctx.projectId)).ok
    : row.project_id === ctx.projectId;
  if (!inProject) {
    return { result: { error: "Resource not found in this project." }, success: false };
  }

  // Une page du wiki (MIN-275) : son corps se lit par `read_page`, qui rend du
  // markdown — le recopier ici ferait une seconde porte à tenir. Lecture en clé
  // service, donc une page corbeillée remonte aussi : c'est `deleted_at` qui le
  // dit, pas une absence.
  if (row.kind === "page") {
    const page = joinedPage(row.page);
    return {
      result: {
        id: row.id,
        kind: "page",
        page_id: row.page_id,
        title: page?.title?.trim() || row.file_name,
        ...(page?.deleted_at ? { page_in_trash: true } : {}),
        read_with: "read_page",
        comment_id: row.comment_id ?? null,
      },
      success: true,
    };
  }

  // Un lien n'a pas d'octets : ni URL signée, ni contenu inline.
  if (row.kind === "link") {
    return {
      result: {
        id: row.id,
        kind: "link",
        url: row.url,
        title: row.file_name,
        comment_id: row.comment_id ?? null,
      },
      success: true,
    };
  }

  const fileName = (row.file_name as string) || "attachment";
  const mime = (row.mime_type as string) || "application/octet-stream";
  const size = typeof row.size_bytes === "number" ? row.size_bytes : 0;

  const url = await signedAttachmentUrl(service, row.storage_path as string, {
    download: fileName,
    expiresIn: 600,
  });

  const meta = {
    id: row.id,
    file_name: fileName,
    mime_type: mime,
    size_bytes: size,
    comment_id: row.comment_id ?? null,
    download_url: url,
    download_url_expires_in_seconds: 600,
  };

  // Une MAQUETTE se regarde (MIN-111). L'image part en data URL dans le message :
  // l'URL signée, elle, expire en 10 minutes alors que le checkpoint est rejoué
  // des heures plus tard. C'est le seul chemin par lequel l'agent VOIT ce que
  // quelqu'un a déposé sur le ticket, au lieu d'en lire la fiche signalétique.
  if (VIEWABLE_IMAGE_MIMES.has(mime) && ctx.imageInput) {
    if (size > ATTACHMENT_IMAGE_MAX_BYTES) {
      return {
        result: {
          ...meta,
          image_omitted: `Image too large to look at (${Math.round(ATTACHMENT_IMAGE_MAX_BYTES / 1024)} KB max) — download it in the sandbox with run_command (\`curl -sL '<download_url>' -o …\`) if you need the file itself.`,
        },
        success: true,
      };
    }
    const buf = await downloadAttachment(service, row.storage_path as string);
    if (buf && buf.length <= ATTACHMENT_IMAGE_MAX_BYTES) {
      return {
        result: { ...meta, image: "The image itself is attached to this result — look at it." },
        success: true,
        images: [{ url: `data:${mime};base64,${buf.toString("base64")}`, name: fileName }],
      };
    }
    // Téléchargement raté ou taille réelle au-dessus du cap → on retombe sur
    // l'URL signée, en le disant (le modèle ne doit pas croire qu'il a vu l'image).
  }

  if (isTextMime(mime) && size <= ATTACHMENT_INLINE_MAX_BYTES) {
    const buf = await downloadAttachment(service, row.storage_path as string);
    if (buf) {
      const text = buf.toString("utf8");
      return {
        result: {
          ...meta,
          // La coupe garde la TÊTE ET LA QUEUE (MIN-247). Elle coupait par la
          // tête, ce qui est exactement le défaut que MIN-107 avait nommé pour
          // `run_command` et jamais porté ici : sur un log, une trace, un
          // export, la fin est la partie utile — et une pièce jointe déposée
          // sur un ticket est presque toujours l'un des trois.
          content: headTail(text, ATTACHMENT_INLINE_MAX_CHARS),
          ...(text.length > ATTACHMENT_INLINE_MAX_CHARS
            ? {
                content_note:
                  "Truncated in the MIDDLE — you have the beginning and the end of the file. For the part in between, download it in the sandbox: run_command `curl -sL '<download_url>' -o /tmp/…` then read_file it (offset/limit) or grep it.",
              }
            : {}),
        },
        success: true,
      };
    }
  }

  return {
    result: {
      ...meta,
      content_omitted:
        "Binary or large file — if you need the bytes, download them in the sandbox with run_command (`curl -sL '<download_url>' -o …`), OUTSIDE the repository unless the file belongs in the commit.",
    },
    success: true,
  };
}

/**
 * Champs qu'un agent n'écrit PAS, et pourquoi le refus est explicite plutôt que
 * silencieux : `status` et `priority` sont hors schéma, mais un champ hors schéma
 * est régulièrement halluciné — avalé sans rien dire, le modèle croirait avoir
 * fermé un ticket. Il reçoit donc une erreur qui lui dit quoi faire à la place.
 */
const REFUSED_UPDATE_FIELDS: Record<string, string> = {
  status:
    "update_issue cannot change a ticket's status. Statuses stay manual — only the user moves a ticket between triage / backlog / todo / in_progress / in_review / done, and the harness already handles the transitions tied to the pull request. Retry with title / description / effort only, and say in your reply what you think the status should be.",
  priority:
    "update_issue cannot change a ticket's priority — it is the user's call. Only title, description and effort are editable here.",
};

async function updateIssue(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  for (const [field, message] of Object.entries(REFUSED_UPDATE_FIELDS)) {
    if (args[field] !== undefined && args[field] !== null) {
      return { result: { error: message }, success: false };
    }
  }
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };

  const input: Record<string, unknown> = {};
  const changed: string[] = [];
  if (args.title !== undefined) {
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (!title) return { result: { error: "title cannot be empty." }, success: false };
    input.title = title;
    changed.push("title");
  }
  if (args.description !== undefined) {
    input.description = typeof args.description === "string" ? args.description : null;
    changed.push("description");
  }
  if (args.effort !== undefined) {
    // `null` efface l'estimation — c'est la seule façon de la retirer.
    if (args.effort !== null && !isEffort(args.effort)) {
      return {
        result: { error: "effort must be one of: xs, s, m, l, xl (or null to clear it)." },
        success: false,
      };
    }
    input.effort = args.effort;
    changed.push("effort");
  }
  if (changed.length === 0) {
    return {
      result: { error: "Nothing to update — pass at least one of title, description or effort." },
      success: false,
    };
  }

  const target = await resolveTarget(ctx, args.issue);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const result = await updateIssueFields({
    issueId: target.issue.id,
    actorId: ctx.actorId,
    input,
    viaAssistant: true,
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Issue update refused." },
      success: false,
    };
  }
  return {
    result: { ok: true, identifier: target.issue.identifier, changed },
    success: true,
  };
}

async function writeIssuePlan(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const plan = typeof args.plan === "string" ? args.plan.trim() : "";
  if (!plan) return { result: { error: "plan (markdown) is required." }, success: false };
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };

  const target = await resolveTarget(ctx, args.issue);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const result = await updateIssueFields({
    issueId: target.issue.id,
    actorId: ctx.actorId,
    input: { plan },
    viaAssistant: true,
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Plan update refused." },
      success: false,
    };
  }

  const parsed = parsePlan(plan);
  return {
    result: {
      ok: true,
      identifier: target.issue.identifier,
      tasks: parsed.tasks.length,
      progress: parsed.progress,
      ...(parsed.tasks.length === 0
        ? {
            warning:
              "No checkbox tasks detected — a minddy plan should carry ordered '- [ ]' tasks so progress is trackable.",
          }
        : {}),
    },
    success: true,
  };
}

/**
 * Le plan et la description d'un ticket TELS QU'ILS SONT STOCKÉS — ce que les
 * deux écritures chirurgicales ci-dessous lisent avant de patcher : ce qu'on
 * n'a pas relu, on ne peut pas l'écraser sans le voir.
 */
async function readIssueText(
  issueId: string,
): Promise<{ plan: string; description: string } | { error: string }> {
  const { data, error } = await getServiceClient()
    .from("issues")
    .select("plan, description")
    .is("deleted_at", null)
    .eq("id", issueId)
    .maybeSingle();
  if (error) return { error: error.message };
  return {
    plan: typeof data?.plan === "string" ? data.plan : "",
    description: typeof data?.description === "string" ? data.description : "",
  };
}

async function appendToIssuePlan(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const markdown = typeof args.markdown === "string" ? args.markdown : "";
  if (!markdown.trim()) {
    return { result: { error: "markdown (the block to add) is required." }, success: false };
  }
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };
  const section =
    typeof args.section === "string" && args.section.trim() ? args.section.trim() : null;

  const target = await resolveTarget(ctx, args.issue);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const current = await readIssueText(target.issue.id);
  if ("error" in current) return { result: { error: current.error }, success: false };

  const next = appendToPlan(current.plan, markdown, section);
  if (next === null) {
    return {
      result: {
        error: `The plan of ${target.issue.identifier} has no "${section}" heading. Read it with read_issue to see its headings, or omit "section" to append at the end.`,
      },
      success: false,
    };
  }
  if (next.length > MAX_PLAN_LENGTH) {
    return {
      result: { error: `The plan is capped at ${MAX_PLAN_LENGTH} characters.` },
      success: false,
    };
  }

  const result = await updateIssueFields({
    issueId: target.issue.id,
    actorId: ctx.actorId,
    input: { plan: next },
    viaAssistant: true,
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Plan update refused." },
      success: false,
    };
  }

  const parsed = parsePlan(next);
  return {
    result: {
      ok: true,
      identifier: target.issue.identifier,
      plan_tasks: parsed.tasks.map((t) => ({
        task_index: t.index,
        state: t.state,
        text: t.text,
      })),
      plan_progress: parsed.progress,
    },
    success: true,
  };
}

async function editIssueTextTool(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (args.field !== "plan" && args.field !== "description") {
    return { result: { error: 'field must be "plan" or "description".' }, success: false };
  }
  const field: IssueTextField = args.field;
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };

  const target = await resolveTarget(ctx, args.issue);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const current = await readIssueText(target.issue.id);
  if ("error" in current) return { result: { error: current.error }, success: false };

  const edit = editIssueText({
    field,
    current: current[field],
    oldString: typeof args.old_string === "string" ? args.old_string : "",
    newString: typeof args.new_string === "string" ? args.new_string : "",
    replaceAll: args.replace_all === true,
    tools: AGENT_TEXT_TOOLS,
  });
  if (!edit.ok) return { result: { error: edit.message }, success: false };

  // La description est TRONQUÉE en silence au-delà de sa borne : la vérifier
  // ici est la seule façon de le dire au modèle.
  const limit = field === "plan" ? MAX_PLAN_LENGTH : MAX_DESCRIPTION_LENGTH;
  if (edit.content.length > limit) {
    return {
      result: { error: `The ${field} is capped at ${limit} characters.` },
      success: false,
    };
  }

  const result = await updateIssueFields({
    issueId: target.issue.id,
    actorId: ctx.actorId,
    input: { [field]: edit.content },
    viaAssistant: true,
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Issue update refused." },
      success: false,
    };
  }

  const parsed = field === "plan" ? parsePlan(edit.content) : null;
  return {
    result: {
      ok: true,
      identifier: target.issue.identifier,
      field,
      additions: edit.additions,
      deletions: edit.deletions,
      diff: cap(edit.diff, EDIT_DIFF_MAX_CHARS),
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
    },
    success: true,
  };
}

async function createIssue(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return { result: { error: "title is required." }, success: false };

  const result = await createIssueForProject({
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    viaAssistant: true,
    input: {
      title,
      // Statut d'atterrissage = le réglage de compte du lanceur, comme toute
      // création qui passe par Numo. Jamais un paramètre du modèle.
      status: ctx.numoDefaultStatus,
      ...(typeof args.description === "string" && args.description.trim()
        ? { description: args.description }
        : {}),
      ...(typeof args.priority === "string" ? { priority: args.priority } : {}),
      ...(typeof args.effort === "string" ? { effort: args.effort } : {}),
    },
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Issue creation refused." },
      success: false,
    };
  }
  const number = (result.issue as { number?: number }).number;
  return {
    result: {
      ok: true,
      issue: {
        id: (result.issue as { id?: string }).id,
        identifier: typeof number === "number" ? `${ctx.projectKey}-${number}` : null,
        title,
        status: ctx.numoDefaultStatus,
      },
    },
    success: true,
  };
}

/**
 * `create_routine` (MIN-185) depuis un run d'agent : la MÊME fabrique que le
 * wizard, le chat et le MCP.
 *
 * L'appelant est le `created_by` du run — pas le owner du projet. Un run lancé
 * par un membre non-propriétaire se voit donc refuser la création, et le message
 * de refus doit le dire assez clairement pour que l'agent le RAPPORTE au lieu de
 * réessayer avec d'autres paramètres.
 *
 * Le tool n'est pas servi à un run de routine (drapeau `interactive` de
 * `agentToolsFor`) : une routine ne s'auto-réplique pas.
 */
async function createRoutineTool(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (!ctx.actorId) {
    return {
      result: { error: "This session has no user to create a routine for." },
      success: false,
    };
  }
  const result = await createRoutine({
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    prompt: typeof args.prompt === "string" ? args.prompt : "",
    model: typeof args.model === "string" ? args.model : null,
    reasoningLevel: typeof args.reasoning_level === "string" ? args.reasoning_level : null,
    baseBranch: typeof args.base_branch === "string" ? args.base_branch : null,
    maxSpendPercent:
      typeof args.max_spend_percent === "number" ? args.max_spend_percent : null,
    frequency: typeof args.frequency === "string" ? args.frequency : "",
    hour: typeof args.hour === "number" ? args.hour : 9,
    minute: typeof args.minute === "number" ? args.minute : 0,
    weekdays: Array.isArray(args.weekdays)
      ? args.weekdays.filter((d): d is number => typeof d === "number")
      : [],
    daysOfMonth: Array.isArray(args.days_of_month)
      ? args.days_of_month.filter((d): d is number => typeof d === "number")
      : [],
    timezone: typeof args.timezone === "string" ? args.timezone : "",
  });
  if (!result.ok) {
    return { result: { error: routineToolError(result) }, success: false };
  }
  const routine = result.routine;
  return {
    result: {
      ok: true,
      routine: {
        id: routine.id,
        title: routine.title,
        frequency: routine.frequency,
        hour: routine.hour,
        minute: routine.minute,
        weekdays: routine.weekdays,
        days_of_month: routine.days_of_month,
        timezone: routine.timezone,
        next_run_at: routine.next_run_at,
      },
    },
    success: true,
  };
}

/** Refus de la fabrique, dit en clair pour que l'agent le rapporte tel quel. */
function routineToolError(r: {
  errorKey: string;
  modelLimit?: { model: string; multiplier: number; limit: number; planId: string };
}): string {
  switch (r.errorKey) {
    case "ownerOnly":
      return "Refused: only the OWNER of this project can create a routine — this session was launched by someone else. Report this to the user; do not retry.";
    case "noRepo":
      return "Refused: this project has no linked repository, so a routine would have nothing to clone.";
    case "promptRequired":
      return "prompt is required — it is the instruction the routine runs at every occurrence.";
    case "unknownTimezone":
      return "Refused: `timezone` must be a valid IANA name (e.g. 'Europe/Paris'). Ask the user rather than guessing; never fall back to UTC.";
    case "invalidSchedule":
      return "Refused: the cadence does not hold together. 'weekly' takes at least one day in `weekdays` (0=Sunday…6=Saturday) and no days_of_month; 'monthly' takes at least one day in `days_of_month` (1–31) and no weekdays.";
    case "modelAbovePlan":
      return r.modelLimit
        ? `Refused: ${r.modelLimit.model} is ×${r.modelLimit.multiplier}, above the ×${r.modelLimit.limit} ceiling of the ${r.modelLimit.planId} plan. Omit \`model\` to use the account default.`
        : "Refused: that model is above the plan's ceiling. Omit `model` to use the account default.";
    default:
      return "Could not create the routine.";
  }
}

/** Cap du verdict écrit en base — un rapport, pas une dissertation. */
const VERDICT_SUMMARY_MAX_CHARS = 2000;
const VERDICT_BLOCKER_MAX_CHARS = 400;
const VERDICT_MAX_BLOCKERS = 20;

/**
 * `report_verdict` (MIN-147) : ce que l'étape de vérification d'une chaîne
 * conclut. Écrit sur `agent_runs.verdict` du run COURANT — c'est ce que le
 * moteur lit pour décider entre « on continue », « on reprend une fois » et
 * « on rend la main en triage ».
 *
 * Servi uniquement quand le run porte une chaîne (`agentToolsFor({ chain })`) ;
 * le refus ci-dessous n'attrape donc qu'un appel halluciné, mais il vaut mieux
 * une erreur explicite qu'un verdict écrit nulle part.
 */
async function reportVerdict(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (!ctx.chainId || !ctx.runId) {
    return {
      result: {
        error:
          "report_verdict is only available inside an automated chain. Just answer normally.",
      },
      success: false,
    };
  }
  if (typeof args.ok !== "boolean") {
    return { result: { error: "ok (boolean) is required." }, success: false };
  }
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  if (!summary) {
    return { result: { error: "summary (what you checked and concluded) is required." }, success: false };
  }
  const blockers = (Array.isArray(args.blockers) ? args.blockers : [])
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .slice(0, VERDICT_MAX_BLOCKERS)
    .map((b) => b.trim().slice(0, VERDICT_BLOCKER_MAX_CHARS));

  const service = getServiceClient();
  const { error } = await service
    .from("agent_runs")
    .update({
      verdict: { ok: args.ok, summary: summary.slice(0, VERDICT_SUMMARY_MAX_CHARS), blockers },
    })
    .eq("id", ctx.runId);
  if (error) {
    return { result: { error: `Verdict not saved: ${error.message}` }, success: false };
  }
  return { result: { ok: true, recorded: args.ok ? "pass" : "fail" }, success: true };
}

/** Exécute un tool ticket. L'appelant a déjà routé sur `ISSUE_TOOL_NAMES`. */
export async function executeIssueTool(
  ctx: IssueToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "search_issues":
        return await searchIssuesTool(ctx, args);
      case "read_issue":
        return await readIssue(ctx, args);
      case "read_resource":
      // Alias d'exécution : un run repris rejoue un checkpoint écrit sous
      // l'ancien nom (cf. content.test.ts), et ce rejeu doit aboutir.
      case "read_attachment":
        return await readResource(ctx, args);
      case "read_feedback":
        return await readFeedback(ctx, args);
      case "update_issue":
        return await updateIssue(ctx, args);
      case "write_issue_plan":
        return await writeIssuePlan(ctx, args);
      case "append_to_plan":
        return await appendToIssuePlan(ctx, args);
      case "edit_issue_text":
        return await editIssueTextTool(ctx, args);
      case "create_issue":
        return await createIssue(ctx, args);
      case "create_routine":
        return await createRoutineTool(ctx, args);
      case "report_verdict":
        return await reportVerdict(ctx, args);
      // Les pages du projet : même contexte, exécuteur voisin (MIN-273).
      case "list_pages":
      case "read_page":
      case "create_page":
      case "update_page":
      case "append_to_page":
      case "edit_page_text":
        return await executePageTool(
          { projectId: ctx.projectId, actorId: ctx.actorId },
          name,
          args,
        );
      default:
        return { result: { error: `Unknown issue tool: ${name}` }, success: false };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
  }
}
