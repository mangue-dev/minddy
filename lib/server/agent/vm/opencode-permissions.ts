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
export function decidePermission(ask: PermissionAsk): PermissionVerdict {
  switch (ask.permission) {
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
