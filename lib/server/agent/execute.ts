import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAccountSettings } from "@/lib/server/account-settings";
import { recordSandboxUsage } from "@/lib/server/usage";
import { defaultLocale, type Locale } from "@/i18n/config";
import {
  AGENT_SOFT_DEADLINE_MS,
  AGENT_MAX_CONTINUATIONS,
} from "@/lib/agent-models";
import { resolveRepoCloneTarget, type RepoCloneTarget } from "./repo-access";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { getGithubBotCommitIdentity } from "@/lib/server/git/github-app";
import {
  getOrCreateAgentSandbox,
  cloneRepo,
  commitAndPush,
  revParseHead,
  changedFiles,
  runShell,
  turnDiff,
  readWorkFile,
  readWorkFileWindow,
  writeWorkFile,
  moveWorkFile,
  deleteWorkFile,
  listDir,
  grepRepo,
  globRepo,
  sandboxName,
  writeToolOutput,
  startBackground,
  readBackgroundSince,
  stopBackground,
  REPO_DIR,
  type GrepOutputMode,
  type Sandbox,
} from "./sandbox";
import {
  BackgroundJobs,
  BACKGROUND_FETCH_BYTES,
  type BackgroundJobRunner,
} from "./background";
import { resolveWithin } from "./repo-path";
import { typeErrorsForTurn, TYPECHECK_MIN_BUDGET_MS } from "./diagnostics";
import { formatSelfReview, SELF_REVIEW_MIN_BUDGET_MS } from "./self-review";
import { LITERAL_RETRY_NOTE } from "./grep-pattern";
import {
  formatRunCommandResult,
  fullOutputDocument,
  spillsToDisk,
  toolOutputFileName,
} from "./command-output";
import { checkCommand, FORBIDDEN_COMMAND_REASON } from "./command-guard";
import { applyEdit } from "./edit";
import { applyPatchEdits, parsePatch, usesApplyPatch, type PatchOp } from "./patch";
import {
  REPO_INSTRUCTION_FILES,
  collectTouchedInstructions,
  formatBootInstructions,
  type InstructionsState,
  type RepoInstructionFile,
} from "./repo-instructions";
import {
  runAgentLoop,
  type AgentChatMessage,
  type EmitAgentEvent,
  type EmitAgentLive,
  type ExecuteAgentTool,
} from "./agent-loop";
import type { AgentToolImage } from "./content";
import { broadcastRunStream } from "./live";
import { agentToolsFor, RUN_COMMAND_TIMEOUT_MS } from "./tools";
import {
  isWebSearchEnabled,
  runWebSearchTool,
  MAX_WEB_SEARCHES_PER_TURN,
  WEB_SEARCH_SEQ_BASE,
} from "@/lib/server/web-search";
import {
  buildAgentSystemPrompt,
  buildAgentContextMessage,
  buildNotebookContextMessage,
  buildInheritedPrMessage,
  buildInheritedBranchMessage,
  toPrLineThreads,
  type AgentRepoContext,
} from "./prompt";
import { resolveAgentApiKey, getModelContextWindow, supportsImageInput } from "./model";
import { forgeFor, isForgeApiError, type Forge } from "./forge";
import type { PullRequestRef } from "./pr";
import type { RepoProviderId } from "@/lib/repo-providers";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { syncIssuePlanStates } from "./plan-sync";
import { executeIssueTool, ISSUE_TOOL_NAMES, type IssueToolContext } from "./issue-tools";
import {
  executeNotebookTool,
  NOTEBOOK_TOOL_NAMES,
  type NotebookToolContext,
} from "./notebook-tools";
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
  notifyAgentRun,
  type AgentRun,
  type AgentCheckpoint,
} from "./runs";
import { checkAgentQuota } from "./quota";

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

/**
 * Identité git des commits de l'agent, selon le forge. Côté GitHub on commit sous
 * le bot de l'App (`<slug>[bot]`, rattachable à un vrai compte GitHub) — sinon le
 * contrôle d'auteur de Vercel bloque le déploiement. Ailleurs, identité générique.
 */
async function resolveCommitterIdentity(
  target: RepoCloneTarget,
): Promise<{ name: string; email: string }> {
  if (target.provider === "github") {
    return getGithubBotCommitIdentity(target.token);
  }
  return { name: "minddy agent", email: "agent@minddy.app" };
}

/** Marge (ms) réservée après la boucle pour commit+push+PR+stamp. */
const COMMIT_MARGIN_MS = 25_000;
/** Soft-deadline plancher d'un chunk (si le budget restant est très court). */
const MIN_SOFT_DEADLINE_MS = 20_000;
/** Wall-clock max d'UN TOUR (garde-fou anti-runaway ; réinitialisé à chaque tour). */
const MAX_WALL_CLOCK_MS = 60 * 60_000;
/** Taille max du checkpoint sérialisé. */
const MAX_CHECKPOINT_BYTES = 8_000_000;
/**
 * Images montrées au modèle par TOUR (MIN-111) — même esprit que
 * `MAX_WEB_SEARCHES_PER_TURN` : une maquette ou deux états d'un même écran, c'est
 * ce dont un tour a besoin. Au-delà, `read_attachment` répond sans image.
 */
const MAX_IMAGES_PER_TURN = 2;
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

/** Ancrage des tools « métier » d'un run : ticket minddy ou carnet (MIN-84). */
type ExecToolAnchor =
  | { kind: "issue"; ctx: IssueToolContext }
  | { kind: "notebook"; ctx: NotebookToolContext };

/** Exécuteur du tool `web_search` (null quand le run n'a pas accès au web). */
type WebSearchHandler =
  | ((query: string) => Promise<{ result: unknown; success: boolean }>)
  | null;

/**
 * Les mains de `run_background` (MIN-114) dans LA microVM de ce chunk : la
 * politique (plafond, garde-fou git, offsets, mise en forme) vit dans le module
 * pur `background.ts`, ce runner ne fait que la poser sur la sandbox. `workdir`
 * passe par `resolveWithin` — un `../..` revient au modèle en erreur de tool.
 */
function sandboxBackgroundRunner(sandbox: Sandbox): BackgroundJobRunner {
  return {
    start: ({ jobId, command, workdir }) =>
      startBackground(sandbox, {
        jobId,
        command,
        cwd: workdir ? resolveWithin(REPO_DIR, workdir) : undefined,
      }),
    read: ({ jobId, pid, offset }) =>
      readBackgroundSince(sandbox, { jobId, pid, offset, maxBytes: BACKGROUND_FETCH_BYTES }),
    stop: ({ pid }) => stopBackground(sandbox, pid),
  };
}

/** Les tools « métier » de l'agent : Sandbox (fichiers/commandes/jobs de fond),
    git/PR (`createPr`) et, selon l'ancrage du run, ticket minddy (`issue-tools.ts`)
    ou carnet (`notebook-tools.ts`) — routés par nom. */
function makeExecTool(
  sandbox: Sandbox,
  createPr: CreatePrHandler,
  anchor: ExecToolAnchor,
  webSearch: WebSearchHandler,
  /** Base des seq de fichiers de sortie déposés (tranchée par continuation, comme
      les autres compteurs de run) : deux chunks n'écrasent pas leurs fichiers. */
  outputSeqBase: number,
  /** Registre des jobs de fond du chunk (MIN-114). Tenu par l'appelant : c'est lui
      qui les tue avant chaque push et en fin de chunk. */
  background: BackgroundJobs,
  /** Instructions repo déjà servies (MIN-115) — muté ici, persisté par l'appelant. */
  instructions: InstructionsState,
  /** Fichiers du dépôt édités depuis le dernier type-check (MIN-110). Muté ici,
      lu et vidé par le hook de fin de tour de l'appelant. */
  editedPaths: Set<string>,
): ExecuteAgentTool {
  let outputSeq = 0;
  /** Images déjà montrées au modèle sur ce chunk (plafond MAX_IMAGES_PER_TURN). */
  let imagesUsed = 0;

  /**
   * Plafonne les images renvoyées par un tool (MIN-111), sur le modèle du plafond
   * de `web_search` : au-delà, le résultat repart SANS image, avec une note qui dit
   * pourquoi — un modèle qui rouvre la même maquette à chaque round remplirait le
   * checkpoint sans rien apprendre de plus.
   */
  const capTurnImages = (out: {
    result: unknown;
    success: boolean;
    reason?: string;
    images?: AgentToolImage[];
  }) => {
    const images = out.images ?? [];
    if (images.length === 0) return out;
    const room = MAX_IMAGES_PER_TURN - imagesUsed;
    if (room <= 0) {
      const note = `Image limit reached for this turn (${MAX_IMAGES_PER_TURN} images). Work from the ones you already looked at — the metadata and download_url above still describe this file.`;
      const result =
        out.result && typeof out.result === "object"
          ? { ...(out.result as object), image_omitted: note }
          : { image_omitted: note };
      return { ...out, images: undefined, result };
    }
    imagesUsed += Math.min(room, images.length);
    return { ...out, images: images.slice(0, room) };
  };

  /**
   * Colle au résultat d'un tool d'édition réussi les instructions des SOUS-DOSSIERS
   * qu'il vient de toucher (MIN-115). Codex concatène tout l'arbre à l'amorce ; nous
   * chargeons PARESSEUSEMENT, à la première édition sous un dossier — un monorepo
   * remplirait sinon le budget de conventions de paquets jamais ouverts, au détriment
   * de celles de la racine. Le bloc part dans le RÉSULTAT du tool : l'historique
   * d'amorce, lui, est figé par le checkpoint. La règle (une lecture par chemin et
   * par run, budget global) vit dans `repo-instructions.ts` ; ici il n'y a que la
   * sandbox. Best-effort — un `AGENTS.md` illisible ne casse pas l'édition.
   *
   * Le bloc passe EN TÊTE de l'objet : le résultat entier traverse `headTail`, qui
   * élide le MILIEU — la tête survit, et un gros diff en queue aussi.
   */
  const withTouchedInstructions = async (
    res: { result: unknown; success: boolean },
    paths: string[],
  ): Promise<{ result: unknown; success: boolean }> => {
    if (!res.success) return res;
    // Entonnoir unique de TOUTE édition réussie (edit_file, write_file, move_file,
    // apply_edits, apply_patch) : c'est ici qu'on note ce que le tour a touché,
    // pour le type-check de fin de tour (MIN-110).
    for (const path of paths) if (path) editedPaths.add(path);
    const block = await collectTouchedInstructions(
      paths.filter(Boolean),
      instructions,
      (path) => readWorkFile(sandbox, path).catch(() => null),
    ).catch((err) => {
      console.error("[agent-execute] subdir instructions failed:", (err as Error).message);
      return null;
    });
    if (!block) return res;
    if (typeof res.result === "string") {
      return { ...res, result: `${block}\n\n${res.result}` };
    }
    return { ...res, result: { repo_instructions: block, ...(res.result as object) } };
  };

  return async (name, args) => {
    if (anchor.kind === "issue" && ISSUE_TOOL_NAMES.has(name)) {
      return capTurnImages(await executeIssueTool(anchor.ctx, name, args));
    }
    if (anchor.kind === "notebook" && NOTEBOOK_TOOL_NAMES.has(name)) {
      return await executeNotebookTool(anchor.ctx, name, args);
    }
    switch (name) {
      case "web_search": {
        const query = String(args.query ?? "").trim();
        if (!query) return { result: { error: "query is required" }, success: false };
        if (!webSearch) {
          return { result: { error: "Web search is not available on this run." }, success: false };
        }
        return await webSearch(query);
      }
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
          fixedStrings: args.fixed_strings === true,
          context: toNum(args.context),
          headLimit: toNum(args.head_limit),
        });
        if (!r.ok) {
          return { result: { error: `grep failed: ${r.error || "invalid pattern or options"}` }, success: false };
        }
        // Motif relancé en littéral : on le DIT, sinon le modèle ne saurait pas
        // que ce qu'il croyait être une regex a été cherché tel quel (MIN-109).
        const note = r.retriedAsLiteral ? `${LITERAL_RETRY_NOTE}\n` : "";
        return { result: note + (r.output || "(no matches)"), success: true };
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
          return await withTouchedInstructions(
            {
              result: {
                path,
                additions: edit.additions,
                deletions: edit.deletions,
                diff: cap(edit.diff, EDIT_DIFF_CAP),
              },
              success: true,
            },
            [path],
          );
        } catch (err) {
          return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
        }
      }
      case "write_file": {
        const path = String(args.path ?? "");
        await writeWorkFile(sandbox, path, String(args.content ?? ""));
        return await withTouchedInstructions({ result: `Wrote ${path}`, success: true }, [path]);
      }
      case "move_file": {
        const to = String(args.to ?? "");
        await moveWorkFile(sandbox, String(args.from ?? ""), to);
        return await withTouchedInstructions(
          { result: `Moved ${args.from} → ${to}`, success: true },
          [to],
        );
      }
      case "delete_file": {
        const path = String(args.path ?? "");
        await deleteWorkFile(sandbox, path);
        // Supprimer un fichier casse des types tout aussi bien qu'en éditer un ;
        // il ne passe pas par `withTouchedInstructions` (rien à charger pour un
        // fichier qui n'est plus là), d'où la note ici.
        if (path) editedPaths.add(path);
        return { result: `Deleted ${args.path}`, success: true };
      }
      case "apply_edits": {
        const changes = Array.isArray(args.changes) ? (args.changes as Array<Record<string, unknown>>) : [];
        if (changes.length === 0) {
          return { result: { error: "No changes provided." }, success: false };
        }
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
        // `success` = « au moins un changement est passé » (MIN-109). Avec `every`,
        // un batch de 6 fichiers dont 5 réussissent était compté ÉCHEC — un taux
        // d'échec de 42 % qui ne mesurait rien. Le détail par changement dit déjà
        // quoi reprendre ; `counts` le rend lisible d'un coup d'œil.
        const okCount = applied.filter((r) => r.ok === true).length;
        return await withTouchedInstructions(
          {
            result: { applied, counts: { ok: okCount, failed: applied.length - okCount } },
            success: okCount > 0,
          },
          applied.filter((r) => r.ok === true).map((r) => String(r.move_to ?? r.path ?? "")),
        );
      }
      case "apply_patch": {
        // Le format `apply_patch` de Codex/OpenCode (MIN-115), servi aux modèles
        // `gpt-*` à la PLACE d'edit_file/apply_edits/write_file. `patch.ts` parse
        // et traduit en substitutions ; l'application reste la cascade d'edit.ts.
        // Un patch illisible revient en erreur de tool : le modèle lit pourquoi et
        // corrige au round suivant, sans qu'aucun fichier n'ait été touché.
        let ops: PatchOp[];
        try {
          ops = parsePatch(String(args.patch ?? args.patchText ?? ""));
        } catch (err) {
          return {
            result: { error: err instanceof Error ? err.message : String(err) },
            success: false,
          };
        }
        const applied: Array<Record<string, unknown>> = [];
        for (const op of ops) {
          try {
            if (op.op === "delete") {
              await deleteWorkFile(sandbox, op.path);
              applied.push({ path: op.path, op: "delete", ok: true });
            } else if (op.op === "add") {
              const existing = await readWorkFile(sandbox, op.path);
              if (existing !== null) {
                throw new Error(
                  `File already exists: ${op.path}. Use '*** Update File: ${op.path}' to change it.`,
                );
              }
              await writeWorkFile(sandbox, op.path, op.content);
              applied.push({ path: op.path, op: "add", ok: true });
            } else {
              const original = await readWorkFile(sandbox, op.path);
              if (original === null) {
                throw new Error(
                  `File not found: ${op.path}. Use '*** Add File: ${op.path}' to create it.`,
                );
              }
              const edited = applyPatchEdits(op.path, original, op.edits);
              if (op.moveTo) {
                // Renommage d'abord (git mv, pour que la PR le capture), contenu ensuite.
                await moveWorkFile(sandbox, op.path, op.moveTo);
                await writeWorkFile(sandbox, op.moveTo, edited.content);
                applied.push({
                  path: op.path,
                  op: "move",
                  ok: true,
                  move_to: op.moveTo,
                  additions: edited.additions,
                  deletions: edited.deletions,
                });
              } else {
                await writeWorkFile(sandbox, op.path, edited.content);
                applied.push({
                  path: op.path,
                  op: "update",
                  ok: true,
                  additions: edited.additions,
                  deletions: edited.deletions,
                });
              }
            }
          } catch (err) {
            applied.push({
              path: op.path,
              op: op.op,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        // Même règle que `apply_edits` (MIN-109) : `success` = « au moins une
        // section est passée ». Le détail par fichier dit quoi reprendre.
        const okCount = applied.filter((r) => r.ok === true).length;
        return await withTouchedInstructions(
          {
            result: { applied, counts: { ok: okCount, failed: applied.length - okCount } },
            success: okCount > 0,
          },
          applied.filter((r) => r.ok === true).map((r) => String(r.move_to ?? r.path ?? "")),
        );
      }
      case "run_command": {
        const command = String(args.command ?? "");
        // Garde-fou git (MIN-108) : la règle « le harness possède git » est
        // EXÉCUTÉE ici, plus seulement dite dans le prompt. Refus = erreur de
        // tool, sans toucher au Sandbox — le round continue et le modèle lit
        // pourquoi. `reason` rend le refus mesurable sur agent_run_events.
        const verdict = checkCommand(command);
        if (!verdict.allowed) {
          return {
            result: { error: verdict.reason },
            success: false,
            reason: FORBIDDEN_COMMAND_REASON,
          };
        }
        // `workdir` (MIN-109) : le modèle préfixait un `cd` dans 13 % des commandes,
        // souvent vers le répertoire courant par défaut. Le chemin passe par
        // resolveWithin — un `../..` sort du dépôt et revient en erreur de tool,
        // pas en throw : le round continue et le modèle corrige.
        let cwd: string | undefined;
        if (args.workdir != null && String(args.workdir).trim() !== "") {
          try {
            cwd = resolveWithin(REPO_DIR, String(args.workdir));
          } catch (err) {
            return {
              result: { error: err instanceof Error ? err.message : String(err) },
              success: false,
            };
          }
        }
        // Le modèle peut RACCOURCIR le timeout, jamais l'allonger : au-delà, la
        // commande mangerait la soft-deadline du chunk.
        const asked = toNum(args.timeout_ms);
        const timeoutMs =
          asked != null && asked > 0
            ? Math.min(Math.floor(asked), RUN_COMMAND_TIMEOUT_MS)
            : RUN_COMMAND_TIMEOUT_MS;
        const r = await runShell(sandbox, command, { cwd, timeoutMs });
        // Sortie longue → la version COMPLÈTE est déposée dans la sandbox (hors
        // dépôt) et reste relisible via read_file/grep. Best-effort : si l'écriture
        // échoue, le modèle reçoit quand même tête ET queue (MIN-107).
        let fullOutputPath: string | null = null;
        if (spillsToDisk(r)) {
          fullOutputPath = await writeToolOutput(
            sandbox,
            toolOutputFileName(command, outputSeqBase + outputSeq++),
            fullOutputDocument(command, r),
          ).catch((err) => {
            console.error("[agent-execute] tool output spill failed:", (err as Error).message);
            return null;
          });
        }
        return {
          result: formatRunCommandResult(r, fullOutputPath),
          success: r.exitCode === 0,
        };
      }
      case "run_background": {
        // Le garde-fou git, le plafond de jobs et les offsets sont dans
        // `background.ts` — y compris le refus des commandes interdites (MIN-108),
        // sans quoi ce tool serait une porte dérobée sur `git push`.
        return await background.handle(args);
      }
      default:
        return { result: `Unknown tool: ${name}`, success: false };
    }
  };
}

/** Lit un fichier d'instructions du dépôt, ou null (absent / illisible). */
async function readInstructionFile(
  sandbox: Sandbox,
  path: string,
): Promise<RepoInstructionFile | null> {
  try {
    const content = await readWorkFile(sandbox, path);
    return content?.trim() ? { path, content } : null;
  } catch {
    return null;
  }
}

/**
 * Lit les instructions du dépôt (AGENTS.md / CLAUDE.md à la racine) et les emballe
 * en un message délimité, ou null s'il n'y en a pas. Lu UNE fois à l'amorce (le
 * checkpoint le transporte ensuite). C'est là qu'un repo déclare ses commandes de
 * build/test, ses conventions et ses interdits — le carburant d'un diff correct.
 * Celles des SOUS-DOSSIERS arrivent plus tard, à la première édition dedans
 * (MIN-115) — cf. `makeExecTool`.
 */
async function readRepoInstructions(
  sandbox: Sandbox,
): Promise<{ message: string; bytes: number } | null> {
  const files: RepoInstructionFile[] = [];
  for (const name of REPO_INSTRUCTION_FILES) {
    const file = await readInstructionFile(sandbox, name);
    if (file) files.push(file);
  }
  return formatBootInstructions(files);
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

async function loadIssueContext(run: AgentRun, issueId: string): Promise<IssueContext> {
  const service = getServiceClient();
  const [{ data: issue }, { data: project }, { data: attachmentRows }] = await Promise.all([
    service
      .from("issues")
      .select("number, title, description, plan")
      .eq("id", issueId)
      .maybeSingle(),
    service.from("projects").select("key, name").eq("id", run.project_id).maybeSingle(),
    service
      .from("attachments")
      .select("id, file_name, mime_type, size_bytes")
      .eq("issue_id", issueId)
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

/** Contexte projet d'un run CARNET (MIN-84) : pas de ticket, juste le projet. */
async function loadProjectContext(
  projectId: string,
): Promise<{ key: string; name: string | null }> {
  const service = getServiceClient();
  const { data } = await service
    .from("projects")
    .select("key, name")
    .eq("id", projectId)
    .maybeSingle();
  return {
    key: (data as { key?: string } | null)?.key ?? "PROJECT",
    name: (data as { name?: string } | null)?.name ?? null,
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
  // Un run CARNET n'hérite jamais (pas de lignée) : rien à raconter.
  if (!run.issue_id) return null;
  const issueId = run.issue_id;
  if (run.pr_number == null) {
    // Pas de PR : la branche héritée porte-t-elle du travail d'une session
    // précédente ? (Une branche neuve stampée par un premier chunk crashé, non.)
    if (!run.branch_name) return null;
    const inherited = await branchHasPriorRun(
      issueId,
      run.branch_name,
      run.created_at,
    ).catch(() => false);
    if (!inherited) return null;
    const previousSummary = await previousRunSummaryForIssue(issueId, run.id).catch(
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
    previousRunSummaryForIssue(issueId, run.id).catch(() => null),
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
  // Direct du fil : le texte du round pendant qu'il s'écrit, diffusé sur le topic
  // du run. Rien en base — le fil ouvert l'affiche, les autres n'en savent rien.
  const emitLive: EmitAgentLive = (progress) =>
    broadcastRunStream(run.id, { ...progress, at: Date.now() });
  let sandbox: Sandbox | null = null;
  // Jobs de fond du chunk (MIN-114), visibles du `finally` : quel que soit le
  // chemin de sortie (fin de tour, erreur, interruption), rien ne survit au chunk.
  let backgroundJobs: BackgroundJobs | null = null;

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

    // Ancrage du run : ticket minddy, ou CARNET (MIN-84, issue_id null) — la note
    // du lanceur (run.prompt) est alors l'instruction, le projet le seul ancrage.
    const issue = run.issue_id ? await loadIssueContext(run, run.issue_id) : null;
    const project = issue
      ? { key: issue.projectKey, name: issue.projectName }
      : await loadProjectContext(run.project_id);
    // Référence lisible du run dans les messages de commit (`wip(...)`).
    const commitRef = issue?.identifier ?? "note";
    // Langue du commentaire + du résumé de l'agent = celle du lanceur (défaut owner).
    const commentLocale = await resolveRunLocale(run);
    const baseBranch = run.base_branch ?? target.defaultBranch;
    const workBranch =
      run.branch_name ??
      (issue
        ? `minddy/agent/${slugForBranch(issue.identifier)}-${run.id.slice(0, 8)}`
        : `minddy/agent/note-${run.id.slice(0, 8)}`);

    // Sandbox : réveille la microVM (filesystem restauré depuis le snapshot
    // persistant → reprise rapide) ; sinon `onCreate` clone la branche de travail.
    // Nom déterministe → même microVM/snapshot d'un tour à l'autre.
    const { sandbox: sb } = await getOrCreateAgentSandbox({
      name: `agent-${run.id}`,
      onCreate: async (fresh) => {
        const committer = await resolveCommitterIdentity(target);
        await cloneRepo(fresh, { authUrl: target.authUrl, baseBranch, workBranch, committer });
      },
    });
    sandbox = sb;

    // Persiste l'identité du Sandbox + la base AVANT la boucle (reprise si crash).
    // sandbox_stopped_at:null → la microVM est de nouveau vivante (le reaper l'ignore).
    //
    // `branch_name`, lui, attend le PREMIER PUSH RÉEL (MIN-123, `noteBranchPushed`
    // plus bas) : tant que rien n'est poussé, la branche n'existe que dans la
    // microVM, et les surfaces qui lisent une branche (vue diff, héritage de
    // lignée, ménage des branches) ne doivent pas en désigner une qui n'est pas
    // sur le dépôt. Le nom, lui, est déterministe — un chunk suivant le retrouve
    // sans avoir besoin de le relire en base.
    await stampRun(run.id, {
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      base_branch: baseBranch,
    });

    // La branche est-elle DÉJÀ sur le remote ? Vrai quand la run hérite d'une
    // lignée (`launchAgentRun` ne transmet que des branches poussées) ou qu'un
    // chunk précédent a poussé. Sert à ne stamper qu'une fois.
    let branchStamped = run.branch_name != null;
    /**
     * Enregistre la branche de travail au premier push qui a VRAIMENT eu lieu :
     * c'est ce push qui la crée sur le dépôt, donc c'est lui qui la fait exister
     * pour l'app. Un push sauté (rien de commité) ne stampe rien.
     */
    const noteBranchPushed = async (pushed: { pushed: boolean } | null): Promise<void> => {
      if (!pushed?.pushed || branchStamped) return;
      // Best-effort : le travail est DÉJÀ sur le dépôt à ce stade — un stamp raté
      // ne doit pas faire échouer un tour abouti. Le prochain push réessaie.
      const stamped = await stampRun(run.id, { branch_name: workBranch }).catch((err) => {
        console.error("[agent-execute] branch stamp failed:", (err as Error).message);
        return null;
      });
      branchStamped = stamped != null;
    };

    // Baseline du « diff par tour » (MIN-46, event `files_changed`) : HEAD à l'entrée
    // du chunk. `filesFromSha` est le point depuis lequel la fin de tour diffe — le
    // dernier sha émis (persisté dans le checkpoint, survit aux chunks WIP), ou ce
    // baseline au tout premier chunk du run (« rien de changé encore »).
    const baselineHead = await revParseHead(sandbox);
    const filesFromSha = run.checkpoint?.lastFilesSha ?? baselineHead;

    // Endpoint du run (BYOK de l'utilisateur, ou clé plateforme OpenRouter).
    // Résolu AVANT l'amorce de l'historique : le prompt système ne décrit que les
    // tools réellement offerts, et web_search en dépend.
    const { apiKey, baseUrl, provider } = await resolveAgentApiKey(run.created_by);

    // Recherche web : réservée aux runs qui parlent à OpenRouter (quota minddy ou
    // BYOK OpenRouter — la recherche part alors sur la MÊME clé que le run, donc
    // sur la même facture). Ailleurs le tool n'est pas offert (cf. agentToolsFor).
    // Plafond par chunk, et une ligne `web_search` au ledger par recherche.
    const webSearchAllowed = provider === "openrouter" && (await isWebSearchEnabled());
    let webSearchesUsed = 0;
    const webSearch: WebSearchHandler = webSearchAllowed
      ? async (query: string) => {
          if (webSearchesUsed >= MAX_WEB_SEARCHES_PER_TURN) {
            return {
              result: {
                error: `Web search limit reached for this turn (${MAX_WEB_SEARCHES_PER_TURN} searches). Work with what you already found.`,
              },
              success: false,
            };
          }
          // `seq` unique dans le run : le compteur repart à zéro à chaque chunk,
          // d'où la tranche par continuation (même règle que sandbox_compute).
          const seq =
            WEB_SEARCH_SEQ_BASE +
            run.continuations * MAX_WEB_SEARCHES_PER_TURN +
            webSearchesUsed;
          webSearchesUsed++;
          return await runWebSearchTool({
            query,
            apiKey,
            runId: run.run_id ?? run.id,
            seq,
            userId: run.created_by,
            projectId: run.project_id,
          });
        }
      : null;

    // Le modèle du run VOIT-IL les images (MIN-111) ? Résolu ici, avant l'amorce,
    // pour la même raison que web_search : le prompt ne doit décrire que ce que le
    // run sait vraiment faire. C'est aussi ce qui autorise `read_attachment` à
    // renvoyer une maquette au lieu de sa fiche signalétique.
    const imageInput = await supportsImageInput(run.model, provider, apiKey).catch(() => false);

    // Rehydrate ou amorce l'historique. L'amorce est CONVERSATIONNELLE : contexte
    // (dépôt + ticket) puis, en DERNIER message utilisateur, la demande réelle du
    // lanceur — l'agent répond à elle, le ticket n'est que son ancrage.
    let messages: AgentChatMessage[];
    let usageSeqStart = run.checkpoint?.usageSeq ?? run.continuations * 1000;
    // Instructions repo déjà servies : reprises du checkpoint sur un tour éclaté en
    // plusieurs chunks, sinon vides — l'amorce les remplit juste en dessous (MIN-115).
    const instructions: InstructionsState = {
      paths: [...(run.checkpoint?.instructions?.paths ?? [])],
      bytes: run.checkpoint?.instructions?.bytes ?? 0,
    };
    if (run.checkpoint?.messages?.length) {
      messages = run.checkpoint.messages;
    } else {
      const system = buildAgentSystemPrompt({
        locale: commentLocale,
        anchor: issue ? "issue" : "notebook",
        webSearch: webSearchAllowed,
        applyPatch: usesApplyPatch(run.model),
        images: imageInput,
      });
      const contextMsg = issue
        ? buildAgentContextMessage({
            issue: {
              identifier: issue.identifier,
              title: issue.title,
              description: issue.description,
              plan: issue.plan,
            },
            repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
            projectName: issue.projectName,
            attachments: issue.attachments,
            images: imageInput,
          })
        : buildNotebookContextMessage({
            repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
            projectName: project.name,
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
      // La racine est TOUJOURS marquée vue, trouvée ou non : ce qui suit ne recharge
      // que les sous-dossiers, à la première édition dedans (MIN-115).
      const repoInstructions = await readRepoInstructions(sandbox);
      instructions.paths.push(...REPO_INSTRUCTION_FILES);
      if (repoInstructions) {
        messages.push({ role: "user", content: repoInstructions.message });
        instructions.bytes += repoInstructions.bytes;
      }
      // La demande du lanceur, en dernier : c'est À ELLE que l'agent répond.
      // Run CARNET : la note part emballée dans la MÊME structure que « copier
      // le prompt » du carnet (balises <notes>, sémantique des cases, « ce sont
      // des notes personnelles, pas une spec — demande avant de deviner »), SANS
      // le bloc MCP : ses tools natifs (read_scratchpad…) le remplacent. La bulle
      // de la conversation affiche `run.prompt` (la note brute) — le wrapper est
      // de la plomberie, pas du contenu utilisateur.
      if (run.prompt?.trim()) {
        messages.push({
          role: "user",
          content: issue
            ? run.prompt.trim()
            : buildScratchpadPrompt(run.prompt.trim(), { mcp: false }),
        });
      }
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
      // Run CARNET : aucun ticket à synchroniser ni à commenter — la PR vit dans
      // la conversation de la session (et sur la page Pull requests).
      if (issue && run.issue_id) {
        if (run.created_by) {
          await syncIssueStatusFromPr({
            issueId: run.issue_id,
            actorId: run.created_by,
            prState: prState.state,
          });
        }
        await postPrComment(run, issue.identifier, kind, pr.url, commentLocale, target.provider);
      }
    };

    /**
     * Tool `create_pr` : la création de PR est une DÉCISION (de l'agent ou de
     * l'utilisateur), plus un automatisme de fin de tour. Pousse d'abord le travail
     * du tour, puis : PR déjà vivante → no-op informatif (le push l'a mise à jour) ;
     * PR refusée → réouverture (règle produit : on réitère la dernière PR, jamais de
     * doublon) ; sinon → création. Une PR mergée n'est jamais réutilisée.
     */
    const createPr: CreatePrHandler = async ({ title, body }) => {
      const prTitle =
        title ||
        (issue
          ? `${issue.identifier}: ${issue.title}`
          : // Run carnet : la première ligne de la note fait office de titre.
            commitMessageFromReply(run.prompt ?? "", commitRef));
      const fresh = (await resolveRepoCloneTarget(run.project_id).catch(() => null)) ?? target;
      let pushed: Awaited<ReturnType<typeof commitAndPush>>;
      try {
        pushed = await commitAndPush(sb, {
          authUrl: fresh.authUrl,
          workBranch,
          baseBranch,
          message: prTitle,
        });
      } catch (err) {
        return { result: { error: `push failed: ${(err as Error).message}` }, success: false };
      }
      // Rien de commité par-dessus la base : on s'arrête AVANT de toucher au dépôt
      // (MIN-123). Pousser créerait une branche vide pour rien — et la forge
      // refuserait la PR (422) juste après, en la laissant derrière elle.
      if (!pushed.pushed) {
        return {
          result: {
            error:
              "Nothing to open a pull request for: this session hasn't changed any file yet. Do the work first, then call create_pr.",
          },
          success: false,
        };
      }
      await noteBranchPushed(pushed);
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
      const prBody = `${body?.trim() || prTitle}\n\n---\n🤖 Généré par l'agent numo (minddy) · ${issue ? `issue ${issue.identifier}` : "note du carnet"}`;
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

    // Fenêtre de contexte du modèle (OpenRouter) → seuil de compaction adapté.
    const contextWindow = await getModelContextWindow(run.model, provider, apiKey).catch(() => null);

    // Budget du chunk : temps restant du drain − marge, borné par la config.
    const elapsedSetup = Date.now() - callStart;
    const softDeadlineMs = Math.max(
      MIN_SOFT_DEADLINE_MS,
      Math.min(opts.deadlineMs - elapsedSetup - COMMIT_MARGIN_MS, AGENT_SOFT_DEADLINE_MS),
    );

    // Ancrage des tools métier : ticket (issue-tools) ou carnet (notebook-tools).
    const toolAnchor: ExecToolAnchor =
      issue && run.issue_id
        ? {
            kind: "issue",
            ctx: {
              issueId: run.issue_id,
              projectId: run.project_id,
              projectKey: issue.projectKey,
              actorId: run.created_by,
              imageInput,
            },
          }
        : {
            kind: "notebook",
            ctx: {
              userId: run.created_by,
              projectId: run.project_id,
              projectKey: project.key,
            },
          };

    // Jobs de fond du chunk (MIN-114). Ils meurent AVANT chaque push (un watcher
    // qui écrit pendant le `git add -A` commiterait n'importe quoi) et de toute
    // façon en fin de chunk (`finally`) : un processus oublié mangerait la microVM
    // jusqu'au reaper, et serait encore là au tour suivant sans que le modèle le
    // sache. Le registre ne survit pas au chunk — c'est assumé, et le tool le dit.
    const background = new BackgroundJobs(
      sandboxBackgroundRunner(sandbox),
      run.continuations * 1000,
    );
    backgroundJobs = background;

    // Fichiers édités depuis le dernier type-check (MIN-110). Vidé à chaque check :
    // un tour qui ne touche à rien après coup n'en relance pas un second.
    const editedPaths = new Set<string>();
    /**
     * Type-check de fin de tour. Se tait — et coûte alors un aller-retour shell de
     * ~1 ms — dès que l'une des conditions manque : rien d'édité, pas de
     * `tsconfig.json`, pas de `node_modules/.bin/tsc`, ou pas assez de budget mural
     * pour absorber un check à froid (mesuré 22 s, cf. §3.3 du comparatif). Sinon,
     * les erreurs partent au modèle et le tour repart (une fois — plafond tenu par
     * la boucle). Best-effort de bout en bout : une panne du checker ne doit jamais
     * empêcher un tour de se terminer.
     */
    /** Le tour a-t-il édité le dépôt ? Verrou LATCHÉ, là où `editedPaths` se vide
     *  à chaque type-check : après une relance, le tour a toujours édité, même si
     *  le modèle n'a plus rien touché depuis. */
    let repoTouched = false;
    /** L'auto-relecture ne passe qu'UNE fois par chunk : elle sert à faire relire
     *  le tour avant la réponse, pas à commenter chaque correctif qui suit. */
    let selfReviewed = false;

    /**
     * Type-check de fin de tour. Se tait — et coûte alors un aller-retour shell de
     * ~1 ms — dès que l'une des conditions manque : rien d'édité, pas de
     * `tsconfig.json`, pas de `node_modules/.bin/tsc`, ou pas assez de budget mural
     * pour absorber un check à froid (mesuré 22 s, cf. §3.3 du comparatif). Sinon,
     * les erreurs partent au modèle et le tour repart (plafond tenu par la boucle).
     * Best-effort de bout en bout : une panne du checker ne doit jamais empêcher un
     * tour de se terminer.
     */
    const typeCheckBlock = async (budgetMs: number): Promise<string | null> => {
      if (editedPaths.size === 0 || budgetMs < TYPECHECK_MIN_BUDGET_MS) return null;
      const touched = [...editedPaths];
      editedPaths.clear();
      const startedAt = Date.now();
      const block = await typeErrorsForTurn(sb, touched).catch((err) => {
        console.error("[agent-execute] turn-end typecheck failed:", (err as Error).message);
        return null;
      });
      // Event `status` (neutre : invisible dans le fil, comptable en base) — c'est
      // lui qui répond à « combien de tours se terminent avec des erreurs de typage
      // introduites par l'agent ? », la mesure que R4 réclamait. `errorsShown` est
      // le compte des erreurs SERVIES (le bloc est capé) : ce que le modèle a lu,
      // pas ce que tsc a trouvé.
      await emit("status", {
        phase: "type_check",
        durationMs: Date.now() - startedAt,
        files: touched.length,
        errorsShown: block ? block.split("\n").filter((l) => /error TS\d+/.test(l)).length : 0,
      });
      return block;
    };

    /**
     * Auto-relecture de fin de tour : le diff du tour, injecté avant que l'agent ne
     * réponde (cf. self-review.ts pour le pourquoi). Deux commandes git en lecture
     * seule — l'index n'est jamais touché, la fin de tour reste seule à stager.
     *
     * `filesFromSha` est la même baseline que le diff par tour émis au feed : elle
     * couvre le travail poussé en WIP au milieu du chunk aussi bien que ce qui
     * dort encore dans l'arbre de travail.
     */
    const selfReviewBlock = async (budgetMs: number): Promise<string | null> => {
      if (selfReviewed || !repoTouched || budgetMs < SELF_REVIEW_MIN_BUDGET_MS) return null;
      selfReviewed = true;
      const startedAt = Date.now();
      const { diff, porcelain } = await turnDiff(sb, filesFromSha).catch(() => ({
        diff: "",
        porcelain: "",
      }));
      const block = formatSelfReview({ diff, porcelain });
      await emit("status", {
        phase: "self_review",
        durationMs: Date.now() - startedAt,
        chars: block?.length ?? 0,
      });
      return block;
    };

    /**
     * Dernier mot du harness. Les erreurs de typage passent AVANT la relecture :
     * elles sont concrètes et bloquantes, et servir un diff par-dessus un dépôt qui
     * ne compile pas noierait le seul signal qui compte.
     */
    const onTurnEnd = async ({ budgetMs }: { budgetMs: number }): Promise<string | null> => {
      if (editedPaths.size > 0) repoTouched = true;
      return (await typeCheckBlock(budgetMs)) ?? (await selfReviewBlock(budgetMs));
    };

    // Budget d'usage RESTANT à l'entrée du chunk. Snapshoté une fois ici : la
    // boucle compare son coût accumulé à ce restant, sans relire l'usage à chaque
    // round. En BYOK, `unlimited` → aucun plafond (l'utilisateur paie sa note).
    const quotaNow = await checkAgentQuota(run.created_by ?? "").catch(() => null);
    const budgetUsd =
      quotaNow && !quotaNow.unlimited ? Math.max(0, quotaNow.remaining ?? 0) : undefined;

    const result = await runAgentLoop({
      messages,
      tools: agentToolsFor({
        anchor: issue ? "issue" : "notebook",
        webSearch: webSearchAllowed,
        model: run.model,
        images: imageInput,
      }),
      model: run.model,
      apiKey,
      baseUrl,
      provider,
      // Figé au lancement (MIN-122) : chaque chunk du run repart du même niveau.
      reasoningLevel: run.reasoning_level,
      runId: run.run_id ?? run.id,
      userId: run.created_by,
      projectId: run.project_id,
      softDeadlineMs,
      budgetUsd,
      contextWindow,
      execTool: makeExecTool(
        sandbox,
        createPr,
        toolAnchor,
        webSearch,
        run.continuations * 1000,
        background,
        instructions,
        editedPaths,
      ),
      onTurnEnd,
      pullSteering: () => pullPendingMessages(run.id),
      // « Interrompre la réponse en cours » : la boucle abandonne l'appel LLM en
      // vol et renvoie `interrupted` (round partiel jeté).
      checkInterrupt: () => readInterruptFlag(run.id),
      // Miroir des états du checklist de l'agent vers le plan de l'issue liée.
      // Run carnet : pas d'issue — le cochage du carnet passe par le tool dédié.
      syncPlan: (steps) =>
        run.issue_id ? syncIssuePlanStates(run.issue_id, steps) : Promise.resolve(),
      emit,
      emitLive,
      usageSeqStart,
    });

    const newCost = run.cost_usd + result.costUsd;
    // `lastFilesSha` amorcé pour TOUTES les mises au repos (ce checkpoint est réutilisé
    // par les chemins WIP/interruption/erreur/budget) : sur le 1er chunk on fixe la
    // baseline, jamais avancée en cours de tour — seule une fin de tour la fait
    // progresser (plus bas). Un chunk ultérieur ne la réinitialise donc pas.
    const checkpoint: AgentCheckpoint = {
      messages: result.messages,
      usageSeq: result.usageSeqEnd,
      lastFilesSha: run.checkpoint?.lastFilesSha ?? baselineHead,
      instructions,
    };
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
      // Chaque entrée au repos REMET l'attente à zéro — seul le tour terminé sur
      // un ask_user (ci-dessous) la lève.
      awaiting_input: false,
    } satisfies Partial<Parameters<typeof stampRun>[1]>;

    // Enregistre le REPOS. Il n'y a plus qu'UN repos (modèle conversationnel) :
    // `completed` — la session attend le prochain message de l'utilisateur dans sa
    // conversation, et ne bloque PLUS le ticket (seuls queued/running l'occupent).
    // Elle reste reprennable à chaud depuis son composer (checkpoint + snapshot).
    // Si un message de steering est arrivé APRÈS la dernière frontière de round
    // (fenêtre de finalisation : commit+push), on RE-QUEUE au lieu de reposer →
    // le drain relance la boucle qui le draine aussitôt.
    // Renvoie `pending` : true = la session repart aussitôt (steering en file) —
    // l'appelant s'en sert pour NE PAS notifier un repos qui n'en est pas un.
    const restStamp = async (
      extra: Partial<Parameters<typeof stampRun>[1]>,
    ): Promise<boolean> => {
      const pending = await hasPendingRunMessages(run.id);
      await stampRun(run.id, {
        status: pending ? "queued" : "completed",
        ...restFields,
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        ...extra,
      });
      return pending;
    };

    // ── Fin de tour NATURELLE : push du travail, PAS de PR automatique ────────
    if (result.status === "completed") {
      const reply = result.reply?.trim() ?? "";
      const freshTarget = await resolveRepoCloneTarget(run.project_id).catch(() => null);
      const authUrl = freshTarget?.authUrl ?? target.authUrl;
      const token = freshTarget?.token ?? target.token;

      // Les jobs de fond meurent AVANT de stager : un serveur de dev ou un watcher
      // encore vivant réécrirait des fichiers pendant le `git add -A`.
      await background.stopAll().catch(() => 0);

      // Pousse ce que le tour a changé — et RIEN si le tour n'a rien changé : la
      // branche n'apparaît sur le dépôt qu'au premier vrai commit (MIN-123). Si la
      // session suit une PR, GitHub la met à jour tout seul — aucune création ici :
      // ouvrir une PR est la décision de l'agent (`create_pr`) ou de l'utilisateur.
      let pushError: string | null = null;
      const pushed = await commitAndPush(sandbox, {
        authUrl,
        workBranch,
        baseBranch,
        message: commitMessageFromReply(reply, commitRef),
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

      await noteBranchPushed(pushed);
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

      // Diff par tour (MIN-46) : émet les fichiers que CE tour a changés, calculés par
      // git dans la sandbox entre la baseline du tour et la tête poussée. Best-effort
      // (n'affecte jamais le repos). `filesToSha` avance la baseline du prochain tour —
      // persistée dans le checkpoint pour que le tour suivant diffe depuis ici.
      let filesToSha = filesFromSha;
      if (pushed?.headSha && pushed.headSha !== filesFromSha) {
        const changed = await changedFiles(sandbox, filesFromSha, pushed.headSha).catch(() => null);
        if (changed && changed.files.length > 0) {
          await emit("files_changed", { files: changed.files, truncated: changed.truncated });
        }
        filesToSha = pushed.headSha;
      }

      // `outcome` = la dernière réponse de la session : c'est elle qu'une future
      // session froide recevra comme résumé du travail précédent.
      const pending = await restStamp({
        checkpoint: { ...checkpoint, lastFilesSha: filesToSha },
        outcome: reply ? cap(reply, 4000) : null,
        // Tour terminé sur un ask_user → la session ATTEND la réponse : point
        // jaune sur les surfaces tant que l'utilisateur n'a pas répondu.
        ...(result.askedUser ? { awaiting_input: true } : {}),
        ...(pushError ? { error_message: cap(pushError, 1000) } : {}),
      });
      // Inbox (MIN-82) : repos réel seulement — un re-queue immédiat (steering
      // en file) n'est pas une fin de tour du point de vue de l'utilisateur.
      if (!pending) {
        await notifyAgentRun(run, result.askedUser ? "agent_question" : "agent_done");
      }
      return "completed";
    }

    // ── interrupted / erreur / suspended : push WIP + persiste le checkpoint ──
    // Même règle qu'en fin de tour : rien ne tourne pendant qu'on stage.
    await background.stopAll().catch(() => 0);
    const wipPushed = await commitAndPush(sandbox, {
      authUrl: target.authUrl,
      workBranch,
      baseBranch,
      message: `wip(${commitRef}): chunk ${run.continuations + 1}`,
    }).catch((err) => {
      // Un push raté ne doit pas perdre le checkpoint (l'état repo se re-poussera au chunk suivant).
      console.error("[agent-execute] WIP push failed:", (err as Error).message);
      return null;
    });
    await noteBranchPushed(wipPushed);
    await reopenIfRejectedWorkPushed(wipPushed, target.token);

    // Budget d'usage épuisé → REPOS, avec la carte qui dit pourquoi et ce qu'on peut
    // faire. Le travail du chunk vient d'être poussé en WIP et le checkpoint est
    // conservé : rien n'est perdu, la session repart d'ici quand le budget revient
    // (rechargement, plan supérieur, ou clé perso).
    //
    // Volontairement PAS `restStamp` : celui-ci re-queue s'il reste des messages de
    // steering en file, ce qui relancerait aussitôt un chunk sans budget. Le message
    // en attente reste en file et sera drainé à la reprise.
    if (result.status === "budget_exhausted") {
      const quota = await checkAgentQuota(run.created_by ?? "").catch(() => null);
      await emit("quota_exhausted", {
        spent: quota?.spent ?? null,
        cap: quota?.cap ?? null,
        resetsAt: quota?.resetsAt ?? null,
        planId: quota?.planId ?? null,
        // null = déjà au sommet de l'échelle : il ne reste qu'attendre, ou le BYOK.
        nextPlanId: quota?.nextPlanId ?? null,
        byok: quota?.mode === "byok",
      });
      await stampRun(run.id, { status: "completed", ...restFields, checkpoint });
      await notifyAgentRun(run, "agent_failed");
      return "completed";
    }

    // Erreur LLM fatale → REPOS reprennable. L'event d'erreur a déjà été émis par la
    // boucle ; le checkpoint (dont un éventuel steering injecté ce round) est conservé
    // → l'utilisateur peut renvoyer un message pour reprendre.
    if (result.status === "error") {
      const pending = await restStamp({
        checkpoint,
        error_message: result.errorMessage ? cap(result.errorMessage, 1000) : null,
      });
      if (!pending) await notifyAgentRun(run, "agent_failed");
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
      const pending = await restStamp({ checkpoint });
      if (!pending) await notifyAgentRun(run, "agent_failed");
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
        await notifyAgentRun(run, "agent_failed");
        return "completed";
      }
      await stampRun(run.id, {
        status: "failed",
        error_message: cap(message, 1000),
        checkpoint: null,
        continuations: 0,
      });
      await notifyAgentRun(run, "agent_failed");
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
    if (!retryForPending) await notifyAgentRun(run, "agent_failed");
    return "completed";
  } finally {
    // Filet des jobs de fond (MIN-114) : les chemins de push les ont déjà tués, mais
    // pas le chemin d'ERREUR mid-tour — et un serveur laissé vivant tiendrait la
    // microVM éveillée jusqu'au reaper. Best-effort, jamais bloquant.
    if (backgroundJobs) await backgroundJobs.stopAll().catch(() => 0);

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
  if (!run.created_by || !run.issue_id) return;
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
