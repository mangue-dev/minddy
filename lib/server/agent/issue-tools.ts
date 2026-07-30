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
import { updateIssueFields } from "@/lib/server/update-issue";
import { createIssueForProject } from "@/lib/server/create-issue";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { isEffort } from "@/lib/issue-validation";
import type { NumoDefaultStatus } from "@/lib/numo-default-status";
import { parsePlan } from "@/lib/plan";
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
 *  - `read_attachment`  → une pièce jointe : texte inline quand c'est lisible,
 *                          l'IMAGE ELLE-MÊME quand c'est une maquette et que le
 *                          modèle du run la voit (MIN-111), sinon URL signée courte
 *                          (curl-able depuis la sandbox).
 *  - `update_issue`     → titre, description, effort. JAMAIS le statut ni la
 *                          priorité : ce sont des décisions de l'utilisateur, et le
 *                          tool REFUSE explicitement l'argument plutôt que de
 *                          l'avaler (un champ hors schéma est vite halluciné).
 *  - `write_issue_plan` → écrit le plan markdown du ticket (updateIssueFields,
 *                          via_assistant) SANS lancer l'implémentation.
 *  - `create_issue`     → crée un ticket du projet, au statut d'atterrissage choisi
 *                          par le lanceur (Compte → Préférences), comme Numo chat.
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
   *  Faux → `read_attachment` se comporte exactement comme avant MIN-111. */
  imageInput?: boolean;
}

/** Noms des tools ticket (routés vers ce module par execute.ts). */
export const ISSUE_TOOL_NAMES = new Set([
  "search_issues",
  "read_issue",
  "read_attachment",
  "update_issue",
  "write_issue_plan",
  "create_issue",
]);

/** Derniers commentaires renvoyés par défaut (le fil complet sur demande). */
const COMMENTS_DEFAULT_LIMIT = 15;
/** Cap par corps de commentaire injecté. */
const COMMENT_BODY_MAX_CHARS = 2000;
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
    },
    success: true,
  };
}

async function readAttachment(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const attachmentId = typeof args.attachment_id === "string" ? args.attachment_id : "";
  if (!attachmentId) {
    return { result: { error: "attachment_id is required (get it from read_issue)." }, success: false };
  }

  const service = getServiceClient();
  // Périmètre = le PROJET du run, pas le seul ticket d'ancrage : les ids que
  // `read_issue` renvoie sur un autre ticket doivent être ouvrables. Le ticket
  // porteur est relu puis épinglé au projet — une pièce d'un autre projet est
  // introuvable, exactement comme avant.
  const { data: row } = await service
    .from("attachments")
    .select("id, issue_id, storage_path, file_name, mime_type, size_bytes, comment_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!row) {
    return { result: { error: "Attachment not found." }, success: false };
  }
  const scoped = await assertIssueInProject(service, row.issue_id as string, ctx.projectId);
  if (!scoped.ok) {
    return { result: { error: "Attachment not found in this project." }, success: false };
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
          content: cap(text, ATTACHMENT_INLINE_MAX_CHARS),
          ...(text.length > ATTACHMENT_INLINE_MAX_CHARS
            ? {
                content_note:
                  "Truncated — for the full file, download it in the sandbox: run_command `curl -sL '<download_url>' -o /tmp/…` then read_file it.",
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
      case "read_attachment":
        return await readAttachment(ctx, args);
      case "update_issue":
        return await updateIssue(ctx, args);
      case "write_issue_plan":
        return await writeIssuePlan(ctx, args);
      case "create_issue":
        return await createIssue(ctx, args);
      default:
        return { result: { error: `Unknown issue tool: ${name}` }, success: false };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
  }
}
