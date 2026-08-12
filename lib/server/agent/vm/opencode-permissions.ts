import { posix as posixPath } from "node:path";

import { checkCommand, FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { assertNotGit, resolveWithin } from "../repo-path";
import { REPO_DIR } from "../repo-host";

/**
 * LES GARDE-FOUS, REJOUÉS SUR LA DEMANDE DE PERMISSION D'OPENCODE (MIN-286, lot 2).
 *
 * Ce que le harness maison faisait DANS le tool (`exec-tool.ts` refusait
 * `git reset --hard` avant de toucher au Sandbox, `repo-host.ts` refusait une
 * écriture hors dépôt), opencode le demande : `permission: {bash: "ask",
 * edit: "ask"}` suspend l'appel et publie `permission.asked` sur le flux. Le
 * superviseur répond — et sa réponse EST le garde-fou.
 *
 * Un module PUR, donc : la décision se teste sans serveur, et
 * [command-guard.ts](../command-guard.ts) comme [repo-path.ts](../repo-path.ts)
 * n'ont pas changé d'une ligne. Ce sont les mêmes fonctions, appelées d'ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ (opencode-ai@1.18.16, faux fournisseur local qui scripte
 * les appels de tool — aucun modèle dépensé)
 *
 * 1. **`bash: "ask"` demande pour TOUTE commande**, `echo hi` comprise :
 *    `{permission: "bash", patterns: ["echo hi"], metadata: {command: "echo hi"},
 *    always: ["echo *"], tool: {messageID, callID}}`. Le garde-fou voit donc
 *    exactement ce que voyait `run_command`.
 * 2. **Une écriture publie `permission: "edit"`** avec `metadata.filepath`
 *    **ABSOLU** (et un `diff`), quel que soit le tool — `write`, `edit`,
 *    `apply_patch`. Une écriture HORS du dépôt en publie deux : d'abord
 *    `external_directory` (`metadata.parentDir`), puis `edit`.
 * 3. **`.git/` n'est protégé par personne chez opencode** : `write` sur
 *    `<dépôt>/.git/config` a été **exécuté** et a écrasé le fichier. C'est
 *    précisément ce que `assertNotGit` garde (écrire un hook ou un `config` =
 *    exfiltration du token d'installation), et c'est la raison pour laquelle
 *    `edit` est en `ask` plutôt qu'en `allow` dans la config du tour.
 * 4. **La réponse porte un MESSAGE, et le modèle le lit** :
 *    `POST /permission/:id/reply {reply: "reject", message}` → le tool revient en
 *    `status: "error"` avec « The user rejected permission to use this specific
 *    tool call with the following feedback: <message> ». C'est ce qui fait qu'un
 *    refus reste ce qu'il a toujours été chez nous : une **erreur de tool** que
 *    le modèle lit et corrige, jamais un tour cassé.
 */

/** Une demande de permission, telle que le flux la publie (`permission.asked`). */
export interface PermissionAsk {
  id: string;
  sessionId: string;
  /** L'action demandée : `bash`, `edit`, `external_directory`, `webfetch`… */
  permission: string;
  /** L'appel de tool qui l'a déclenchée — ce qui relie le refus au fil. */
  callId: string;
  /** `metadata.command` sur un `bash`. */
  command?: string;
  /** `metadata.filepath` sur une écriture — absolu (mesure n°2). */
  filepath?: string;
  /**
   * `metadata.subagent_type` sur un `task` : le sous-agent demandé, DEMANDÉ
   * AVANT qu'opencode ne le résolve (mesuré, cf. `decideTask`).
   */
  subagentType?: string;
}

/**
 * Ce que le superviseur sait des sous-agents au moment du verdict — l'offre du
 * tour et ce qui tourne déjà. Absent = pas de délégation à arbitrer.
 */
export interface SubagentContext {
  /** Les `subagent_type` déclarés en config ([opencode-config.ts](opencode-config.ts)). */
  names: ReadonlySet<string>;
  /** Filles vivantes à cet instant. */
  running: number;
  /** Plafond de simultané (`app_config`, MIN-112). */
  maxParallel: number;
}

/** Ce que le superviseur doit répondre, et pourquoi. */
export interface PermissionVerdict {
  reply: "once" | "reject";
  /** Le mot au modèle sur un refus — il arrive dans l'erreur de tool (mesure n°4). */
  message?: string;
  /** `tool_result.reason`, pour que le refus reste mesurable en base. */
  reason?: string;
}

const ALLOW: PermissionVerdict = { reply: "once" };

/**
 * LE VERDICT DU HARNESS. Ne lève jamais : un garde-fou qui lève sur une forme
 * inattendue arrêterait le tour au lieu de le protéger, et le seul chemin sûr
 * quand on ne comprend pas la demande est de la refuser en le disant.
 */
export function decidePermission(
  ask: PermissionAsk,
  subagents?: SubagentContext,
): PermissionVerdict {
  switch (ask.permission) {
    case "task":
      return decideTask(ask, subagents);

    case "bash": {
      const command = (ask.command ?? "").trim();
      // Une demande `bash` sans commande n'existe pas dans la mesure. Si elle
      // apparaissait, on ne saurait pas ce qu'on autorise : on refuse.
      if (!command) {
        return {
          reply: "reject",
          message: "The harness could not read the command to run, so it refused it.",
        };
      }
      const verdict = checkCommand(command);
      if (verdict.allowed) return ALLOW;
      return { reply: "reject", message: verdict.reason, reason: FORBIDDEN_COMMAND_REASON };
    }

    case "edit": {
      const filepath = (ask.filepath ?? "").trim();
      if (!filepath) {
        return {
          reply: "reject",
          message: "The harness could not read the path to write, so it refused the edit.",
        };
      }
      try {
        // `resolveWithin` prend un chemin RELATIF au dépôt : lui passer un absolu
        // le recollerait sous `REPO_DIR` (`/etc/x` → `<dépôt>/etc/x`), donc sans
        // jamais sortir — c'est-à-dire sans jamais rien refuser. On ramène donc
        // d'abord au relatif, et un chemin qui n'est pas sous le dépôt est refusé
        // avant même d'être normalisé.
        const abs = absoluteInRepo(filepath);
        assertNotGit(REPO_DIR, abs, filepath);
        return ALLOW;
      } catch (err) {
        return { reply: "reject", message: (err as Error).message };
      }
    }

    // La microVM n'a qu'un dépôt et un harness : tout le reste est hors sujet, et
    // la config le refuse déjà (`external_directory: "deny"`). Ceci est le second
    // rideau — une ACL qui bougerait chez opencode ne rouvrirait pas le disque.
    case "external_directory":
      return {
        reply: "reject",
        message: `The harness only allows work inside the repository (${REPO_DIR}).`,
      };

    default:
      return ALLOW;
  }
}

/**
 * LA DÉLÉGATION (MIN-286, lot 2, tâche 12) — le seul point où l'on peut encore
 * dire non à un `task`, et le seul d'où le modèle entend autre chose qu'un
 * message d'opencode.
 *
 * Deux refus, et rien d'autre :
 *
 * 1. **Le plafond de simultané** (`maxParallel`, réglé en `app_config`). C'est le
 *    même refus, aux mots près, que celui du registre maison
 *    ([subagent.ts](../subagent.ts)) : le sandbox est PARTAGÉ, et deux filles qui
 *    écrivent en même temps se marchent dessus. Chez opencode le `task` de premier
 *    plan BLOQUE le parent, donc le simultané ne vient que d'un round qui appelle
 *    `task` plusieurs fois — c'est exactement ce qu'on borne ici.
 * 2. **Un sous-agent qui n'existe pas.** Opencode répondrait « Unknown agent type:
 *    X », sans dire ce qui est offert au tour (les agents sont dans la description
 *    du tool, qu'un modèle a pu perdre de vue). On lui rend l'offre, comme
 *    `makeSubagentModelResolver` rendait les favoris.
 *
 * Le reste passe : la config a déjà décidé de ce qui est offert, et un garde-fou
 * qui redit la config est un endroit de plus où les deux peuvent diverger.
 */
function decideTask(ask: PermissionAsk, subagents?: SubagentContext): PermissionVerdict {
  if (!subagents) return ALLOW;

  if (subagents.running >= subagents.maxParallel) {
    return {
      reply: "reject",
      message:
        `Too many sub-agents running at once (${subagents.running}/${subagents.maxParallel}). ` +
        `Wait for one to report back before delegating again.`,
      reason: "subagent_limit",
    };
  }

  const requested = (ask.subagentType ?? "").trim();
  if (!subagents.names.has(requested)) {
    return {
      reply: "reject",
      message:
        `Unknown sub-agent type ${JSON.stringify(requested)}. ` +
        `Available for this session: ${[...subagents.names].join(", ")}.`,
      reason: "unknown_subagent",
    };
  }
  return ALLOW;
}

/**
 * Le chemin absolu d'une écriture, LÈVE s'il sort du dépôt. Un chemin relatif
 * passe par `resolveWithin` (le `..` y est normalisé, la sortie y est refusée) ;
 * un absolu est comparé au dépôt tel quel.
 */
function absoluteInRepo(filepath: string): string {
  if (!filepath.startsWith("/")) return resolveWithin(REPO_DIR, filepath);
  const resolved = posixPath.normalize(filepath);
  if (resolved !== REPO_DIR && !resolved.startsWith(`${REPO_DIR}/`)) {
    throw new Error(`Path escapes the repository: ${filepath}`);
  }
  return resolved;
}
