import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getIssue } from "@/lib/server/issue-reads";
import { signedAttachmentUrl, downloadAttachment } from "@/lib/server/attachments";
import { updateIssueFields } from "@/lib/server/update-issue";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { parsePlan } from "@/lib/plan";
import type { AgentToolImage } from "./content";

/**
 * Tools TICKET de l'agent de code : l'agent est ancré à une issue minddy, et son
 * contexte d'amorce n'est qu'un SNAPSHOT — ces tools lui donnent l'état VIVANT du
 * ticket à tout moment (champs, plan, commentaires, pièces jointes), et le droit
 * d'écrire le plan du ticket quand l'utilisateur le demande.
 *  - `read_issue`       → tout le ticket (getIssue, partagé avec Numo/MCP) + plan
 *                          parsé en tâches + derniers commentaires.
 *  - `read_attachment`  → une pièce jointe : texte inline quand c'est lisible,
 *                          l'IMAGE ELLE-MÊME quand c'est une maquette et que le
 *                          modèle du run la voit (MIN-111), sinon URL signée courte
 *                          (curl-able depuis la sandbox).
 *  - `write_issue_plan` → écrit le plan markdown du ticket (updateIssueFields,
 *                          via_assistant) SANS lancer l'implémentation.
 * Service client : l'accès a été contrôlé au lancement du run (membre du projet),
 * et tout est épinglé sur l'issue du run.
 */

export interface IssueToolContext {
  issueId: string;
  projectId: string;
  projectKey: string;
  /** Propriétaire du run — acteur des écritures (plan). */
  actorId: string | null;
  /** Le modèle du run accepte-t-il une image en entrée ? (cf. `supportsImageInput`).
   *  Faux → `read_attachment` se comporte exactement comme avant MIN-111. */
  imageInput?: boolean;
}

/** Noms des tools ticket (routés vers ce module par execute.ts). */
export const ISSUE_TOOL_NAMES = new Set(["read_issue", "read_attachment", "write_issue_plan"]);

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

async function readIssue(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const service = getServiceClient();
  const detail = await getIssue(
    { db: service, service, projectId: ctx.projectId, projectKey: ctx.projectKey },
    { issue_id: ctx.issueId },
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
  // Épinglé sur l'issue du run : couvre les pièces du ticket ET de ses
  // commentaires (les deux portent issue_id), rien d'autre.
  const { data: row } = await service
    .from("attachments")
    .select("id, storage_path, file_name, mime_type, size_bytes, comment_id")
    .eq("id", attachmentId)
    .eq("issue_id", ctx.issueId)
    .maybeSingle();
  if (!row) {
    return { result: { error: "Attachment not found on this ticket." }, success: false };
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

async function writeIssuePlan(
  ctx: IssueToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const plan = typeof args.plan === "string" ? args.plan.trim() : "";
  if (!plan) return { result: { error: "plan (markdown) is required." }, success: false };
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };

  const result = await updateIssueFields({
    issueId: ctx.issueId,
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

/** Exécute un tool ticket. L'appelant a déjà routé sur `ISSUE_TOOL_NAMES`. */
export async function executeIssueTool(
  ctx: IssueToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "read_issue":
        return await readIssue(ctx, args);
      case "read_attachment":
        return await readAttachment(ctx, args);
      case "write_issue_plan":
        return await writeIssuePlan(ctx, args);
      default:
        return { result: { error: `Unknown issue tool: ${name}` }, success: false };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
  }
}
