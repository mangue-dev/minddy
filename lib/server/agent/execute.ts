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
  buildAgentTaskMessage,
  buildInheritedPrMessage,
  type AgentRepoContext,
} from "./prompt";
import { resolveAgentApiKey, getModelContextWindow } from "./model";
import {
  ensurePullRequest,
  getPullRequest,
  listPullRequestComments,
  reopenPullRequest,
  GithubApiError,
  type PullRequestRef,
} from "./pr";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { syncIssuePlanStates } from "./plan-sync";
import {
  stampRun,
  appendEvent,
  pullPendingMessages,
  previousRunSummaryForIssue,
  readInterruptFlag,
  clearInterrupt,
  hasPendingRunMessages,
  type AgentRun,
  type AgentRunStatus,
  type AgentCheckpoint,
} from "./runs";

/**
 * Exécute UN chunk d'un RUN d'agent (MIN-46 + MIN-68). Réveille (snapshot
 * persistant) ou clone le Sandbox, rehydrate le checkpoint, fait tourner la boucle
 * jusqu'à la soft-deadline, puis :
 *   - suspended  → commit+push WIP, checkpoint persisté, run re-`queued` (continue
 *                  le tour, en process ou via l'auto-invoke) ;
 *   - completed  → fin de tour : commit+push, PR ouverte/mise à jour S'IL Y A un
 *                  diff, puis run `completed` — le tour est fini, l'issue est libre
 *                  d'accueillir une nouvelle run froide ;
 *   - needs_input → `ask_user` / interruption / erreur LLM : REPOS. La run reste
 *                  ACTIVE (elle attend l'utilisateur DANS sa conversation) et bloque
 *                  donc toute nouvelle run sur l'issue.
 * Un run terminé (`completed`) reste reprennable à CHAUD depuis le composer de sa
 * conversation (checkpoint + snapshot conservés) ; c'est le seul chemin de reprise.
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

export type ExecuteOutcome =
  | "completed"
  | "suspended"
  | "needs_input"
  | "interrupted"
  | "failed";

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

/**
 * Assemble le message d'amorce d'une run FROIDE qui hérite d'une PR (MIN-68), ou
 * null si la run n'hérite de rien (premier lancement). La PR et son fil de review
 * sont lus À CHAUD sur GitHub — pas figés au lancement : entre la création de la run
 * et son exécution, un reviewer a pu commenter, et c'est souvent CE commentaire qui
 * motive la relance. Le résumé de la run précédente vient de la base (`outcome`).
 *
 * Best-effort : GitHub indisponible ne doit pas faire échouer la run — on retombe
 * sur le contexte minimal (« tu itères sur cette branche, va la lire »).
 */
async function buildInheritedPrContext(
  run: AgentRun,
  opts: {
    token: string;
    repoFullName: string;
    repo: AgentRepoContext;
  },
): Promise<string | null> {
  if (run.pr_number == null) return null;
  const number = run.pr_number;

  const [pr, comments, previousSummary] = await Promise.all([
    getPullRequest({ token: opts.token, repoFullName: opts.repoFullName, number }).catch(
      () => null,
    ),
    listPullRequestComments({
      token: opts.token,
      repoFullName: opts.repoFullName,
      number,
    }).catch(() => []),
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
      previousSummary,
    },
  });
}

/**
 * PR du run après le push : l'héritée mise à jour (MIN-68) — rouverte si elle avait
 * été REFUSÉE, puisque la run vient de répondre aux objections — ou une PR neuve.
 * Une PR déjà mergée n'est pas réutilisable : on en ouvre une nouvelle sur la
 * branche (cas de course — la PR a été mergée après la création du run).
 *
 * Toute défaillance sur la PR héritée (illisible, réouverture refusée parce que sa
 * branche tête avait été supprimée à la fermeture puis recréée par notre push…)
 * retombe sur l'ouverture d'une PR neuve : le travail vient d'être poussé, il DOIT
 * finir sous une pull request — sans ce repli, l'erreur remonterait au 422 « aucune
 * modification » et le run se conclurait sur « rien produit » avec des commits
 * orphelins.
 */
async function openOrUpdatePullRequest(opts: {
  token: string;
  repoFullName: string;
  inheritedNumber: number | null;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<PullRequestRef> {
  if (opts.inheritedNumber != null) {
    const current = await getPullRequest({
      token: opts.token,
      repoFullName: opts.repoFullName,
      number: opts.inheritedNumber,
    }).catch(() => null);
    if (current && !current.merged) {
      // Le push a déjà mis la PR à jour (GitHub suit la tête de branche) : il ne
      // reste qu'à la remettre en revue si elle avait été fermée.
      if (current.state !== "closed") return current;
      const reopened = await reopenPullRequest({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number: opts.inheritedNumber,
      }).catch((err) => {
        console.error("[agent-execute] PR reopen failed:", (err as Error).message);
        return null;
      });
      if (reopened) return reopened;
    }
  }
  return await ensurePullRequest({
    token: opts.token,
    repoFullName: opts.repoFullName,
    head: opts.head,
    base: opts.base,
    title: opts.title,
    body: opts.body,
  });
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
        status: pending ? "queued" : "needs_input",
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        continuations: 0,
        attempts: 0,
        window_started_at: null,
        last_activity_at: new Date().toISOString(),
        interrupt_requested: false,
      });
      return "interrupted";
    }

    // Cible de clone (token d'installation frais pour ce chunk).
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) throw new Error("No repository linked to this project");

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

    // Rehydrate ou amorce l'historique.
    let messages: AgentChatMessage[];
    let usageSeqStart = run.checkpoint?.usageSeq ?? run.continuations * 1000;
    if (run.checkpoint?.messages?.length) {
      messages = run.checkpoint.messages;
    } else {
      const system = buildAgentSystemPrompt({ locale: commentLocale });
      const taskMsg = buildAgentTaskMessage({
        issue: {
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          plan: issue.plan,
        },
        repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
        projectName: issue.projectName,
        extraInstructions: run.prompt, // injecté UNE fois (plus de double-injection)
      });
      messages = [
        { role: "system", content: system },
        { role: "user", content: taskMsg },
      ];
      // Run FROIDE héritant d'une PR (MIN-68) : elle n'a aucun checkpoint, mais la
      // branche porte déjà du travail. On lui donne sa seule mémoire de ce passé —
      // résumé de la run précédente, PR, fil de review — pour qu'elle itère au lieu
      // de tout refaire.
      const inheritedPr = await buildInheritedPrContext(run, {
        token: target.token,
        repoFullName: target.repoFullName,
        repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
      });
      if (inheritedPr) messages.push({ role: "user", content: inheritedPr });
      // Instructions du dépôt (AGENTS.md / CLAUDE.md) — message dédié après la tâche.
      const repoInstructions = await readRepoInstructions(sandbox);
      if (repoInstructions) messages.push({ role: "user", content: repoInstructions });
    }

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
      execTool: makeExecTool(sandbox),
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

    // Champs communs à toute mise au REPOS (fin de tour / ask_user / interruption /
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

    // Enregistre le REPOS. Deux repos distincts (MIN-68) :
    //   • `completed` — le tour est FINI (l'agent a appelé `finish`). Le run n'est
    //     plus actif : l'issue peut accueillir une nouvelle run froide. Il reste
    //     reprennable à chaud depuis le composer de SA conversation.
    //   • `needs_input` — le run est SUSPENDU et attend l'utilisateur dans sa
    //     conversation (ask_user, interruption, erreur, budget épuisé). Il reste
    //     ACTIF, donc bloque toute nouvelle run sur l'issue.
    // Si un message de steering est arrivé APRÈS la dernière frontière de round
    // (fenêtre de finalisation : commit+push+PR), on RE-QUEUE au lieu de reposer →
    // le drain relance la boucle qui le draine aussitôt.
    const restStamp = async (
      extra: Partial<Parameters<typeof stampRun>[1]>,
      restStatus: AgentRunStatus = "needs_input",
    ): Promise<void> => {
      const pending = await hasPendingRunMessages(run.id);
      await stampRun(run.id, {
        status: pending ? "queued" : restStatus,
        ...restFields,
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        ...extra,
      });
    };

    // ── Fin de tour : commit + PR (si diff) → run `completed` ─────────────────
    if (result.status === "completed") {
      const finish = result.finish ?? { summary: "Changes applied." };
      const freshTarget = await resolveRepoCloneTarget(run.project_id);
      const authUrl = freshTarget?.authUrl ?? target.authUrl;
      const token = freshTarget?.token ?? target.token;

      const prTitle = finish.prTitle?.trim() || `${issue.identifier}: ${issue.title}`;
      const prBody = `${finish.prBody?.trim() || finish.summary}\n\n---\n🤖 Généré par l'agent numo (minddy) · issue ${issue.identifier}`;

      await commitAndPush(sandbox, { authUrl, workBranch, message: prTitle });

      try {
        const pr = await openOrUpdatePullRequest({
          token,
          repoFullName: target.repoFullName,
          inheritedNumber: run.pr_number,
          head: workBranch,
          base: baseBranch,
          title: prTitle,
          body: prBody,
        });
        await emit("pr_opened", { number: pr.number, url: pr.url });
        await postSummaryComment(run, issue.identifier, finish.summary, pr.url, commentLocale);
        await restStamp(
          {
            checkpoint,
            pr_number: pr.number,
            pr_url: pr.url,
            pr_state: (pr.state as AgentRun["pr_state"]) ?? "open",
            outcome: finish.summary,
          },
          "completed",
        );
        // PR ouverte/mise à jour → l'issue passe en revue (MIN-46). Best-effort.
        if (run.created_by) {
          await syncIssueStatusFromPr({
            issueId: run.issue_id,
            actorId: run.created_by,
            prState: (pr.state as AgentRun["pr_state"]) ?? "open",
          });
        }
        return "completed";
      } catch (err) {
        // Aucune modification produite (422 « No commits between… ») → fin de tour
        // sans PR.
        if (err instanceof GithubApiError && err.status === 422) {
          await emit("summary", { text: "No changes were produced." });
          await postSummaryComment(run, issue.identifier, finish.summary, null, commentLocale);
          await restStamp({ checkpoint, outcome: finish.summary }, "completed");
          return "completed";
        }
        throw err;
      }
    }

    // ── needs_input / interrupted / suspended : push WIP + persiste le checkpoint ─
    await commitAndPush(sandbox, {
      authUrl: target.authUrl,
      workBranch,
      message: `wip(${issue.identifier}): chunk ${run.continuations + 1}`,
    }).catch((err) => {
      // Un push raté ne doit pas perdre le checkpoint (l'état repo se re-poussera au chunk suivant).
      console.error("[agent-execute] WIP push failed:", (err as Error).message);
    });

    // ask_user → REPOS (attend la réponse de l'utilisateur).
    if (result.status === "needs_input") {
      await restStamp({ checkpoint, outcome: result.question ?? null });
      return "needs_input";
    }

    // Erreur LLM fatale → REPOS reprennable. L'event d'erreur a déjà été émis par la
    // boucle ; le checkpoint (dont un éventuel steering injecté ce round) est conservé
    // → l'utilisateur peut renvoyer un message pour reprendre.
    if (result.status === "error") {
      await restStamp({
        checkpoint,
        error_message: result.errorMessage ? cap(result.errorMessage, 1000) : null,
      });
      return "needs_input";
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
      return "needs_input";
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
    // Erreur d'AMORÇAGE (repo/modèle/clone : sandbox jamais acquise) → non
    // reprenable, la session échoue.
    if (!sandbox) {
      await stampRun(run.id, {
        status: "failed",
        error_message: cap(message, 1000),
        checkpoint: null,
        continuations: 0,
      });
      return "failed";
    }
    // Erreur EN COURS DE TOUR → la session reste reprennable : REPOS, checkpoint du
    // dernier état sain conservé (non écrasé), microVM gardée. L'utilisateur peut
    // renvoyer un message pour reprendre.
    await clearInterrupt(run.id).catch(() => {});
    await stampRun(run.id, {
      status: "needs_input",
      error_message: cap(message, 1000),
      continuations: 0,
      // Comme `restFields` : ce run revient au repos sain, son budget de reprise sur
      // crash repart entier (sinon il s'épuise sur la vie du run et le prochain
      // crash effacerait son checkpoint).
      attempts: 0,
      window_started_at: null,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      last_activity_at: new Date().toISOString(),
      interrupt_requested: false,
    });
    return "needs_input";
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
