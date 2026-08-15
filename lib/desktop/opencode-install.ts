import { OPENCODE_VERSION, opencodeBin } from "@/lib/server/agent/vm/opencode-version";

/**
 * LE BINAIRE OPENCODE SUR LA MACHINE (MIN-293) — la moitié qui se décide sans
 * disque.
 *
 * ## Pourquoi c'est un PRÉ-VOL du lanceur, et pas l'affaire du harness
 *
 * Le harness sait déjà s'installer tout seul : `ensureInstalled`
 * ([opencode-host.ts](../server/agent/vm/opencode-host.ts)) pose le paquet quand
 * il manque ou quand la version diverge, et c'est ce qui fait qu'une microVM sans
 * snapshot à jour tourne quand même. On ne le remplace pas — on le double, plus
 * tôt, et ce n'est pas de la redondance : **c'est une question de LOG**.
 *
 * Une installation qui échoue à l'intérieur du harness échoue à l'endroit exact
 * où l'on n'a rien à lire — le tour n'a pas encore parlé, aucun event n'existe,
 * et le seul témoin est un `stdio` qui n'était branché nulle part avant MIN-363.
 * Faite ici, elle a un journal ([run-log.ts](run-log.ts)), un refus nommé et un
 * geste de réparation. C'est la différence entre « ça ne marche pas » et une
 * phrase qu'on peut coller dans un fil de support.
 *
 * ## L'inconnue que l'audit n'avait pas nommée : `npm`
 *
 * `ensureInstalled` shell-out `npm i opencode-ai@…`. **Electron embarque Node,
 * pas npm.** Sur un Mac sans Command Line Tools — c'est-à-dire sur la machine de
 * quelqu'un qui n'est pas développeur — il n'y a pas de `npm` sur le `PATH`, et
 * l'installation ne peut pas avoir lieu. Ce n'est pas une panne à rattraper ici :
 * c'est un refus, dit avant le fork, avec ce qu'il faut faire.
 *
 * Le jour où le local s'adresse à quelqu'un qui n'a pas de chaîne d'outils, il
 * faudra un autre chemin (téléchargement direct de l'archive, ou binaire
 * embarqué) — et il faudra alors s'occuper de la signature, puisque c'est
 * précisément ce que `disable-library-validation` autorise. Ce n'est pas ce lot.
 *
 * ## Une fois par MACHINE, pas une fois par tour
 *
 * 144 Mo, 10,6 s d'installation. Le dossier est propre à la machine
 * (`HarnessLayout.opencodeDir` n'est PAS sous la racine du run — cf.
 * [harness-layout.ts](../server/agent/harness-layout.ts)), donc deux runs
 * simultanés le partagent, et le second tour d'un ticket ne repaie rien.
 *
 * ## L'entitlement qui va avec, et ce qu'il ouvre
 *
 * Lancer ce binaire depuis une app signée exige
 * `com.apple.security.cs.disable-library-validation`
 * ([entitlements.mac.plist](../../desktop/build/entitlements.mac.plist)) — il y
 * est écrit noir sur blanc, y compris ce qu'il coûte : **combiné à
 * `allow-dyld-environment-variables`, déjà présent pour Chromium, il fait de
 * minddy un véhicule d'héritage TCC.**
 */

export { OPENCODE_VERSION, opencodeBin };

/** Ce que la coquille a lu sur le disque avant de décider. */
export interface OpencodeFacts {
  /** La version écrite dans `node_modules/opencode-ai/package.json`, ou `null`. */
  readonly installedVersion: string | null;
  /** Le binaire existe-t-il, et est-il exécutable ? */
  readonly binaryPresent: boolean;
  /** Un `npm` a-t-il été trouvé sur le `PATH` ? */
  readonly npmAvailable: boolean;
}

export type OpencodeDecision =
  /** Rien à faire : la bonne version est là. */
  | { readonly action: "ready" }
  /**
   * À installer, et la raison est portée : `missing` sur une machine neuve,
   * `version` quand l'épingle a bougé. La distinction n'est pas décorative — la
   * seconde vaut une ligne de journal, parce qu'elle explique dix secondes
   * d'attente au milieu d'une mise à jour de l'app.
   */
  | { readonly action: "install"; readonly why: "missing" | "version" }
  /** Impossible : rien sur le disque, et rien pour l'y mettre. */
  | { readonly action: "refuse"; readonly reason: "no_npm" };

/**
 * FAUT-IL INSTALLER OPENCODE ?
 *
 * La comparaison de version compte autant que la présence, et pour la raison
 * écrite dans `ensureInstalled` : un test d'existence seul verrait le binaire
 * d'hier, le trouverait très bien, et tous les tours tourneraient sur l'ancien
 * moteur pendant que le dépôt jure le contraire — sans une ligne de log. Le
 * carnet de mesures de ce dépôt porte sur CE binaire
 * ([docs/harness-opencode.md](../../docs/harness-opencode.md)), pas sur une API
 * publique.
 */
export function opencodeDecision(
  facts: OpencodeFacts,
  wanted: string = OPENCODE_VERSION,
): OpencodeDecision {
  if (facts.binaryPresent && facts.installedVersion === wanted) return { action: "ready" };
  if (!facts.npmAvailable) return { action: "refuse", reason: "no_npm" };
  const why = facts.installedVersion && facts.installedVersion !== wanted ? "version" : "missing";
  return { action: "install", why };
}

/** La commande d'installation. Une seule écriture, lue par la coquille. */
export function opencodeInstallArgs(wanted: string = OPENCODE_VERSION): string[] {
  return ["i", "--no-audit", "--no-fund", "--silent", `opencode-ai@${wanted}`];
}

/** Le chemin du manifeste dont on lit la version posée. */
export function opencodeManifestPath(installDir: string): string {
  return `${installDir.replace(/\/+$/, "")}/node_modules/opencode-ai/package.json`;
}

/** La version lue dans ce manifeste, ou `null` si le paquet est là sans elle. */
export function readOpencodeManifestVersion(raw: string): string | null {
  try {
    const version = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version : null;
  } catch {
    return null;
  }
}

/**
 * La phrase du journal. Elle nomme le geste — `xcode-select --install` est
 * l'incantation qui pose `npm` sur un Mac sans chaîne d'outils, et personne ne la
 * devine.
 */
export function opencodeRefusalMessage(reason: "no_npm", wanted = OPENCODE_VERSION): string {
  return (
    `minddy needs opencode ${wanted} to run an agent turn on this Mac, and no npm was found on ` +
    "the PATH to install it. Install Node.js (or run `xcode-select --install`), then start the turn again."
  );
}

/** Ce qu'on écrit au journal quand on s'apprête à attendre dix secondes. */
export function opencodeInstallNote(why: "missing" | "version", wanted = OPENCODE_VERSION): string {
  return why === "version"
    ? `installing opencode ${wanted} — the pinned version changed since the last turn`
    : `installing opencode ${wanted} — first turn on this Mac, this takes about ten seconds`;
}
