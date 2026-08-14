import { RUN_COMMAND_TIMEOUT_MS, SUBAGENT_CONTROL_TOOLS } from "./tools";
import { runCommandTimeoutMs } from "./chunk-budget";
import {
  ISSUE_TOOL_NAMES,
  PLATFORM_TOOL_NAMES,
  PLATFORM_TOOLS_BY_ANCHOR,
  PR_TOOL_NAMES,
  PROJECT_PR_TOOL_NAMES,
  SCRATCHPAD_TOOL_NAMES,
} from "./platform-tool-names";
import type { AgentAnchor } from "./prompt";
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
  REPO_DIR,
  type GrepOutputMode,
  type RepoHost,
} from "./repo-host";
import { BackgroundJobs } from "./background";
import { Subagents } from "./subagent";
import { pruneToolOutputs, TOOL_RESULT_MAX_CHARS } from "./prune";
import type { ReadWindow } from "./repo-host";
// Type SEUL : `agent-api` est un module client, mais un `import type` est effacé à
// la compilation — rien de client ne traverse la frontière.
import type { AgentFileChangeStatus } from "@/lib/agent-api";
import { resolveWithin } from "./repo-path";
import { LITERAL_RETRY_NOTE, NO_FILES_IN_SCOPE_NOTE, REGEX_RETRY_NOTE } from "./grep-pattern";
import {
  formatRunCommandResult,
  fullOutputDocument,
  spillsToDisk,
  toolOutputFileName,
} from "./command-output";
import { checkCommand, FORBIDDEN_COMMAND_REASON } from "./command-guard";
import {
  newVerificationSink,
  noteVerificationCommand,
  noteVerificationStale,
  type VerificationSink,
} from "./diagnostics";
import {
  applyEdit,
  diffFiles,
  ReplaceError,
  sealTelemetry,
  telemetryFailure,
  telemetryMatch,
  type EditTelemetry,
} from "./edit";
import { applyPatchEdits, parsePatch, type PatchOp } from "./patch";
import {
  REPO_INSTRUCTION_FILES,
  collectTouchedInstructions,
  formatBootInstructions,
  type InstructionsReason,
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
) => Promise<{
  result: unknown;
  success: boolean;
  images?: AgentToolImage[];
  /** Ce que le harness a de LONG à dire sur cet appel — servi en message `user`
   *  après le round, là où un `result` serait élidé par le milieu. Aujourd'hui :
   *  le contrôle du plan accroché à `write_issue_plan` (`gateWritePlan`). */
  followUp?: string;
}>;


/**
 * Images montrées au modèle par TOUR (MIN-111) — même esprit que
 * `MAX_WEB_SEARCHES_PER_TURN` : une maquette ou deux états d'un même écran, c'est
 * ce dont un tour a besoin. Au-delà, `read_resource` répond sans image.
 */
export const MAX_IMAGES_PER_TURN = 2;

/** Cap du diff renvoyé au modèle après une édition (le diff complet n'est pas utile). */
const EDIT_DIFF_CAP = 4000;

/**
 * Budget de diff PARTAGÉ par un appel batch (`apply_edits`, `apply_patch`).
 *
 * Jusqu'à MIN-246, ces deux chemins ne rendaient qu'`additions`/`deletions` : le
 * modèle éditait à l'aveugle là où il édite le plus (le batch, et la totalité des
 * runs `gpt-*`, qui ne connaissent qu'`apply_patch`). Rendre un diff par fichier
 * sans plafond global ferait l'excès inverse — un batch de quinze fichiers
 * remplirait le contexte de diff. D'où un budget de tour : les premiers fichiers
 * rendent leur diff, les suivants le disent au lieu de le taire.
 */
const BATCH_DIFF_BUDGET = 8000;

/**
 * Distributeur du budget ci-dessus, un par appel de tool. Rend le diff capé tant
 * qu'il reste de la place, puis une note — jamais rien en silence.
 */
function diffBudget() {
  let left = BATCH_DIFF_BUDGET;
  return (path: string, before: string, after: string): Record<string, string> => {
    if (before === after) return {};
    if (left <= 0) return { diff_omitted: "diff budget for this call is exhausted; re-read the file if you need to see it" };
    const diff = cap(diffFiles(path, before, after), Math.min(EDIT_DIFF_CAP, left));
    left -= diff.length;
    return { diff };
  };
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

function toNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Ce qu'un `read_file` rend VRAIMENT, pied de page compris (MIN-248).
 *
 * Le résultat d'un tool traverse `JSON.stringify` puis `headTail(…,
 * TOOL_RESULT_MAX_CHARS)`, qui élide le MILIEU. Une lecture de fichier entier de
 * 45 Ko en ressortait donc à ~6 Ko trouée en son centre — et annoncée COMPLÈTE,
 * parce que le pied de page ne parlait que de la fenêtre demandée (`win.truncated`),
 * jamais de cette coupe-là. Le modèle croyait avoir tout lu, ne trouvait pas ce
 * qu'il cherchait, et relisait.
 *
 * On coupe donc ici, par LIGNES ENTIÈRES et par la queue, en mesurant sur le JSON
 * (c'est lui qui est capé, et l'échappement d'un `\n` ou d'un `\t` y coûte deux
 * caractères). Le pied de page dit alors la dernière ligne réellement rendue.
 */
export function fitReadResult(body: string, win: ReadWindow): string {
  const fits = (s: string) => JSON.stringify(s).length <= TOOL_RESULT_MAX_CHARS;

  const windowFooter = win.truncated
    ? `\n\n[Showing lines ${win.startLine}-${win.startLine + win.returnedLines - 1} of ${win.totalLines}. Use offset/limit to read more.]`
    : "";
  if (fits(body + windowFooter)) return body + windowFooter;

  // Le corps peut porter un bloc de conventions en tête (MIN-247), qui n'est pas
  // numéroté : les lignes du fichier sont les `win.returnedLines` DERNIÈRES.
  const lines = body.split("\n");
  const prefixLines = Math.max(0, lines.length - win.returnedLines);
  const cutFooter = (kept: number) => {
    const shown = Math.max(0, kept - prefixLines);
    const last = win.startLine + shown - 1;
    const range =
      shown > 0
        ? `showing lines ${win.startLine}-${last} of ${win.totalLines}`
        : `no file content fit (${win.totalLines} lines)`;
    return `\n\n[Output truncated to fit the tool result limit: ${range}. Read on with offset=${win.startLine + shown}, or narrow the window with offset/limit.]`;
  };

  // Recherche dichotomique du nombre de lignes qui tient : une mesure coûte un
  // `JSON.stringify` du corps, donc on en fait ~log₂(n) et non n.
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(lines.slice(0, mid).join("\n") + cutFooter(mid))) lo = mid;
    else hi = mid - 1;
  }
  // Même une seule ligne peut déborder (ligne monstrueuse) : `headTail` reste le
  // filet de la boucle, et le pied de page ne mentirait plus qu'à la marge.
  return lines.slice(0, Math.max(1, lo)).join("\n") + cutFooter(Math.max(1, lo));
}

/**
 * Un fichier touché, dit AU FIL sans attendre la fin du tour.
 *
 * Le `status` n'est CERTAIN que là où le tool le porte : une suppression supprime,
 * un renommage renomme. Ailleurs, distinguer « créé » de « modifié » demanderait un
 * appel git par édition — on annonce donc `modified`, et l'event `files_changed` de
 * fin de tour, lui dérivé de `git diff --name-status`, rectifie. Le fil montre du
 * PROVISOIRE en attendant l'autorité, et jamais un compteur de lignes inventé
 * (`additions`/`deletions` restent à 0, que `hideEmpty` tait).
 */
export type AgentLiveEdit = {
  path: string;
  status: AgentFileChangeStatus;
  previousPath?: string;
};

/** Exécuteur du tool `create_pr` (fourni par executeAgentRun, qui a le contexte git/PR). */
export type CreatePrHandler = (args: {
  title: string;
  body?: string;
}) => Promise<{
  result: unknown;
  success: boolean;
  /** Le diff du tour, quand la porte de MIN-247 retient la livraison (`gateCreatePr`).
   *  Sert au modèle en message `user` — un résultat de tool serait élidé au milieu. */
  followUp?: string;
}>;

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
 * Ce dont un exec-tool a besoin. Un objet plutôt qu'une liste de positions : depuis
 * les sous-agents (MIN-112) il y a DEUX exec-tools par chunk, celui du parent et
 * celui d'une fille, et ils ne diffèrent que par une poignée de champs — nullables
 * ici, structurellement absents là-bas.
 */
export interface ExecToolConfig {
  host: RepoHost;
  /**
   * ANCRAGE du run (MIN-326) — ticket, carnet ou relecture de pull request. Il
   * décide de ce que le routage de plateforme ACCEPTE, par la même table que le
   * plan de contrôle (`PLATFORM_TOOLS_BY_ANCHOR`).
   *
   * Un jeu de tools n'est une garantie que si le routeur l'applique : le nom d'un
   * tool non servi arrive quand même ici — un checkpoint d'avant, un modèle qui
   * l'invente, une consigne glissée dans le dépôt qu'on relit — et il était
   * exécuté sur son seul nom. Une relecture, dont tout ce qu'elle lit vient d'un
   * fork inconnu, réécrivait ainsi le carnet de quelqu'un.
   */
  anchor: AgentAnchor;
  /** null = pas de livraison (jeu d'un sous-agent : la PR appartient au parent). */
  createPr: CreatePrHandler | null;
  /** Écritures sur la pull request RELUE (MIN-168). null hors session de
   *  relecture : ces trois tools ne sont alors ni offerts ni exécutables. */
  prTool: PlatformToolHandler | null;
  /** Pull requests DU PROJET (MIN-267) — l'inventaire et ce qu'on y fait. null
   *  sur une session de RELECTURE (elle a `prTool`, sur sa seule pull request) et
   *  chez un sous-agent, à qui les pull requests n'appartiennent pas. */
  projectPrTool: PlatformToolHandler | null;
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
  /** Ce que le MODÈLE a vérifié lui-même (MIN-262) : rempli par un `run_command` de
      tests sorti en 0, périmé par toute édition. Le crochet de fin de tour le lit et
      ne relance pas ce qui vient de passer vert. PARTAGÉ avec les sous-agents, pour
      la même raison qu'`editedPaths` : une fille qui édite périme la vérification du
      parent, sans quoi le harness se tairait sur un dépôt qu'elle vient de changer.
      Optionnel — sans lui, le crochet relance tout, comme avant. */
  verification?: VerificationSink;
  /** Registre des sous-agents du chunk (MIN-112). null = jeu d'un sous-agent (la
      hiérarchie est à un niveau) ou vieux checkpoint qui appelle encore ces tools. */
  subagents: Subagents | null;
  /** Ce qu'il reste du budget TEMPS du chunk (MIN-214) — la même horloge que celle
      qui borne un sous-agent. Elle borne aussi le timeout d'un `run_command` : sans
      elle, une commande entamée juste avant la soft-deadline allait au bout de ses
      180 s et la fonction mourait avant d'écrire le checkpoint. PARTAGÉE avec les
      filles : c'est l'horloge du CHUNK, celle que la plateforme tue. */
  chunkRemainingMs: () => number;
  /** Notifie le fil dès qu'un tool a écrit un fichier, avant la fin du tour. */
  onEdit?: (edits: AgentLiveEdit[]) => void;
}

/** Les tools « métier » de l'agent : Sandbox (fichiers/commandes/jobs de fond),
    git/PR (`createPr`), tickets minddy (`issue-tools.ts`), carnet du lanceur
    (`scratchpad-tools.ts`) et délégation (`subagent.ts`) — routés par nom. Les
    tools minddy sont servis aux DEUX ancrages (MIN-125) : l'ancrage ne pilote plus
    que la cible par défaut des tools ticket, portée par leur contexte. */
export function makeExecTool(cfg: ExecToolConfig): ExecuteAgentTool {
  const {
    host,
    anchor,
    createPr,
    prTool,
    projectPrTool,
    issueTool,
    scratchpadTool,
    webSearch,
    outputSeqBase,
    background,
    instructions,
    editedPaths,
    subagents,
    chunkRemainingMs,
    onEdit,
  } = cfg;
  const verification = cfg.verification ?? newVerificationSink();
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
    followUp?: string;
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
  const withInstructionsFor = async <T extends { result: unknown; success: boolean }>(
    res: T,
    paths: string[],
    reason: InstructionsReason,
  ): Promise<T> => {
    if (!res.success) return res;
    const block = await collectTouchedInstructions(
      paths.filter(Boolean),
      instructions,
      (path) => readWorkFile(host, path).catch(() => null),
      reason,
    ).catch((err) => {
      console.error("[agent-execute] subdir instructions failed:", (err as Error).message);
      return null;
    });
    if (!block) return res;
    if (typeof res.result === "string") {
      return { ...res, result: `${block}\n\n${res.result}` };
    }
    return { ...res, result: { repo_instructions: block, ...(res.result as object) } } as T;
  };

  const withTouchedInstructions = async <T extends { result: unknown; success: boolean }>(
    res: T,
    paths: string[],
    /** Ce que le fil doit montrer, quand le tool en sait plus que « modifié ». */
    live?: AgentLiveEdit[],
  ): Promise<T> => {
    if (!res.success) return res;
    // Entonnoir unique de TOUTE édition réussie (edit_file, write_file, move_file,
    // apply_edits, apply_patch) : c'est ici qu'on note ce que le tour a touché,
    // pour le type-check de fin de tour (MIN-110). Un fichier LU n'y entre pas —
    // il n'a rien à faire vérifier.
    noteEdited(paths);
    notifyEdit(live ?? paths.filter(Boolean).map((path) => ({ path, status: "modified" as const })));
    return withInstructionsFor(res, paths, "edited");
  };

  /**
   * Ce que le tour a touché, noté aux DEUX endroits qui éditent (l'entonnoir
   * ci-dessus et `delete_file`, qui ne passe pas par lui). Une édition périme la
   * vérification du modèle (MIN-262) : un `npm test` vert d'il y a trois rounds ne
   * dit plus rien du fichier qu'on vient de réécrire.
   */
  const noteEdited = (paths: readonly string[]) => {
    let edited = false;
    for (const path of paths) {
      if (!path) continue;
      editedPaths.add(path);
      edited = true;
    }
    if (edited) noteVerificationStale(verification);
  };

  /** Le fil, prévenu — jamais avec une liste vide (ce serait un bruit sans objet). */
  const notifyEdit = (edits: AgentLiveEdit[]) => {
    if (edits.length > 0) onEdit?.(edits);
  };

  return async (name, args, callId) => {
    // Verrou d'écriture de la sandbox PARTAGÉE (MIN-112). Le parent qui continue
    // d'éditer pendant qu'une fille écrit est exactement le même risque que deux
    // filles simultanées, dans un dépôt dont la fin de tour fait `git add -A`. La
    // décision vit dans `subagent.ts` (module de politique, testable) ; ici il n'y a
    // que le branchement. La lecture et `run_command` restent ouverts.
    const locked = subagents?.writeLock(name);
    if (locked) return locked;
    /**
     * L'ANCRAGE AVANT LE NOM (MIN-326). Un tool de plateforme hors du jeu de cet
     * ancrage est refusé ici, avant tout handler — c'est le pendant du refus du
     * plan de contrôle, pour les tools que le moteur exécute en direct. Les tools
     * de fichier et de contrôle ne sont pas concernés : ils ne sont pas dans la
     * table, et c'est leur handler qui décide (une relecture n'a pas d'éditeur).
     */
    if (PLATFORM_TOOL_NAMES.has(name) && !PLATFORM_TOOLS_BY_ANCHOR[anchor].has(name)) {
      return {
        result: { error: `You do not have the ${name} tool in this session.` },
        success: false,
      };
    }
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
    if (PROJECT_PR_TOOL_NAMES.has(name)) {
      if (!projectPrTool) {
        return subagentDenied(
          name,
          "the project's pull requests belong to the parent session, which decides what happens to them",
        );
      }
      return await projectPrTool(name, args);
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
        const path = String(args.path ?? "");
        const win = await readWorkFileWindow(host, path, {
          offset: toNum(args.offset),
          limit: toNum(args.limit),
        });
        if (!win) return { result: "(file not found)", success: false };
        // Les conventions du sous-dossier arrivent AVEC le fichier qu'on ouvre
        // pour les comprendre, pas après la première édition (MIN-247). Même
        // état, même budget et même « une fois par chemin » que côté édition :
        // un dossier lu puis édité ne sert ses instructions qu'une seule fois.
        const withBlock = await withInstructionsFor(
          { result: win.content || "(empty file)", success: true },
          [path],
          "read",
        );
        // Le pied de page se décide EN DERNIER, sur le texte réellement rendu —
        // bloc de conventions compris (MIN-248).
        return { ...withBlock, result: fitReadResult(String(withBlock.result), win) };
      }
      case "list_dir": {
        const path = args.path ? String(args.path) : ".";
        const content = await listDir(host, path);
        // Illisible ≠ vide (MIN-226) : « (empty) » sur un chemin qui n'existe pas
        // affirmerait deux choses fausses à la fois.
        if (content === null) {
          return {
            result: { error: `Cannot list ${path}: no such directory (or not a directory).` },
            success: false,
          };
        }
        return { result: content || "(empty)", success: true };
      }
      case "glob": {
        const { files, truncated, ok } = await globRepo(
          host,
          String(args.pattern ?? ""),
          args.path ? String(args.path) : undefined,
        );
        // Motif refusé par git ≠ dépôt sans fichier correspondant (MIN-226).
        if (!ok) {
          return {
            result: { error: "glob failed: git rejected the 'pattern'/'path' — check their syntax." },
            success: false,
          };
        }
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
        // Et l'inverse (MIN-238) : une alternation cherchée au pied de la lettre
        // n'a jamais cherché ses alternatives — sans la note, le modèle lirait le
        // résultat de la relance comme celui de sa demande, et ne saurait pas que
        // `fixed_strings` ne fait pas ce qu'il croit.
        const note = r.retriedAsLiteral
          ? `${LITERAL_RETRY_NOTE}\n`
          : r.retriedAsRegex
            ? `${REGEX_RETRY_NOTE}\n`
            : "";
        // Périmètre vide ≠ absence (MIN-226) : rien n'a été LU, et le dire est
        // la moitié utile de la réponse. `success: false` en plus du mot — une
        // recherche qui n'a rien ouvert n'a pas abouti, et l'échec se voit dans
        // le fil comme dans les mesures.
        if (r.noFilesInScope) {
          return { result: note + NO_FILES_IN_SCOPE_NOTE, success: false };
        }
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
              edit: sealTelemetry({
                tool: "edit_file",
                matched: [telemetryMatch(edit.trace)],
                failed: [],
              }),
            },
            [path],
          );
        } catch (err) {
          return {
            result: { error: err instanceof Error ? err.message : String(err) },
            success: false,
            edit: sealTelemetry({
              tool: "edit_file",
              matched: [],
              failed: [telemetryFailure(err)],
            }),
          };
        }
      }
      case "write_file": {
        const path = String(args.path ?? "");
        await writeWorkFile(host, path, String(args.content ?? ""));
        return await withTouchedInstructions({ result: `Wrote ${path}`, success: true }, [path]);
      }
      case "move_file": {
        const to = String(args.to ?? "");
        const from = String(args.from ?? "");
        await moveWorkFile(host, from, to);
        return await withTouchedInstructions(
          { result: `Moved ${args.from} → ${to}`, success: true },
          [to],
          [{ path: to, status: "renamed", previousPath: from }],
        );
      }
      case "delete_file": {
        const path = String(args.path ?? "");
        await deleteWorkFile(host, path);
        // Supprimer un fichier casse des types tout aussi bien qu'en éditer un ;
        // il ne passe pas par `withTouchedInstructions` (rien à charger pour un
        // fichier qui n'est plus là), d'où la note ici. Le fil, lui, doit le voir
        // partir : sans cet appel, une suppression n'apparaissait qu'au commit.
        noteEdited([path]);
        notifyEdit(path ? [{ path, status: "deleted" }] : []);
        return { result: `Deleted ${args.path}`, success: true };
      }
      case "apply_edits": {
        const changes = Array.isArray(args.changes) ? (args.changes as Array<Record<string, unknown>>) : [];
        if (changes.length === 0) {
          return { result: { error: "No changes provided." }, success: false };
        }
        const applied: Array<Record<string, unknown>> = [];
        const telemetry: EditTelemetry = { tool: "apply_edits", matched: [], failed: [] };
        const budget = diffBudget();
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
              // Une mise à jour sans edit écrivait le fichier tel quel et repartait
              // en `ok: true` : le modèle lisait un ✓ là où rien n'avait changé.
              if (edits.length === 0) {
                throw new Error(
                  `No edits provided for ${path}. An update change needs at least one { old_string, new_string }.`,
                );
              }
              let content = original;
              let additions = 0;
              let deletions = 0;
              /** Rangs (1-based) des edits qui ne changeaient rien. */
              const skipped: number[] = [];
              for (const [i, e] of edits.entries()) {
                try {
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
                  telemetry.matched.push(telemetryMatch(r.trace));
                } catch (err) {
                  telemetry.failed.push(telemetryFailure(err));
                  // Un edit dont `old_string` vaut `new_string` ne change RIEN : il ne
                  // peut donc rien corrompre, et il n'a pas à emporter les autres edits
                  // du fichier — mesuré 8 fois sur `agent_run_events`, dont 3 batches où
                  // un no-op a jeté des edits parfaitement bons. On le saute et on le DIT
                  // (le taire ferait croire au modèle que son edit a pris). Tout autre
                  // échec garde l'atomicité du fichier : on ne l'écrit pas à moitié.
                  if (err instanceof ReplaceError && err.reason === "identical") {
                    skipped.push(i + 1);
                    continue;
                  }
                  throw err;
                }
              }
              // Sauter le seul edit d'un fichier, c'est ne rien faire du tout : l'échec
              // doit rester lisible comme tel.
              if (skipped.length === edits.length) {
                throw new Error(
                  `No changes to apply to ${path}: every edit has an identical old_string and new_string.`,
                );
              }
              await writeWorkFile(host, path, content);
              applied.push({
                path,
                op: "update",
                ok: true,
                additions,
                deletions,
                // Le diff du fichier une fois TOUS ses edits posés (MIN-246) : sans
                // lui, le chemin batch — le majoritaire — rendait deux compteurs et
                // rien de ce qui avait été écrit.
                ...budget(path, original, content),
                ...(skipped.length > 0
                  ? {
                      skipped_edits: skipped,
                      note: "these edits have an identical old_string and new_string — they changed nothing and were skipped; the others applied",
                    }
                  : {}),
              });
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
            edit: sealTelemetry(telemetry),
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
          // Une enveloppe illisible est un échec de FORMAT, pas d'édition : c'est
          // le chiffre qu'aider mesure sous le nom `percent_cases_well_formed`, et
          // le nôtre se compte ici — sur le seul chemin qui serve un format
          // TEXTUEL au modèle, donc le seul où il puisse le casser (MIN-246).
          const message = err instanceof Error ? err.message : String(err);
          return {
            result: { error: message },
            success: false,
            edit: sealTelemetry({
              tool: "apply_patch",
              matched: [],
              failed: [],
              parse_error: cap(message, 200),
            }),
          };
        }
        const applied: Array<Record<string, unknown>> = [];
        const telemetry: EditTelemetry = { tool: "apply_patch", matched: [], failed: [] };
        const budget = diffBudget();
        for (const op of ops) {
          try {
            if (op.op === "invalid") {
              // Section illisible : elle échoue SEULE. Le modèle lit
              // quoi refaire, et garde les fichiers que l'enveloppe a bien portés.
              throw new Error(op.error);
            } else if (op.op === "delete") {
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
              for (const trace of edited.traces) telemetry.matched.push(telemetryMatch(trace));
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
                  ...budget(op.moveTo, original, edited.content),
                });
              } else {
                await writeWorkFile(host, op.path, edited.content);
                applied.push({
                  path: op.path,
                  op: "update",
                  ok: true,
                  additions: edited.additions,
                  deletions: edited.deletions,
                  // Même raison qu'`apply_edits` : c'est le chemin de TOUS les runs
                  // `gpt-*`, et il ne rendait rien de ce qui avait été écrit.
                  ...budget(op.path, original, edited.content),
                });
              }
            }
          } catch (err) {
            // Une SECTION illisible dans une enveloppe lisible compte comme une
            // rupture de format, au même titre qu'un patch entier illisible.
            if (op.op === "invalid") telemetry.parse_error ??= cap(op.error, 200);
            else if (op.op === "update") telemetry.failed.push(telemetryFailure(err));
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
            edit: sealTelemetry(telemetry),
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
        // LE GESTE FAIT FOI (MIN-262). Si cette commande est la suite de tests du
        // dépôt et qu'elle sort en 0, la fin de tour ne la relancera pas : le modèle
        // décide de la profondeur de sa vérification en la FAISANT, pas en la
        // promettant. Toute édition qui suit périme la note (cf. `noteEdited`).
        noteVerificationCommand(verification, command, r.exitCode);
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
