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
import { executeObjectiveTool, resolveObjectiveRef } from "./objective-tools";
import { headTail } from "./prune";
import type { AgentToolImage } from "./agent-contract";

/**
 * Tools TICKET of the code agent: the PROJECT tickets of the run. Served at both
 * anchors (MIN-125) — a notebook run must be able to search and read a ticket,
 * a ticket run must be able to aim at another. The anchor only decides to
 * the DEFAULT TARGET: the run ticket when there is one, otherwise `issue` is
 * mandatory and is resolved with `search_issues`.
 * - `search_issues` → find a project ticket (searchIssues, shared
 * with Numo/MCP).
 * - `read_issue` → whole ticket (getIssue) + plan parsed into tasks +
 * last comments.
 * - `read_resource` → one resource: the url and title for a LINK;
 * the id and title for a wiki PAGE (the document
 * is then read as `read_page`); for a
 * FILE, inline text when it's readable, the IMAGE
 * ITSELF when it's a mockup and the model of the
 * run sees it (MIN-111), otherwise short signed URL
 * (curl-able from the sandbox).
 * - `update_issue` → title, description, effort, and ATTACHMENT to a
 * objective (MIN-287). NEVER the status or the
 * priority: these are user decisions, and the
 * tool explicitly REFUSES the argument rather than
 * swallowing it (a field outside the schema is quickly hallucinated).
 * - `write_issue_plan` → writes the markdown plan of the ticket (updateIssueFields,
 * via_assistant) WITHOUT launching the implementation.
 * - `append_to_plan` → adds a block to the existing plan without touching the rest.
 * - `edit_issue_text` → rewrites ONE passage of the plan or the description
 * (old_string → new_string), like `edit_file` on a
 * file. Both (MIN-186) share their core with
 * the MCP and Numo: `appendToPlan` and `editIssueText`.
 * - `create_issue` → creates a project ticket, with the landing status chosen
 * by the launcher (Account → Preferences), like Numo chat.
 * - `create_routine` → sets a ROUTINE (MIN-185): a scheduled run which
 * returns by itself. Same manufacturer as the other three
 * doors; the caller is the launcher of the run, so a
 * run launched by a non-owner is refused.
 * Customer service: access was controlled at run launch (project member),
 * and any read/write is pinned to the run's project.
 */

export interface IssueToolContext {
  /** Run ticket — DEFAULT target of ticket tools. Null on a notebook run:
 * `issue` then becomes mandatory. */
  anchorIssueId: string | null;
  projectId: string;
  projectKey: string;
  /** Run owner — writing actor (plan, fields, creation). */
  actorId: string | null;
  /** Landing status of a created ticket, LAUNCHER account setting
 * (`user_metadata.numo_default_status`) — never a template parameter. */
  numoDefaultStatus: NumoDefaultStatus;
  /** Does the run model accept an image as input? (see `supportsImageInput`).
 * False → `read_resource` behaves exactly as before MIN-111. */
  imageInput?: boolean;
  /** Run CURRENT — the line on which `report_verdict` writes its verdict. */
  runId?: string | null;
  /** Run automation chain (MIN-147). It is she who decides whether
 * `report_verdict` is served: outside the chain, no one reads a verdict. */
  chainId?: string | null;
}

/** Names of the tools in this module. They live in `platform-tool-names.ts` since
 * MIN-224 — ROUTING goes down to the microVM, EXECUTION stays here — and are
 * re-exported so nothing has to change import. */
export { ISSUE_TOOL_NAMES } from "./platform-tool-names";

/** Latest comments returned by default (the full thread on request). */
const COMMENTS_DEFAULT_LIMIT = 15;
/** Cap per injected comment body. */
const COMMENT_BODY_MAX_CHARS = 2000;
/** Heading of the body of a return: more generous than a comment, because it is
 the STATEMENT of the need — to truncate it is to lose the use case described at the
 end. Stays under the heading of the loop (headTail 6000). */
const FEEDBACK_BODY_MAX_CHARS = 4000;
/** Heading of an attachment's inline text content — aligned with the heading of the loop's tools results (headTail 6000): beyond that, the content would be elided in the middle anyway; the signed URL is the path for the entire file. */
const ATTACHMENT_INLINE_MAX_CHARS = 6000;
/** Max size of an attachment downloaded for inline reading. */
const ATTACHMENT_INLINE_MAX_BYTES = 256 * 1024;
/**
 * Image formats that are SHOWN to the model (MIN-111). Closed list: these are the ones
 * that multimodal providers all accept. An SVG is text, it goes through
 * inline reading; a TIFF or HEIC does not show — URL signed, as before.
 */
const VIEWABLE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
/**
 * Max size of an image shown to the model, in SOURCE bytes. Base64 weighs 4/3 —
 * 750 KB of PNG is ~1 MB in the message, and the history IS the checkpoint
 * (capped at 8 MB, with `capHistoryImages` only keeping three). A screen model
 * fits very comfortably inside; beyond that, we return the URL signed with a
 * note that says so.
 */
const ATTACHMENT_IMAGE_MAX_BYTES = 750 * 1024;

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/** The names that the code agent bears, so that patch refusals return
 * to tools that exist IN THE RUN (see IssueTextTools). */
const AGENT_TEXT_TOOLS: IssueTextTools = {
  read: "read_issue",
  appendToPlan: "append_to_plan",
  replaceWhole: { plan: "write_issue_plan", description: "update_issue" },
};

/** Cap of the diff rendered by `edit_issue_text`: confirm the landing of
 the edition, not re-transport the document that we have just avoided rewriting. */
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
 * Ticket TARGETED by a tool: the one that `args.issue` designates, otherwise the one in the run.
 * Going through the resolver itself for anchoring costs a tiny query and
 * reports the identifier (the agent needs it to talk about the ticket) while
 * re-pinning the target to run project.
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

  // Assigned as display name (never the raw email) — the uuid alone is silent.
  const assigneeId = (detail.issue.assignee_id as string | null) ?? null;
  let assigneeName: string | null = null;
  if (assigneeId) {
    const users = await fetchAuthUsersById(service, [assigneeId]).catch(() => null);
    if (users) assigneeName = displayName(toNamed(users.get(assigneeId)), "User");
  }

  // The PURPOSE of the ticket (MIN-287): `objective_id` alone is a silent uuid, and
  // an agent who does not know the purpose of the ticket he is implementing reads it
  // out of his intention. Name and status are what makes connection
  // readable — and its absence, actionable.
  const objectiveId = (detail.issue.objective_id as string | null) ?? null;
  let objective: { id: string; name: string; status: unknown } | null = null;
  if (objectiveId) {
    const { data: row } = await service
      .from("objectives")
      .select("id, name, status")
      .is("deleted_at", null)
      .eq("id", objectiveId)
      .maybeSingle();
    if (row) {
      objective = { id: row.id as string, name: row.name as string, status: row.status };
    }
  }

  // Plan parsed into indexed tasks: this is the actionable form (“ready plan,
  // just apply it") — the states [ ]/[~]/[x]/[-] become readable.
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
        // On an OTHER ticket than the run ticket, this is how the agent learns
        // how to name it (“MIN-7”) — never by its uuid.
        identifier: target.issue.identifier,
        ...(assigneeName ? { assignee_name: assigneeName } : {}),
        ...(objective
          ? { objective }
          : {
              objective: null,
              objective_note:
                "This ticket belongs to NO objective — it is outside every progress bar and out of cycle filling. If an objective covers this work (list_objectives), attach it with update_issue { objective }.",
            }),
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
 * `read_feedback` (MIN-196) — the REQUEST behind the ticket, in the words of
 * who made it, with his conversation.
 *
 * The agent arrives here by `read_issue`, which lists the returns of the ticket in
 * `linked_feedback`: this is where the id comes from. The scope is the PROJECT of the
 * run, as for attachments — a return from another project is refused.
 *
 * Each comment carries its visibility, because the two do not listen to each other
 * same: a PUBLIC comment comes from a user of the product who describes
 * its case — it is the subject closest to the real need — while an INTERNAL
 * note is a team decision, which may contradict the request. The
 * to confuse is to take the arbitration of the team for the needs of the user,
 * or the opposite.
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
      // “board visitor” = someone OUTSIDE the team. This is what distinguishes
      // a reported need for internal arbitration.
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
        // The SUBMITTED text next to the canonical: the team often rewrites the
        // title and body, and the original is what the person typed.
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
  // `attachment_id` remains accepted: a checkpoint written before MIN-184 replays
  // the old call with the old argument, and the replay should succeed.
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
  // Scope = the PROJECT of the run, not the only anchor ticket: the ids that
  // `read_issue` returns to another ticket must be open. The parent
  // is reread then pinned to the project — a resource from another project is
  // not found, exactly like before.
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
  // A resource depends on a ticket OR an objective: the ticket goes through
  // `assertIssueInProject` (which also checks that it is not in the trash),
  // the objective by the `project_id` that the line itself carries.
  const inProject = row.issue_id
    ? (await assertIssueInProject(service, row.issue_id as string, ctx.projectId)).ok
    : row.project_id === ctx.projectId;
  if (!inProject) {
    return { result: { error: "Resource not found in this project." }, success: false };
  }

  // A page from the wiki (MIN-275): its body reads `read_page`, which renders
  // markdown — copying it here would make a second door to hold. Reading in key
  // service, so a trashed page also comes up: it's `deleted_at` which
  // said, not an absence.
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

  // A link has no bytes: neither signed URL nor inline content.
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

  // A MODEL looks at itself (MIN-111). The image is sent as a data URL in the message:
  // the signed URL expires in 10 minutes while the checkpoint is replayed
  // hours later. It is the only way by which the agent SEES what
  // someone filed on the ticket, instead of reading the data sheet.
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
    // Failed download or real size above the cap → we fall back on
    // the signed URL, saying so (the model must not believe it has seen the image).
  }

  if (isTextMime(mime) && size <= ATTACHMENT_INLINE_MAX_BYTES) {
    const buf = await downloadAttachment(service, row.storage_path as string);
    if (buf) {
      const text = buf.toString("utf8");
      return {
        result: {
          ...meta,
          // The cup keeps the HEAD AND THE TAIL (MIN-247). She cut through the
          // head, which is exactly the fault that MIN-107 had named for
          // `run_command` and never worn here: on a log, a trace, a
          // export, the end is the useful part — and an attachment filed
          // on a ticket is almost always one of three.
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
 * Fields that an agent does NOT write, and why the denial is explicit rather than
 * silent: `status` and `priority` are out-of-schema, but an out-of-schema field
 * is regularly hallucinated — swallowed without saying anything, the model would believe it has
 * closed a ticket. So it receives an error that tells it what to do instead.
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
    // `null` clears the estimate — this is the only way to remove it.
    if (args.effort !== null && !isEffort(args.effort)) {
      return {
        result: { error: "effort must be one of: xs, s, m, l, xl (or null to clear it)." },
        success: false,
      };
    }
    input.effort = args.effort;
    changed.push("effort");
  }
  // Attachment to an OBJECTIVE (MIN-287): `null` detaches. It is the gesture that
  // enters the ticket into a progress bar and into the fill
  // cycle — without it, the human goes back behind the agent to tidy up.
  if (args.objective !== undefined) {
    if (args.objective === null) {
      input.objective_id = null;
    } else {
      const objective = await resolveObjectiveRef(ctx.projectId, args.objective);
      if ("error" in objective) {
        return { result: { error: objective.error }, success: false };
      }
      input.objective_id = objective.objective.id;
    }
    changed.push("objective");
  }
  if (changed.length === 0) {
    return {
      result: {
        error:
          "Nothing to update — pass at least one of title, description, effort or objective.",
      },
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
 * The plan and description of a ticket AS STORED — what the
 * two surgical scripts below read before patching: what we
 * didn't read again, we can't overwrite it without seeing it.
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

  // The description is silently TRUNCATED beyond its limit: check it
  // here is the only way to tell the model.
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

  // A ticket created without any objective is a ticket that a human will have to
  // put away: the connection is made HERE, at creation (MIN-287).
  let objectiveId: string | null = null;
  if (typeof args.objective === "string" && args.objective.trim()) {
    const objective = await resolveObjectiveRef(ctx.projectId, args.objective);
    if ("error" in objective) {
      return { result: { error: objective.error }, success: false };
    }
    objectiveId = objective.objective.id;
  }

  const result = await createIssueForProject({
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    viaAssistant: true,
    input: {
      title,
      // Landing Status = the launcher's account setting, like any
      // creation that goes through Numo. Never a model parameter.
      status: ctx.numoDefaultStatus,
      ...(typeof args.description === "string" && args.description.trim()
        ? { description: args.description }
        : {}),
      ...(typeof args.priority === "string" ? { priority: args.priority } : {}),
      ...(typeof args.effort === "string" ? { effort: args.effort } : {}),
      ...(objectiveId ? { objective_id: objectiveId } : {}),
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
        objective_id: objectiveId,
      },
      ...(objectiveId
        ? {}
        : {
            objective_note:
              "This ticket belongs to no objective, so it counts in no progress bar. If one covers it (list_objectives), attach it with update_issue { objective }.",
          }),
    },
    success: true,
  };
}

/**
 * `create_routine` (MIN-185) from an agent run: the SAME factory as the
 * wizard, chat and MCP.
 *
 * The caller is the `created_by` of the run — not the project owner. A run launched
 * by a non-owner member is therefore refused creation, and the refusal message
 * must say this clearly enough for the agent to REPORT it instead of
 * retrying with other parameters.
 *
 * The tool is not used in a routine run (`interactive` flag of
 * `agentToolsFor`): a routine does not self-replicate.
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

/** Refusal from the factory, said in clear so that the agent reports it as is. */
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

/** Cap of the written verdict in base — a report, not a dissertation. */
const VERDICT_SUMMARY_MAX_CHARS = 2000;
const VERDICT_BLOCKER_MAX_CHARS = 400;
const VERDICT_MAX_BLOCKERS = 20;

/**
 * `report_verdict` (MIN-147): What the verifying a string
 * step concludes. Written on `agent_runs.verdict` of the CURRENT run — this is what the
 * engine reads to decide between "we continue", "we resume once" and
 * "we give up in triage".
 *
 * Used only when the run carries a string (`agentToolsFor({ chain })`) ;
 * the refusal below therefore only catches a hallucinatory appeal, but it is better
 * an explicit error than a verdict written nowhere.
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

/** Runs a tool ticket. The caller has already routed to `ISSUE_TOOL_NAMES`. */
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
      // Execution alias: a resumed run replays a checkpoint written under
      // the old name (see content.test.ts), and this replay must succeed.
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
      // The project pages: same context, neighboring executor (MIN-273).
      case "list_pages":
      // `search_pages` was served to the model and routed by `ISSUE_TOOL_NAMES`,
      // mais absent d'ici : chaque appel repartait en « Unknown issue tool ».
      case "search_pages":
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
      // The objectives of the project: same context, neighboring executor (MIN-287).
      case "list_objectives":
      case "read_objective":
      case "create_objective":
      case "update_objective":
      case "comment_objective":
        return await executeObjectiveTool(
          { projectId: ctx.projectId, projectKey: ctx.projectKey, actorId: ctx.actorId },
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
