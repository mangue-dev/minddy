import {
  MINDDY_NODE_EXEC_ENV,
  MINDDY_NPM_CLI_ENV,
  OPENCODE_VERSION,
  opencodeBin,
} from "@/lib/server/agent/vm/opencode-version";

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
 * pas npm.** Le launcher fournit donc un npm de repli dans le bundle signé et
 * l'exécute avec le Node d'Electron. Le npm système reste utilisable par une
 * ancienne app et le PATH utilisateur est tout de même réparé pour les shells
 * des tools, mais aucun des deux n'est requis pour amorcer OpenCode.
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

/** Un chemin POSIX sans doublons, qui respecte d'abord le shell déjà configuré. */
export function localRuntimePath(current: string | undefined, discovered: readonly string[]): string {
  const ordered = [
    ...(current ?? "").split(":"),
    ...discovered,
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  return [...new Set(ordered.filter((entry) => entry.trim()))].join(":");
}

/** Script POSIX qui transforme l'exécutable Electron en commande Node/npm. */
export function electronToolShim(executable: string, args: readonly string[] = []): string {
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  return (
    `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${[executable, ...args].map(quote).join(" ")}` +
    ` "$@"\n`
  );
}

export interface NpmInvocation {
  readonly executable: string;
  readonly argsPrefix: readonly string[];
  readonly extraEnv: Readonly<Record<string, string>>;
  readonly source: "bundled" | "system";
}

/**
 * Le npm livré avec l'app est prioritaire : il rend le premier lancement
 * indépendant de la configuration shell de la personne. Le npm système reste
 * un repli utile en développement et pour les anciennes installations.
 */
export function npmInvocation(opts: {
  bundledCli: string | null;
  electronExecutable: string;
  systemNpm: string | null;
}): NpmInvocation | null {
  if (opts.bundledCli) {
    return {
      executable: opts.electronExecutable,
      argsPrefix: [opts.bundledCli],
      extraEnv: {
        ELECTRON_RUN_AS_NODE: "1",
        [MINDDY_NPM_CLI_ENV]: opts.bundledCli,
        [MINDDY_NODE_EXEC_ENV]: opts.electronExecutable,
      },
      source: "bundled",
    };
  }
  if (!opts.systemNpm) return null;
  return {
    executable: opts.systemNpm,
    argsPrefix: [],
    extraEnv: {},
    source: "system",
  };
}

/** Ce que la coquille a lu sur le disque avant de décider. */
export interface OpencodeFacts {
  /** La version écrite dans `node_modules/opencode-ai/package.json`, ou `null`. */
  readonly installedVersion: string | null;
  /** Version du runtime des tools, installé au même endroit que le binaire. */
  readonly pluginVersion: string | null;
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
  if (
    facts.binaryPresent &&
    facts.installedVersion === wanted &&
    facts.pluginVersion === wanted
  ) {
    return { action: "ready" };
  }
  if (!facts.npmAvailable) return { action: "refuse", reason: "no_npm" };
  const why = facts.installedVersion && facts.installedVersion !== wanted ? "version" : "missing";
  return { action: "install", why };
}

/**
 * La commande d'installation et les chemins du dossier vivent dans
 * [opencode-version.ts](../server/agent/vm/opencode-version.ts) depuis MIN-293 :
 * le harness les pose aussi, et deux écritures d'une même commande finissent par
 * ne plus poser les mêmes drapeaux. Ceux-là comptent — `--prefix` est ce qui
 * empêche `npm` de remonter l'arborescence et d'installer dans le home.
 */

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
    `minddy needs opencode ${wanted} to run an agent turn on this Mac, but neither its bundled ` +
    "npm nor a system npm is available. Reinstall or update minddy, then start the turn again."
  );
}

/** Ce qu'on écrit au journal quand on s'apprête à attendre dix secondes. */
export function opencodeInstallNote(why: "missing" | "version", wanted = OPENCODE_VERSION): string {
  return why === "version"
    ? `installing opencode ${wanted} — the pinned version changed since the last turn`
    : `installing opencode ${wanted} — first turn on this Mac, this takes about ten seconds`;
}
