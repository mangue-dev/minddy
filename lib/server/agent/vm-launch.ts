import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { HARNESS_DIR } from "./repo-host";
import { VM_BUNDLE_PATH, VM_JOB_PATH, type VmJob } from "./vm/protocol";
import type { Sandbox } from "./sandbox";

/**
 * LE DÉMARRAGE DE LA BOUCLE DANS LA MICROVM (MIN-224) — le dernier geste de la
 * fonction avant qu'elle ne rende la main.
 *
 * Trois écritures et un lancement : le bundle du harness, le job du tour, puis
 * `node main.js` en `detached: true`. La fonction ne l'attend PAS ; elle persiste
 * l'identifiant de la commande et retourne. À partir de là, la conversation vit
 * dans la VM, et la fonction n'existe plus que comme plan de contrôle.
 *
 * PAS DE `timeoutMs` SUR LA COMMANDE, et c'est délibéré. Le SDK le fait respecter
 * à l'exec, y compris sur une commande détachée : en poser un plafonnerait le
 * tour, ce que la migration existe précisément pour supprimer. Le plafond du tour
 * est celui que la boucle se donne (`VM_TURN_SOFT_DEADLINE_MS`), parce qu'une
 * boucle qui s'arrête écrit son checkpoint — là où une commande tuée par la
 * plateforme ne laisse rien.
 *
 * TOUT VIT HORS DE `REPO_DIR`. Le harness et le modèle partagent désormais le
 * même disque : sans ça, le `git add -A` de fin de tour emporterait le bundle ET
 * le job — donc l'historique complet de la conversation — dans un commit du dépôt
 * de l'utilisateur, puis dans sa pull request.
 */

/**
 * Où le bundle est lu, côté fonction. Produit par `prebuild`
 * (`scripts/build-agent-vm.mjs`) et embarqué dans la fonction par
 * `outputFileTracingIncludes` (next.config.mjs) — il est lu par CHEMIN, donc
 * invisible du traceur d'imports de Next, et cette ligne de config est ce qui
 * l'empêche de manquer en production.
 */
const LOCAL_BUNDLE_PATH = path.join(process.cwd(), ".agent-vm", "main.js");

/**
 * Le bundle est le même pour tous les runs d'un déploiement : on le lit UNE fois
 * par instance de fonction. Une invocation qui sert cinq lancements ne relit pas
 * 280 Ko cinq fois.
 */
let cachedBundle: Promise<string> | null = null;
function bundleSource(): Promise<string> {
  cachedBundle ??= readFile(LOCAL_BUNDLE_PATH, "utf8").catch((err) => {
    cachedBundle = null;
    throw new Error(
      `agent VM bundle missing at ${LOCAL_BUNDLE_PATH} — run \`npm run build:agent-vm\` (it is wired as \`prebuild\`): ${(err as Error).message}`,
    );
  });
  return cachedBundle;
}

/**
 * Écrit le harness dans la microVM et lance le tour. Rend l'identifiant de la
 * commande, à persister sur la ligne du run : c'est lui, et lui seul, qui
 * permettra au chien de garde de constater que le process est mort — un constat,
 * pas une présomption après vingt minutes de silence.
 *
 * LÈVE si l'un des trois gestes échoue. L'appelant traite ça comme une erreur
 * d'amorçage : la session reste reprennable, avec l'erreur visible. Un run qu'on
 * croirait lancé alors que rien ne tourne serait bien pire — il resterait
 * `running` jusqu'à ce que quelqu'un s'en aperçoive.
 */
export async function startVmLoop(sandbox: Sandbox, job: VmJob): Promise<string> {
  const bundle = await bundleSource();

  await sandbox.mkDir(HARNESS_DIR).catch(() => {});
  await sandbox.writeFiles([
    { path: VM_BUNDLE_PATH, content: bundle },
    // Le job porte l'historique de la conversation : c'est le plus gros des deux,
    // et c'est pour lui que `HARNESS_DIR` est hors du dépôt.
    { path: VM_JOB_PATH, content: JSON.stringify(job) },
  ]);

  const command = await sandbox.runCommand({
    cmd: "node",
    args: [VM_BUNDLE_PATH],
    cwd: HARNESS_DIR,
    detached: true,
  });
  return command.cmdId;
}
