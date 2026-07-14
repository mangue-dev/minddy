import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAccountSettings } from "@/lib/server/account-settings";
import { defaultLocale, type Locale } from "@/i18n/config";
import {
  AGENT_SOFT_DEADLINE_MS,
  AGENT_MAX_CONTINUATIONS,
} from "@/lib/agent-models";
import { resolveRepoCloneTarget } from "./repo-access";
import {
  createOrReconnectSandbox,
  cloneRepo,
  commitAndPush,
  runShell,
  readWorkFile,
  readWorkFileWindow,
  writeWorkFile,
  listDir,
  grepRepo,
  globRepo,
  stopSandbox,
  sandboxName,
  type GrepOutputMode,
  type Sandbox,
} from "./sandbox";
import { applyEdit } from "./edit";
import {
  runAgentLoop,
  type AgentChatMessage,
  type EmitAgentEvent,
  type ExecuteAgentTool,
} from "./agent-loop";
import { AGENT_TOOLS, RUN_COMMAND_TIMEOUT_MS } from "./tools";
import { buildAgentSystemPrompt } from "./prompt";
import { resolveAgentApiKey } from "./model";
import { ensurePullRequest, GithubApiError } from "./pr";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import {
  stampRun,
  appendEvent,
  pullPendingMessages,
  type AgentRun,
  type AgentCheckpoint,
} from "./runs";

/**
 * Exécute UN chunk d'un run d'agent (MIN-46). Reconnecte/clone le Sandbox,
 * rehydrate le checkpoint, fait tourner la boucle jusqu'à la soft-deadline, puis :
 *   - suspended  → commit+push WIP, checkpoint persisté, run re-`queued` (le drain
 *                  le reprend, en process ou via l'auto-invoke) ;
 *   - needs_input → commit+push WIP, run `needs_input` (attend la réponse user) ;
 *   - completed  → commit+push final, PR ouverte, commentaire d'issue, run `completed`.
 * Toute exception → run `failed`. Le drain appelle cette fonction après claim.
 */

/** Marge (ms) réservée après la boucle pour commit+push+PR+stamp. */
const COMMIT_MARGIN_MS = 25_000;
/** Soft-deadline plancher d'un chunk (si le budget restant est très court). */
const MIN_SOFT_DEADLINE_MS = 20_000;
/** Wall-clock global max d'un run (garde-fou anti-runaway). */
const MAX_WALL_CLOCK_MS = 60 * 60_000;
/** Taille max du checkpoint sérialisé. */
const MAX_CHECKPOINT_BYTES = 8_000_000;

export type ExecuteOutcome = "completed" | "suspended" | "needs_input" | "failed";

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

function slugForBranch(identifier: string): string {
  return identifier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Cap du diff renvoyé au modèle après une édition (le diff complet n'est pas utile). */
const EDIT_DIFF_CAP = 4000;

function toNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Les tools « métier » de l'agent, exécutés dans le Sandbox du run. */
function makeExecTool(sandbox: Sandbox): ExecuteAgentTool {
  return async (name, args) => {
    switch (name) {
      case "read_file": {
        const win = await readWorkFileWindow(sandbox, String(args.path ?? ""), {
          offset: toNum(args.offset),
          limit: toNum(args.limit),
        });
        if (!win) return { result: "(file not found)", success: false };
        const footer = win.truncated
          ? `\n\n[Showing lines ${win.startLine}-${win.startLine + win.returnedLines - 1} of ${win.totalLines}. Use offset/limit to read more.]`
          : "";
        return { result: (win.content || "(empty file)") + footer, success: true };
      }
      case "list_dir": {
        const content = await listDir(sandbox, args.path ? String(args.path) : ".");
        return { result: content || "(empty)", success: true };
      }
      case "glob": {
        const { files, truncated } = await globRepo(
          sandbox,
          String(args.pattern ?? ""),
          args.path ? String(args.path) : undefined,
        );
        if (files.length === 0) return { result: "(no files matched)", success: true };
        const note = truncated ? `\n… (capped at ${files.length} files)` : "";
        return { result: files.join("\n") + note, success: true };
      }
      case "grep": {
        const out = await grepRepo(sandbox, {
          pattern: String(args.pattern ?? ""),
          path: args.path ? String(args.path) : undefined,
          glob: args.glob ? String(args.glob) : undefined,
          outputMode: (args.output_mode as GrepOutputMode) ?? undefined,
          ignoreCase: args.ignore_case === true,
          context: toNum(args.context),
          headLimit: toNum(args.head_limit),
        });
        return { result: out || "(no matches)", success: true };
      }
      case "edit_file": {
        const path = String(args.path ?? "");
        const original = await readWorkFile(sandbox, path);
        if (original === null) {
          return {
            result: { error: `File not found: ${path}. Use write_file to create a new file.` },
            success: false,
          };
        }
        try {
          const edit = applyEdit(
            path,
            original,
            String(args.old_string ?? ""),
            String(args.new_string ?? ""),
            args.replace_all === true,
          );
          await writeWorkFile(sandbox, path, edit.content);
          return {
            result: {
              path,
              additions: edit.additions,
              deletions: edit.deletions,
              diff: cap(edit.diff, EDIT_DIFF_CAP),
            },
            success: true,
          };
        } catch (err) {
          return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
        }
      }
      case "write_file": {
        await writeWorkFile(sandbox, String(args.path ?? ""), String(args.content ?? ""));
        return { result: `Wrote ${args.path}`, success: true };
      }
      case "run_command": {
        const r = await runShell(sandbox, String(args.command ?? ""), {
          timeoutMs: RUN_COMMAND_TIMEOUT_MS,
        });
        return {
          result: {
            exitCode: r.exitCode,
            stdout: cap(r.stdout, 4000),
            stderr: cap(r.stderr, 2000),
          },
          success: r.exitCode === 0,
        };
      }
      default:
        return { result: `Unknown tool: ${name}`, success: false };
    }
  };
}

interface IssueContext {
  identifier: string;
  title: string;
  description: string | null;
  plan: string | null;
  projectName: string | null;
}

async function loadIssueContext(run: AgentRun): Promise<IssueContext> {
  const service = getServiceClient();
  const [{ data: issue }, { data: project }] = await Promise.all([
    service
      .from("issues")
      .select("number, title, description, plan")
      .eq("id", run.issue_id)
      .maybeSingle(),
    service.from("projects").select("key, name").eq("id", run.project_id).maybeSingle(),
  ]);
  const key = (project as { key?: string } | null)?.key ?? "ISSUE";
  const number = (issue as { number?: number } | null)?.number ?? 0;
  return {
    identifier: `${key}-${number}`,
    title: (issue as { title?: string } | null)?.title ?? "Untitled",
    description: (issue as { description?: string | null } | null)?.description ?? null,
    plan: (issue as { plan?: string | null } | null)?.plan ?? null,
    projectName: (project as { name?: string } | null)?.name ?? null,
  };
}

export async function executeAgentRun(
  run: AgentRun,
  opts: { deadlineMs: number },
): Promise<ExecuteOutcome> {
  const callStart = Date.now();
  const emit: EmitAgentEvent = (type, payload) => appendEvent(run.id, type, payload);
  let sandbox: Sandbox | null = null;

  try {
    await emit("status", { status: "running", continuation: run.continuations });

    if (!run.created_by) throw new Error("Run has no owner");
    if (!run.model) throw new Error("Run has no model");

    // Cible de clone (token d'installation frais pour ce chunk).
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) throw new Error("No repository linked to this project");

    const issue = await loadIssueContext(run);
    // Langue du commentaire + du résumé de l'agent = celle du lanceur (défaut owner).
    const commentLocale = await resolveRunLocale(run);
    const baseBranch = run.base_branch ?? target.defaultBranch;
    const workBranch =
      run.branch_name ?? `minddy/agent/${slugForBranch(issue.identifier)}-${run.id.slice(0, 8)}`;

    // Sandbox : reconnecte si la microVM est vivante, sinon clone à neuf.
    const { sandbox: sb, reconnected } = await createOrReconnectSandbox(run.sandbox_id);
    sandbox = sb;
    if (!reconnected) {
      await cloneRepo(sandbox, { authUrl: target.authUrl, baseBranch, workBranch });
    }

    // Persiste l'identité du Sandbox + les branches AVANT la boucle (reprise si crash).
    await stampRun(run.id, {
      sandbox_id: sandboxName(sandbox),
      base_branch: baseBranch,
      branch_name: workBranch,
    });

    // Rehydrate ou amorce l'historique.
    let messages: AgentChatMessage[];
    let usageSeqStart = run.checkpoint?.usageSeq ?? run.continuations * 1000;
    if (run.checkpoint?.messages?.length) {
      messages = run.checkpoint.messages;
    } else {
      const system = buildAgentSystemPrompt({
        issue: {
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          plan: issue.plan,
        },
        repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
        projectName: issue.projectName,
        extraInstructions: run.prompt,
        locale: commentLocale,
      });
      const userMsg = run.prompt?.trim()
        ? run.prompt.trim()
        : `Implement issue ${issue.identifier}: ${issue.title}.`;
      messages = [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ];
    }

    const { apiKey, baseUrl, provider } = await resolveAgentApiKey(run.created_by);

    // Budget du chunk : temps restant du drain − marge, borné par la config.
    const elapsedSetup = Date.now() - callStart;
    const softDeadlineMs = Math.max(
      MIN_SOFT_DEADLINE_MS,
      Math.min(opts.deadlineMs - elapsedSetup - COMMIT_MARGIN_MS, AGENT_SOFT_DEADLINE_MS),
    );

    const result = await runAgentLoop({
      messages,
      tools: AGENT_TOOLS,
      model: run.model,
      apiKey,
      baseUrl,
      provider,
      runId: run.run_id ?? run.id,
      userId: run.created_by,
      projectId: run.project_id,
      softDeadlineMs,
      execTool: makeExecTool(sandbox),
      pullSteering: () => pullPendingMessages(run.id),
      emit,
      usageSeqStart,
    });

    const newCost = run.cost_usd + result.costUsd;

    // ── Terminé : commit final + PR + commentaire ────────────────────────────
    if (result.status === "completed") {
      const finish = result.finish ?? { summary: "Changes applied." };
      const freshTarget = await resolveRepoCloneTarget(run.project_id);
      const authUrl = freshTarget?.authUrl ?? target.authUrl;
      const token = freshTarget?.token ?? target.token;

      await commitAndPush(sandbox, {
        authUrl,
        workBranch,
        message: finish.prTitle?.trim() || `${issue.identifier}: ${issue.title}`,
      });

      const prTitle = finish.prTitle?.trim() || `${issue.identifier}: ${issue.title}`;
      const prBody = `${finish.prBody?.trim() || finish.summary}\n\n---\n🤖 Généré par l'agent numo (minddy) · issue ${issue.identifier}`;

      try {
        const pr = await ensurePullRequest({
          token,
          repoFullName: target.repoFullName,
          head: workBranch,
          base: baseBranch,
          title: prTitle,
          body: prBody,
        });
        await emit("pr_opened", { number: pr.number, url: pr.url });
        await postSummaryComment(run, issue.identifier, finish.summary, pr.url, commentLocale);
        await stopSandbox(sandbox);
        await stampRun(run.id, {
          status: "completed",
          pr_number: pr.number,
          pr_url: pr.url,
          pr_state: (pr.state as AgentRun["pr_state"]) ?? "open",
          checkpoint: null,
          continuations: 0,
          cost_usd: newCost,
          outcome: finish.summary,
        });
        // La PR est ouverte → l'issue passe en revue (MIN-46). L'acteur est
        // l'auteur du run (il a l'accès projet) ; best-effort.
        if (run.created_by) {
          await syncIssueStatusFromPr({
            issueId: run.issue_id,
            actorId: run.created_by,
            prState: (pr.state as AgentRun["pr_state"]) ?? "open",
          });
        }
        return "completed";
      } catch (err) {
        // Aucune modification produite (422 « No commits between… ») → complété sans PR.
        if (err instanceof GithubApiError && err.status === 422) {
          await emit("summary", { text: "No changes were produced." });
          await postSummaryComment(run, issue.identifier, finish.summary, null, commentLocale);
          await stopSandbox(sandbox);
          await stampRun(run.id, {
            status: "completed",
            checkpoint: null,
            continuations: 0,
            cost_usd: newCost,
            outcome: `${finish.summary} (no diff)`,
          });
          return "completed";
        }
        throw err;
      }
    }

    // ── Suspend / attente user : push WIP + persiste le checkpoint ────────────
    const checkpoint: AgentCheckpoint = { messages: result.messages, usageSeq: result.usageSeqEnd };
    usageSeqStart = result.usageSeqEnd;

    await commitAndPush(sandbox, {
      authUrl: target.authUrl,
      workBranch,
      message: `wip(${issue.identifier}): chunk ${run.continuations + 1}`,
    }).catch((err) => {
      // Un push raté ne doit pas perdre le checkpoint (l'état repo se re-poussera au chunk suivant).
      console.error("[agent-execute] WIP push failed:", (err as Error).message);
    });

    if (result.status === "needs_input") {
      await stampRun(run.id, {
        status: "needs_input",
        checkpoint,
        sandbox_id: sandboxName(sandbox),
        cost_usd: newCost,
        outcome: result.question ?? null,
      });
      return "needs_input";
    }

    // suspended — garde-fous anti-runaway.
    const nextContinuations = run.continuations + 1;
    const wallClock = run.window_started_at
      ? Date.now() - Date.parse(run.window_started_at)
      : Date.now() - callStart;
    const checkpointTooBig = JSON.stringify(checkpoint).length > MAX_CHECKPOINT_BYTES;

    if (
      nextContinuations > AGENT_MAX_CONTINUATIONS ||
      wallClock > MAX_WALL_CLOCK_MS ||
      checkpointTooBig
    ) {
      await emit("error", { message: "Run budget exhausted (continuations / time / size)." });
      await stopSandbox(sandbox);
      await stampRun(run.id, {
        status: "failed",
        error_message: "Run budget exhausted",
        checkpoint: null,
        continuations: 0,
        cost_usd: newCost,
      });
      return "failed";
    }

    await stampRun(run.id, {
      status: "queued",
      checkpoint,
      sandbox_id: sandboxName(sandbox),
      continuations: nextContinuations,
      attempts: 0,
      not_before: new Date().toISOString(),
      cost_usd: newCost,
    });
    return "suspended";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emit("error", { message });
    if (sandbox) await stopSandbox(sandbox);
    await stampRun(run.id, {
      status: "failed",
      error_message: cap(message, 1000),
      checkpoint: null,
      continuations: 0,
    });
    return "failed";
  }
}

const COMMENT_STRINGS: Record<
  Locale,
  { header: (id: string) => string; viewPr: string; noChanges: string }
> = {
  fr: {
    header: (id) => `Agent numo — ${id}`,
    viewPr: "Voir la pull request",
    noChanges: "Aucune modification produite.",
  },
  en: {
    header: (id) => `Numo agent — ${id}`,
    viewPr: "View the pull request",
    noChanges: "No changes were produced.",
  },
};

/**
 * Langue du run = celle du lanceur (préférence de compte user_metadata.locale),
 * défaut owner du projet, puis défaut de l'app. Utilisée pour le résumé de
 * l'agent et le commentaire d'issue.
 */
async function resolveRunLocale(run: AgentRun): Promise<Locale> {
  if (run.created_by) {
    const r = await getAccountSettings({ userId: run.created_by });
    if (r.ok) return r.settings.locale;
  }
  try {
    const service = getServiceClient();
    const { data } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", run.project_id)
      .maybeSingle();
    const ownerId = (data as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
      const r = await getAccountSettings({ userId: ownerId });
      if (r.ok) return r.settings.locale;
    }
  } catch {
    // ignore — on retombe sur le défaut
  }
  return defaultLocale;
}

/** Poste le résumé du run (+ lien PR) en commentaire d'issue, attribué à Numo. */
async function postSummaryComment(
  run: AgentRun,
  identifier: string,
  summary: string,
  prUrl: string | null,
  locale: Locale,
): Promise<void> {
  if (!run.created_by) return;
  try {
    const service = getServiceClient();
    const s = COMMENT_STRINGS[locale] ?? COMMENT_STRINGS.en;
    const body = prUrl
      ? `**${s.header(identifier)}**\n\n${summary}\n\n🔗 [${s.viewPr}](${prUrl})`
      : `**${s.header(identifier)}**\n\n${summary}\n\n_${s.noChanges}_`;
    await service.from("comments").insert({
      issue_id: run.issue_id,
      author_id: run.created_by,
      body,
      via_assistant: true,
    });
  } catch (err) {
    console.error("[agent-execute] summary comment failed:", (err as Error).message);
  }
}
