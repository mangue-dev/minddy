import { posix as posixPath } from "node:path";

import { checkCommand, FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { assertNotGit, resolveWithin } from "../repo-path";

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
   * LES FICHIERS D'UN `apply_patch`, UN PAR UN (`metadata.files`).
   *
   * `write` et `edit` touchent un fichier et publient un `filepath`. `apply_patch`
   * en touche N et n'en publie **qu'une seule demande**, dont le `filepath` est la
   * liste RECOLLÉE : `resources.join(", ")` (mesuré sur le binaire). Prise pour un
   * chemin, cette chaîne donnait une ligne de « fichiers changés » portant trois à
   * cinq noms séparés par des virgules — et, plus grave, un `assertNotGit` qui ne
   * voit qu'un segment `a.ts, .git` : le seul garde-fou du dépôt passait à côté
   * d'un patch qui touche `.git/config` en second.
   *
   * `metadata.files` porte la vraie liste, avec la nature de chaque geste. Vide
   * (ou absent) sur les tools mono-fichier : `filepath` suffit et fait foi.
   */
  files?: { path: string; status: "added" | "modified" | "deleted" }[];
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
  /**
   * DÉLÉGATIONS AUTORISÉES ET PAS ENCORE NÉES — sans elles, le plafond ne borne
   * rien du seul cas qu'il ait à borner.
   *
   * Une fille n'entre dans `running` qu'à sa NAISSANCE, et le flux ne l'annonce
   * qu'après coup (`metadata` du part `task`, mesuré : `opencode-delegation.test.ts`
   * ancre `runningAtAsk === 0`). Un round qui appelle `task` trois fois voyait donc
   * ses trois demandes arbitrées avant qu'aucune fille n'existe, et `running`
   * valait zéro aux trois — le plafond passait toujours. Ce qu'on compte ici est
   * le crédit ouvert entre l'autorisation et la naissance.
   */
  pending?: number;
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
  /**
   * LE DÉPÔT DU RUN (`job.layout.repoDir`), et il est passé plutôt que lu depuis
   * une constante (MIN-354).
   *
   * C'est LE paramètre qui rendait ce verdict inutilisable hors microVM :
   * `metadata.filepath` est ABSOLU (mesure n°2), donc comparé à `/vercel/sandbox/repo`
   * sur une machine où le dépôt vit ailleurs, il sortait TOUJOURS — le harness
   * refusait 100 % des écritures, en croyant garder quelque chose.
   */
  repoDir: string,
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
      /**
       * TOUS LES CHEMINS DE LA DEMANDE, et pas seulement le premier : une
       * permission d'`apply_patch` en porte N (cf. `PermissionAsk.files`). Un
       * seul chemin refusé refuse la demande entière — il n'y a pas de « oui
       * pour ces trois fichiers, non pour le quatrième » dans le protocole, et
       * c'est le sens prudent.
       */
      const targets = editTargets(ask);
      if (targets.length === 0) {
        return {
          reply: "reject",
          message: "The harness could not read the path to write, so it refused the edit.",
        };
      }
      try {
        for (const { path } of targets) {
          // `resolveWithin` prend un chemin RELATIF au dépôt : lui passer un absolu
          // le recollerait sous `REPO_DIR` (`/etc/x` → `<dépôt>/etc/x`), donc sans
          // jamais sortir — c'est-à-dire sans jamais rien refuser. On ramène donc
          // d'abord au relatif, et un chemin qui n'est pas sous le dépôt est refusé
          // avant même d'être normalisé.
          const abs = absoluteInRepo(repoDir, path);
          assertNotGit(repoDir, abs, path);
        }
        return ALLOW;
      } catch (err) {
        return { reply: "reject", message: (err as Error).message };
      }
    }

    // Un run n'a qu'un dépôt et un harness : tout le reste est hors sujet, et
    // la config le refuse déjà (`external_directory: "deny"`). Ceci est le second
    // rideau — une ACL qui bougerait chez opencode ne rouvrirait pas le disque.
    // Il compte DOUBLE hors microVM : la machine n'est plus une frontière, ce
    // refus-ci est ce qui tient le modèle à l'écart du reste du disque.
    case "external_directory":
      return {
        reply: "reject",
        message: `The harness only allows work inside the repository (${repoDir}).`,
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

  // Vivantes ET promises : une autorisation déjà donnée compte, sans quoi un round
  // qui appelle `task` en rafale passe entièrement sous le plafond (cf. `pending`).
  const engaged = subagents.running + (subagents.pending ?? 0);
  if (engaged >= subagents.maxParallel) {
    return {
      reply: "reject",
      message:
        `Too many sub-agents running at once (${engaged}/${subagents.maxParallel}). ` +
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
 * Ce qu'une demande d'écriture engage, fichier par fichier. `files` fait foi dès
 * qu'il est là (`apply_patch`, qui porte aussi la NATURE de chaque geste) ;
 * sinon c'est `filepath`, qui est alors un vrai chemin unique (`write`, `edit`)
 * dont on ne sait dire que « modifié » — la liste de git, en fin de tour,
 * tranchera.
 */
export function editTargets(ask: PermissionAsk): NonNullable<PermissionAsk["files"]> {
  const files = (ask.files ?? [])
    .map((f) => ({ ...f, path: f.path.trim() }))
    .filter((f) => f.path);
  if (files.length > 0) return files;
  const single = (ask.filepath ?? "").trim();
  return single ? [{ path: single, status: "modified" }] : [];
}

/**
 * Le chemin absolu d'une écriture, LÈVE s'il sort du dépôt. Un chemin relatif
 * passe par `resolveWithin` (le `..` y est normalisé, la sortie y est refusée) ;
 * un absolu est comparé au dépôt tel quel.
 */
function absoluteInRepo(repoDir: string, filepath: string): string {
  if (!filepath.startsWith("/")) return resolveWithin(repoDir, filepath);
  const resolved = posixPath.normalize(filepath);
  if (resolved !== repoDir && !resolved.startsWith(`${repoDir}/`)) {
    throw new Error(`Path escapes the repository: ${filepath}`);
  }
  return resolved;
}
