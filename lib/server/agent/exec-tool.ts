import { RUN_COMMAND_TIMEOUT_MS, SUBAGENT_CONTROL_TOOLS } from "./tools";
import { runCommandTimeoutMs } from "./chunk-budget";
import {
  ISSUE_TOOL_NAMES,
  PR_TOOL_NAMES,
  SCRATCHPAD_TOOL_NAMES,
} from "./platform-tool-names";
import {
  readWorkFile,
  readWorkFileWindow,
  writeWorkFile,
  moveWorkFile,
  deleteWorkFile,
  listDir,
  grepRepo,
  globRepo,
  writeToolOutput,
  startBackground,
  readBackgroundSince,
  stopBackground,
  REPO_DIR,
  type GrepOutputMode,
  type RepoHost,
} from "./repo-host";
import {
  BackgroundJobs,
  BACKGROUND_FETCH_BYTES,
  type BackgroundJobRunner,
} from "./background";
import { Subagents } from "./subagent";
import { pruneToolOutputs } from "./prune";
import { resolveWithin } from "./repo-path";
import { LITERAL_RETRY_NOTE } from "./grep-pattern";
import {
  formatRunCommandResult,
  fullOutputDocument,
  spillsToDisk,
  toolOutputFileName,
} from "./command-output";
import { checkCommand, FORBIDDEN_COMMAND_REASON } from "./command-guard";
import { applyEdit } from "./edit";
import { applyPatchEdits, parsePatch, type PatchOp } from "./patch";
import {
  REPO_INSTRUCTION_FILES,
  collectTouchedInstructions,
  formatBootInstructions,
  type InstructionsState,
  type RepoInstructionFile,
} from "./repo-instructions";
import type { ExecuteAgentTool } from "./agent-loop";
import type { AgentToolImage } from "./content";

/**
 * LES 25 TOOLS DE L'AGENT, câblés sur un dépôt (MIN-46) — fichiers, commandes,
 * jobs de fond, édition, délégation, plus le ROUTAGE des tools de plateforme.
 *
 * EXTRAIT D'`execute.ts` PAR MIN-224, et pas pour ranger. Ce module descend dans
 * la microVM avec la boucle : il ne doit donc atteindre ni le client Supabase, ni
 * la forge, ni la moindre variable d'environnement sensible — c'est un invariant
 * tenu par `vm-bundle-secrets.test.ts`. D'où la seule vraie différence avec ce
 * qu'il était : les tools de PLATEFORME (ticket, carnet, pull request, recherche
 * web) ne sont plus exécutés ici mais INJECTÉS.
 *
 * La fonction leur passe l'exécuteur direct (`executeIssueTool`…) ; la microVM
 * leur passe un POST vers le plan de contrôle. Le routage par nom, lui, est le
 * même des deux côtés — et c'est ce qui garantit qu'un tool servi au modèle est
 * exécutable quel que soit le moteur.
 */

/**
 * Un tool de PLATEFORME, exécuté hors du dépôt. Même signature des deux côtés :
 * la fonction appelle l'exécuteur en direct, la microVM passe par le plan de
 * contrôle et rend ce qu'il répond.
 */
export type PlatformToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ result: unknown; success: boolean; images?: AgentToolImage[] }>;


/**
 * Images montrées au modèle par TOUR (MIN-111) — même esprit que
 * `MAX_WEB_SEARCHES_PER_TURN` : une maquette ou deux états d'un même écran, c'est
 * ce dont un tour a besoin. Au-delà, `read_resource` répond sans image.
 */
export const MAX_IMAGES_PER_TURN = 2;

/** Cap du diff renvoyé au modèle après une édition (le diff complet n'est pas utile). */
const EDIT_DIFF_CAP = 4000;

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

function toNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Exécuteur du tool `create_pr` (fourni par executeAgentRun, qui a le contexte git/PR). */
export type CreatePrHandler = (args: {
  title: string;
  body?: string;
}) => Promise<{ result: unknown; success: boolean }>;

/** Exécuteur du tool `web_search` (null quand le run n'a pas accès au web). */
export type WebSearchHandler =
  | ((query: string) => Promise<{ result: unknown; success: boolean }>)
  | null;

/**
 * Refus d'un tool absent du jeu de l'appelant (MIN-112). Un sous-agent ne devrait
 * jamais y arriver (le tool n'est pas dans son schéma) mais un modèle en invente
 * parfois un qu'il a vu ailleurs, et un vieux checkpoint peut porter un système qui
 * le décrit : mieux vaut un refus qui DIT pourquoi qu'un « Unknown tool » qui laisse
 * le modèle retenter au round suivant.
 */
function subagentDenied(name: string, why: string): { result: unknown; success: boolean } {
  return {
    result: {
      error: `You do not have the ${name} tool: ${why}. Do the part you can, then report it.`,
    },
    success: false,
  };
}

/**
 * Les mains de `run_background` (MIN-114) dans LA microVM de ce chunk : la
 * politique (plafond, garde-fou git, offsets, mise en forme) vit dans le module
 * pur `background.ts`, ce runner ne fait que la poser sur la sandbox. `workdir`
 * passe par `resolveWithin` — un `../..` revient au modèle en erreur de tool.
 */
export function repoBackgroundRunner(host: RepoHost): BackgroundJobRunner {
  return {
    start: ({ jobId, command, workdir }) =>
      startBackground(host, {
        jobId,
        command,
        cwd: workdir ? resolveWithin(REPO_DIR, workdir) : undefined,
      }),
    read: ({ jobId, pid, offset }) =>
      readBackgroundSince(host, { jobId, pid, offset, maxBytes: BACKGROUND_FETCH_BYTES }),
    stop: ({ pid }) => stopBackground(host, pid),
  };
}

/**
 * Ce dont un exec-tool a besoin. Un objet plutôt qu'une liste de positions : depuis
 * les sous-agents (MIN-112) il y a DEUX exec-tools par chunk, celui du parent et
 * celui d'une fille, et ils ne diffèrent que par une poignée de champs — nullables
 * ici, structurellement absents là-bas.
 */
export interface ExecToolConfig {
  host: RepoHost;
  /** null = pas de livraison (jeu d'un sous-agent : la PR appartient au parent). */
  createPr: CreatePrHandler | null;
  /** Écritures sur la pull request RELUE (MIN-168). null hors session de
   *  relecture : ces trois tools ne sont alors ni offerts ni exécutables. */
  prTool: PlatformToolHandler | null;
  /** null = pas de tools ticket (idem : le ticket appartient au parent). */
  issueTool: PlatformToolHandler | null;
  /** null = pas de tools carnet. */
  scratchpadTool: PlatformToolHandler | null;
  webSearch: WebSearchHandler;
  /** Base des seq de fichiers de sortie déposés (tranchée par continuation, comme
      les autres compteurs de run) : deux chunks n'écrasent pas leurs fichiers — et
      deux exec-tools d'un même chunk non plus (cf. `toolOutputFileName`). */
  outputSeqBase: number;
  /** Registre des jobs de fond du chunk (MIN-114). Tenu par l'appelant : c'est lui
      qui les tue avant chaque push et en fin de chunk. null = pas de jobs de fond. */
  background: BackgroundJobs | null;
  /** Instructions repo déjà servies (MIN-115) — muté ici, persisté par l'appelant.
      PROPRE à chaque exec-tool : partager celui du parent marquerait un `AGENTS.md`
      « déjà servi » alors qu'il ne l'a été qu'à une fille, dont le contexte meurt
      avec elle — le parent ne le lirait jamais. */
  instructions: InstructionsState;
  /** Fichiers du dépôt édités depuis le dernier type-check (MIN-110). Muté ici,
      lu et vidé par le hook de fin de tour de l'appelant. PARTAGÉ avec les
      sous-agents : c'est ce que le type-check de fin de tour lit, et une fille qui
      casse un type doit le faire dire. */
  editedPaths: Set<string>;
  /** Registre des sous-agents du chunk (MIN-112). null = jeu d'un sous-agent (la
      hiérarchie est à un niveau) ou vieux checkpoint qui appelle encore ces tools. */
  subagents: Subagents | null;
  /** Ce qu'il reste du budget TEMPS du chunk (MIN-214) — la même horloge que celle
      qui borne un sous-agent. Elle borne aussi le timeout d'un `run_command` : sans
      elle, une commande entamée juste avant la soft-deadline allait au bout de ses
      180 s et la fonction mourait avant d'écrire le checkpoint. PARTAGÉE avec les
      filles : c'est l'horloge du CHUNK, celle que la plateforme tue. */
  chunkRemainingMs: () => number;
}

/** Les tools « métier » de l'agent : Sandbox (fichiers/commandes/jobs de fond),
    git/PR (`createPr`), tickets minddy (`issue-tools.ts`), carnet du lanceur
    (`scratchpad-tools.ts`) et délégation (`subagent.ts`) — routés par nom. Les
    tools minddy sont servis aux DEUX ancrages (MIN-125) : l'ancrage ne pilote plus
    que la cible par défaut des tools ticket, portée par leur contexte. */
export function makeExecTool(cfg: ExecToolConfig): ExecuteAgentTool {
  const {
    host,
    createPr,
    prTool,
    issueTool,
    scratchpadTool,
    webSearch,
    outputSeqBase,
    background,
    instructions,
    editedPaths,
    subagents,
    chunkRemainingMs,
  } = cfg;
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
      (path) => readWorkFile(host, path).catch(() => null),
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

  return async (name, args, callId) => {
    // Verrou d'écriture de la sandbox PARTAGÉE (MIN-112). Le parent qui continue
    // d'éditer pendant qu'une fille écrit est exactement le même risque que deux
    // filles simultanées, dans un dépôt dont la fin de tour fait `git add -A`. La
    // décision vit dans `subagent.ts` (module de politique, testable) ; ici il n'y a
    // que le branchement. La lecture et `run_command` restent ouverts.
    const locked = subagents?.writeLock(name);
    if (locked) return locked;
    if (ISSUE_TOOL_NAMES.has(name)) {
      if (!issueTool) return subagentDenied(name, "minddy tickets belong to the parent session");
      return capTurnImages(await issueTool(name, args));
    }
    if (SCRATCHPAD_TOOL_NAMES.has(name)) {
      if (!scratchpadTool) {
        return subagentDenied(name, "the user's notebook belongs to the parent session");
      }
      return await scratchpadTool(name, args);
    }
    if (PR_TOOL_NAMES.has(name)) {
      if (!prTool) {
        return {
          result: {
            error: `${name} is only available in a pull request review session.`,
          },
          success: false,
        };
      }
      return await prTool(name, args);
    }
    if (SUBAGENT_CONTROL_TOOLS.has(name)) {
      if (!subagents) {
        return subagentDenied(
          name,
          "the sub-agent hierarchy is one level deep, so a sub-agent cannot delegate further",
        );
      }
      if (name === "agent_status") return subagents.status(args);
      if (name === "list_agents") return subagents.list();
      return await subagents.spawn(args, { parentCallId: callId });
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
        if (!createPr) {
          return subagentDenied(
            "create_pr",
            "the pull request belongs to the parent session, which decides when to open it",
          );
        }
        return await createPr({
          title: String(args.title ?? "").trim(),
          body: typeof args.body === "string" ? args.body : undefined,
        });
      }
      case "read_file": {
        const win = await readWorkFileWindow(host, String(args.path ?? ""), {
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
        const content = await listDir(host, args.path ? String(args.path) : ".");
        return { result: content || "(empty)", success: true };
      }
      case "glob": {
        const { files, truncated } = await globRepo(
          host,
          String(args.pattern ?? ""),
          args.path ? String(args.path) : undefined,
        );
        if (files.length === 0) return { result: "(no files matched)", success: true };
        const note = truncated ? `\n… (capped at ${files.length} files)` : "";
        return { result: files.join("\n") + note, success: true };
      }
      case "grep": {
        const r = await grepRepo(host, {
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
        const original = await readWorkFile(host, path);
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
          await writeWorkFile(host, path, edit.content);
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
        await writeWorkFile(host, path, String(args.content ?? ""));
        return await withTouchedInstructions({ result: `Wrote ${path}`, success: true }, [path]);
      }
      case "move_file": {
        const to = String(args.to ?? "");
        await moveWorkFile(host, String(args.from ?? ""), to);
        return await withTouchedInstructions(
          { result: `Moved ${args.from} → ${to}`, success: true },
          [to],
        );
      }
      case "delete_file": {
        const path = String(args.path ?? "");
        await deleteWorkFile(host, path);
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
              await deleteWorkFile(host, path);
              applied.push({ path, op, ok: true });
            } else if (op === "move") {
              const to = String(ch.move_to ?? "");
              await moveWorkFile(host, path, to);
              applied.push({ path, op, ok: true, move_to: to });
            } else if (op === "add") {
              await writeWorkFile(host, path, String(ch.content ?? ""));
              applied.push({ path, op, ok: true });
            } else {
              // update : applique tous les edits en mémoire, puis écrit une fois (atomique/fichier).
              const original = await readWorkFile(host, path);
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
              await writeWorkFile(host, path, content);
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
              await deleteWorkFile(host, op.path);
              applied.push({ path: op.path, op: "delete", ok: true });
            } else if (op.op === "add") {
              const existing = await readWorkFile(host, op.path);
              if (existing !== null) {
                throw new Error(
                  `File already exists: ${op.path}. Use '*** Update File: ${op.path}' to change it.`,
                );
              }
              await writeWorkFile(host, op.path, op.content);
              applied.push({ path: op.path, op: "add", ok: true });
            } else {
              const original = await readWorkFile(host, op.path);
              if (original === null) {
                throw new Error(
                  `File not found: ${op.path}. Use '*** Add File: ${op.path}' to create it.`,
                );
              }
              const edited = applyPatchEdits(op.path, original, op.edits);
              if (op.moveTo) {
                // Renommage d'abord (git mv, pour que la PR le capture), contenu ensuite.
                await moveWorkFile(host, op.path, op.moveTo);
                await writeWorkFile(host, op.moveTo, edited.content);
                applied.push({
                  path: op.path,
                  op: "move",
                  ok: true,
                  move_to: op.moveTo,
                  additions: edited.additions,
                  deletions: edited.deletions,
                });
              } else {
                await writeWorkFile(host, op.path, edited.content);
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
        // Commande vide (MIN-204) : `sh -c ""` rend exit 0 et une sortie vide,
        // que le modèle lit comme « la suite de tests est passée ». Le refus est
        // ici en second rideau — la boucle rejette déjà les arguments illisibles —
        // et attrape aussi l'argument bien formé mais mal nommé.
        if (!command.trim()) return { result: { error: "command is required" }, success: false };
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
        // Le modèle peut RACCOURCIR le timeout, jamais l'allonger — et le RESTANT du
        // chunk le raccourcit à son tour (MIN-214). Le plafond seul ne bornait que
        // la commande, pas le round : une commande lancée juste avant la
        // soft-deadline allait au bout de ses 180 s, la fonction était tuée avant
        // d'écrire le checkpoint, et tout le chunk partait avec.
        const timeoutMs = runCommandTimeoutMs(
          toNum(args.timeout_ms),
          chunkRemainingMs(),
          RUN_COMMAND_TIMEOUT_MS,
        );
        const r = await host.exec(command, { cwd, timeoutMs });
        // Sortie longue → la version COMPLÈTE est déposée dans la sandbox (hors
        // dépôt) et reste relisible via read_file/grep. Best-effort : si l'écriture
        // échoue, le modèle reçoit quand même tête ET queue (MIN-107).
        let fullOutputPath: string | null = null;
        if (spillsToDisk(r)) {
          fullOutputPath = await writeToolOutput(
            host,
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
        if (!background) {
          return subagentDenied(
            "run_background",
            "background jobs are held by the parent session, which kills them at the end of the turn — a job you left running would keep the machine awake with nobody watching it",
          );
        }
        return await background.handle(args);
      }
      default:
        return { result: `Unknown tool: ${name}`, success: false };
    }
  };
}


/** Lit un fichier d'instructions du dépôt, ou null (absent / illisible). */
async function readInstructionFile(
  host: RepoHost,
  path: string,
): Promise<RepoInstructionFile | null> {
  try {
    const content = await readWorkFile(host, path);
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
export async function readRepoInstructions(
  host: RepoHost,
): Promise<{ message: string; bytes: number } | null> {
  const files: RepoInstructionFile[] = [];
  for (const name of REPO_INSTRUCTION_FILES) {
    const file = await readInstructionFile(host, name);
    if (file) files.push(file);
  }
  return formatBootInstructions(files);
}
