/**
 * LE HARNESS SUR LA MACHINE (MIN-293) — la moitié qui se décide sans disque.
 *
 * ## Ce que ce fichier garde
 *
 * `.agent-vm/main.js` est **le seul code non signé par Apple que l'app de bureau
 * exécute**, et il vit sous `userData`, c'est-à-dire dans un dossier
 * **inscriptible par le modèle sous le même UID** — un tour qui le réécrit
 * capterait, au tour suivant, le bail d'exécution locale, la clé du modèle et
 * l'`authUrl` du dépôt.
 *
 * D'où la règle, et elle n'est pas négociable : **l'empreinte se vérifie sur le
 * fichier du disque, juste avant le fork.** Pas au téléchargement — au
 * téléchargement, TLS a déjà fait le travail et le fichier n'a pas encore eu le
 * temps d'être réécrit. Ce qu'on vérifie n'est pas ce qu'on a reçu, c'est ce
 * qu'on s'apprête à exécuter.
 *
 * ## Pourquoi il est téléchargé et pas embarqué
 *
 * Le contrat entre le harness et le plan de contrôle est typé et il bouge
 * ([vm/protocol.ts](../server/agent/vm/protocol.ts)). Une app installée il y a
 * deux mois ne doit pas jouer un tour avec un harness de deux mois. Et
 * l'embarquer le ferait entrer dans l'empreinte de republication
 * ([desktop-fingerprint.mjs](../../scripts/desktop-fingerprint.mjs)) : un
 * mouvement de `protocol.ts` coûterait une notarisation et 120 Mo téléchargés
 * par tout le monde, pour un fichier de 280 Ko.
 *
 * ## Le bundle SUIT L'ORIGINE ACTIVE
 *
 * Il est demandé à l'origine du canal (`desktopOriginForChannel`), jamais à une
 * constante. Une coquille en preview qui jouerait un tour avec le harness de
 * production ferait diverger le contrat typé **en silence** : les deux
 * fichiers `protocol.ts` ne sont pas le même, et rien dans le job ne le dirait.
 * C'est aussi ce qui fait marcher le développement contre `localhost`.
 *
 * ## Le rangement, et ce que le nom du fichier porte
 *
 * Un fichier par empreinte, sous `<userData>/harness/`. Le nom PORTE l'empreinte,
 * ce qui donne deux propriétés gratuites : deux runs simultanés sur des bundles
 * différents (bascule de canal en plein tour) ne se marchent pas dessus, et le
 * ménage se fait par comparaison de noms, sans lire un octet.
 *
 * Décisions ici, `fs` et `fetch` dans [desktop/src/launcher.ts](../../desktop/src/launcher.ts) —
 * `vitest` ne collecte pas `desktop/src/`
 * ([local-surface-coverage.test.ts](../server/agent/local-surface-coverage.test.ts)).
 */

/** Le dossier des bundles, sous `userData`. */
export const HARNESS_DIR_NAME = "harness";

/** Le chemin, sous `userData`, du manifeste servi par l'origine active. */
export const HARNESS_MANIFEST_PATH = "/api/desktop/harness";

/** Et celui des octets. */
export const HARNESS_BUNDLE_PATH = "/api/desktop/harness/bundle";

/**
 * Plafond de ce qu'on accepte de télécharger. Le bundle fait ~280 Ko et son
 * propre build refuse au-delà de 4 Mo
 * ([build-agent-vm.mjs](../../scripts/build-agent-vm.mjs)) : au-delà de ce
 * plafond-ci, ce n'est plus notre fichier, et il n'y a rien à en faire.
 */
export const HARNESS_MAX_BYTES = 8 * 1024 * 1024;

/** Le manifeste, tel que l'origine active le sert. */
export interface HarnessManifest {
  readonly protocolVersion: number;
  readonly opencodeVersion: string;
  /** Empreinte hexadécimale minuscule du bundle. */
  readonly sha256: string;
  readonly bytes: number;
}

/**
 * Pourquoi la machine ne peut pas exécuter de harness.
 *
 * - `manifest_unreachable` — l'origine n'a pas répondu, ou a refusé. C'est aussi
 *   le cas d'une session expirée : le manifeste est authentifié ;
 * - `manifest_invalid` — elle a répondu autre chose qu'un manifeste. Un portail
 *   captif, un proxy d'entreprise, une page d'erreur HTML ;
 * - `protocol_mismatch` — **le seul refus qui ne vient pas d'une panne** : cette
 *   version de l'app connaît un contrat que le déploiement ne sert plus, ou
 *   l'inverse. Il vaut mieux le dire ici que de laisser `parseVmJob` le
 *   découvrir après le fork, où il n'y a plus qu'un journal pour en parler ;
 * - `download_failed` — le manifeste était bon, les octets non ;
 * - `fingerprint_mismatch` — **le refus qui compte.** Les octets sur le disque ne
 *   sont pas ceux que l'origine a annoncés. Sur un téléchargement c'est un
 *   incident réseau ; juste avant un fork, c'est quelqu'un qui a réécrit le
 *   harness, et on ne l'exécute pas.
 */
export type HarnessRefusal =
  | "manifest_unreachable"
  | "manifest_invalid"
  | "protocol_mismatch"
  | "download_failed"
  | "fingerprint_mismatch";

/** Le nom du fichier d'un bundle. L'empreinte EST le nom (cf. en-tête). */
export function harnessBundleFileName(sha256: string): string {
  return `main-${sha256.slice(0, 32)}.js`;
}

/**
 * Le manifeste relu de ce que l'origine a répondu — ou `null`.
 *
 * Tout est vérifié, y compris ce qui « ne peut pas » être faux : ce JSON décide
 * du code qu'on va exécuter, et il arrive par le réseau. Une empreinte qui ne
 * serait pas 64 caractères hexadécimaux ne peut pas être comparée à un hash, et
 * la comparer quand même rendrait `false` — c'est-à-dire un refus, mais pour la
 * mauvaise raison, et l'utilisateur lirait « le harness a été modifié ».
 */
export function parseHarnessManifest(raw: unknown): HarnessManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { protocolVersion, opencodeVersion, sha256, bytes } = raw as Record<string, unknown>;
  if (typeof protocolVersion !== "number" || !Number.isInteger(protocolVersion)) return null;
  if (typeof opencodeVersion !== "string" || !opencodeVersion.trim()) return null;
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) return null;
  if (bytes > HARNESS_MAX_BYTES) return null;
  return { protocolVersion, opencodeVersion, sha256, bytes };
}

/** Ce que la coquille a trouvé sur le disque pour ce manifeste. */
export interface CachedBundle {
  /** L'empreinte RECALCULÉE du fichier, jamais celle qu'on avait notée. */
  readonly sha256: string;
  readonly bytes: number;
}

export type BundleDecision =
  | { readonly action: "reuse" }
  | { readonly action: "download" }
  | { readonly action: "refuse"; readonly reason: HarnessRefusal };

/**
 * FAUT-IL TÉLÉCHARGER CE BUNDLE ?
 *
 * `cached` est ce qu'on a **rehashé** sur le disque, pas ce qu'on croyait y
 * avoir mis. C'est toute la différence : une note prise au téléchargement dirait
 * seulement ce qu'on a écrit, et le fichier a pu être réécrit depuis.
 *
 * `expectedProtocol` est le `VM_PROTOCOL_VERSION` que CETTE version de l'app
 * connaît. Elle ne l'utilise pas elle-même — c'est le harness qui refusera un
 * job d'une autre version — mais elle sait le lire, et le refus vaut mieux ici.
 */
export function bundleDecision(
  manifest: HarnessManifest,
  cached: CachedBundle | null,
  expectedProtocol: number,
): BundleDecision {
  if (manifest.protocolVersion !== expectedProtocol) {
    return { action: "refuse", reason: "protocol_mismatch" };
  }
  if (cached && cached.sha256 === manifest.sha256 && cached.bytes === manifest.bytes) {
    return { action: "reuse" };
  }
  return { action: "download" };
}

/**
 * LES OCTETS REÇUS SONT-ILS CEUX QU'ON ATTENDAIT ?
 *
 * La taille d'abord, et pas par optimisation : une réponse tronquée est le cas
 * ordinaire (réseau coupé, proxy), et son diagnostic n'est pas le même qu'une
 * empreinte qui diverge. Confondre les deux ferait lire « le harness a été
 * modifié » à quelqu'un dont le wifi a lâché.
 */
export function verifyDownload(
  received: { sha256: string; bytes: number },
  manifest: HarnessManifest,
): { ok: true } | { ok: false; reason: HarnessRefusal } {
  if (received.bytes !== manifest.bytes) return { ok: false, reason: "download_failed" };
  if (received.sha256 !== manifest.sha256) return { ok: false, reason: "fingerprint_mismatch" };
  return { ok: true };
}

/**
 * LE DERNIER CONTRÔLE, celui qui a lieu à un cheveu du `fork`.
 *
 * Séparé de `verifyDownload` bien que la comparaison soit la même, parce que ce
 * qu'ils PROUVENT n'est pas la même chose et que leur diagnostic ne doit pas
 * l'être non plus. Ici, une divergence n'est jamais un incident réseau : le
 * fichier a été écrit par nous, vérifié par nous, et quelque chose l'a changé
 * entre-temps. On ne réessaie pas, on ne retélécharge pas — on refuse.
 */
export function verifyBeforeFork(
  onDisk: CachedBundle | null,
  manifest: HarnessManifest,
): { ok: true } | { ok: false; reason: HarnessRefusal } {
  if (!onDisk) return { ok: false, reason: "download_failed" };
  if (onDisk.bytes !== manifest.bytes || onDisk.sha256 !== manifest.sha256) {
    return { ok: false, reason: "fingerprint_mismatch" };
  }
  return { ok: true };
}

/**
 * Les bundles à SUPPRIMER : tous sauf celui qu'on vient de retenir.
 *
 * La fonction ne touche à rien, elle nomme — même patron que `pruneRunLogs`
 * ([run-log.ts](run-log.ts)). Un bundle par empreinte s'accumulerait autrement à
 * chaque déploiement, et 280 Ko par déploiement finit par se voir.
 *
 * ⚠ **Le ménage se fait APRÈS le fork, jamais avant** : un second tour peut
 * tourner sur un bundle plus ancien (bascule de canal, ou simplement un tour
 * commencé avant le déploiement). Supprimer sous ses pieds le fichier que
 * `utilityProcess` a déjà chargé ne le tuerait pas — le mapping survit à
 * l'`unlink` — mais un redémarrage, lui, n'aurait plus rien à lire.
 */
export function staleBundles(files: readonly string[], keep: string): string[] {
  return files.filter((name) => name !== keep && /^main-[0-9a-f]{32}\.js$/.test(name));
}

/**
 * La phrase du journal, en anglais comme le reste des surfaces natives.
 *
 * Elle est ici et pas dans la coquille pour la même raison que tout le fichier :
 * c'est ce que quelqu'un lira dans son rapport de diagnostic quand un tour n'a
 * jamais démarré, et une phrase se relit dans un test.
 */
export function harnessRefusalMessage(reason: HarnessRefusal, origin: string): string {
  switch (reason) {
    case "manifest_unreachable":
      return `Could not reach ${origin} to fetch the agent harness — check your connection, and that you are still signed in.`;
    case "manifest_invalid":
      return `${origin} answered something that is not a harness manifest. A captive portal or a corporate proxy is the usual cause.`;
    case "protocol_mismatch":
      return `This version of minddy speaks a different harness protocol than ${origin}. Update the app, or switch back to the stable channel.`;
    case "download_failed":
      return `The agent harness downloaded from ${origin} was incomplete.`;
    case "fingerprint_mismatch":
      return `The agent harness on this Mac does not match what ${origin} published, so it was not run. It has been discarded and will be downloaded again.`;
  }
}
