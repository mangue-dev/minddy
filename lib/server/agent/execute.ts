import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAccountSettings } from "@/lib/server/account-settings";
import { recordSandboxUsage } from "@/lib/server/usage";
import { defaultLocale, type Locale } from "@/i18n/config";
import {
  AGENT_SOFT_DEADLINE_MS,
  AGENT_MAX_CONTINUATIONS,
} from "@/lib/agent-models";
import { resolveRepoCloneTarget } from "./repo-access";
import {
  getOrCreateAgentSandbox,
  cloneRepo,
  commitAndPush,
  runShell,
  readWorkFile,
  readWorkFileWindow,
  writeWorkFile,
  moveWorkFile,
  deleteWorkFile,
  listDir,
  grepRepo,
  globRepo,
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
import {
  buildAgentSystemPrompt,
  buildAgentContextMessage,
  buildInheritedPrMessage,
  buildInheritedBranchMessage,
  toPrLineThreads,
  type AgentRepoContext,
} from "./prompt";
import { resolveAgentApiKey, getModelContextWindow } from "./model";
import { forgeFor, isForgeApiError, type Forge } from "./forge";
import type { PullRequestRef } from "./pr";
import type { RepoProviderId } from "@/lib/repo-providers";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { syncIssuePlanStates } from "./plan-sync";
import { executeIssueTool, ISSUE_TOOL_NAMES, type IssueToolContext } from "./issue-tools";
import {
  stampRun,
  getRun,
  appendEvent,
  pullPendingMessages,
  previousRunSummaryForIssue,
  branchHasPriorRun,
  readInterruptFlag,
  clearInterrupt,
  hasPendingRunMessages,
  type AgentRun,
  type AgentCheckpoint,
} from "./runs";

/**
 * Exécute UN chunk d'un RUN d'agent (MIN-46 + MIN-68, modèle CONVERSATIONNEL).
 * Réveille (snapshot persistant) ou clone le Sandbox, rehydrate le checkpoint,
 * fait tourner la boucle jusqu'à la soft-deadline, puis :
 *   - suspended  → commit+push WIP, checkpoint persisté, run re-`queued` (continue
 *                  le tour, en process ou via l'auto-invoke) ;
 *   - completed  → fin de tour NATURELLE (l'agent a répondu) : commit+push de ce
 *                  qui a changé. AUCUNE PR n'est créée ici — si la session en suit
 *                  déjà une, le push l'a mise à jour (et on la ROUVRE si elle avait
 *                  été refusée) ; en créer une est la décision de l'agent (tool
 *                  `create_pr`) ou de l'utilisateur. Run → `completed` (repos).
 *   - interrupted / erreur LLM → même REPOS `completed` (checkpoint conservé,
 *                  error_message le cas échéant) : la session attend simplement le
 *                  prochain message de l'utilisateur.
 * Au repos, une session ne bloque PLUS le ticket : seuls queued/running comptent
 * comme « un agent travaille ». Elle reste reprennable à CHAUD depuis le composer
 * de sa conversation (checkpoint + snapshot conservés).
 * Seule une erreur d'AMORÇAGE (repo/modèle) → `failed`. Le drain appelle après claim.
 */

/** Marge (ms) réservée après la boucle pour commit+push+PR+stamp. */
const COMMIT_MARGIN_MS = 25_000;
/** Soft-deadline plancher d'un chunk (si le budget restant est très court). */
const MIN_SOFT_DEADLINE_MS = 20_000;
/** Wall-clock max d'UN TOUR (garde-fou anti-runaway ; réinitialisé à chaque tour). */
const MAX_WALL_CLOCK_MS = 60 * 60_000;
/** Taille max du checkpoint sérialisé. */
const MAX_CHECKPOINT_BYTES = 8_000_000;
/** Borne du re-queue « message en attente » sur erreur mid-turn (catch final) :
    `attempts` (incrémenté à chaque claim) n'est pas remis à zéro sur ce chemin,
    donc une erreur persistante s'arrête après ce nombre de claims. */
const MAX_ERROR_REQUEUE_ATTEMPTS = 2;

export type ExecuteOutcome = "completed" | "suspended" | "interrupted" | "failed";

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

/** Exécuteur du tool `create_pr` (fourni par executeAgentRun, qui a le contexte git/PR). */
type CreatePrHandler = (args: {
  title: string;
  body?: string;
}) => Promise<{ result: unknown; success: boolean }>;

/** Les tools « métier » de l'agent : Sandbox (fichiers/commandes), git/PR
    (`createPr`) et ticket minddy (`issue-tools.ts`, routé par nom). */
function makeExecTool(
  sandbox: Sandbox,
  createPr: CreatePrHandler,
  issueToolCtx: IssueToolContext,
): ExecuteAgentTool {
  return async (name, args) => {
    if (ISSUE_TOOL_NAMES.has(name)) return await executeIssueTool(issueToolCtx, name, args);
    switch (name) {
      case "create_pr": {
        return await createPr({
          title: String(args.title ?? "").trim(),
          body: typeof args.body === "string" ? args.body : undefined,
        });
      }
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
        const r = await grepRepo(sandbox, {
          pattern: String(args.pattern ?? ""),
          path: args.path ? String(args.path) : undefined,
          glob: args.glob ? String(args.glob) : undefined,
          outputMode: (args.output_mode as GrepOutputMode) ?? undefined,
          ignoreCase: args.ignore_case === true,
          context: toNum(args.context),
          headLimit: toNum(args.head_limit),
        });
        if (!r.ok) {
          return { result: { error: `grep failed: ${r.error || "invalid pattern or options"}` }, success: false };
        }
        return { result: r.output || "(no matches)", success: true };
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
      case "move_file": {
        await moveWorkFile(sandbox, String(args.from ?? ""), String(args.to ?? ""));
        return { result: `Moved ${args.from} → ${args.to}`, success: true };
      }
      case "delete_file": {
        await deleteWorkFile(sandbox, String(args.path ?? ""));
        return { result: `Deleted ${args.path}`, success: true };
      }
      case "apply_edits": {
        const changes = Array.isArray(args.changes) ? (args.changes as Array<Record<string, unknown>>) : [];
        const applied: Array<Record<string, unknown>> = [];
        for (const ch of changes) {
          const path = String(ch.path ?? "");
          const op = String(ch.op ?? "update");
          try {
            if (op === "delete") {
              await deleteWorkFile(sandbox, path);
              applied.push({ path, op, ok: true });
            } else if (op === "move") {
              const to = String(ch.move_to ?? "");
              await moveWorkFile(sandbox, path, to);
              applied.push({ path, op, ok: true, move_to: to });
            } else if (op === "add") {
              await writeWorkFile(sandbox, path, String(ch.content ?? ""));
              applied.push({ path, op, ok: true });
            } else {
              // update : applique tous les edits en mémoire, puis écrit une fois (atomique/fichier).
              const original = await readWorkFile(sandbox, path);
              if (original === null) throw new Error(`File not found: ${path}`);
              const edits = Array.isArray(ch.edits) ? (ch.edits as Array<Record<string, unknown>>) : [];
              let content = original;
              let additions = 0;
              let deletions = 0;
              for (const e of edits) {
                const r = applyEdit(
                  path,
                  content,
                  String(e.old_string ?? ""),
                  String(e.new_string ?? ""),
                  e.replace_all === true,
                );
                content = r.content;
                additions += r.additions;
                deletions += r.deletions;
              }
              await writeWorkFile(sandbox, path, content);
              applied.push({ path, op: "update", ok: true, additions, deletions });
            }
          } catch (err) {
            applied.push({ path, op, ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        }
        return { result: { applied }, success: applied.every((r) => r.ok === true) };
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

/** Fichiers d'instructions repo lus à la racine du clone (ordre = priorité d'affichage). */
const REPO_INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];
/** Cap des instructions repo injectées (miroir du project_doc_max_bytes de Codex). */
const REPO_INSTRUCTIONS_MAX_BYTES = 32_000;

/**
 * Lit les instructions du dépôt (AGENTS.md / CLAUDE.md à la racine) et les emballe
 * en un message délimité, ou null s'il n'y en a pas. Lu UNE fois à l'amorce (le
 * checkpoint le transporte ensuite). C'est là qu'un repo déclare ses commandes de
 * build/test, ses conventions et ses interdits — le carburant d'un diff correct.
 */
async function readRepoInstructions(sandbox: Sandbox): Promise<string | null> {
  const parts: string[] = [];
  for (const name of REPO_INSTRUCTION_FILES) {
    try {
      const content = await readWorkFile(sandbox, name);
      if (content?.trim()) parts.push(`## ${name}\n${content.trim()}`);
    } catch {
      // fichier absent / illisible → on ignore
    }
  }
  if (parts.length === 0) return null;
  let body = parts.join("\n\n");
  if (body.length > REPO_INSTRUCTIONS_MAX_BYTES) {
    body = `${body.slice(0, REPO_INSTRUCTIONS_MAX_BYTES)}… [truncated]`;
  }
  return `# Repository instructions\nThe repository ships these instructions. Follow them; they override the general conventions on project-specific matters (build/test commands, structure, forbidden areas).\n\n<REPO_INSTRUCTIONS>\n${body}\n</REPO_INSTRUCTIONS>`;
}

interface IssueContext {
  identifier: string;
  title: string;
  description: string | null;
  plan: string | null;
  projectName: string | null;
  projectKey: string;
  /** Pièces jointes du ticket (et de ses commentaires) — annoncées dans l'amorce
      pour que l'agent sache qu'elles existent (il les ouvre via read_attachment). */
  attachments: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }>;
}

async function loadIssueContext(run: AgentRun): Promise<IssueContext> {
  const service = getServiceClient();
  const [{ data: issue }, { data: project }, { data: attachmentRows }] = await Promise.all([
    service
      .from("issues")
      .select("number, title, description, plan")
      .eq("id", run.issue_id)
      .maybeSingle(),
    service.from("projects").select("key, name").eq("id", run.project_id).maybeSingle(),
    service
      .from("attachments")
      .select("id, file_name, mime_type, size_bytes")
      .eq("issue_id", run.issue_id)
      .order("created_at", { ascending: true }),
  ]);
  const key = (project as { key?: string } | null)?.key ?? "ISSUE";
  const number = (issue as { number?: number } | null)?.number ?? 0;
  return {
    identifier: `${key}-${number}`,
    title: (issue as { title?: string } | null)?.title ?? "Untitled",
    description: (issue as { description?: string | null } | null)?.description ?? null,
    plan: (issue as { plan?: string | null } | null)?.plan ?? null,
    projectName: (project as { name?: string } | null)?.name ?? null,
    projectKey: key,
    attachments: ((attachmentRows ?? []) as Array<{
      id: string;
      file_name: string | null;
      mime_type: string | null;
      size_bytes: number | null;
    }>).map((a) => ({
      id: a.id,
      name: a.file_name ?? "attachment",
      mimeType: a.mime_type ?? "application/octet-stream",
      sizeBytes: a.size_bytes ?? 0,
    })),
  };
}

/**
 * Assemble le message d'amorce d'une run FROIDE qui hérite du travail du ticket
 * (MIN-68, indexé sur la branche), ou null si la run n'hérite de rien (premier
 * lancement). Deux formes :
 *  • la lignée porte une PR → PR + fil de review lus À CHAUD sur GitHub (pas figés
 *    au lancement : entre la création de la run et son exécution, un reviewer a pu
 *    commenter, et c'est souvent CE commentaire qui motive la relance) ;
 *  • la lignée n'a pas (encore) de PR → message de branche héritée (le travail
 *    poussé continue ; `create_pr` reste une décision).
 * Le résumé de la run précédente vient de la base (`outcome`).
 *
 * Best-effort : GitHub indisponible ne doit pas faire échouer la run — on retombe
 * sur le contexte minimal (« tu itères sur cette branche, va la lire »).
 */
async function buildInheritedPrContext(
  run: AgentRun,
  opts: {
    forge: Forge;
    token: string;
    repoFullName: string;
    repo: AgentRepoContext;
  },
): Promise<string | null> {
  if (run.pr_number == null) {
    // Pas de PR : la branche héritée porte-t-elle du travail d'une session
    // précédente ? (Une branche neuve stampée par un premier chunk crashé, non.)
    if (!run.branch_name) return null;
    const inherited = await branchHasPriorRun(
      run.issue_id,
      run.branch_name,
      run.created_at,
    ).catch(() => false);
    if (!inherited) return null;
    const previousSummary = await previousRunSummaryForIssue(run.issue_id, run.id).catch(
      () => null,
    );
    return buildInheritedBranchMessage({ repo: opts.repo, previousSummary });
  }
  const number = run.pr_number;

  const [pr, comments, reviewComments, previousSummary] = await Promise.all([
    opts.forge
      .getPullRequest({ token: opts.token, repoFullName: opts.repoFullName, number })
      .catch(() => null),
    opts.forge
      .listPullRequestComments({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    // Commentaires ancrés au code : l'agent doit voir ce qu'on lui demande de
    // corriger LIGNE À LIGNE, pas seulement le fil de conversation.
    opts.forge
      .listPullRequestReviewComments({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    previousRunSummaryForIssue(run.issue_id, run.id).catch(() => null),
  ]);

  return buildInheritedPrMessage({
    repo: opts.repo,
    pr: {
      number,
      title: pr?.title ?? null,
      body: pr?.body ?? null,
      // PR illisible → on se rabat sur l'état figé au lancement.
      state: pr ? (pr.merged ? "merged" : pr.state) : run.pr_state,
      comments: comments.map((c) => ({ author: c.user?.login ?? null, body: c.body })),
      lineThreads: toPrLineThreads(reviewComments),
      previousSummary,
    },
  });
}

/**
 * Message de commit d'une fin de tour : la première ligne de la réponse de l'agent
 * (nettoyée du markdown, bornée), sinon un générique. Les PR sont squash-mergées
 * par défaut — le message n'a pas besoin d'être parfait, juste lisible.
 */
export function commitMessageFromReply(reply: string, identifier: string): string {
  const firstLine = reply.split("\n").find((l) => l.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/[#*_`>]+/g, "").trim();
  if (cleaned.length >= 8) return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69)}…`;
  return `wip(${identifier}): agent update`;
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

    // Interruption demandée alors que le run était EN FILE (entre deux tours) : on
    // repasse au repos sans même réveiller la sandbox.
    //
    // Sauf s'il reste un message NON CONSOMMÉ : le composer envoie toujours le
    // couple steer PUIS interrupt quand l'agent « travaille » (et `queued` compte
    // comme tel), donc le message peut être arrivé juste avant le drapeau. Reposer
    // ici l'avalerait — personne ne draine un run au repos, et l'utilisateur verrait
    // l'agent mourir sans avoir lu sa consigne. On re-queue pour le traiter.
    if (run.interrupt_requested) {
      await clearInterrupt(run.id);
      const pending = await hasPendingRunMessages(run.id);
      await stampRun(run.id, {
        status: pending ? "queued" : "completed",
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        continuations: 0,
        attempts: 0,
        window_started_at: null,
        last_activity_at: new Date().toISOString(),
        interrupt_requested: false,
      });
      return "interrupted";
    }

    // Cible de clone (token frais pour ce chunk) + client PR/MR du provider.
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) throw new Error("No repository linked to this project");
    const forge = forgeFor(target.provider);

    const issue = await loadIssueContext(run);
    // Langue du commentaire + du résumé de l'agent = celle du lanceur (défaut owner).
    const commentLocale = await resolveRunLocale(run);
    const baseBranch = run.base_branch ?? target.defaultBranch;
    const workBranch =
      run.branch_name ?? `minddy/agent/${slugForBranch(issue.identifier)}-${run.id.slice(0, 8)}`;

    // Sandbox : réveille la microVM (filesystem restauré depuis le snapshot
    // persistant → reprise rapide) ; sinon `onCreate` clone la branche de travail.
    // Nom déterministe → même microVM/snapshot d'un tour à l'autre.
    const { sandbox: sb } = await getOrCreateAgentSandbox({
      name: `agent-${run.id}`,
      onCreate: async (fresh) => {
        await cloneRepo(fresh, { authUrl: target.authUrl, baseBranch, workBranch });
      },
    });
    sandbox = sb;

    // Persiste l'identité du Sandbox + les branches AVANT la boucle (reprise si crash).
    // sandbox_stopped_at:null → la microVM est de nouveau vivante (le reaper l'ignore).
    await stampRun(run.id, {
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      base_branch: baseBranch,
      branch_name: workBranch,
    });

    // Rehydrate ou amorce l'historique. L'amorce est CONVERSATIONNELLE : contexte
    // (dépôt + ticket) puis, en DERNIER message utilisateur, la demande réelle du
    // lanceur — l'agent répond à elle, le ticket n'est que son ancrage.
    let messages: AgentChatMessage[];
    let usageSeqStart = run.checkpoint?.usageSeq ?? run.continuations * 1000;
    if (run.checkpoint?.messages?.length) {
      messages = run.checkpoint.messages;
    } else {
      const system = buildAgentSystemPrompt({ locale: commentLocale });
      const contextMsg = buildAgentContextMessage({
        issue: {
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          plan: issue.plan,
        },
        repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
        projectName: issue.projectName,
        attachments: issue.attachments,
      });
      messages = [
        { role: "system", content: system },
        { role: "user", content: contextMsg },
      ];
      // Session FROIDE héritant d'une PR (MIN-68) : elle n'a aucun checkpoint, mais
      // la branche porte déjà du travail. On lui donne sa seule mémoire de ce passé —
      // résumé de la session précédente, PR, fil de review — pour qu'elle itère au
      // lieu de tout refaire.
      const inheritedPr = await buildInheritedPrContext(run, {
        forge,
        token: target.token,
        repoFullName: target.repoFullName,
        repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
      });
      if (inheritedPr) messages.push({ role: "user", content: inheritedPr });
      // Instructions du dépôt (AGENTS.md / CLAUDE.md) — message dédié après le contexte.
      const repoInstructions = await readRepoInstructions(sandbox);
      if (repoInstructions) messages.push({ role: "user", content: repoInstructions });
      // La demande du lanceur, en dernier : c'est À ELLE que l'agent répond.
      if (run.prompt?.trim()) messages.push({ role: "user", content: run.prompt.trim() });
    }

    // État PR de la session, MUTÉ pendant le tour (create_pr, réouverture au push) :
    // la fin de tour lit l'état à jour, pas celui figé au claim.
    const prState: { number: number | null; url: string | null; state: AgentRun["pr_state"] } = {
      number: run.pr_number,
      url: run.pr_url,
      state: run.pr_state,
    };

    /** Enregistre une PR ouverte/rouverte : état local + stamp + statut d'issue +
     *  event live + commentaire d'issue (le SEUL commentaire du nouveau modèle). */
    const registerPr = async (
      pr: PullRequestRef,
      kind: "opened" | "reopened",
    ): Promise<void> => {
      prState.number = pr.number;
      prState.url = pr.url;
      prState.state = pr.merged ? "merged" : ((pr.state as AgentRun["pr_state"]) ?? "open");
      await emit("pr_opened", { number: pr.number, url: pr.url });
      await stampRun(run.id, {
        pr_number: pr.number,
        pr_url: pr.url,
        pr_state: prState.state,
      });
      if (run.created_by) {
        await syncIssueStatusFromPr({
          issueId: run.issue_id,
          actorId: run.created_by,
          prState: prState.state,
        });
      }
      await postPrComment(run, issue.identifier, kind, pr.url, commentLocale, target.provider);
    };

    /**
     * Tool `create_pr` : la création de PR est une DÉCISION (de l'agent ou de
     * l'utilisateur), plus un automatisme de fin de tour. Pousse d'abord le travail
     * du tour, puis : PR déjà vivante → no-op informatif (le push l'a mise à jour) ;
     * PR refusée → réouverture (règle produit : on réitère la dernière PR, jamais de
     * doublon) ; sinon → création. Une PR mergée n'est jamais réutilisée.
     */
    const createPr: CreatePrHandler = async ({ title, body }) => {
      const prTitle = title || `${issue.identifier}: ${issue.title}`;
      const fresh = (await resolveRepoCloneTarget(run.project_id).catch(() => null)) ?? target;
      try {
        await commitAndPush(sb, { authUrl: fresh.authUrl, workBranch, message: prTitle });
      } catch (err) {
        return { result: { error: `push failed: ${(err as Error).message}` }, success: false };
      }
      if (prState.number != null) {
        const current = await forge
          .getPullRequest({
            token: fresh.token,
            repoFullName: fresh.repoFullName,
            number: prState.number,
          })
          .catch(() => null);
        if (current?.merged) {
          return {
            result: {
              error: `Pull request #${prState.number} is already merged — this branch's work is shipped. A new session on this ticket will start a fresh branch and pull request.`,
            },
            success: false,
          };
        }
        if (current && current.state !== "closed") {
          return {
            result: {
              number: current.number,
              url: current.url,
              note: "A pull request already exists for this branch — your pushes update it automatically; nothing was created.",
            },
            success: true,
          };
        }
        if (current && current.state === "closed") {
          const reopened = await forge
            .reopenPullRequest({
              token: fresh.token,
              repoFullName: fresh.repoFullName,
              number: prState.number,
            })
            .catch((err) => {
              console.error("[agent-execute] PR reopen failed:", (err as Error).message);
              return null;
            });
          if (reopened) {
            await registerPr(reopened, "reopened");
            return {
              result: {
                number: reopened.number,
                url: reopened.url,
                note: "The rejected pull request was reopened with the new work.",
              },
              success: true,
            };
          }
        }
        // PR illisible / réouverture impossible (branche tête supprimée puis
        // recréée par notre push…) → on retombe sur une création propre.
      }
      const prBody = `${body?.trim() || prTitle}\n\n---\n🤖 Généré par l'agent numo (minddy) · issue ${issue.identifier}`;
      try {
        const pr = await forge.ensurePullRequest({
          token: fresh.token,
          repoFullName: fresh.repoFullName,
          head: workBranch,
          base: baseBranch,
          title: prTitle,
          body: prBody,
        });
        await registerPr(pr, "opened");
        return { result: { number: pr.number, url: pr.url }, success: true };
      } catch (err) {
        if (isForgeApiError(err) && err.status === 422) {
          return {
            result: {
              error:
                "The branch has no changes compared to the base branch — there is nothing to open a pull request for.",
            },
            success: false,
          };
        }
        return { result: { error: (err as Error).message }, success: false };
      }
    };

    /**
     * Recale `prState` sur la BASE : les actions in-app (merge/reject pendant que
     * l'agent tourne) et le webhook GitHub stampent `agent_runs.pr_state`, invisible
     * du snapshot pris au claim. Sans ce recalage, un reject mid-turn ne serait
     * jamais rouvert au push, et un merge mid-turn passerait inaperçu.
     */
    const refreshPrStateFromDb = async (): Promise<void> => {
      const db = await getRun(run.id).catch(() => null);
      if (!db) return;
      prState.number = db.pr_number;
      prState.url = db.pr_url;
      prState.state = db.pr_state;
    };

    /**
     * La session suit une PR REFUSÉE et un push vient de faire AVANCER le remote →
     * on la ROUVRE (règle produit : on réitère toujours la dernière PR du ticket,
     * jamais de doublon). Appelé après CHAQUE push — fin de tour ET push WIP de
     * mi-tour : sur un tour multi-chunks, ce sont les WIP qui portent les commits.
     * Décision sur `remoteUpdated` (le remote a bougé), pas `committed` : un commit
     * posé à un appel précédent (push 5xx) part avec un arbre propre au suivant.
     * Une PR mergée n'est jamais ressuscitée (le reopen échoue → on n'insiste pas).
     * Best-effort.
     */
    const reopenIfRejectedWorkPushed = async (
      pushed: { remoteUpdated: boolean } | null,
      token: string,
    ): Promise<void> => {
      if (!pushed?.remoteUpdated) return;
      await refreshPrStateFromDb();
      if (prState.number == null || prState.state !== "closed") return;
      const reopened = await forge
        .reopenPullRequest({
          token,
          repoFullName: target.repoFullName,
          number: prState.number,
        })
        .catch((err) => {
          console.error("[agent-execute] PR reopen on push failed:", (err as Error).message);
          return null;
        });
      if (reopened && !reopened.merged) await registerPr(reopened, "reopened");
    };

    const { apiKey, baseUrl, provider } = await resolveAgentApiKey(run.created_by);
    // Fenêtre de contexte du modèle (OpenRouter) → seuil de compaction adapté.
    const contextWindow = await getModelContextWindow(run.model, provider, apiKey).catch(() => null);

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
      contextWindow,
      execTool: makeExecTool(sandbox, createPr, {
        issueId: run.issue_id,
        projectId: run.project_id,
        projectKey: issue.projectKey,
        actorId: run.created_by,
      }),
      pullSteering: () => pullPendingMessages(run.id),
      // « Interrompre la réponse en cours » : la boucle abandonne l'appel LLM en
      // vol et renvoie `interrupted` (round partiel jeté).
      checkInterrupt: () => readInterruptFlag(run.id),
      // Miroir des états du checklist de l'agent vers le plan de l'issue liée.
      syncPlan: (steps) => syncIssuePlanStates(run.issue_id, steps),
      emit,
      usageSeqStart,
    });

    const newCost = run.cost_usd + result.costUsd;
    const checkpoint: AgentCheckpoint = { messages: result.messages, usageSeq: result.usageSeqEnd };
    const nowIso = new Date().toISOString();

    // Champs communs à toute mise au REPOS (fin de tour / interruption / erreur /
    // budget épuisé) : run reprennable à chaud, microVM gardée chaude (le reaper la
    // coupera après ~5 min d'inactivité), budget de tour remis à zéro.
    const restFields = {
      continuations: 0,
      // `attempts` compte les claims d'un tour pour la reprise sur crash
      // (`requeueStuckRuns`), et `claim_agent_run` l'incrémente à CHAQUE claim. Sans
      // remise à zéro ici, il s'accumule sur la vie entière du run — or MIN-68 fait
      // du multi-tours la vie normale d'un run (chaque reprise à chaud = un claim de
      // plus). Passé le budget, un crash ne requeue plus : il marque `failed` ET
      // efface le checkpoint → conversation morte pour de bon. Un tour qui arrive au
      // repos est un tour SAIN : son successeur repart avec son budget entier.
      attempts: 0,
      window_started_at: null,
      cost_usd: newCost,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      last_activity_at: nowIso,
      interrupt_requested: false,
    } satisfies Partial<Parameters<typeof stampRun>[1]>;

    // Enregistre le REPOS. Il n'y a plus qu'UN repos (modèle conversationnel) :
    // `completed` — la session attend le prochain message de l'utilisateur dans sa
    // conversation, et ne bloque PLUS le ticket (seuls queued/running l'occupent).
    // Elle reste reprennable à chaud depuis son composer (checkpoint + snapshot).
    // Si un message de steering est arrivé APRÈS la dernière frontière de round
    // (fenêtre de finalisation : commit+push), on RE-QUEUE au lieu de reposer →
    // le drain relance la boucle qui le draine aussitôt.
    const restStamp = async (
      extra: Partial<Parameters<typeof stampRun>[1]>,
    ): Promise<void> => {
      const pending = await hasPendingRunMessages(run.id);
      await stampRun(run.id, {
        status: pending ? "queued" : "completed",
        ...restFields,
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        ...extra,
      });
    };

    // ── Fin de tour NATURELLE : push du travail, PAS de PR automatique ────────
    if (result.status === "completed") {
      const reply = result.reply?.trim() ?? "";
      const freshTarget = await resolveRepoCloneTarget(run.project_id).catch(() => null);
      const authUrl = freshTarget?.authUrl ?? target.authUrl;
      const token = freshTarget?.token ?? target.token;

      // Pousse ce que le tour a changé (no-op propre sans changement). Si la session
      // suit une PR, GitHub la met à jour tout seul — aucune création ici : ouvrir
      // une PR est la décision de l'agent (`create_pr`) ou de l'utilisateur.
      let pushError: string | null = null;
      const pushed = await commitAndPush(sandbox, {
        authUrl,
        workBranch,
        message: commitMessageFromReply(reply, issue.identifier),
      }).catch((err) => {
        pushError = (err as Error).message;
        console.error("[agent-execute] turn-end push failed:", pushError);
        return null;
      });
      // Push raté → SIGNAL VISIBLE (event + error_message), le run reste au repos
      // reprennable. Un rejet non-fast-forward n'est PAS transitoire (quelqu'un a
      // poussé sur la branche de l'agent) : sans signal, chaque tour re-échouerait
      // en silence et l'utilisateur croirait le travail livré alors que la branche
      // distante ne le reçoit plus jamais.
      if (pushError) {
        await emit("error", {
          message: (PUSH_FAILED_STRINGS[commentLocale] ?? PUSH_FAILED_STRINGS.en)(
            cap(pushError, 300),
          ),
        });
      }

      await reopenIfRejectedWorkPushed(pushed, token);
      // Le remote a reçu du travail mais la PR a été FUSIONNÉE pendant le tour
      // (`refreshPrStateFromDb` dans le reopen vient de recaler l'état) : les
      // commits sont préservés sur la branche mais n'appartiennent plus à aucune
      // PR — on le dit, sinon l'utilisateur croit le travail en revue.
      if (pushed?.remoteUpdated && prState.state === "merged" && prState.number != null) {
        await emit("error", {
          message: (MERGED_DURING_TURN_STRINGS[commentLocale] ?? MERGED_DURING_TURN_STRINGS.en)(
            prRef(target.provider, prState.number),
            prTerm(target.provider),
          ),
        });
      }

      // `outcome` = la dernière réponse de la session : c'est elle qu'une future
      // session froide recevra comme résumé du travail précédent.
      await restStamp({
        checkpoint,
        outcome: reply ? cap(reply, 4000) : null,
        ...(pushError ? { error_message: cap(pushError, 1000) } : {}),
      });
      return "completed";
    }

    // ── interrupted / erreur / suspended : push WIP + persiste le checkpoint ──
    const wipPushed = await commitAndPush(sandbox, {
      authUrl: target.authUrl,
      workBranch,
      message: `wip(${issue.identifier}): chunk ${run.continuations + 1}`,
    }).catch((err) => {
      // Un push raté ne doit pas perdre le checkpoint (l'état repo se re-poussera au chunk suivant).
      console.error("[agent-execute] WIP push failed:", (err as Error).message);
      return null;
    });
    await reopenIfRejectedWorkPushed(wipPushed, target.token);

    // Erreur LLM fatale → REPOS reprennable. L'event d'erreur a déjà été émis par la
    // boucle ; le checkpoint (dont un éventuel steering injecté ce round) est conservé
    // → l'utilisateur peut renvoyer un message pour reprendre.
    if (result.status === "error") {
      await restStamp({
        checkpoint,
        error_message: result.errorMessage ? cap(result.errorMessage, 1000) : null,
      });
      return "completed";
    }

    // « Interrompre » → REPOS (round partiel déjà jeté par la boucle).
    if (result.status === "interrupted") {
      await clearInterrupt(run.id);
      await restStamp({ checkpoint });
      return "interrupted";
    }

    // suspended, mais une interruption a été demandée pendant le chunk → REPOS
    // plutôt que re-queue (course : le drapeau est arrivé après le retour de boucle).
    if (await readInterruptFlag(run.id)) {
      await clearInterrupt(run.id);
      await restStamp({ checkpoint });
      return "interrupted";
    }

    // suspended — garde-fous anti-runaway PAR TOUR : au-delà, on REPOSE (avec un
    // event d'erreur) au lieu d'échouer — la session reste reprennable.
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
      await emit("error", {
        message: "Tour trop long (budget épuisé) — envoie un message pour continuer.",
      });
      await restStamp({ checkpoint });
      return "completed";
    }

    // Continuation du MÊME tour : re-queue immédiat (window_started_at conservé).
    await stampRun(run.id, {
      status: "queued",
      checkpoint,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      continuations: nextContinuations,
      attempts: 0,
      not_before: nowIso,
      cost_usd: newCost,
    });
    return "suspended";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emit("error", { message });
    // Erreur d'AMORÇAGE (repo/modèle/clone : sandbox jamais acquise).
    if (!sandbox) {
      // Une CONVERSATION EXISTANTE (checkpoint) ne meurt jamais sur une erreur
      // d'amorçage — souvent transitoire (mint de token GitHub, 502). REPOS avec
      // l'erreur visible : le prochain message retentera l'amorçage, contexte
      // intact. Seule une run VIERGE (rien à préserver) échoue en `failed`.
      if (run.checkpoint?.messages?.length) {
        await stampRun(run.id, {
          status: "completed",
          error_message: cap(message, 1000),
          continuations: 0,
          attempts: 0,
          window_started_at: null,
          last_activity_at: new Date().toISOString(),
          interrupt_requested: false,
        });
        return "completed";
      }
      await stampRun(run.id, {
        status: "failed",
        error_message: cap(message, 1000),
        checkpoint: null,
        continuations: 0,
      });
      return "failed";
    }
    // Erreur EN COURS DE TOUR → la session reste reprennable : REPOS, checkpoint du
    // dernier état sain conservé (non écrasé), microVM gardée. Si un message de
    // steering attend (accepté pendant le tour, jamais drainé), on RE-QUEUE pour ne
    // pas l'orpheliner — borné par `attempts` (incrémenté à chaque claim, jamais
    // remis à zéro sur ce chemin) pour qu'une erreur persistante ne boucle pas
    // claim → erreur → re-queue indéfiniment.
    await clearInterrupt(run.id).catch(() => {});
    const retryForPending =
      run.attempts < MAX_ERROR_REQUEUE_ATTEMPTS &&
      (await hasPendingRunMessages(run.id).catch(() => false));
    await stampRun(run.id, {
      status: retryForPending ? "queued" : "completed",
      ...(retryForPending
        ? { not_before: new Date().toISOString() }
        : // Repos sain : le budget de reprise sur crash repart entier (sinon il
          // s'épuise sur la vie du run et le prochain crash effacerait son
          // checkpoint via requeueStuckRuns).
          { attempts: 0 }),
      error_message: cap(message, 1000),
      continuations: 0,
      window_started_at: null,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      last_activity_at: new Date().toISOString(),
      interrupt_requested: false,
    });
    return "completed";
  } finally {
    // Métrage du compute sandbox (MIN-72) : chaque tranche d'exécution où la
    // microVM a été réveillée est facturée en wall-clock — y compris les tours
    // en échec. Bande de seq dédiée pour ne pas croiser celle des appels LLM
    // (continuations × 1000 + rounds).
    if (sandbox) {
      await recordSandboxUsage({
        runId: run.run_id ?? run.id,
        seq: SANDBOX_USAGE_SEQ_BASE + run.continuations,
        userId: run.created_by,
        projectId: run.project_id,
        durationMs: Date.now() - callStart,
      }).catch(() => {});
    }
  }
}

/** Base de seq des lignes `sandbox_compute` (hors de la bande des appels LLM). */
const SANDBOX_USAGE_SEQ_BASE = 1_000_000_000;

/** Note de fil quand le push de fin de tour échoue (visible dans la conversation). */
const PUSH_FAILED_STRINGS: Record<Locale, (detail: string) => string> = {
  fr: (detail) =>
    `Le push de fin de tour a échoué — la branche distante n'a PAS reçu le travail de ce tour. Le travail reste dans la sandbox et sera re-poussé au prochain tour. Détail : ${detail}`,
  en: (detail) =>
    `The turn-end push failed — the remote branch did NOT receive this turn's work. The work is kept in the sandbox and will be pushed again next turn. Detail: ${detail}`,
};

/** Terme provider affiché dans les notes/commentaires (marques, non localisées). */
function prTerm(provider: RepoProviderId): string {
  return provider === "gitlab" ? "merge request" : "pull request";
}

/** Référence provider d'une PR/MR : `#12` sur GitHub, `!12` sur GitLab. */
function prRef(provider: RepoProviderId, n: number): string {
  return provider === "gitlab" ? `!${n}` : `#${n}`;
}

function capitalized(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/** Note de fil quand la PR a été fusionnée PENDANT le tour (travail hors PR). */
const MERGED_DURING_TURN_STRINGS: Record<Locale, (ref: string, term: string) => string> = {
  fr: (ref, term) =>
    `La ${term} ${ref} a été fusionnée pendant ce tour : le nouveau travail a été poussé sur la branche mais n'appartient plus à aucune ${term}. Lance une nouvelle session pour continuer — elle repartira d'une branche neuve.`,
  en: (ref, term) =>
    `${capitalized(term)} ${ref} was merged during this turn: the new work was pushed to the branch but no longer belongs to any ${term}. Start a new session to continue — it will begin from a fresh branch.`,
};

const COMMENT_STRINGS: Record<
  Locale,
  {
    header: (id: string) => string;
    opened: (term: string) => string;
    reopened: (term: string) => string;
    viewPr: (term: string) => string;
  }
> = {
  fr: {
    header: (id) => `Agent numo — ${id}`,
    opened: (term) => `${capitalized(term)} ouverte.`,
    reopened: (term) => `${capitalized(term)} rouverte avec le nouveau travail.`,
    viewPr: (term) => `Voir la ${term}`,
  },
  en: {
    header: (id) => `Numo agent — ${id}`,
    opened: (term) => `${capitalized(term)} opened.`,
    reopened: (term) => `${capitalized(term)} reopened with the new work.`,
    viewPr: (term) => `View the ${term}`,
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

/**
 * Poste un commentaire d'issue sur ÉVÉNEMENT PR uniquement (création/réouverture),
 * attribué à Numo. Les tours de conversation ordinaires ne commentent plus le
 * ticket : tout vit dans la conversation de la session.
 */
async function postPrComment(
  run: AgentRun,
  identifier: string,
  kind: "opened" | "reopened",
  prUrl: string,
  locale: Locale,
  provider: RepoProviderId,
): Promise<void> {
  if (!run.created_by) return;
  try {
    const service = getServiceClient();
    const s = COMMENT_STRINGS[locale] ?? COMMENT_STRINGS.en;
    const term = prTerm(provider);
    const label = kind === "reopened" ? s.reopened(term) : s.opened(term);
    const body = `**${s.header(identifier)}**\n\n${label}\n\n🔗 [${s.viewPr(term)}](${prUrl})`;
    await service.from("comments").insert({
      issue_id: run.issue_id,
      author_id: run.created_by,
      body,
      via_assistant: true,
    });
  } catch (err) {
    console.error("[agent-execute] PR comment failed:", (err as Error).message);
  }
}
