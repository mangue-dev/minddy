import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { OPENCODE_VERSION } from "./vm/opencode-version";
import { VM_PROTOCOL_VERSION } from "./vm/protocol";

/**
 * LE BUNDLE DU HARNESS, ET SON EMPREINTE (MIN-293).
 *
 * `.agent-vm/main.js` est produit par `prebuild`/`predev`
 * ([scripts/build-agent-vm.mjs](../../../scripts/build-agent-vm.mjs)) et embarqué
 * dans les fonctions par `outputFileTracingIncludes` (next.config.mjs). Il avait
 * jusqu'ici **un** lecteur, [vm-launch.ts](vm-launch.ts), qui l'écrit dans la
 * microVM. Il en a maintenant un second : la machine de l'utilisateur, qui le
 * TÉLÉCHARGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL SE TÉLÉCHARGE PLUTÔT QUE DE S'EMBARQUER DANS L'APP
 *
 * Deux raisons, et la seconde est la plus dure à réparer si on se trompe.
 *
 * 1. **Le contrat est typé et il bouge** ([vm/protocol.ts](vm/protocol.ts)).
 *    Une app installée il y a deux mois jouerait un tour avec un harness de deux
 *    mois : `parseVmJob` le refuserait, mais seulement APRÈS le fork, et un refus
 *    par version est une panne de plus à expliquer plutôt qu'un problème résolu.
 * 2. **L'embarquer le ferait entrer dans l'empreinte de republication**
 *    ([scripts/desktop-fingerprint.mjs](../../../scripts/desktop-fingerprint.mjs)) :
 *    un mouvement de `protocol.ts` coûterait une notarisation et 120 Mo
 *    téléchargés par tout le monde, pour un fichier de 280 Ko.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EMPREINTE N'EST PAS UNE PRÉCAUTION DE TRANSPORT
 *
 * TLS garantit déjà que ce qu'on télécharge est ce qu'on a servi. Ce que
 * l'empreinte garde, c'est le fichier **une fois posé sur le disque** : c'est le
 * seul code non signé par Apple que l'app exécute, il vit sous `userData`, et il
 * est **inscriptible par le modèle sous le même UID** — un tour qui le réécrit
 * capterait au tour suivant le bail d'exécution locale, la clé du modèle « en
 * mémoire » et l'`authUrl` du dépôt.
 *
 * D'où la forme : un MANIFESTE séparé des octets. Le lanceur demande le
 * manifeste à chaque tour (2 lignes de JSON), rehashe le fichier qu'il a sur le
 * disque, et ne forke que si les deux coïncident — cf.
 * [lib/desktop/harness-bundle.ts](../../desktop/harness-bundle.ts).
 *
 * `protocolVersion` et `opencodeVersion` voyagent dans le même manifeste parce
 * qu'ils se décident au même endroit et se lisent au même moment : une coquille
 * qui découvrirait le désaccord de protocole après le fork n'aurait plus que le
 * journal pour le dire.
 */

/**
 * Où le bundle est lu, côté fonction. Il est lu par CHEMIN, donc invisible du
 * traceur d'imports de Next : c'est `outputFileTracingIncludes` qui l'empêche de
 * manquer en production, et rien d'autre.
 */
const LOCAL_BUNDLE_PATH = path.join(process.cwd(), ".agent-vm", "main.js");

/** Ce que la machine reçoit AVANT les octets, et qui décide si elle les demande. */
export interface HarnessManifest {
  /** `VM_PROTOCOL_VERSION` — le harness et le job doivent parler le même. */
  protocolVersion: number;
  /** La version d'opencode épinglée, pour que la machine sache quoi installer. */
  opencodeVersion: string;
  /** L'empreinte du bundle, en hexadécimal minuscule. */
  sha256: string;
  /** Sa taille, pour qu'un téléchargement tronqué se voie sans hasher. */
  bytes: number;
}

/**
 * Le bundle est le même pour tous les runs d'un déploiement : on le lit UNE fois
 * par instance de fonction, et on hashe une fois aussi. Une invocation qui sert
 * cinq lancements ne relit pas 280 Ko cinq fois — c'était déjà la règle dans
 * `vm-launch.ts`, elle vaut d'autant plus maintenant qu'une route publique peut
 * être appelée à chaque tour de chaque machine.
 */
let cached: Promise<{ source: string; manifest: HarnessManifest }> | null = null;

function readBundle(): Promise<{ source: string; manifest: HarnessManifest }> {
  return readFile(LOCAL_BUNDLE_PATH, "utf8").then(
    (source) => ({
      source,
      manifest: {
        protocolVersion: VM_PROTOCOL_VERSION,
        opencodeVersion: OPENCODE_VERSION,
        sha256: createHash("sha256").update(source, "utf8").digest("hex"),
        // La longueur en OCTETS, pas en caractères : le bundle est de l'ASCII en
        // pratique, mais un `Buffer.byteLength` coûte le même prix et ne ment pas
        // le jour où un littéral non-ASCII y entre.
        bytes: Buffer.byteLength(source, "utf8"),
      },
    }),
    (err: Error) => {
      cached = null;
      throw new Error(
        `agent VM bundle missing at ${LOCAL_BUNDLE_PATH} — run \`npm run build:agent-vm\` (it is wired as \`prebuild\`): ${err.message}`,
      );
    },
  );
}

function load(): Promise<{ source: string; manifest: HarnessManifest }> {
  // En développement, `build:agent-vm` réécrit ce fichier sans recharger le
  // module Next. Garder la promesse en cache faisait donc exécuter l'ancien
  // harness pendant des heures et rendait tout benchmark local mensonger.
  if (process.env.NODE_ENV === "development") return readBundle();
  cached ??= readBundle();
  return cached;
}

/** Les octets du harness. LÈVE si le bundle manque — cf. le message ci-dessus. */
export async function harnessBundleSource(): Promise<string> {
  return (await load()).source;
}

/** Le manifeste du harness que ce déploiement sert. LÈVE avec le même message. */
export async function harnessBundleManifest(): Promise<HarnessManifest> {
  return (await load()).manifest;
}

/**
 * Oublie ce qui est en cache. **Réservé aux tests** : en production le bundle
 * d'une instance de fonction ne change pas, et c'est précisément ce sur quoi le
 * cache s'appuie.
 */
export function forgetHarnessBundleCache(): void {
  cached = null;
}
