import { realpath as nodeRealpath } from "node:fs/promises";
import { lookup as nodeLookup } from "node:dns/promises";
import { posix as posixPath } from "node:path";

import { assertNotGit } from "../repo-path";
import {
  editTargets,
  webfetchLiteralVerdict,
  type PermissionAsk,
  type PermissionVerdict,
} from "./opencode-permissions";
import {
  fetchHostname,
  isPrivateAddress,
  isPrivateHostname,
  privateFetchMessage,
  PRIVATE_FETCH_REASON,
} from "./private-address";

/**
 * LES DEUX GARDE-FOUS QUI ONT BESOIN DU DISQUE ET DU RÉSOLVEUR (MIN-360).
 *
 * [opencode-permissions.ts](opencode-permissions.ts) est PUR, et doit le rester :
 * c'est ce qui permet de casser un verdict dans un test plutôt qu'en production.
 * Or deux des garde-fous que le passage en local rend obligatoires ne se décident
 * pas sur une chaîne de caractères :
 *
 * 1. **le lien symbolique.** `resolveWithin` ([repo-path.ts](../repo-path.ts))
 *    normalise un chemin sans jamais toucher au disque. Un
 *    `ln -s /Users/x/.ssh <dépôt>/notes` — que rien n'empêche, `ln` n'étant pas
 *    git — produit un chemin qui satisfait la validation et pointe où il veut.
 *    Seul `realpath` tranche ;
 * 2. **la loopback derrière un nom.** Refuser `http://127.0.0.1` et laisser passer
 *    un domaine qui RÉSOUT vers 127.0.0.1 ne garde rien du tout. Le contrôle porte
 *    sur l'adresse, jamais sur le nom.
 *
 * D'où ce module : le classement des adresses est ailleurs et pur
 * ([private-address.ts](private-address.ts)), les deux entrées d'IO sont
 * injectables, et le superviseur n'appelle qu'une fonction.
 */

/** Ce que le module a besoin du monde extérieur. Injectable, donc testable. */
export interface LocalGuardDeps {
  /** `realpath(2)`. Lève quand le chemin n'existe pas — c'est attendu et géré. */
  realpath?: (path: string) => Promise<string>;
  /** Résolution d'un nom en adresses. Lève quand le nom ne résout pas. */
  resolve?: (hostname: string) => Promise<string[]>;
}

const defaultRealpath = (path: string): Promise<string> => nodeRealpath(path);
const defaultResolve = async (hostname: string): Promise<string[]> => {
  const found = await nodeLookup(hostname, { all: true });
  return found.map((entry) => entry.address);
};

/**
 * Le chemin RÉEL d'une cible qui n'existe pas forcément encore — une écriture crée
 * souvent le fichier. On résout donc le plus proche ancêtre qui existe, puis on
 * recolle ce qui manque : c'est ce qui fait qu'un lien symbolique posé sur un
 * DOSSIER parent est vu, là où un `realpath` du fichier se contenterait de lever.
 */
export async function realPathOf(
  absPath: string,
  realpath: (path: string) => Promise<string>,
): Promise<string> {
  const rest: string[] = [];
  let cursor = posixPath.normalize(absPath);
  // Borne de profondeur : un chemin ne remonte pas indéfiniment, et une boucle
  // sans borne dans un garde-fou est un garde-fou qui fige le tour.
  for (let depth = 0; depth < 64; depth++) {
    try {
      const real = await realpath(cursor);
      return rest.length === 0 ? real : posixPath.join(real, ...rest);
    } catch {
      const parent = posixPath.dirname(cursor);
      if (parent === cursor) break;
      rest.unshift(posixPath.basename(cursor));
      cursor = parent;
    }
  }
  return posixPath.normalize(absPath);
}

/**
 * AFFINE UN VERDICT DÉJÀ RENDU, sur le chemin local seulement.
 *
 * Le sens de la fonction est à sens unique, et c'est ce qui la rend sûre à
 * insérer : elle ne peut que refuser ce qui était autorisé, jamais l'inverse. Un
 * refus de `decidePermission` ressort intact, sans qu'on touche au disque.
 *
 * NE LÈVE JAMAIS, pour la raison de `decidePermission` : une IO qui échoue sur une
 * forme inattendue arrêterait le tour au lieu de le protéger. Les deux ignorances
 * ne se traitent pas pareil, et c'est délibéré — un `realpath` muet sur la racine
 * du dépôt laisse le verdict tel quel (le contrôle pur a déjà eu lieu), une
 * résolution DNS muette REFUSE, parce qu'un nom dont on ne sait rien est
 * exactement ce que ce garde-fou existe pour ne pas laisser passer.
 */
export async function refineLocalVerdict(
  ask: PermissionAsk,
  verdict: PermissionVerdict,
  repoDir: string,
  deps: LocalGuardDeps = {},
): Promise<PermissionVerdict> {
  if (verdict.reply !== "once") return verdict;

  if (ask.permission === "edit") {
    return await refineEdit(ask, verdict, repoDir, deps.realpath ?? defaultRealpath);
  }
  if (ask.permission === "webfetch") {
    return await refineWebfetch(ask, verdict, deps.resolve ?? defaultResolve);
  }
  return verdict;
}

async function refineEdit(
  ask: PermissionAsk,
  verdict: PermissionVerdict,
  repoDir: string,
  realpath: (path: string) => Promise<string>,
): Promise<PermissionVerdict> {
  let root: string;
  try {
    root = await realpath(repoDir);
  } catch {
    return verdict;
  }
  for (const { path } of editTargets(ask)) {
    const absolute = path.startsWith("/") ? path : posixPath.join(repoDir, path);
    const real = await realPathOf(absolute, realpath);
    if (real !== root && !real.startsWith(`${root}/`)) {
      return {
        reply: "reject",
        message:
          `Refused writing ${path} — it resolves to ${real}, outside the repository. ` +
          `A symlink inside the repository still points where it points, and the harness ` +
          `follows it before deciding.`,
      };
    }
    try {
      assertNotGit(root, real, path);
    } catch (err) {
      return { reply: "reject", message: (err as Error).message };
    }
  }
  return verdict;
}

async function refineWebfetch(
  ask: PermissionAsk,
  verdict: PermissionVerdict,
  resolve: (hostname: string) => Promise<string[]>,
): Promise<PermissionVerdict> {
  const hostname = fetchHostname(ask.url);
  // Le verdict littéral d'abord : il refait le contrôle que `decidePermission` a
  // déjà fait, et c'est voulu — cette fonction doit tenir seule, sans supposer que
  // quelqu'un a passé le bon garde-fou avant elle.
  if (!hostname || isPrivateHostname(hostname)) return webfetchLiteralVerdict(ask.url);

  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch {
    return {
      reply: "reject",
      message:
        `Refused fetching ${hostname} — it could not be resolved, so the harness cannot tell ` +
        `whether it points at this machine's own network.`,
      reason: PRIVATE_FETCH_REASON,
    };
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return {
      reply: "reject",
      message: privateFetchMessage(hostname),
      reason: PRIVATE_FETCH_REASON,
    };
  }
  return verdict;
}
